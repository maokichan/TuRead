package store

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"

	"turead/server/internal/domain"
)

// Store SQLite 注册表（works / editions），server 持久化的全部内容
type Store struct {
	db *sql.DB
}

var schema = []string{
	`CREATE TABLE IF NOT EXISTS works (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		title       TEXT NOT NULL,
		protocol    TEXT NOT NULL,
		code        TEXT NOT NULL,
		author      TEXT,
		publisher   TEXT,
		language    TEXT,
		cover       TEXT,
		description TEXT,
		created_at  INTEGER NOT NULL,
		UNIQUE(protocol, code)
	)`,
	`CREATE TABLE IF NOT EXISTS editions (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		work_id    INTEGER NOT NULL REFERENCES works(id),
		ext        TEXT NOT NULL,
		hash_algo  TEXT NOT NULL DEFAULT 'md5-sample3-v1',
		hash       TEXT NOT NULL,
		size       INTEGER NOT NULL,
		source     TEXT,
		file_path  TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		UNIQUE(hash_algo, ext, hash, size)
	)`,
	`CREATE INDEX IF NOT EXISTS idx_editions_work ON editions(work_id)`,
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
	for _, stmt := range schema {
		if _, err := db.Exec(stmt); err != nil {
			db.Close()
			return nil, fmt.Errorf("migrate: %w", err)
		}
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

// RegisterWork 注册作品；已存在（protocol, code 冲突）时返回既有 ID，created=false
func (s *Store) RegisterWork(w domain.Work) (id int64, created bool, err error) {
	now := time.Now().Unix()
	_, err = s.db.Exec(
		`INSERT INTO works(title, protocol, code, author, publisher, language, cover, description, created_at)
		 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(protocol, code) DO NOTHING`,
		w.Title, w.Protocol, w.Code, w.Author, w.Publisher, w.Language, w.Cover, w.Description, now,
	)
	if err != nil {
		return 0, false, fmt.Errorf("insert work: %w", err)
	}
	row := s.db.QueryRow(`SELECT id FROM works WHERE protocol = ? AND code = ?`, w.Protocol, w.Code)
	if err := row.Scan(&id); err != nil {
		return 0, false, fmt.Errorf("select work: %w", err)
	}
	var existing time.Time
	_ = s.db.QueryRow(`SELECT created_at FROM works WHERE id = ?`, id).Scan(&existing)
	created = existing.Unix() == now
	return id, created, nil
}

// RegisterEdition 注册电子版；指纹冲突时返回既有 ID，created=false
func (s *Store) RegisterEdition(e domain.Edition) (id int64, created bool, err error) {
	now := time.Now().Unix()
	_, err = s.db.Exec(
		`INSERT INTO editions(work_id, ext, hash_algo, hash, size, source, file_path, created_at)
		 VALUES(?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(hash_algo, ext, hash, size) DO NOTHING`,
		e.WorkID, e.Ext, e.HashAlgo, e.Hash, e.Size, e.Source, e.FilePath, now,
	)
	if err != nil {
		return 0, false, fmt.Errorf("insert edition: %w", err)
	}
	row := s.db.QueryRow(
		`SELECT id FROM editions WHERE hash_algo = ? AND ext = ? AND hash = ? AND size = ?`,
		e.HashAlgo, e.Ext, e.Hash, e.Size,
	)
	if err := row.Scan(&id); err != nil {
		return 0, false, fmt.Errorf("select edition: %w", err)
	}
	var existing time.Time
	_ = s.db.QueryRow(`SELECT created_at FROM editions WHERE id = ?`, id).Scan(&existing)
	created = existing.Unix() == now
	return id, created, nil
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
		`SELECT id, work_id, ext, hash_algo, hash, size, source, file_path, created_at
		 FROM editions WHERE hash_algo = ? AND ext = ? AND hash = ? AND size = ?`,
		fp.Algorithm, ext, fp.Hash, fp.Size,
	).Scan(&e.ID, &e.WorkID, &e.Ext, &e.HashAlgo, &e.Hash, &e.Size, &e.Source, &e.FilePath, &createdAt)
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
		`SELECT id, work_id, ext, hash_algo, hash, size, source, file_path, created_at
		 FROM editions WHERE id = ?`, id,
	).Scan(&e.ID, &e.WorkID, &e.Ext, &e.HashAlgo, &e.Hash, &e.Size, &e.Source, &e.FilePath, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("query edition by id: %w", err)
	}
	e.CreatedAt = time.Unix(createdAt, 0)
	return e, nil
}
