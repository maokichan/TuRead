package transport

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
)

func doGetBody(t *testing.T, url string, headers map[string]string) ([]byte, int) {
	t.Helper()
	req, _ := http.NewRequest("GET", url, nil)
	for k, v := range headers {
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

// createRoomCustom 用指定 hash/size 建房间（不同于 admin_test 的 createRoom 固定 body，用于制造不同 edition）
func createRoomCustom(t *testing.T, u, tok, hash string, size int64) (roomID string, editionID int64) {
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

// GET /rooms：鉴权闸 + 全量列表 + ?edition= 按书筛选 + 非法参数
func TestListRoomsEndpoint(t *testing.T) {
	_, u := newTestServerAdmin(t, testAccess, []string{adminToken})

	// 未带 token → 401
	if got := doGet(t, u+"/rooms", nil); got != 401 {
		t.Fatalf("list rooms without auth should 401, got %d", got)
	}

	// 两个不同 edition 的房间
	_, edA := createRoomCustom(t, u, adminToken, "deadbeef", 100)
	_, edB := createRoomCustom(t, u, adminToken, "c0ffee", 200)
	if edA == edB {
		t.Fatal("editions should differ")
	}

	// 全量列表：2 个房间，字段正确（title 来自 work）
	body, code := doGetBody(t, u+"/rooms", authHdr(adminToken))
	if code != 200 {
		t.Fatalf("list rooms should 200, got %d", code)
	}
	var resp struct {
		Rooms []roomInfo `json:"rooms"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Rooms) != 2 {
		t.Fatalf("expected 2 rooms, got %d", len(resp.Rooms))
	}
	for _, rm := range resp.Rooms {
		if rm.RoomID == "" || rm.EditionID == 0 || rm.Title != "T" || rm.Ext != "epub" || rm.MemberCount != 0 {
			t.Fatalf("bad room info: %+v", rm)
		}
	}

	// 按书筛选 edition=A → 只剩对应房间
	body, code = doGetBody(t, u+"/rooms?edition="+fmt.Sprint(edA), authHdr(adminToken))
	if code != 200 {
		t.Fatalf("filtered list should 200, got %d", code)
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Rooms) != 1 || resp.Rooms[0].EditionID != edA {
		t.Fatalf("expected 1 room for edition %d, got %+v", edA, resp.Rooms)
	}

	// 非法 edition 参数 → 400
	if got := doGet(t, u+"/rooms?edition=abc", authHdr(adminToken)); got != 400 {
		t.Fatalf("invalid edition should 400, got %d", got)
	}
}

// POST /rooms 的 owner 昵称约束（v0.2.1）：与 WS 握手同一判据（非空 + rune 数 ≤12）。
// 此前建房路径不校验 → 房主可用超长昵称建档，随后自己 WS join 被握手拒绝（进不去自己的房）。
func TestCreateRoomOwnerNickConstraint(t *testing.T) {
	_, u := newTestServerAdmin(t, testAccess, []string{adminToken})

	post := func(owner string) int {
		body := fmt.Sprintf(`{"owner":%q,"book":{"protocol":"content-hash-v1","code":"deadbeef","title":"T","ext":"epub","hash":"deadbeef","size":100}}`, owner)
		req, _ := http.NewRequest("POST", u+"/rooms", bytes.NewBufferString(body))
		for k, v := range authHdr(adminToken) {
			req.Header.Set(k, v)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		return resp.StatusCode
	}

	if code := post("alice"); code != 200 {
		t.Fatalf("12 字以内的昵称应放行，got %d", code)
	}
	if code := post(""); code != 400 {
		t.Fatalf("空昵称应 400，got %d", code)
	}
	// 13 个汉字（rune 计）—— 与 ws.go 握手的 maxNickLen 同一判据
	if code := post("一二三四五六七八九十甲乙丙"); code != 400 {
		t.Fatalf("超长昵称（13 rune）应 400，got %d", code)
	}
	// 恰好 12 个汉字：放行
	if code := post("一二三四五六七八九十甲乙"); code != 200 {
		t.Fatalf("12 rune 昵称应放行，got %d", code)
	}
}
