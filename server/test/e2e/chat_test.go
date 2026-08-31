package e2e

import (
	"encoding/json"
	"testing"
	"time"

	"turead/server/internal/domain"
)

// E2E 聊天：A 发 room.chat → 落库 + 广播 room.message（含发送者回执）→ 历史接口可拉取
func TestE2EChatBroadcastAndHistory(t *testing.T) {
	u := newTestServer(t)
	roomID, _ := createRoom(t, u, adminToken, "deadbeef", 100)

	a := dialWS(t, u, roomID, "alice", "Aaaa111")
	defer a.Close()
	joinWS(t, a, fpMatch())
	b := dialWS(t, u, roomID, "bob", "Bbbb222")
	defer b.Close()
	joinWS(t, b, fpMatch())

	// 排空 A 的 pending（B 加入时广播给 A 的 presence）
	readPresence(t, a, 3*time.Second)

	// A 发聊天
	if err := a.WriteJSON(domain.MessageEnvelope{Type: domain.MsgChat, Payload: map[string]any{"text": "大家好"}}); err != nil {
		t.Fatal(err)
	}

	// B 收到广播
	msgB := readChatMessage(t, b, 3*time.Second)
	if msgB.Text != "大家好" || msgB.Member != "Aaaa111" || msgB.Nick != "alice" || msgB.RoomID != roomID || msgB.ID == 0 {
		t.Fatalf("bad chat msg for B: %+v", msgB)
	}
	// A 也收到（含发送者的权威回执）
	msgA := readChatMessage(t, a, 3*time.Second)
	if msgA.Text != "大家好" || msgA.Member != "Aaaa111" {
		t.Fatalf("bad chat echo for A: %+v", msgA)
	}

	// 历史接口
	body, code := doGetBody(t, u+"/rooms/"+roomID+"/messages", authHdr(adminToken))
	if code != 200 {
		t.Fatalf("history should 200, got %d", code)
	}
	var resp struct {
		Messages []domain.ChatMessage `json:"messages"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Messages) != 1 || resp.Messages[0].Text != "大家好" {
		t.Fatalf("history wrong: %+v", resp.Messages)
	}

	// 空文本不落库不广播
	if err := a.WriteJSON(domain.MessageEnvelope{Type: domain.MsgChat, Payload: map[string]any{"text": "   "}}); err != nil {
		t.Fatal(err)
	}
	a.SetReadDeadline(time.Now().Add(300 * time.Millisecond))
	if err := a.ReadJSON(&struct{}{}); err == nil {
		t.Fatal("blank chat should not be echoed")
	}

	// 历史校验：非法 after / limit
	if got := doGet(t, u+"/rooms/"+roomID+"/messages?after=abc", authHdr(adminToken)); got != 400 {
		t.Fatalf("invalid after should 400, got %d", got)
	}
	if got := doGet(t, u+"/rooms/"+roomID+"/messages?limit=9999", authHdr(adminToken)); got != 400 {
		t.Fatalf("invalid limit should 400, got %d", got)
	}
}
