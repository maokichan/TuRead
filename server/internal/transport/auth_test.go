package transport

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"turead/server/internal/room"
	"turead/server/internal/store"
)

const (
	testAccess = "shared-secret-123"
	testToken  = "Ab3xY9q" // 7 位大小写字母+数字（社区传统格式）
)

// newTestServer 起一个带真实 SQLite 的测试 server；access 为空 = 第 2 层不启用
func newTestServer(t *testing.T, access string) (*Server, string) {
	t.Helper()
	return newTestServerAdmin(t, access, nil)
}

// newTestServerAdmin 额外指定管理员 token 列表
func newTestServerAdmin(t *testing.T, access string, admins []string) (*Server, string) {
	t.Helper()
	dir := t.TempDir()
	st, err := store.Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	fs, _ := store.NewFileStore(dir)
	rm := room.NewManager(20, time.Hour) // 测试用宽裕 TTL，避免测试期间空房间被清理
	s := NewServer(st, fs, rm, Policy{AccessToken: access, AdminTokens: admins})
	ts := httptest.NewServer(s.Routes())
	t.Cleanup(ts.Close)
	return s, ts.URL
}

func doGet(t *testing.T, url string, headers map[string]string) int {
	t.Helper()
	req, _ := http.NewRequest("GET", url, nil)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	return resp.StatusCode
}

// GET /books/999：鉴权通过 → 404（资源不存在，说明已进业务）；鉴权失败 → 401
func TestHealthzExemptFromAuth(t *testing.T) {
	_, u := newTestServer(t, testAccess)
	if got := doGet(t, u+"/healthz", nil); got != 200 {
		t.Fatalf("healthz should be exempt from auth, got %d", got)
	}
}

func TestAuthGateMatrix(t *testing.T) {
	_, u := newTestServer(t, testAccess)
	cases := []struct {
		name string
		hdr  map[string]string
		want int
	}{
		{"no headers", nil, 401},
		{"wrong access key", map[string]string{accessHeader: "wrong"}, 401},
		{"access ok but missing member token", map[string]string{accessHeader: testAccess}, 401},
		{"member token too short", map[string]string{accessHeader: testAccess, "Authorization": "Bearer Ab3xY"}, 401},
		{"member token illegal chars", map[string]string{accessHeader: testAccess, "Authorization": "Bearer Ab3xY9!"}, 401},
		{"member token without bearer prefix", map[string]string{accessHeader: testAccess, "Authorization": testToken}, 401},
		{"access + member token ok", map[string]string{accessHeader: testAccess, "Authorization": "Bearer " + testToken}, 404},
	}
	for _, c := range cases {
		if got := doGet(t, u+"/books/999", c.hdr); got != c.want {
			t.Fatalf("%s: got %d, want %d", c.name, got, c.want)
		}
	}
}

func TestMemberTokenOnlyWhenAccessLayerDisabled(t *testing.T) {
	_, u := newTestServer(t, "") // 未配置 TUREAD_ACCESS_TOKEN → 第 2 层不启用
	if got := doGet(t, u+"/books/999", map[string]string{"Authorization": "Bearer " + testToken}); got != 404 {
		t.Fatalf("member token only should pass when access layer disabled, got %d", got)
	}
	if got := doGet(t, u+"/books/999", nil); got != 401 {
		t.Fatalf("missing member token should fail, got %d", got)
	}
}

// 同 token 新连接必须踢掉旧连接（"单设备登录"语义，跨平台同一身份不并存）
func TestSameTokenKicksPreviousConnection(t *testing.T) {
	_, u := newTestServer(t, testAccess)
	wsURL := "ws" + strings.TrimPrefix(u, "http") + "/ws?room=x&nick=alice"
	hdr := http.Header{}
	hdr.Set(accessHeader, testAccess)
	hdr.Set("Authorization", "Bearer "+testToken)

	c1, _, err := websocket.DefaultDialer.Dial(wsURL, hdr)
	if err != nil {
		t.Fatal(err)
	}
	defer c1.Close()
	time.Sleep(50 * time.Millisecond) // 确保 c1 已完成认领

	c2, _, err := websocket.DefaultDialer.Dial(wsURL, hdr)
	if err != nil {
		t.Fatal(err)
	}
	defer c2.Close()

	c1.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, _, err := c1.ReadMessage(); err == nil {
		t.Fatal("first connection should be kicked by same-token reconnect")
	}
}
