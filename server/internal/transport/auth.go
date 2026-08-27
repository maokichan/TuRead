package transport

import (
	"context"
	"crypto/subtle"
	"net/http"
	"regexp"
	"strings"
)

// 通讯模型 token 双闸（ARCHITECTURE §2）：
//   第 2 层 准入门禁（服务器级共享钥匙）：TUREAD_ACCESS_TOKEN，所有客户端配置同一把；X-Turead-Access 头。
//   第 3 层 成员身份 token（客户端级，每人一把）：Authorization: Bearer <7位大小写字母数字>；
//          标识"谁在连"（= 成员 ID），重连找回、跨平台同一身份；格式不合法直接 401（防随意构造）。
//          远期可迁移为用户系统的登录凭证（加盐哈希入库）。
// 例外：/healthz 完全豁免（探活不带 token）。

const (
	accessHeader    = "X-Turead-Access" // 第 2 层：服务器级共享钥匙
	memberTokenLen  = 7                 // 成员 token：7 位大小写字母+数字（社区传统）
	ctxMemberTokenK = ctxKey("memberToken")
)

var memberTokenRe = regexp.MustCompile(`^[A-Za-z0-9]{7}$`)

type ctxKey string

// validMemberToken 成员 token 格式校验：32 位小写 hex（用户提议的"密码学机制"最简落地）
func validMemberToken(t string) bool {
	return memberTokenRe.MatchString(t)
}

// bearerToken 从 Authorization 头提取 Bearer token（大小写不敏感前缀）
func bearerToken(h string) string {
	const prefix = "bearer "
	if len(h) <= len(prefix) {
		return ""
	}
	if !strings.EqualFold(h[:len(prefix)], prefix) {
		return ""
	}
	return strings.TrimSpace(h[len(prefix):])
}

// authMiddleware 统一校验：/healthz 豁免；无钥匙/钥匙错 → 401；成员 token 缺失/格式非法 → 401。
// 校验通过后把成员 token 放入 request context（WS 握手用它作成员身份）。
func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" {
			next.ServeHTTP(w, r)
			return
		}
		// 第 2 层：服务器级共享钥匙（未配置 = 不启用；配置了必须匹配，常量时间比较防时序侧信道）
		if s.accessToken != "" {
			got := r.Header.Get(accessHeader)
			if subtle.ConstantTimeCompare([]byte(got), []byte(s.accessToken)) != 1 {
				writeErr(w, http.StatusUnauthorized, "missing or invalid access token")
				return
			}
		}
		// 第 3 层：成员身份 token（格式校验）
		tok := bearerToken(r.Header.Get("Authorization"))
		if !validMemberToken(tok) {
			writeErr(w, http.StatusUnauthorized, "missing or invalid member token")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxMemberTokenK, tok)))
	})
}

// memberTokenFromCtx 取中间件放入的成员 token（WS 握手用）
func memberTokenFromCtx(r *http.Request) string {
	t, _ := r.Context().Value(ctxMemberTokenK).(string)
	return t
}
