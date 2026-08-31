package transport

import (
	"bytes"
	"fmt"
	"net/http"
	"testing"
)

// 上传大小限制：策略 max_upload_bytes 超限 413，未超限 200
func TestUploadSizeLimit(t *testing.T) {
	s, u := newTestServerAdmin(t, testAccess, []string{adminToken})
	_, editionID := createRoomCustom(t, u, adminToken, "deadbeef", 100)

	s.ApplyPolicy(Policy{AccessToken: testAccess, AdminTokens: []string{adminToken}, MaxUploadBytes: 10})

	upload := func(body string) int {
		req, _ := http.NewRequest("POST", u+"/books/"+fmt.Sprint(editionID)+"/file", bytes.NewBufferString(body))
		for k, v := range authHdr(adminToken) {
			req.Header.Set(k, v)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp.StatusCode
	}

	if got := upload("12345678901"); got != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversize upload should 413, got %d", got)
	}
	if got := upload("12345"); got != http.StatusOK {
		t.Fatalf("within-limit upload should 200, got %d", got)
	}
}
