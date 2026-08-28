package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func writeFile(t *testing.T, content string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "turead.toml")
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestLoadFromFile(t *testing.T) {
	p := writeFile(t, `
addr = ":9999"
data_dir = "/srv/turead"
access_token = "file-token"
admin_tokens = ["Adm1n77", "Adm1n88"]
room_ttl = "1h"
max_upload_mb = 100
`)
	cfg, err := Load(p)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Addr != ":9999" || cfg.DataDir != "/srv/turead" || cfg.AccessToken != "file-token" {
		t.Fatalf("file fields wrong: %+v", cfg)
	}
	if len(cfg.AdminTokens) != 2 || cfg.AdminTokens[0] != "Adm1n77" {
		t.Fatalf("admin tokens wrong: %+v", cfg.AdminTokens)
	}
	if cfg.RoomTTL != time.Hour || cfg.MaxUploadMB != 100 {
		t.Fatalf("policy fields wrong: %+v", cfg)
	}
}

func TestEnvOverridesFile(t *testing.T) {
	p := writeFile(t, "room_ttl = \"1h\"\nmax_upload_mb = 100\n")
	t.Setenv("TUREAD_ROOM_TTL", "30m")
	t.Setenv("TUREAD_MAX_UPLOAD_MB", "50")
	t.Setenv("TUREAD_ADMIN_TOKENS", "Xxx1111, Yyy2222")
	cfg, err := Load(p)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.RoomTTL != 30*time.Minute || cfg.MaxUploadMB != 50 {
		t.Fatalf("env should override file: %+v", cfg)
	}
	if len(cfg.AdminTokens) != 2 {
		t.Fatalf("env admin tokens wrong: %+v", cfg.AdminTokens)
	}
}

func TestMissingFileUsesDefaults(t *testing.T) {
	cfg, err := Load(filepath.Join(t.TempDir(), "nope.toml"))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Addr != ":8080" || cfg.DataDir != "data" || cfg.RoomTTL != 12*time.Hour {
		t.Fatalf("defaults wrong: %+v", cfg)
	}
}

func TestValidationRejectsBadValues(t *testing.T) {
	p := writeFile(t, "room_ttl = \"-1h\"\n")
	if _, err := Load(p); err == nil {
		t.Fatal("negative room_ttl should fail validation")
	}
	p2 := writeFile(t, "max_upload_mb = -5\n")
	if _, err := Load(p2); err == nil {
		t.Fatal("negative max_upload_mb should fail validation")
	}
	p3 := writeFile(t, "room_ttl = \"bogus\"\n")
	if _, err := Load(p3); err == nil {
		t.Fatal("unparseable room_ttl should fail")
	}
}

func TestPolicyChanged(t *testing.T) {
	a := Default()
	b := Default()
	if PolicyChanged(a, b) {
		t.Fatal("identical configs should not be 'changed'")
	}
	b.RoomTTL = time.Hour
	if !PolicyChanged(a, b) {
		t.Fatal("policy diff should be detected")
	}
	b = Default()
	b.Addr = ":9999" // 启动类字段不算策略变更
	if PolicyChanged(a, b) {
		t.Fatal("addr change is not a policy change")
	}
}
