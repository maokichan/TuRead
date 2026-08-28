package transport

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"turead/server/internal/domain"
)

// ---------- REST：健康检查 ----------

// GET /healthz —— 存活探针：DB 可 ping 则 200 ok，否则 503 degraded
func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.store.Ping(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "degraded", "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ---------- REST：创建房间 ----------

type createRoomRequest struct {
	Owner string   `json:"owner"`
	Book  bookInfo `json:"book"`
}

type bookInfo struct {
	Protocol string `json:"protocol"`
	Code     string `json:"code"`
	Title    string `json:"title"`
	Ext      string `json:"ext"`
	HashAlgo string `json:"hashAlgo,omitempty"`
	Hash     string `json:"hash"`
	Size     int64  `json:"size"`
	Source   string `json:"source,omitempty"`
	URL      string `json:"url,omitempty"` // 可选：下载来源（外部平台 zlib/anna 等，或本机地址）；本机副本状态由上传动作决定
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
		URL:      req.Book.URL,
	}
	ed.FilePath = s.files.RelPath(ed)
	editionID, _, err := s.store.RegisterEdition(ed)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	// 房主身份 = 成员 token（中间件已校验；v0.1.6 起房间 owner 存 token，房主权限远期可验证）
	ownerToken := memberTokenFromCtx(r)
	r2, err := s.rooms.Create(editionID, ownerToken)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	// 房主建档（幂等；nick 为创建时的展示昵称）+ 房间定义落库（失败不阻断——内存房间仍可用，仅重启后不恢复）
	role := domain.RoleUser
	if s.isAdmin(ownerToken) {
		role = domain.RoleAdmin
	}
	if _, err := s.store.RegisterUser(ownerToken, req.Owner, role); err != nil {
		log.Printf("register room owner %s: %v", ownerToken, err)
	}
	if err := s.store.RegisterRoom(domain.RoomRecord{ID: r2.ID, EditionID: editionID, OwnerToken: ownerToken, CreatedAt: r2.CreatedAt}); err != nil {
		log.Printf("register room %s: %v", r2.ID, err)
	}
	writeJSON(w, http.StatusOK, createRoomResponse{
		RoomID:    r2.ID,
		EditionID: editionID,
		WorkID:    workID,
		Created:   true,
	})
}

// ---------- REST：房间聊天历史 ----------

// GET /rooms/{roomID}/messages —— 拉取聊天历史（追加日志，按 id 升序；?after=<id> 增量拉取，?limit=<n> 限制条数）
func (s *Server) handleRoomMessages(w http.ResponseWriter, r *http.Request) {
	roomID := r.PathValue("roomID")
	var after int64
	if q := r.URL.Query().Get("after"); q != "" {
		id, err := strconv.ParseInt(q, 10, 64)
		if err != nil || id < 0 {
			writeErr(w, http.StatusBadRequest, "invalid after")
			return
		}
		after = id
	}
	limit := 50
	if q := r.URL.Query().Get("limit"); q != "" {
		n, err := strconv.Atoi(q)
		if err != nil || n <= 0 || n > 500 {
			writeErr(w, http.StatusBadRequest, "invalid limit")
			return
		}
		limit = n
	}
	msgs, err := s.store.ListMessages(roomID, after, limit)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"messages": msgs})
}

// ---------- REST：房间发现（大厅 / 按书找房） ----------

type roomInfo struct {
	RoomID      string `json:"roomId"`
	EditionID   int64  `json:"editionId"`
	Title       string `json:"title,omitempty"` // 绑定书书名（work.title；可能缺）
	Ext         string `json:"ext,omitempty"`
	OwnerNick   string `json:"ownerNick,omitempty"` // 房主展示昵称（users.nick）
	MemberCount int    `json:"memberCount"`
	CreatedAt   int64  `json:"createdAt"` // unix 秒
}

// GET /rooms —— 房间大厅：列出全部存活房间；?edition=<id> 按书找房（筛选绑定该 edition 的房间）。
// v0.1.5 起房间定义落库（rooms 表）：列表基于内存房间表（含重启后恢复的房间），空房间 TTL 内仍可见。
func (s *Server) handleListRooms(w http.ResponseWriter, r *http.Request) {
	var filter *int64
	if q := r.URL.Query().Get("edition"); q != "" {
		id, err := strconv.ParseInt(q, 10, 64)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "invalid edition id")
			return
		}
		filter = &id
	}
	rooms := s.rooms.List()
	out := make([]roomInfo, 0, len(rooms))
	for _, rm := range rooms {
		if filter != nil && rm.EditionID != *filter {
			continue
		}
		info := roomInfo{RoomID: rm.ID, EditionID: rm.EditionID, MemberCount: rm.MemberCount, CreatedAt: rm.CreatedAt.Unix()}
		if u, err := s.store.GetUser(rm.OwnerToken); err == nil && u != nil {
			info.OwnerNick = u.Nick
		}
		if ed, err := s.store.GetEdition(rm.EditionID); err == nil && ed != nil {
			info.Ext = ed.Ext
			if wk, err := s.store.GetWork(ed.WorkID); err == nil && wk != nil {
				info.Title = wk.Title
			}
		}
		out = append(out, info)
	}
	writeJSON(w, http.StatusOK, map[string]any{"rooms": out})
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

// 上传文件副本（内容寻址存储；已存在则幂等跳过；成功后标记本机已有副本 local_copy=1）
// 大小限制（策略类，可热改）：max_upload_mb > 0 时超限 413；用 MaxBytesReader 同时防 chunked 无限流。
func (s *Server) handleUploadFile(w http.ResponseWriter, r *http.Request) {
	ed, ok := s.getEdition(w, r)
	if !ok {
		return
	}
	if max := s.policySnapshot().MaxUploadBytes; max > 0 {
		if r.ContentLength > max {
			writeErr(w, http.StatusRequestEntityTooLarge, "upload too large")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, max)
	}
	_, err := s.files.Save(*ed, r.Body)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := s.store.MarkLocalCopy(ed.ID); err != nil {
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
