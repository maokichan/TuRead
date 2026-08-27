package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"turead/server/internal/room"
	"turead/server/internal/store"
	"turead/server/internal/transport"
)

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

const version = "0.1.2"

func main() {
	dataDir, err := filepath.Abs(getenv("TUREAD_DATA_DIR", "data"))
	if err != nil {
		log.Fatal(err)
	}
	addr := getenv("TUREAD_ADDR", ":8080")
	// 第 2 层准入门禁：服务器级共享钥匙（所有客户端配置同一把；未设置 = 不启用该层）
	accessToken := getenv("TUREAD_ACCESS_TOKEN", "")
	if accessToken == "" {
		log.Printf("warning: TUREAD_ACCESS_TOKEN not set — access-token gate disabled")
	}
	// 管理员 token 列表（逗号分隔；命中者 role=admin，可执行副本/房间清理等管理操作）
	var adminTokens []string
	for _, t := range strings.Split(getenv("TUREAD_ADMIN_TOKENS", ""), ",") {
		if t = strings.TrimSpace(t); t != "" {
			adminTokens = append(adminTokens, t)
		}
	}
	if len(adminTokens) > 0 {
		log.Printf("admin tokens configured: %d", len(adminTokens))
	}
	maxMembers := 20

	st, err := store.Open(dataDir)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	defer st.Close()

	fs, err := store.NewFileStore(dataDir)
	if err != nil {
		log.Fatalf("open file store: %v", err)
	}

	rm := room.NewManager(maxMembers)
	srv := &http.Server{
		Addr:    addr,
		Handler: transport.NewServer(st, fs, rm, accessToken, adminTokens).Routes(),
	}

	go func() {
		log.Printf("TuRead server %s listening on %s (data: %s)", version, addr, dataDir)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()

	// 优雅关停：SIGINT/SIGTERM → 停止接收新连接 → 等待在途请求（限时 10s）→ 关 DB 退出
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	<-ctx.Done()

	log.Println("shutting down ...")
	shutCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
	// 注：Shutdown 不等 hijacked 连接（WebSocket）——当前接受，关停时 WS 被直接断开
	log.Println("bye")
}
