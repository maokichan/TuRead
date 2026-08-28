package transport

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/gorilla/websocket"

	"turead/server/internal/domain"
)

// WS 常量：背压（写超时 / pong 等待 / ping 周期 / 发送队列容量）+ 输入约束
const (
	writeWait  = 10 * time.Second // 单条出站消息写超时
	pongWait   = 60 * time.Second // 等 pong 的读超时（超过即判定死连接）
	pingPeriod = (pongWait * 9) / 10
	sendQueue  = 32 // outbound 队列容量；广播只入队不阻塞，满 = 慢客户端

	maxNickLen = 12 // 昵称最大长度（按"字"计，rune 数）
)

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

type chatPayload struct {
	Text string `json:"text"`
}

// wsClient 一个 WS 连接：独立写队列 + 写 goroutine（广播背压）。
// 广播方（room.Broadcast 触发的 send 回调）只做非阻塞入队；写 goroutine 串行落盘写；
// 队列满 = 慢客户端 → kick 断开，避免一个慢客户端同步阻塞整个房间广播链。
type wsClient struct {
	conn      *websocket.Conn
	server    *Server
	roomID    string
	memberID  string // 成员身份 = 成员 token（中间件校验后注入）
	token     string // 成员 token（同 token 新连接踢旧连接的依据）
	nick      string
	out       chan []byte   // outbound 队列（已编码的信封）
	done      chan struct{} // 关闭信号（closeOnce 保护）
	closeOnce sync.Once
}

// send 广播回调（可被任意 goroutine 调用）：编码后非阻塞入队；队列满判定慢客户端直接断开
func (c *wsClient) send(env domain.MessageEnvelope) {
	b, err := json.Marshal(wsEnvelope{Type: env.Type, Payload: mustJSON(env.Payload)})
	if err != nil {
		return
	}
	select {
	case c.out <- b:
	default:
		c.kick() // 背压：慢客户端不拖垮房间
	}
}

// writer 独立写 goroutine：串行写出站消息 + 周期性 ping 保活。
// 任何写失败（慢客户端 TCP 缓冲满/死连接）→ kick 断开并让 reader 退出清理；
// 队列满（writer 阻塞时 send 的 default 分支）也会 kick——两条背压路径殊途同归。
func (c *wsClient) writer() {
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()
	defer c.kick()
	for {
		select {
		case b := <-c.out:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.TextMessage, b); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		case <-c.done:
			return
		}
	}
}

// kick 关闭连接：通知 writer 退出 + 断开底层 conn（reader 的 Read 随即报错退出并清理）
func (c *wsClient) kick() {
	c.closeOnce.Do(func() {
		close(c.done)
		c.conn.Close()
	})
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("upgrade: %v", err)
		return
	}
	roomID := r.URL.Query().Get("room")
	nick := r.URL.Query().Get("nick")
	if roomID == "" || nick == "" || utf8.RuneCountInString(nick) > maxNickLen {
		conn.Close()
		return
	}
	c := &wsClient{
		conn:   conn,
		server: s,
		roomID: roomID,
		token:  memberTokenFromCtx(r), // 中间件已校验格式
		nick:   nick,
		out:    make(chan []byte, sendQueue),
		done:   make(chan struct{}),
	}
	if old := s.claimMember(c.token, c); old != nil {
		// 同 token 新连接顶掉旧连接（"单设备登录"语义，跨平台同一身份不并存）
		log.Printf("member %s: kicking previous connection", c.token)
		old.kick()
	}
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	go c.writer()
	c.loop()
}

// claimMember 认领成员身份：同 token 已有活跃连接则返回旧连接（调用方负责踢掉）
func (s *Server) claimMember(token string, c *wsClient) *wsClient {
	s.activeMu.Lock()
	defer s.activeMu.Unlock()
	old := s.active[token]
	s.active[token] = c
	return old
}

// releaseMember 释放成员身份（仅当 active 仍指向本连接时删除，防误删新连接）
func (s *Server) releaseMember(token string, c *wsClient) {
	s.activeMu.Lock()
	defer s.activeMu.Unlock()
	if s.active[token] == c {
		delete(s.active, token)
	}
}

// loop 读循环：处理入站信封；退出时释放成员身份、清理房间订阅并关闭连接
func (c *wsClient) loop() {
	defer c.kick()
	defer c.server.releaseMember(c.token, c)
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
		case domain.MsgChat:
			c.handleChat(env.Payload)
		}
	}
	if c.memberID != "" {
		c.server.rooms.Leave(c.roomID, c.memberID)
		// 转发规范（v0.1.5）：离开/断线必须广播 presence，其余成员列表不残留离线成员
		if r, err := c.server.rooms.Get(c.roomID); err == nil {
			r.Broadcast("", domain.MessageEnvelope{Type: domain.MsgPresence, Payload: r.Members()})
		}
	}
}

func (c *wsClient) handleJoin(payload json.RawMessage) {
	var p joinPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		c.send(domain.MessageEnvelope{Type: domain.MsgJoinAck, Payload: domain.JoinAck{OK: false, Reason: "bad payload"}})
		return
	}
	c.memberID = c.token // 成员身份 = 成员 token（唯一、跨平台同一身份）

	// 首次进房间自动建档（token = 用户 ID，INSERT OR IGNORE 幂等）；失败不阻断 join
	role := domain.RoleUser
	if c.server.isAdmin(c.token) {
		role = domain.RoleAdmin
	}
	if _, err := c.server.store.RegisterUser(c.token, c.nick, role); err != nil {
		log.Printf("register user %s: %v", c.token, err)
	}

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

// handleChat 聊天：落库（追加日志）后向房间广播 room.message（含发送者，server 权威回执）。
// 转发机制复用房间广播（send 队列/背压/信封），v1 只同步位置与聊天，笔记/光标等明确排除。
func (c *wsClient) handleChat(payload json.RawMessage) {
	var p chatPayload
	if err := json.Unmarshal(payload, &p); err != nil || strings.TrimSpace(p.Text) == "" {
		return
	}
	msgID, createdAt, err := c.server.store.InsertMessage(c.roomID, c.memberID, c.nick, p.Text)
	if err != nil {
		log.Printf("insert chat message: %v", err)
		return
	}
	msg := domain.ChatMessage{
		ID:        msgID,
		RoomID:    c.roomID,
		Member:    c.memberID,
		Nick:      c.nick,
		Text:      p.Text,
		CreatedAt: createdAt,
	}
	if r, err := c.server.rooms.Get(c.roomID); err == nil {
		r.Broadcast("", domain.MessageEnvelope{Type: domain.MsgChatMessage, Payload: msg})
	}
}
