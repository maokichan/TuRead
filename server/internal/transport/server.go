package transport

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"github.com/gorilla/websocket"

	"turead/server/internal/domain"
	"turead/server/internal/room"
	"turead/server/internal/store"
)

// Server 组装 REST + WS，依赖注入 store / roomMgr / fileStore
type Server struct {
	store     *store.Store
	files     *store.FileStore
	rooms     *room.RoomManager
	upgrader  websocket.Upgrader
}

func NewServer(st *store.Store, fs *store.FileStore, rm *room.RoomManager) *Server {
	return &Server{
		store: st,
		files: fs,
		rooms: rm,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true }, // 学习期：接受任意来源
		},
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /rooms", s.handleCreateRoom)
	mux.HandleFunc("GET /books/{editionID}", s.handleGetEdition)
	mux.HandleFunc("POST /books/{editionID}/file", s.handleUploadFile)
	mux.HandleFunc("GET /books/{editionID}/file", s.handleDownloadFile)
	mux.HandleFunc("GET /ws", s.handleWS)
	return mux
}

// ---------- 信封 / 载荷 ----------

// wsEnvelope transport 层的信封（payload 先保持 raw，按 type 再解析）
type wsEnvelope struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type joinPayload struct {
	Fingerprint *domain.Fingerprint `json:"fingerprint"` // nil = 无书成员（需要分发）
}

type locationPayload struct {
	Location *domain.BookLocation `json:"location"`
}

// ---------- REST：创建房间 ----------

type createRoomRequest struct {
	Owner string    `json:"owner"`
	Book  bookInfo  `json:"book"`
}

type bookInfo struct {
	Protocol string `json:"protocol"`
	Code     string `json:"code"`
	Title    string `json:"title"`
	Author   string `json:"author"`
	Ext      string `json:"ext"`
	HashAlgo string `json:"hashAlgo,omitempty"`
	Hash     string `json:"hash"`
	Size     int64  `json:"size"`
	Source   string `json:"source,omitempty"`
}

type createRoomResponse struct {
	RoomID    string `json:"roomId"`
	EditionID int64  `json:"editionId"`
	WorkID    int64  `json:"workId"`
	Created   bool   `json:"created"`
}

func (s *Server) handleCreateRoom(w http.ResponseWriter, r *http.Request) {
	var req createRoomRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}
	if req.Owner == "" || !domain.ValidProtocol(req.Book.Protocol) {
		writeErr(w, http.StatusBadRequest, "owner and valid protocol required")
		return
	}
	code, ok := domain.NormalizeCode(req.Book.Protocol, req.Book.Code)
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid "+req.Book.Protocol+" code")
		return
	}
	if req.Book.Title == "" || req.Book.Ext == "" || req.Book.Hash == "" || req.Book.Size <= 0 {
		writeErr(w, http.StatusBadRequest, "title, ext, hash, size required")
		return
	}
	algo := req.Book.HashAlgo
	if algo == "" {
		algo = "md5-sample3-v1"
	}

	workID, _, err := s.store.RegisterWork(domain.Work{
		Title:    req.Book.Title,
		Protocol: req.Book.Protocol,
		Code:     code,
		Author:   req.Book.Author,
	})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	ed := domain.Edition{
		WorkID:   workID,
		Ext:      strings.ToLower(req.Book.Ext),
		HashAlgo: algo,
		Hash:     req.Book.Hash,
		Size:     req.Book.Size,
		Source:   req.Book.Source,
	}
	ed.FilePath = s.files.RelPath(ed)
	editionID, _, err := s.store.RegisterEdition(ed)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	r2, err := s.rooms.Create(editionID, req.Owner)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, createRoomResponse{
		RoomID:    r2.ID,
		EditionID: editionID,
		WorkID:    workID,
		Created:   true,
	})
}

// ---------- REST：电子版信息 / 上传 / 下载 ----------

func (s *Server) getEdition(w http.ResponseWriter, r *http.Request) (*domain.Edition, bool) {
	id, err := strconv.ParseInt(r.PathValue("editionID"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid edition id")
		return nil, false
	}
	ed, err := s.store.GetEdition(id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return nil, false
	}
	if ed == nil {
		writeErr(w, http.StatusNotFound, "edition not found")
		return nil, false
	}
	return ed, true
}

func (s *Server) handleGetEdition(w http.ResponseWriter, r *http.Request) {
	ed, ok := s.getEdition(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, ed)
}

// 上传文件副本（内容寻址存储；已存在则幂等跳过）
func (s *Server) handleUploadFile(w http.ResponseWriter, r *http.Request) {
	ed, ok := s.getEdition(w, r)
	if !ok {
		return
	}
	_, err := s.files.Save(*ed, r.Body)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusOK)
}

