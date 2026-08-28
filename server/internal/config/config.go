// Package config 服务器配置：TOML 文件 + 环境变量覆盖 + 内置默认。
//
// 优先级：环境变量（TUREAD_*）> 配置文件 > 默认值。
// 配置项分两类：
//   - 启动类（改动需重启）：addr（监听地址）、data_dir（数据目录）
//   - 策略类（支持热重载）：access_token、admin_tokens、room_ttl、max_upload_mb、log_level（预留）
// 热重载由 Watch 轮询配置文件实现；运维手册见 server/docs/OPS.md。
package config

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/BurntSushi/toml"
)

// Config 全部配置项（TOML 标签即配置文件字段名）
type Config struct {
	Addr        string        `toml:"addr"`         // 监听地址（启动类，热改不生效）
	DataDir     string        `toml:"data_dir"`     // 数据目录（启动类，热改不生效）
	AccessToken string        `toml:"access_token"` // 第 2 层准入门禁共享钥匙；空 = 不启用（策略类）
	AdminTokens []string      `toml:"admin_tokens"` // 管理员 token 列表（策略类）
	RoomTTL     time.Duration `toml:"room_ttl"`     // 空房间 TTL（策略类）
	MaxUploadMB int64         `toml:"max_upload_mb"` // 上传大小上限（MB；0 = 不限）（策略类）
	LogLevel    string        `toml:"log_level"`    // 日志级别（预留：日志系统未做分级）
}

// Default 内置默认值
func Default() Config {
	return Config{
		Addr:        ":8080",
		DataDir:     "data",
		RoomTTL:     12 * time.Hour,
		MaxUploadMB: 0,
		LogLevel:    "info",
	}
}

// DefaultConfigPath 默认配置文件路径（可用 TUREAD_CONFIG 覆盖）
const DefaultConfigPath = "turead.toml"

// Load 加载配置：默认值 → TOML 文件（configPath 为空时取 TUREAD_CONFIG 或 ./turead.toml；文件不存在则只用默认+环境）→ 环境变量覆盖。
func Load(configPath string) (Config, error) {
	cfg := Default()
	if configPath == "" {
		configPath = os.Getenv("TUREAD_CONFIG")
	}
	if configPath == "" {
		configPath = DefaultConfigPath
	}
	if _, err := os.Stat(configPath); err == nil {
		if _, err := toml.DecodeFile(configPath, &cfg); err != nil {
			return cfg, fmt.Errorf("parse config %s: %w", configPath, err)
		}
	} else if !os.IsNotExist(err) {
		return cfg, fmt.Errorf("stat config %s: %w", configPath, err)
	}

	// 环境变量覆盖（现有 TUREAD_* 语义保留；env 优先于文件）
	if v := os.Getenv("TUREAD_ADDR"); v != "" {
		cfg.Addr = v
	}
	if v := os.Getenv("TUREAD_DATA_DIR"); v != "" {
		cfg.DataDir = v
	}
	if v := os.Getenv("TUREAD_ACCESS_TOKEN"); v != "" {
		cfg.AccessToken = v
	}
	if v := os.Getenv("TUREAD_ADMIN_TOKENS"); v != "" {
		cfg.AdminTokens = splitCSV(v)
	}
	if v := os.Getenv("TUREAD_ROOM_TTL"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return cfg, fmt.Errorf("invalid TUREAD_ROOM_TTL %q: %w", v, err)
		}
		cfg.RoomTTL = d
	}
	if v := os.Getenv("TUREAD_MAX_UPLOAD_MB"); v != "" {
		var n int64
		if _, err := fmt.Sscanf(v, "%d", &n); err != nil {
			return cfg, fmt.Errorf("invalid TUREAD_MAX_UPLOAD_MB %q: %w", v, err)
		}
		cfg.MaxUploadMB = n
	}
	if err := cfg.Validate(); err != nil {
		return cfg, err
	}
	return cfg, nil
}

// Validate 校验配置合法性
func (c Config) Validate() error {
	if c.Addr == "" {
		return fmt.Errorf("addr must not be empty")
	}
	if c.DataDir == "" {
		return fmt.Errorf("data_dir must not be empty")
	}
	if c.RoomTTL <= 0 {
		return fmt.Errorf("room_ttl must be positive, got %s", c.RoomTTL)
	}
	if c.MaxUploadMB < 0 {
		return fmt.Errorf("max_upload_mb must be >= 0, got %d", c.MaxUploadMB)
	}
	return nil
}

// PolicyChanged 判断两个配置的策略类字段是否不同（热重载只关心这些）
func PolicyChanged(a, b Config) bool {
	return a.AccessToken != b.AccessToken ||
		strings.Join(a.AdminTokens, ",") != strings.Join(b.AdminTokens, ",") ||
		a.RoomTTL != b.RoomTTL ||
		a.MaxUploadMB != b.MaxUploadMB ||
		a.LogLevel != b.LogLevel
}

// Watch 轮询配置文件，变更（mtime 变化）时解析并调用 onReload；解析失败调用 onError。
// 返回 stop 函数停止监听。interval 为轮询间隔（如 2s）。
func Watch(configPath string, interval time.Duration, onReload func(Config), onError func(error)) (stop func()) {
	done := make(chan struct{})
	go func() {
		var lastMod time.Time
		for {
			select {
			case <-done:
				return
			case <-time.After(interval):
			}
			fi, err := os.Stat(configPath)
			if err != nil {
				// 文件被删/暂不可见：不处理（保留旧配置）
				continue
			}
			if fi.ModTime().Equal(lastMod) {
				continue
			}
			lastMod = fi.ModTime()
			cfg, err := Load(configPath)
			if err != nil {
				if onError != nil {
					onError(err)
				}
				continue
			}
			onReload(cfg)
		}
	}()
	return func() { close(done) }
}

func splitCSV(s string) []string {
	var out []string
	for _, t := range strings.Split(s, ",") {
		if t = strings.TrimSpace(t); t != "" {
			out = append(out, t)
		}
	}
	return out
}
