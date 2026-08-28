package store

import (
	"testing"
	"time"

	"turead/server/internal/domain"
)

// 房间定义与聊天消息：落库 / 幂等 / 增量拉取 / 重启恢复 / 删房级联清消息
func TestRoomsAndMessages(t *testing.T) {
	dir := t.TempDir()
	st, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}

	// 先建 work/edition（rooms.edition_id 外键引用）
	workID, _, err := st.RegisterWork(domain.Work{Title: "T", Protocol: "content-hash-v1", Code: "c1"})
	if err != nil {
		t.Fatal(err)
	}
	edID, _, err := st.RegisterEdition(domain.Edition{WorkID: workID, Ext: "epub", HashAlgo: "md5-sample3-v1", Hash: "h1", Size: 100, FilePath: "books/h1.epub"})
	if err != nil {
		t.Fatal(err)
	}

	// 注册房间 + 幂等
	rec := domain.RoomRecord{ID: "abcd1234", EditionID: edID, OwnerToken: "Aaaa111", CreatedAt: time.Now()}
	if err := st.RegisterRoom(rec); err != nil {
		t.Fatal(err)
	}
	if err := st.RegisterRoom(rec); err != nil {
		t.Fatal(err)
	}

	// 消息：追加 + 增量
	id1, ts1, err := st.InsertMessage("abcd1234", "Aaaa111", "alice", "hello")
	if err != nil {
		t.Fatal(err)
	}
	if ts1 == 0 {
		t.Fatal("created_at should be set")
	}
	id2, _, _ := st.InsertMessage("abcd1234", "Bbbb222", "bob", "hi")

	msgs, err := st.ListMessages("abcd1234", 0, 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(msgs) != 2 || msgs[0].Text != "hello" || msgs[1].Text != "hi" || msgs[0].Nick != "alice" {
		t.Fatalf("bad messages: %+v", msgs)
	}
	after, _ := st.ListMessages("abcd1234", id1, 10)
	if len(after) != 1 || after[0].ID != id2 {
		t.Fatalf("after filter wrong: %+v", after)
	}
	limit1, _ := st.ListMessages("abcd1234", 0, 1)
	if len(limit1) != 1 {
		t.Fatalf("limit wrong: %+v", limit1)
	}
	st.Close()

	// 重启恢复：重开同一数据目录，房间与消息都在
	st2, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer st2.Close()
	recs, err := st2.ListRooms()
	if err != nil {
		t.Fatal(err)
	}
	if len(recs) != 1 || recs[0].ID != "abcd1234" || recs[0].EditionID != edID || recs[0].OwnerToken != "Aaaa111" {
		t.Fatalf("rooms not restored: %+v", recs)
	}
	restored, _ := st2.ListMessages("abcd1234", 0, 10)
	if len(restored) != 2 {
		t.Fatalf("messages not restored: %+v", restored)
	}

	// 删房 → 消息级联清理
	if err := st2.DeleteRoom("abcd1234"); err != nil {
		t.Fatal(err)
	}
	afterDel, _ := st2.ListMessages("abcd1234", 0, 10)
	if len(afterDel) != 0 {
		t.Fatalf("messages should cascade delete: %+v", afterDel)
	}
	recs2, _ := st2.ListRooms()
	if len(recs2) != 0 {
		t.Fatalf("room should be deleted: %+v", recs2)
	}
}
