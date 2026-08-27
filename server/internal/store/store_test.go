package store

import (
	"testing"
	"time"
)

// users 建档：首次 created=true；重复注册幂等（不覆盖 nick）；读取字段正确；不存在返回 nil
func TestRegisterAndGetUser(t *testing.T) {
	st, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	created, err := st.RegisterUser("Ab3xY9q", "alice", "user")
	if err != nil {
		t.Fatal(err)
	}
	if !created {
		t.Fatal("first register should create")
	}

	u, err := st.GetUser("Ab3xY9q")
	if err != nil {
		t.Fatal(err)
	}
	if u == nil {
		t.Fatal("user missing after register")
	}
	if u.Nick != "alice" || u.Role != "user" || u.Bio != "" {
		t.Fatalf("unexpected user: %+v", u)
	}
	if u.CreatedAt.IsZero() || time.Since(u.CreatedAt) > time.Minute {
		t.Fatalf("created_at wrong: %v", u.CreatedAt)
	}

	// 幂等：重复注册不创建、不覆盖
	created2, err := st.RegisterUser("Ab3xY9q", "bob", "admin")
	if err != nil {
		t.Fatal(err)
	}
	if created2 {
		t.Fatal("second register should not create")
	}
	u2, _ := st.GetUser("Ab3xY9q")
	if u2.Nick != "alice" {
		t.Fatalf("nick should stay alice, got %s", u2.Nick)
	}
	if u2.Role != "user" {
		t.Fatalf("role should stay user (not overwritten), got %s", u2.Role)
	}

	missing, err := st.GetUser("Zzz9999")
	if err != nil {
		t.Fatal(err)
	}
	if missing != nil {
		t.Fatal("missing user should be nil")
	}
}
