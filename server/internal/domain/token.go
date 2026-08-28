package domain

import "crypto/rand"

// 成员 token：7 位大小写字母+数字。
// v0.1.6 起由**服务端签发**（POST /auth/token，按 IP 复用/换发）；格式校验在 transport/auth.go（^[A-Za-z0-9]{7}$）。
const memberTokenAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

// NewMemberToken 生成 7 位成员 token（crypto/rand；取模偏差对 token 场景可忽略，碰撞由调用方重试）
func NewMemberToken() (string, error) {
	b := make([]byte, 7)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	for i := range b {
		b[i] = memberTokenAlphabet[int(b[i])%len(memberTokenAlphabet)]
	}
	return string(b), nil
}
