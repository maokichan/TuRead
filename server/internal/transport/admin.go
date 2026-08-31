package transport

import (
	"net/http"

	"turead/server/internal/domain"
)

// ---------- REST：管理/权限操作（admin / 房主） ----------

// isAdmin 判定 token 是否为管理员：策略中的管理员 token 列表命中 或 users.role == admin
func (s *Server) isAdmin(token string) bool {
	for _, t := range s.policySnapshot().AdminTokens {
		if t == token {
			return true
		}
	}
	u, err := s.store.GetUser(token)
	if err != nil || u == nil {
		return false
	}
	return u.Role == domain.RoleAdmin
}

// requireAdmin 权限闸：非管理员 403（副本删除仍 admin-only）
func (s *Server) requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	if !s.isAdmin(memberTokenFromCtx(r)) {
		writeErr(w, http.StatusForbidden, "admin required")
		return false
	}
	return true
}

// findActive 按成员 ID（= token）找活跃连接
func (s *Server) findActive(memberID string) *wsClient {
	s.activeMu.Lock()
	defer s.activeMu.Unlock()
	return s.active[memberID]
}

// DELETE /books/{editionID}/file —— 删除本机副本（文件 + local_copy 置 0；admin only）
func (s *Server) handleDeleteEditionFile(w http.ResponseWriter, r *http.Request) {
	if !s.requireAdmin(w, r) {
		return
	}
	ed, ok := s.getEdition(w, r)
	if !ok {
		return
	}
	if err := s.files.Delete(*ed); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := s.store.ClearLocalCopy(ed.ID); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusOK)
}

// DELETE /rooms/{roomID} —— 删除房间并踢出全部成员连接；同步删除持久化房间记录与聊天消息。
// 权限（v0.2.0）：房主（资源级，只能删自己的房间）或 admin（全局级，可删任何房间）。
func (s *Server) handleDeleteRoom(w http.ResponseWriter, r *http.Request) {
	roomID := r.PathValue("roomID")
	token := memberTokenFromCtx(r)
	room, err := s.rooms.Get(roomID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "room not found")
		return
	}
	if !s.isAdmin(token) && room.OwnerToken != token {
		writeErr(w, http.StatusForbidden, "owner or admin required")
		return
	}
	ids, err := s.rooms.Delete(roomID)
	if err != nil {
		writeErr(w, http.StatusNotFound, err.Error())
		return
	}
	if err := s.store.DeleteRoom(roomID); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	for _, id := range ids {
		if c := s.findActive(id); c != nil {
			c.kick()
		}
	}
	w.WriteHeader(http.StatusOK)
}
