package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"turead/server/internal/config"
	"turead/server/internal/room"
	"turead/server/internal/store"
	"turead/server/internal/transport"
)

const version = "0.1.6"

func main() {
	// 配置：默认值 → TOML 文件（TUREAD_CONFIG 或 ./turead.toml）→ 环境变量覆盖（TUREAD_*）
	cfg, err := config.Load("")
	if err != nil {
		log.Fatalf("load config: %v", err)
	}
	dataDir, err := filepath.Abs(cfg.DataDir)
	if err != nil {
		log.Fatal(err)
	}
	if cfg.AccessToken == "" {
		log.Printf("warning: access_token not set — access-token gate disabled")
	}
	if len(cfg.AdminTokens) > 0 {
		log.Printf("admin tokens configured: %d", len(cfg.AdminTokens))
	}

	st, err := store.Open(dataDir)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	defer st.Close()

	fs, err := store.NewFileStore(dataDir)
	if err != nil {
		log.Fatalf("open file store: %v", err)
	}

	rm := room.NewManager(20, cfg.RoomTTL)
	// 重启恢复：持久化房间定义 → 内存房间（空房间，TTL 自恢复时刻起算）
	if recs, err := st.ListRooms(); err != nil {
		log.Printf("restore rooms: %v", err)
	} else {
		for _, rec := range recs {
			rm.Restore(rec)
		}
		if len(recs) > 0 {
			log.Printf("restored %d room(s) from db", len(recs))
		}
	}
	// TTL 过期回调：同步删除持久化房间记录（含聊天消息）
	rm.SetOnExpired(func(roomID string) {
		if err := st.DeleteRoom(roomID); err != nil {
			log.Printf("delete expired room %s: %v", roomID, err)
		}
	})

	ts := transport.NewServer(st, fs, rm, transport.Policy{
		AccessToken:    cfg.AccessToken,
		AdminTokens:    cfg.AdminTokens,
		MaxUploadBytes: cfg.MaxUploadMB * 1024 * 1024,
	})
	srv := &http.Server{
		Addr:    cfg.Addr,
		Handler: ts.Routes(),
	}

	go func() {
		log.Printf("TuRead server %s listening on %s (data: %s)", version, cfg.Addr, dataDir)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()

	// 配置文件热重载（策略类字段：access_token / admin_tokens / room_ttl / max_upload_mb；
	// addr / data_dir 为启动类，改动需重启生效）。已连接 WS 不受令牌变更影响（连接时已鉴权）。
	configPath := os.Getenv("TUREAD_CONFIG")
	if configPath == "" {
		configPath = config.DefaultConfigPath
	}
	stopWatch := config.Watch(configPath, 2*time.Second, func(newCfg config.Config) {
		if !config.PolicyChanged(cfg, newCfg) {
			return
		}
		log.Printf("config reloaded: room_ttl=%s max_upload_mb=%d", newCfg.RoomTTL, newCfg.MaxUploadMB)
		cfg = newCfg
		ts.ApplyPolicy(transport.Policy{
			AccessToken:    cfg.AccessToken,
			AdminTokens:    cfg.AdminTokens,
			MaxUploadBytes: cfg.MaxUploadMB * 1024 * 1024,
		})
		rm.SetTTL(cfg.RoomTTL)
	}, func(err error) {
		log.Printf("config reload failed: %v", err)
	})
	defer stopWatch()

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
