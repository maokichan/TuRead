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
	store       *store.Store
	files       *store.FileStore
	rooms       *room.RoomManager
	upgrader    websocket.Upgrader
	accessToken string          // 第 2 层：服务器级共享钥匙（TUREAD_ACCESS_TOKEN；空 = 不启用该层）
	admin       map[string]bool // 管理员 token 集合（TUREAD_ADMIN_TOKENS；或 users.role == admin）

	activeMu sync.Mutex // 成员 token → 活跃 WS 连接（同 token 新连接踢旧连接）
	active   map[string]*wsClient
}

// NewServer 组装 server；accessToken 为服务器级共享钥匙（可为空 = 不启用第 2 层）；
// adminTokens 为管理员 token 列表（TUREAD_ADMIN_TOKENS，逗号分隔）
func NewServer(st *store.Store, fs *store.FileStore, rm *room.RoomManager, accessToken string, adminTokens []string) *Server {
	admin := make(map[string]bool, len(adminTokens))
	for _, t := range adminTokens {
		admin[t] = true
	}
	return &Server{
		store:       st,
		files:       fs,
		rooms:       rm,
		accessToken: accessToken,
		admin:       admin,
		active:      map[string]*wsClient{},
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true }, // 接受任意来源（桌面客户端非浏览器）
		},
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealthz)
	mux.HandleFunc("POST /rooms", s.handleCreateRoom)
	mux.HandleFunc("GET /books/{editionID}", s.handleGetEdition)
	mux.HandleFunc("POST /books/{editionID}/file", s.handleUploadFile)
	mux.HandleFunc("GET /books/{editionID}/file", s.handleDownloadFile)
	mux.HandleFunc("DELETE /books/{editionID}/file", s.handleDeleteEditionFile) // admin only
	mux.HandleFunc("DELETE /rooms/{roomID}", s.handleDeleteRoom)                // admin only
	mux.HandleFunc("GET /ws", s.handleWS)
	return s.authMiddleware(mux) // 双闸校验（/healthz 豁免）
}
