package e2e

import (
	"testing"
	"time"

	"turead/server/internal/domain"
)

// E2E 集成测试（黑盒，server/test/e2e）：把早期"跑完即删"的冒烟链路固化为 go test。
// 覆盖：建房间 → 双成员 join → 位置广播转发 → 洪泛不丢 → 断线清理 → 同 token 踢旧。
// 只通过公开 HTTP/WS 交互（helpers_test.go 的 newTestServer 用公开 API 组装真实 server）。
// 优雅关停（SIGINT/SIGTERM → Shutdown）是 cmd/server/main.go 的装配行为，此处不覆盖（由审查保证）。
// 慢客户端背压/踢出是确定性白盒单测（internal/transport/backpressure_test.go TestSendQueueOverflowKicks）。

// E2E 快乐路径：建房间 → 双成员 join → A 广播位置 → B 收到 presence（含 A 的位置，且转发排除 A 自己）
func TestE2EJoinAndLocationBroadcast(t *testing.T) {
	u := newTestServer(t)
	roomID, _ := createRoom(t, u, adminToken, "deadbeef", 100)

	a := dialWS(t, u, roomID, "alice", "Aaaa111")
	defer a.Close()
	joinWS(t, a, fpMatch())

	b := dialWS(t, u, roomID, "bob", "Bbbb222")
	defer b.Close()
	joinWS(t, b, fpMatch())

	// A 广播位置
	loc := map[string]any{"chapterDocIndex": 0, "chapterHref": "chap.xhtml", "count": 0, "page": 3, "percentage": 0.42, "text": "hello"}
	if err := a.WriteJSON(domain.MessageEnvelope{Type: domain.MsgLocation, Payload: map[string]any{"location": loc}}); err != nil {
		t.Fatal(err)
	}

	members := readPresence(t, b, 3*time.Second)
	found := false
	for _, m := range members {
		if m.ID == "Aaaa111" {
			found = true
			if m.Location == nil || m.Location.Page != 3 || m.Location.Percentage != 0.42 {
				t.Fatalf("A location not forwarded correctly: %+v", m.Location)
			}
		}
	}
	if !found {
		t.Fatal("A missing from presence snapshot")
	}
}

// E2E 洪泛：B 并发读取的同时 A 连发 N 条位置，B 全收不丢。
// （B 不读导致的队列满踢出 = 背压正确行为，已有确定性单测 TestSendQueueOverflowKicks 覆盖；此处验证"读得动的快客户端端到端不丢包"）
func TestE2EFloodNoDrop(t *testing.T) {
	u := newTestServer(t)
	roomID, _ := createRoom(t, u, adminToken, "deadbeef", 100)

	a := dialWS(t, u, roomID, "alice", "Aaaa111")
	defer a.Close()
	joinWS(t, a, fpMatch())

	b := dialWS(t, u, roomID, "bob", "Bbbb222")
	defer b.Close()
	joinWS(t, b, fpMatch())

	const n = 500
	got := make(chan struct{}, n)
	go func() {
		b.SetReadDeadline(time.Now().Add(15 * time.Second))
		for i := 0; i < n; i++ {
			var env struct{ Type string }
			if err := b.ReadJSON(&env); err != nil {
				return // 错误由主 goroutine 的超时判定暴露
			}
			got <- struct{}{}
		}
	}()

	for i := 0; i < n; i++ {
		loc := map[string]any{"page": i, "percentage": float64(i) / float64(n)}
		if err := a.WriteJSON(domain.MessageEnvelope{Type: domain.MsgLocation, Payload: map[string]any{"location": loc}}); err != nil {
			t.Fatal(err)
		}
	}
	for i := 0; i < n; i++ {
		select {
		case <-got:
		case <-time.After(15 * time.Second):
			t.Fatalf("B received only %d/%d messages", i, n)
		}
	}
}

// E2E 断线清理 + 离开广播：A 断开后其成员身份被移除，且**其余成员立即收到 presence**（v0.1.5 转发规范补丁）
func TestE2EDisconnectCleanup(t *testing.T) {
	u := newTestServer(t)
	roomID, _ := createRoom(t, u, adminToken, "deadbeef", 100)

	a := dialWS(t, u, roomID, "alice", "Aaaa111")
	joinWS(t, a, fpMatch())
	b := dialWS(t, u, roomID, "bob", "Bbbb222")
	defer b.Close()
	joinWS(t, b, fpMatch())

	a.Close() // 直接断开
	// B 应立即收到离开广播的 presence（A 已移除）
	members := readPresence(t, b, 3*time.Second)
	for _, m := range members {
		if m.ID == "Aaaa111" {
			t.Fatal("disconnected member should be cleaned up (leave broadcast)")
		}
	}

	// 随后 C 加入触发的 presence 同样不含 A
	c := dialWS(t, u, roomID, "carol", "Cccc333")
	defer c.Close()
	joinWS(t, c, fpMatch())
	members = readPresence(t, b, 3*time.Second)
	for _, m := range members {
		if m.ID == "Aaaa111" {
			t.Fatal("disconnected member leaked into later presence")
		}
	}
}

// E2E 同 token 踢旧连接：同一成员 token 的新连接顶掉旧连接
func TestE2ESameTokenKicksOld(t *testing.T) {
	u := newTestServer(t)
	roomID, _ := createRoom(t, u, adminToken, "deadbeef", 100)

	c1 := dialWS(t, u, roomID, "alice", "Aaaa111")
	joinWS(t, c1, fpMatch())
	defer c1.Close()

	_ = dialWS(t, u, roomID, "alice2", "Aaaa111") // 同 token 新连接 → 踢旧

	c1.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, _, err := c1.ReadMessage(); err == nil {
		t.Fatal("old connection should be kicked by same-token new connection")
	}
}
