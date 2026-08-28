package transport

import (
	"net/http"
	"sync"

	"github.com/gorilla/websocket"

	"turead/server/internal/room"
	"turead/server/internal/store"
)

// Server 组装 REST + WS，依赖注入 store / roomMgr / fileStore。
// 文件划分（按职责）：rest.go（业务 REST）/ ws.go（WebSocket + 背压）/ admin.go（管理接口）/ auth.go（双闸中间件）/ utils.go（工具）。
type Server struct {
	store *store.Store
	files *store.FileStore
	rooms *room.RoomManager

	upgrader websocket.Upgrader

	policyMu sync.RWMutex // 保护策略类配置（热重载）
	policy   Policy

	activeMu sync.Mutex // 成员 token → 活跃 WS 连接（同 token 新连接踢旧连接）
	active   map[string]*wsClient
}

// Policy 策略类配置：热重载可修改的部分（对应配置文件中的策略类字段，见 internal/config）
type Policy struct {
	AccessToken    string   // 第 2 层准入门禁共享钥匙；空 = 不启用
	AdminTokens    []string // 管理员 token 集合（或 users.role == admin）
	MaxUploadBytes int64    // 上传大小上限（字节；0 = 不限）
}

// NewServer 组装 server
func NewServer(st *store.Store, fs *store.FileStore, rm *room.RoomManager, policy Policy) *Server {
	s := &Server{
		store: st,
		files: fs,
		rooms: rm,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true }, // 接受任意来源（桌面客户端非浏览器）
		},
		active: map[string]*wsClient{},
	}
	s.ApplyPolicy(policy)
	return s
}

// ApplyPolicy 应用（或热重载）策略类配置：访问令牌、管理员列表、上传上限
func (s *Server) ApplyPolicy(p Policy) {
	s.policyMu.Lock()
	defer s.policyMu.Unlock()
	s.policy = p
}

// policySnapshot 读取策略快照（热重载下保证读到一致版本）
func (s *Server) policySnapshot() Policy {
	s.policyMu.RLock()
	defer s.policyMu.RUnlock()
	return s.policy
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealthz)
	mux.HandleFunc("POST /auth/token", s.handleIssueToken) // 服务端签发成员 token（仅需二级令牌）
	mux.HandleFunc("POST /rooms", s.handleCreateRoom)
	mux.HandleFunc("GET /rooms", s.handleListRooms)
	mux.HandleFunc("GET /rooms/{roomID}/messages", s.handleRoomMessages)
	mux.HandleFunc("GET /books/{editionID}", s.handleGetEdition)
	mux.HandleFunc("POST /books/{editionID}/file", s.handleUploadFile)
	mux.HandleFunc("GET /books/{editionID}/file", s.handleDownloadFile)
	mux.HandleFunc("DELETE /books/{editionID}/file", s.handleDeleteEditionFile) // admin only
	mux.HandleFunc("DELETE /rooms/{roomID}", s.handleDeleteRoom)                // admin only
	mux.HandleFunc("GET /ws", s.handleWS)
	return s.authMiddleware(mux) // 双闸校验（/healthz 豁免）
}
