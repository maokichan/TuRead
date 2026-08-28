package room

import (
	"testing"
	"time"

	"turead/server/internal/domain"
)

// fakeClock 测试用假时钟：m.now 指向它，测试里推进 fake 时间即可控制 TTL 判定
func fakeClock(t *testing.T, ttl time.Duration) (*RoomManager, *time.Time) {
	t.Helper()
	now := time.Now()
	m := NewManager(20, ttl)
	m.now = func() time.Time { return now }
	return m, &now
}

// 空房间不立即销毁：TTL 内 Get 仍命中；超过 TTL 后 Get 报 ErrNotFound
func TestEmptyRoomTTL(t *testing.T) {
	m, now := fakeClock(t, time.Hour)
	r, err := m.Create(1, "Aaaa111")
	if err != nil {
		t.Fatal(err)
	}
	// 成员加入再离开 → 房间变空（emptyAt 起算）
	if _, err := m.Join(r.ID, "m1", "alice", nil, nil, nil); err != nil {
		t.Fatal(err)
	}
	m.Leave(r.ID, "m1")
	if _, err := m.Get(r.ID); err != nil {
		t.Fatalf("room should still exist within TTL, got %v", err)
	}
	// 推进超过 TTL → 清理
	*now = now.Add(2 * time.Hour)
	if _, err := m.Get(r.ID); err != ErrNotFound {
		t.Fatalf("room should be reaped after TTL, got %v", err)
	}
}

// 空房间在 TTL 内重新有人加入 → 取消倒计时，不再过期
func TestJoinCancelsEmptyTTL(t *testing.T) {
	m, now := fakeClock(t, time.Hour)
	r, err := m.Create(1, "Aaaa111")
	if err != nil {
		t.Fatal(err)
	}
	m.Leave(r.ID, "nobody") // 没人加入过；Leave 无效调用，房间仍空
	// 有人加入 → emptyAt 清除
	if _, err := m.Join(r.ID, "m1", "bob", nil, nil, nil); err != nil {
		t.Fatal(err)
	}
	*now = now.Add(10 * time.Hour) // 远超 TTL
	if _, err := m.Get(r.ID); err != nil {
		t.Fatalf("room with member should never expire, got %v", err)
	}
}

// 有成员的房间永不因 TTL 过期；离开后重新计时
func TestMemberRoomNeverExpiresAndRestartsTimer(t *testing.T) {
	m, now := fakeClock(t, time.Hour)
	r, err := m.Create(1, "Aaaa111")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := m.Join(r.ID, "m1", "alice", nil, nil, nil); err != nil {
		t.Fatal(err)
	}
	*now = now.Add(5 * time.Hour)
	if _, err := m.Get(r.ID); err != nil {
		t.Fatalf("active room should not expire, got %v", err)
	}
	// 成员离开 → 空 → 进入 TTL；推进 30 分钟（未超）仍在
	m.Leave(r.ID, "m1")
	*now = now.Add(30 * time.Minute)
	if _, err := m.Get(r.ID); err != nil {
		t.Fatalf("room should still exist 30min after empty, got %v", err)
	}
	// 再推进 1 小时（累计超 TTL）→ 清理
	*now = now.Add(1 * time.Hour)
	if _, err := m.Get(r.ID); err != ErrNotFound {
		t.Fatalf("room should be reaped, got %v", err)
	}
}

// 创建后从未有人加入的房间：TTL 从创建时刻起算
func TestNeverJoinedRoomExpires(t *testing.T) {
	m, now := fakeClock(t, time.Hour)
	if _, err := m.Create(1, "Aaaa111"); err != nil {
		t.Fatal(err)
	}
	*now = now.Add(2 * time.Hour)
	if got := len(m.List()); got != 0 {
		t.Fatalf("never-joined room should be reaped after TTL, list=%d", got)
	}
}

// List 只返回存活房间（先清理过期空房间），并带成员数与房主 token
func TestListRooms(t *testing.T) {
	m, now := fakeClock(t, time.Hour)
	r1, _ := m.Create(1, "Aaaa111")
	_, _ = m.Create(2, "Bbbb222") // r2：空房间，TTL 超时后应被清理
	if _, err := m.Join(r1.ID, "m1", "alice", nil, nil, nil); err != nil {
		t.Fatal(err)
	}
	// r2 空房间 → 推进超 TTL 后应被清理
	*now = now.Add(2 * time.Hour)
	rooms := m.List()
	if len(rooms) != 1 {
		t.Fatalf("expected 1 live room, got %d", len(rooms))
	}
	if rooms[0].ID != r1.ID || rooms[0].EditionID != 1 || rooms[0].MemberCount != 1 || rooms[0].OwnerToken != "Aaaa111" {
		t.Fatalf("unexpected room info: %+v", rooms[0])
	}
}

// 标定仍生效：指纹不匹配拒绝加入（与 TTL 无关，回归保护）
func TestJoinStillCalibrates(t *testing.T) {
	m, _ := fakeClock(t, time.Hour)
	r, _ := m.Create(1, "Aaaa111")
	ed := domain.Edition{ID: 1, Hash: "deadbeef", Size: 100}
	fp := &domain.Fingerprint{Algorithm: "md5-sample3-v1", Hash: "beef", Size: 100}
	if _, err := m.Join(r.ID, "m1", "alice", &ed, fp, nil); err != ErrMismatch {
		t.Fatalf("mismatched fingerprint should be rejected, got %v", err)
	}
}
