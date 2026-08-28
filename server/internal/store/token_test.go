package store

import (
	"testing"
	"time"
)

// 服务端签发（v0.1.6）：首次签发 / 窗口内复用 / 原地换发 / 续期 / 过期不命中 / 签发后建档补 nick / 碰撞报告
func TestTokenIssuanceAndReuse(t *testing.T) {
	st, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	now := time.Now().Unix()
	day := int64(24 * time.Hour / time.Second)

	// 首次签发
	ok, err := st.IssueToken("1.2.3.4", "Abc1234", now)
	if err != nil || !ok {
		t.Fatalf("first issue: ok=%v err=%v", ok, err)
	}
	// 窗口内复用命中
	tok, err := st.FindTokenByIP("1.2.3.4", now-7*day)
	if err != nil || tok != "Abc1234" {
		t.Fatalf("reuse find: tok=%q err=%v", tok, err)
	}
	// 原地换发（保留档案字段，不删行）
	ok, err = st.IssueToken("1.2.3.4", "Xyz9999", now+1)
	if err != nil || !ok {
		t.Fatalf("rotate: ok=%v err=%v", ok, err)
	}
	tok, _ = st.FindTokenByIP("1.2.3.4", now-7*day)
	if tok != "Xyz9999" {
		t.Fatalf("after rotate should find new token, got %q", tok)
	}
	// 续期不影响查找
	if err := st.TouchToken("Xyz9999", now+100); err != nil {
		t.Fatal(err)
	}
	tok, _ = st.FindTokenByIP("1.2.3.4", now-7*day)
	if tok != "Xyz9999" {
		t.Fatalf("after touch should still find, got %q", tok)
	}
	// 过期不命中：手工造一条 8 天前的记录
	if _, err := st.db.Exec(
		`INSERT INTO users(token, nick, bio, role, ip, token_issued_at, created_at) VALUES('Old7777', '', '', 'user', '9.9.9.9', ?, ?)`,
		now-8*day, now-8*day,
	); err != nil {
		t.Fatal(err)
	}
	tok, _ = st.FindTokenByIP("9.9.9.9", now-7*day)
	if tok != "" {
		t.Fatalf("expired token should not be found, got %q", tok)
	}
	// 签发后 join 建档补 nick（RegisterUser 幂等：冲突只补空 nick）
	if _, err := st.RegisterUser("Xyz9999", "bob", "user"); err != nil {
		t.Fatal(err)
	}
	u, _ := st.GetUser("Xyz9999")
	if u == nil || u.Nick != "bob" || u.Role != "user" {
		t.Fatalf("nick fill failed: %+v", u)
	}
	// 已占用 token 再次签发 → 报告碰撞（ok=false），不覆盖原用户
	ok, err = st.IssueToken("5.6.7.8", "Xyz9999", now)
	if err != nil || ok {
		t.Fatalf("collision should report ok=false: ok=%v err=%v", ok, err)
	}
}
