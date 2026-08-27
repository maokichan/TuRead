package store

import (
	"context"
	"database/sql"
	_ "embed"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"

	"turead/server/internal/domain"
)

// Store SQLite 注册表（works / editions），server 持久化的全部内容
type Store struct {
	db *sql.DB
}

//go:embed schema.sql
var schemaSQL string

// 老库列迁移：CREATE TABLE IF NOT EXISTS 对已存在的表不生效，缺列时补 ALTER。
var columnMigrations = []struct {
	table, column, ddl string
}{
	{"editions", "url", "ALTER TABLE editions ADD COLUMN url TEXT"},
	{"editions", "local_copy", "ALTER TABLE editions ADD COLUMN local_copy INTEGER NOT NULL DEFAULT 0"},
}

// Open 打开（或创建）数据目录下的 SQLite，并执行 schema 迁移
func Open(dataDir string) (*Store, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}
	dbPath := filepath.Join(dataDir, "turead.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1) // SQLite 单写者，串行访问
	for _, stmt := range splitStatements(schemaSQL) {
		if _, err := db.Exec(stmt); err != nil {
			db.Close()
			return nil, fmt.Errorf("migrate: %w", err)
		}
	}
	if err := migrateColumns(db); err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

// Ping 健康检查：确认 DB 连通（/healthz 探活用）
func (s *Store) Ping(ctx context.Context) error {
	return s.db.PingContext(ctx)
}

// splitStatements 按分号拆句（schema.sql 无字符串字面量，安全）
func splitStatements(s string) []string {
	parts := strings.Split(s, ";")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// migrateColumns 检查老库缺列并 ALTER 补齐
func migrateColumns(db *sql.DB) error {
	for _, m := range columnMigrations {
		rows, err := db.Query("PRAGMA table_info(" + m.table + ")")
		if err != nil {
			return fmt.Errorf("inspect %s: %w", m.table, err)
		}
		found := false
		for rows.Next() {
			var (
				cid     int
				name    string
				ctype   string
				notnull int
				dflt    any
				pk      int
			)
			if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
				rows.Close()
				return fmt.Errorf("scan %s columns: %w", m.table, err)
			}
			if name == m.column {
				found = true
			}
		}
		rows.Close()
		if !found {
			if _, err := db.Exec(m.ddl); err != nil {
				return fmt.Errorf("migrate %s.%s: %w", m.table, m.column, err)
			}
		}
	}
	return nil
}

// RegisterWork 注册作品；已存在（protocol, code 冲突）时返回既有 ID，created=false
func (s *Store) RegisterWork(w domain.Work) (id int64, created bool, err error) {
	res, err := s.db.Exec(
		`INSERT INTO works(title, protocol, code, author, publisher, language, cover, description, created_at)
		 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(protocol, code) DO NOTHING`,
		w.Title, w.Protocol, w.Code, w.Author, w.Publisher, w.Language, w.Cover, w.Description, time.Now().Unix(),
	)
	if err != nil {
		return 0, false, fmt.Errorf("insert work: %w", err)
	}
	created, err = inserted(res)
	if err != nil {
		return 0, false, err
	}
	row := s.db.QueryRow(`SELECT id FROM works WHERE protocol = ? AND code = ?`, w.Protocol, w.Code)
	if err := row.Scan(&id); err != nil {
		return 0, false, fmt.Errorf("select work: %w", err)
	}
	return id, created, nil
}

// RegisterEdition 注册电子版；指纹冲突时返回既有 ID，created=false（url 保留首个非空值）
func (s *Store) RegisterEdition(e domain.Edition) (id int64, created bool, err error) {
	res, err := s.db.Exec(
		`INSERT INTO editions(work_id, ext, hash_algo, hash, size, source, url, file_path, created_at)
		 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(hash_algo, ext, hash, size) DO UPDATE SET url = COALESCE(editions.url, excluded.url)`,
		e.WorkID, e.Ext, e.HashAlgo, e.Hash, e.Size, e.Source, e.URL, e.FilePath, time.Now().Unix(),
	)
	if err != nil {
		return 0, false, fmt.Errorf("insert edition: %w", err)
	}
	created, err = inserted(res)
	if err != nil {
		return 0, false, err
	}
	row := s.db.QueryRow(
		`SELECT id FROM editions WHERE hash_algo = ? AND ext = ? AND hash = ? AND size = ?`,
		e.HashAlgo, e.Ext, e.Hash, e.Size,
	)
	if err := row.Scan(&id); err != nil {
		return 0, false, fmt.Errorf("select edition: %w", err)
	}
	return id, created, nil
}

// inserted 从 INSERT ... ON CONFLICT DO NOTHING 的结果判断是否真正插入（1 = 新建，0 = 冲突已存在）
func inserted(res sql.Result) (bool, error) {
	n, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("rows affected: %w", err)
	}
	return n == 1, nil
}

