package e2e

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"turead/server/internal/domain"
	"turead/server/internal/room"
	"turead/server/internal/store"
	"turead/server/internal/transport"
)

// 黑盒 E2E 测试基建（server/test/e2e）：
// 只用公开 API（store.Open / room.NewManager / transport.NewServer）组装真实 server，
// 通过 HTTP + WebSocket 交互，不访问任何内部字段 —— 与源码解耦，可整体独立运行。

const (
	testAccess = "shared-secret-123"
	adminToken = "Adm1n77"
)

// newTestServer 用公开 API 组装真实 server（黑盒：只通过 HTTP/WS 交互，不访问内部）
func newTestServer(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	st, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	fs, err := store.NewFileStore(dir)
	if err != nil {
		t.Fatal(err)
	}
	rm := room.NewManager(20, time.Hour) // 测试用宽裕 TTL，避免测试期间空房间被清理
	s := transport.NewServer(st, fs, rm, transport.Policy{AccessToken: testAccess, AdminTokens: []string{adminToken}})
	ts := httptest.NewServer(s.Routes())
	t.Cleanup(ts.Close)
	return ts.URL
}

// ---------- REST 辅助 ----------

func authHdr(tok string) map[string]string {
	return map[string]string{"X-Turead-Access": testAccess, "Authorization": "Bearer " + tok}
}

func doReq(t *testing.T, method, url, body string, hdr map[string]string) int {
	t.Helper()
	req, _ := http.NewRequest(method, url, bytes.NewBufferString(body))
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	return resp.StatusCode
}

func doGet(t *testing.T, url string, hdr map[string]string) int {
	t.Helper()
	return doReq(t, "GET", url, "", hdr)
}

func doGetBody(t *testing.T, url string, hdr map[string]string) ([]byte, int) {
	t.Helper()
	req, _ := http.NewRequest("GET", url, nil)
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	buf := new(bytes.Buffer)
	buf.ReadFrom(resp.Body)
	return buf.Bytes(), resp.StatusCode
}

// createRoom 用指定 hash/size 建房间（黑盒：走公开 REST；不同 hash = 不同 edition）
func createRoom(t *testing.T, u, tok, hash string, size int64) (roomID string, editionID int64) {
	t.Helper()
	body := fmt.Sprintf(`{"owner":"alice","book":{"protocol":"content-hash-v1","code":"%s","title":"T","ext":"epub","hash":"%s","size":%d}}`, hash, hash, size)
	req, _ := http.NewRequest("POST", u+"/rooms", bytes.NewBufferString(body))
	for k, v := range authHdr(tok) {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("create room: %d", resp.StatusCode)
	}
	var cr struct {
		RoomID    string `json:"roomId"`
		EditionID int64  `json:"editionId"`
	}
	json.NewDecoder(resp.Body).Decode(&cr)
	return cr.RoomID, cr.EditionID
}

// ---------- WS 辅助 ----------

// dialWS 带双闸头连接 WS 房间
func dialWS(t *testing.T, u, roomID, nick, token string) *websocket.Conn {
	t.Helper()
	hdr := http.Header{}
	hdr.Set("X-Turead-Access", testAccess)
	hdr.Set("Authorization", "Bearer "+token)
	c, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(u, "http")+"/ws?room="+roomID+"&nick="+nick, hdr)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

// joinWS 发送 room.join 并消费 join-ack
func joinWS(t *testing.T, c *websocket.Conn, fp map[string]any) {
	t.Helper()
	if err := c.WriteJSON(domain.MessageEnvelope{Type: domain.MsgJoin, Payload: map[string]any{"fingerprint": fp}}); err != nil {
		t.Fatal(err)
	}
	c.SetReadDeadline(time.Now().Add(3 * time.Second))
	var ack struct {
		Type string `json:"type"`
	}
	if err := c.ReadJSON(&ack); err != nil || ack.Type != domain.MsgJoinAck {
		t.Fatalf("join failed: %v %+v", err, ack)
	}
}

// readPresence 读一条消息并断言是 presence，返回成员快照
func readPresence(t *testing.T, c *websocket.Conn, deadline time.Duration) []domain.Member {
	t.Helper()
	c.SetReadDeadline(time.Now().Add(deadline))
	var env struct {
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	}
	if err := c.ReadJSON(&env); err != nil {
		t.Fatalf("read presence: %v", err)
	}
	if env.Type != domain.MsgPresence {
		t.Fatalf("expected presence, got %s", env.Type)
	}
	var members []domain.Member
	if err := json.Unmarshal(env.Payload, &members); err != nil {
		t.Fatal(err)
	}
	return members
}

// readChatMessage 读一条消息并断言是 room.message，返回聊天消息
func readChatMessage(t *testing.T, c *websocket.Conn, d time.Duration) domain.ChatMessage {
	t.Helper()
	c.SetReadDeadline(time.Now().Add(d))
	var env struct {
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	}
	if err := c.ReadJSON(&env); err != nil {
		t.Fatalf("read chat: %v", err)
	}
	if env.Type != domain.MsgChatMessage {
		t.Fatalf("expected room.message, got %s", env.Type)
	}
	var msg domain.ChatMessage
	if err := json.Unmarshal(env.Payload, &msg); err != nil {
		t.Fatal(err)
	}
	return msg
}

func fpMatch() map[string]any {
	return map[string]any{"algorithm": "md5-sample3-v1", "hash": "deadbeef", "size": 100}
}
