package transport

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"turead/server/internal/domain"
)

const adminToken = "Adm1n77"

func authHdr(tok string) map[string]string {
	return map[string]string{accessHeader: testAccess, "Authorization": "Bearer " + tok}
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

func createRoom(t *testing.T, u, tok string) (roomID string, editionID int64) {
	t.Helper()
	body := `{"owner":"alice","book":{"protocol":"content-hash-v1","code":"c1","title":"T","ext":"epub","hash":"deadbeef","size":100}}`
	req, _ := http.NewRequest("POST", u+"/rooms", bytes.NewBufferString(body))
	for k, v := range authHdr(tok) {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("create room: %d", resp.StatusCode)
	}
	var cr struct {
		RoomID    string `json:"roomId"`
		EditionID int64  `json:"editionId"`
	}
	json.NewDecoder(resp.Body).Decode(&cr)
	return cr.RoomID, cr.EditionID
}

// 管理接口权限闸：非 admin 403；env 列表 admin 与 users.role=admin 都放行
func TestAdminRequiredOnManagement(t *testing.T) {
	_, u := newTestServerAdmin(t, testAccess, []string{adminToken})
	if got := doReq(t, "DELETE", u+"/books/999/file", "", authHdr(testToken)); got != 403 {
		t.Fatalf("non-admin delete should be 403, got %d", got)
	}
	// env 列表 admin：鉴权过 + 权限过 → 404（edition 不存在，说明进了业务）
	if got := doReq(t, "DELETE", u+"/books/999/file", "", authHdr(adminToken)); got != 404 {
		t.Fatalf("admin (env list) should pass auth and reach 404, got %d", got)
	}
}

// 删副本：上传 → local_copy=1 → 删除（admin）→ local_copy=0 且下载 404
func TestDeleteEditionFile(t *testing.T) {
	s, u := newTestServerAdmin(t, testAccess, []string{adminToken})
	_, editionID := createRoom(t, u, adminToken)

	if got := doReq(t, "POST", u+"/books/1/file", "", nil); got != 401 {
		t.Fatalf("upload without auth should 401, got %d", got)
	}
	req, _ := http.NewRequest("POST", u+"/books/1/file", bytes.NewBufferString("fakebook"))
	for k, v := range authHdr(adminToken) {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()

	ed, _ := s.store.GetEdition(editionID)
	if !ed.LocalCopy {
		t.Fatal("local_copy should be 1 after upload")
	}
	if got := doReq(t, "GET", u+"/books/1/file", "", authHdr(testToken)); got != 200 {
		t.Fatalf("download after upload should 200, got %d", got)
	}

	if got := doReq(t, "DELETE", u+"/books/1/file", "", authHdr(adminToken)); got != 200 {
		t.Fatalf("admin delete should 200, got %d", got)
	}
	ed2, _ := s.store.GetEdition(editionID)
	if ed2.LocalCopy {
		t.Fatal("local_copy should be 0 after delete")
	}
	if got := doReq(t, "GET", u+"/books/1/file", "", authHdr(testToken)); got != 404 {
		t.Fatalf("download after delete should 404, got %d", got)
	}
}

// 删房间：成员被踢（连接断开）
func TestDeleteRoomKicksMembers(t *testing.T) {
	_, u := newTestServerAdmin(t, testAccess, []string{adminToken})
	roomID, _ := createRoom(t, u, adminToken)

	hdr := http.Header{}
	hdr.Set(accessHeader, testAccess)
	hdr.Set("Authorization", "Bearer "+testToken)
	c, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(u, "http")+"/ws?room="+roomID+"&nick=alice", hdr)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	_ = c.WriteJSON(domain.MessageEnvelope{Type: domain.MsgJoin, Payload: map[string]any{
		"fingerprint": map[string]any{"algorithm": "md5-sample3-v1", "hash": "deadbeef", "size": 100},
	}})
	c.SetReadDeadline(time.Now().Add(3 * time.Second))
	var e struct {
		Type string `json:"type"`
	}
	if err := c.ReadJSON(&e); err != nil || e.Type != domain.MsgJoinAck {
		t.Fatalf("join failed: %v %+v", err, e)
	}

	if got := doReq(t, "DELETE", u+"/rooms/"+roomID, "", authHdr(adminToken)); got != 200 {
		t.Fatalf("admin delete room should 200, got %d", got)
	}
	c.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, _, err := c.ReadMessage(); err == nil {
		t.Fatal("member should be kicked when room deleted")
	}
}

// 房主权限（v0.2.0）：房主可删自己的房间（资源级）；非房主非 admin 403；admin 可删任何房间（全局级）
func TestRoomDeletionPermissions(t *testing.T) {
	_, u := newTestServerAdmin(t, testAccess, []string{adminToken})

	// 房主 testToken 建房间
	roomID, _ := createRoomCustom(t, u, testToken, "deadbeef", 100)

	// 非房主非 admin 删 → 403（token 格式合法、已过双闸，但权限不足）
	if got := doReq(t, "DELETE", u+"/rooms/"+roomID, "", authHdr("Bbbb222")); got != 403 {
		t.Fatalf("non-owner non-admin delete should 403, got %d", got)
	}

	// 房主删自己的房间 → 200
	if got := doReq(t, "DELETE", u+"/rooms/"+roomID, "", authHdr(testToken)); got != 200 {
		t.Fatalf("owner delete should 200, got %d", got)
	}
	// 删除后房间不存在 → 404（admin 也找不到）
	if got := doReq(t, "DELETE", u+"/rooms/"+roomID, "", authHdr(adminToken)); got != 404 {
		t.Fatalf("deleted room should 404, got %d", got)
	}

	// admin 可删任意房间（另一房主的房间）
	roomID2, _ := createRoomCustom(t, u, testToken, "c0ffee", 200)
	if got := doReq(t, "DELETE", u+"/rooms/"+roomID2, "", authHdr(adminToken)); got != 200 {
		t.Fatalf("admin delete any room should 200, got %d", got)
	}
}

// 昵称限制：≤12 字可入房；>12 字连接被关
func TestNickLengthLimit(t *testing.T) {
	_, u := newTestServerAdmin(t, testAccess, []string{adminToken})
	roomID, _ := createRoom(t, u, adminToken)

	dial := func(nick string) (*websocket.Conn, error) {
		hdr := http.Header{}
		hdr.Set(accessHeader, testAccess)
		hdr.Set("Authorization", "Bearer "+testToken)
		c, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(u, "http")+"/ws?room="+roomID+"&nick="+nick, hdr)
		return c, err
	}

	// 12 字：正常 join
	c12, err := dial("一二三四五六七八九十甲乙")
	if err != nil {
		t.Fatal(err)
	}
	defer c12.Close()
	_ = c12.WriteJSON(domain.MessageEnvelope{Type: domain.MsgJoin, Payload: map[string]any{"fingerprint": nil}})
	c12.SetReadDeadline(time.Now().Add(3 * time.Second))
	if err := c12.ReadJSON(&struct{}{}); err != nil {
		t.Fatalf("12-char nick should work, got %v", err)
	}

	// 13 字：升级后连接被关（读报错）
	c13, err := dial("一二三四五六七八九十甲乙丙")
	if err != nil {
		t.Fatal(err)
	}
	defer c13.Close()
	c13.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, _, err := c13.ReadMessage(); err == nil {
		t.Fatal("13-char nick should be rejected (connection closed)")
	}
}
