package transport

import (
	"log"
	"net"
	"net/http"
	"time"

	"turead/server/internal/domain"
)

// 成员 token 签发（v0.1.6）：由**服务端按 IP 签发**，取代客户端自生成。
// 规则（用户定案）：请求带二级令牌、成员 token 为空 → 同一 IP 7 天内申请过则复用（续期），否则换发新 token。
// ⚠️ 已知限制（NAT/共享 IP）：同一公网 IP 下的多客户端共享同一 token，会触发"同 token 踢旧"互相顶线；
//    v1 接受（匿名访客模型），远期可引入客户端 nonce 区分同 IP 多设备。
const tokenReuseWindow = 7 * 24 * time.Hour

// POST /auth/token —— 签发（或复用）成员 token。
// 认证：仅需第 2 层（X-Turead-Access）；成员 token 层豁免（本接口就是"成员 token 为空"的签发入口）。
func (s *Server) handleIssueToken(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	now := time.Now().Unix()
	cutoff := now - int64(tokenReuseWindow/time.Second)

	// 复用：该 IP 7 天内申请过 → 返回既有 token 并续期（活跃身份不因窗口过期）
	if tok, err := s.store.FindTokenByIP(ip, cutoff); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	} else if tok != "" {
		if err := s.store.TouchToken(tok, now); err != nil {
			log.Printf("touch token for %s: %v", ip, err)
		}
		writeJSON(w, http.StatusOK, map[string]any{"token": tok, "issued": false})
		return
	}

	// 换发新 token（碰撞重试）
	for i := 0; i < 5; i++ {
		tok, err := domain.NewMemberToken()
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		ok, err := s.store.IssueToken(ip, tok, now)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		if !ok {
			continue // token 恰好被占用（1/62^7），换一个重试
		}
		log.Printf("issued member token for %s", ip)
		writeJSON(w, http.StatusOK, map[string]any{"token": tok, "issued": true})
		return
	}
	writeErr(w, http.StatusInternalServerError, "failed to issue token after retries")
}

// clientIP 取请求来源 IP（v1 只用 RemoteAddr，不信任代理头 X-Forwarded-For）
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