// MarkLocalCopy 标记本机已存副本（上传成功后调用，置 local_copy = 1）
func (s *Store) MarkLocalCopy(id int64) error {
	_, err := s.db.Exec(`UPDATE editions SET local_copy = 1 WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("mark local copy: %w", err)
	}
	return nil
}

// ClearLocalCopy 清除本机副本标记（副本文件被删除后调用，置 local_copy = 0）
func (s *Store) ClearLocalCopy(id int64) error {
	_, err := s.db.Exec(`UPDATE editions SET local_copy = 0 WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("clear local copy: %w", err)
	}
	return nil
}

// RegisterUser 用户建档：token = 用户 ID；已存在时返回 created=false（幂等，不覆盖既有档案）。
// 首次进房间（WS join）时调用；nick 为 join 时的昵称（档案默认值）；role 由调用方判定（admin/user）。
func (s *Store) RegisterUser(token, nick, role string) (created bool, err error) {
	res, err := s.db.Exec(
		`INSERT INTO users(token, nick, bio, role, created_at) VALUES(?, ?, '', ?, ?)
		 ON CONFLICT(token) DO NOTHING`,
		token, nick, role, time.Now().Unix(),
	)
	if err != nil {
		return false, fmt.Errorf("insert user: %w", err)
	}
	created, err = inserted(res)
	if err != nil {
		return false, err
	}
	return created, nil
}

// GetUser 按 token 查用户档案
func (s *Store) GetUser(token string) (*domain.User, error) {
	u := &domain.User{}
	var createdAt int64
	err := s.db.QueryRow(
		`SELECT token, nick, bio, role, created_at FROM users WHERE token = ?`, token,
	).Scan(&u.Token, &u.Nick, &u.Bio, &u.Role, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("query user: %w", err)
	}
	u.CreatedAt = time.Unix(createdAt, 0)
	return u, nil
}

// FindWork 按协议+编码查作品
func (s *Store) FindWork(protocol, code string) (*domain.Work, error) {
	w := &domain.Work{}
	var createdAt int64
	err := s.db.QueryRow(
		`SELECT id, title, protocol, code, author, publisher, language, cover, description, created_at
		 FROM works WHERE protocol = ? AND code = ?`, protocol, code,
	).Scan(&w.ID, &w.Title, &w.Protocol, &w.Code, &w.Author, &w.Publisher, &w.Language, &w.Cover, &w.Description, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("query work: %w", err)
	}
	w.CreatedAt = time.Unix(createdAt, 0)
	return w, nil
}

// FindEdition 按扩展名+指纹查电子版
func (s *Store) FindEdition(ext string, fp domain.Fingerprint) (*domain.Edition, error) {
	e := &domain.Edition{}
	var createdAt int64
	err := s.db.QueryRow(
		`SELECT id, work_id, ext, hash_algo, hash, size, source, url, local_copy, file_path, created_at
		 FROM editions WHERE hash_algo = ? AND ext = ? AND hash = ? AND size = ?`,
		fp.Algorithm, ext, fp.Hash, fp.Size,
	).Scan(&e.ID, &e.WorkID, &e.Ext, &e.HashAlgo, &e.Hash, &e.Size, &e.Source, &e.URL, &e.LocalCopy, &e.FilePath, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("query edition: %w", err)
	}
	e.CreatedAt = time.Unix(createdAt, 0)
	return e, nil
}

// GetEdition 按 id 查电子版
func (s *Store) GetEdition(id int64) (*domain.Edition, error) {
	e := &domain.Edition{}
	var createdAt int64
	err := s.db.QueryRow(
		`SELECT id, work_id, ext, hash_algo, hash, size, source, url, local_copy, file_path, created_at
		 FROM editions WHERE id = ?`, id,
	).Scan(&e.ID, &e.WorkID, &e.Ext, &e.HashAlgo, &e.Hash, &e.Size, &e.Source, &e.URL, &e.LocalCopy, &e.FilePath, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("query edition by id: %w", err)
	}
	e.CreatedAt = time.Unix(createdAt, 0)
	return e, nil
}
