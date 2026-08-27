package transport

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"turead/server/internal/domain"
)

// TestSendQueueOverflowKicks 广播背压：out 队列满时 send 必须走 default 分支 kick 慢客户端，
// 而不是阻塞广播方（防止一个慢客户端拖垮整个房间）。
func TestSendQueueOverflowKicks(t *testing.T) {
	serverConn := make(chan *websocket.Conn, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		up := websocket.Upgrader{}
		c, err := up.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		serverConn <- c
		for { // 服务端一侧只读不写 = 慢客户端语义（writer 无人消费队列）
			if _, _, err := c.ReadMessage(); err != nil {
				return
			}
		}
	}))
	defer srv.Close()

	cc, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer cc.Close()
	sc := <-serverConn // 拿到服务端连接

	wc := &wsClient{
		conn: sc,
		out:  make(chan []byte, 1), // 队列容量 1（不启动 writer，模拟 writer 被慢客户端卡死）
		done: make(chan struct{}),
	}

	env := domain.MessageEnvelope{Type: domain.MsgPresence, Payload: []byte("{}")}
	wc.send(env) // 入队 → 满
	start := time.Now()
	wc.send(env) // 溢出 → kick（必须非阻塞返回）
	if time.Since(start) > 100*time.Millisecond {
		t.Fatal("send blocked on full queue (backpressure broken)")
	}

	select {
	case <-wc.done:
	case <-time.After(time.Second):
		t.Fatal("send overflow did not kick the client")
	}
	cc.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, _, err := cc.ReadMessage(); err == nil {
		t.Fatal("client connection should be closed after kick")
	}
}
