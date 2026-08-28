package transport

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"
)

// POST /auth/token：服务端签发成员 token（仅需二级令牌）；同 IP 复用；签发的 token 可访问受保护接口
func TestIssueTokenEndpoint(t *testing.T) {
	_, u := newTestServerAdmin(t, testAccess, []string{adminToken})

	// 无二级令牌 → 401
	req, _ := http.NewRequest("POST", u+"/auth/token", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("no access token should 401, got %d", resp.StatusCode)
	}

	// 带二级令牌 → 签发新 token
	var r1 struct {
		Token  string `json:"token"`
		Issued bool   `json:"issued"`
	}
	if err := json.Unmarshal(postAuthToken(t, u, testAccess), &r1); err != nil {
		t.Fatal(err)
	}
	if len(r1.Token) != 7 || !r1.Issued {
		t.Fatalf("bad issue response: %+v", r1)
	}

	// 同 IP（httptest 全走 127.0.0.1）再次调用 → 复用同一 token
	var r2 struct {
		Token  string `json:"token"`
		Issued bool   `json:"issued"`
	}
	if err := json.Unmarshal(postAuthToken(t, u, testAccess), &r2); err != nil {
		t.Fatal(err)
	}
	if r2.Token != r1.Token || r2.Issued {
		t.Fatalf("same IP should reuse token: %s vs %s (issued=%v)", r2.Token, r1.Token, r2.Issued)
	}

	// 签发的 token 可访问受保护接口（双闸齐备 → 200）
	if got := doGet(t, u+"/rooms", map[string]string{accessHeader: testAccess, "Authorization": "Bearer " + r1.Token}); got != http.StatusOK {
		t.Fatalf("issued token should access protected endpoint, got %d", got)
	}
}

func postAuthToken(t *testing.T, u, access string) []byte {
	t.Helper()
	req, _ := http.NewRequest("POST", u+"/auth/token", bytes.NewBuffer(nil))
	req.Header.Set(accessHeader, access)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("issue token should 200, got %d", resp.StatusCode)
	}
	buf := new(bytes.Buffer)
	buf.ReadFrom(resp.Body)
	return buf.Bytes()
}

// 房主身份 = 成员 token（v0.1.6）：创建房间后 rooms.owner_token = 创建者 token；大厅展示其昵称（建房时建档）
func TestRoomOwnerToken(t *testing.T) {
	s, u := newTestServerAdmin(t, testAccess, []string{adminToken})
	roomID, _ := createRoomCustom(t, u, adminToken, "deadbeef", 100) // createRoomCustom 的 owner 昵称 = "alice"

	recs, err := s.store.ListRooms()
	if err != nil {
		t.Fatal(err)
	}
	if len(recs) != 1 || recs[0].ID != roomID || recs[0].OwnerToken != adminToken {
		t.Fatalf("room owner_token should be creator token: %+v", recs)
	}

	body, code := doGetBody(t, u+"/rooms", authHdr(adminToken))
	if code != http.StatusOK {
		t.Fatalf("lobby should 200, got %d", code)
	}
	var resp struct {
		Rooms []roomInfo `json:"rooms"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Rooms) != 1 || resp.Rooms[0].OwnerNick != "alice" {
		t.Fatalf("lobby ownerNick wrong: %+v", resp.Rooms)
	}
}