// 下载文件副本（分发：让无书成员获得电子版）
func (s *Server) handleDownloadFile(w http.ResponseWriter, r *http.Request) {
	ed, ok := s.getEdition(w, r)
	if !ok {
		return
	}
	f, err := s.files.Open(*ed)
	if err != nil {
		writeErr(w, http.StatusNotFound, "file not uploaded yet")
		return
	}
	defer f.Close()
	w.Header().Set("Content-Disposition", "attachment; filename=\"book."+ed.Ext+"\"")
	http.ServeContent(w, r, "book."+ed.Ext, ed.CreatedAt, f)
}

// ---------- WebSocket：房间同步 ----------

type wsClient struct {
	conn     *websocket.Conn
	writeMu  sync.Mutex
	server   *Server
	roomID   string
	memberID string
	nick     string
}

func (c *wsClient) send(env domain.MessageEnvelope) {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	if err := c.conn.WriteJSON(wsEnvelope{Type: env.Type, Payload: mustJSON(env.Payload)}); err != nil {
		log.Printf("ws send: %v", err)
	}
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("upgrade: %v", err)
		return
	}
	roomID := r.URL.Query().Get("room")
	nick := r.URL.Query().Get("nick")
	if roomID == "" || nick == "" {
		conn.Close()
		return
	}
	c := &wsClient{conn: conn, server: s, roomID: roomID, nick: nick}
	c.loop()
}

func (c *wsClient) loop() {
	defer c.conn.Close()
	for {
		var env wsEnvelope
		if err := c.conn.ReadJSON(&env); err != nil {
			break
		}
		switch env.Type {
		case domain.MsgJoin:
			c.handleJoin(env.Payload)
		case domain.MsgLocation:
			c.handleLocation(env.Payload)
		}
	}
	if c.memberID != "" {
		c.server.rooms.Leave(c.roomID, c.memberID)
	}
}

func (c *wsClient) handleJoin(payload json.RawMessage) {
	var p joinPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		c.send(domain.MessageEnvelope{Type: domain.MsgJoinAck, Payload: domain.JoinAck{OK: false, Reason: "bad payload"}})
		return
	}
	c.memberID = newMemberID(c.nick)

	editionID, err := c.server.rooms.EditionID(c.roomID)
	if err != nil {
		c.send(domain.MessageEnvelope{Type: domain.MsgJoinAck, Payload: domain.JoinAck{OK: false, Reason: err.Error()}})
		return
	}
	ed, err := c.server.store.GetEdition(editionID)
	if err != nil || ed == nil {
		c.send(domain.MessageEnvelope{Type: domain.MsgJoinAck, Payload: domain.JoinAck{OK: false, Reason: "room not found"}})
		return
	}

	r, err := c.server.rooms.Join(c.roomID, c.memberID, c.nick, ed, p.Fingerprint, c.send)
	if err != nil {
		c.send(domain.MessageEnvelope{Type: domain.MsgJoinAck, Payload: domain.JoinAck{OK: false, Reason: err.Error()}})
		return
	}
	c.send(domain.MessageEnvelope{Type: domain.MsgJoinAck, Payload: domain.JoinAck{
		OK:      true,
		RoomID:  r.ID,
		Edition: ed,
		Members: r.Members(),
	}})
	r.Broadcast(c.memberID, domain.MessageEnvelope{Type: domain.MsgPresence, Payload: r.Members()})
}

func (c *wsClient) handleLocation(payload json.RawMessage) {
	var p locationPayload
	if err := json.Unmarshal(payload, &p); err != nil || p.Location == nil {
		return
	}
	c.server.rooms.SetLocation(c.roomID, c.memberID, p.Location)
}

// ---------- 工具 ----------

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func mustJSON(v any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		return json.RawMessage("null")
	}
	return b
}

func newMemberID(nick string) string {
	// 学习期：昵称 + 随机后缀，避免同昵称并发连接相互覆盖订阅
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return nick
	}
	return nick + "-" + hex.EncodeToString(b)
}
