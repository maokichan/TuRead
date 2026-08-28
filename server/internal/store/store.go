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
	{"users", "ip", "ALTER TABLE users ADD COLUMN ip TEXT NOT NULL DEFAULT ''"},
	{"users", "token_issued_at", "ALTER TABLE users ADD COLUMN token_issued_at INTEGER NOT NULL DEFAULT 0"},
	{"rooms", "owner_token", "ALTER TABLE rooms ADD COLUMN owner_token TEXT NOT NULL DEFAULT ''"}, // v0.1.6 旧库 rooms.owner 列保留无害
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
		`INSERT INTO works(title, protocol, code, language, cover, description, created_at)
		 VALUES(?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(protocol, code) DO NOTHING`,
		w.Title, w.Protocol, w.Code, w.Language, w.Cover, w.Description, time.Now().Unix(),
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

// RegisterUser 用户建档：token = 用户 ID；已存在时返回 created=false。
// 首次进房间（WS join）时调用；nick 为 join 时的昵称。
// 幂等语义（v0.1.6）：token 可能已被签发建档（nick=''），此时冲突只补空 nick，不覆盖既有档案/role。
func (s *Store) RegisterUser(token, nick, role string) (created bool, err error) {
	// 已存在：只补空 nick
	var exists int
	err = s.db.QueryRow(`SELECT 1 FROM users WHERE token = ?`, token).Scan(&exists)
	if err == nil {
		if _, err := s.db.Exec(`UPDATE users SET nick = ? WHERE token = ? AND nick = ''`, nick, token); err != nil {
			return false, fmt.Errorf("update user nick: %w", err)
		}
		return false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return false, fmt.Errorf("query user: %w", err)
	}
	// 新建
	_, err = s.db.Exec(
		`INSERT INTO users(token, nick, bio, role, ip, token_issued_at, created_at) VALUES(?, ?, '', ?, '', 0, ?)`,
		token, nick, role, time.Now().Unix(),
	)
	if err != nil {
		return false, fmt.Errorf("insert user: %w", err)
	}
	return true, nil
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

// FindTokenByIP 按 IP 找未过期的已签发 token（token_issued_at >= since）；无则返回空串。
// v0.1.6 服务端签发模型：同一 IP 7 天内申请过 → 复用既有 token。
func (s *Store) FindTokenByIP(ip string, since int64) (string, error) {
	var token string
	err := s.db.QueryRow(
		`SELECT token FROM users WHERE ip = ? AND token_issued_at >= ? ORDER BY token_issued_at DESC LIMIT 1`,
		ip, since,
	).Scan(&token)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("find token by ip: %w", err)
	}
	return token, nil
}

// TouchToken 续期：更新该 token 的签发时间（复用路径；保证活跃 IP 的 token 不因 7 天窗口过期）
func (s *Store) TouchToken(token string, at int64) error {
	_, err := s.db.Exec(`UPDATE users SET token_issued_at = ? WHERE token = ?`, at, token)
	if err != nil {
		return fmt.Errorf("touch token: %w", err)
	}
	return nil
}

// IssueToken 为 IP 签发新 token：该 IP 已有签发记录则原地换发（保留 nick/role），否则新建档案。
// 返回 inserted=false 表示 token 恰好与既有用户碰撞（调用方换一个重试）。
func (s *Store) IssueToken(ip, token string, at int64) (bool, error) {
	res, err := s.db.Exec(
		`UPDATE users SET token = ?, token_issued_at = ? WHERE ip = ? AND token != ''`,
		token, at, ip,
	)
	if err != nil {
		return false, fmt.Errorf("rotate token: %w", err)
	}
	if n, _ := res.RowsAffected(); n > 0 {
		return true, nil
	}
	res, err = s.db.Exec(
		`INSERT INTO users(token, nick, bio, role, ip, token_issued_at, created_at) VALUES(?, '', '', 'user', ?, ?, ?)
		 ON CONFLICT(token) DO NOTHING`,
		token, ip, at, at,
	)
	if err != nil {
		return false, fmt.Errorf("issue token: %w", err)
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

// FindWork 按协议+编码查作品
func (s *Store) FindWork(protocol, code string) (*domain.Work, error) {
	w := &domain.Work{}
	var createdAt int64
	err := s.db.QueryRow(
		`SELECT id, title, protocol, code, language, cover, description, created_at
		 FROM works WHERE protocol = ? AND code = ?`, protocol, code,
	).Scan(&w.ID, &w.Title, &w.Protocol, &w.Code, &w.Language, &w.Cover, &w.Description, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("query work: %w", err)
	}
	w.CreatedAt = time.Unix(createdAt, 0)
	return w, nil
}

// GetWork 按 id 查作品（大厅展示书名用）
func (s *Store) GetWork(id int64) (*domain.Work, error) {
	w := &domain.Work{}
	var createdAt int64
	err := s.db.QueryRow(
		`SELECT id, title, protocol, code, language, cover, description, created_at
		 FROM works WHERE id = ?`, id,
	).Scan(&w.ID, &w.Title, &w.Protocol, &w.Code, &w.Language, &w.Cover, &w.Description, &createdAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("query work by id: %w", err)
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

// ---------- rooms / messages（v0.1.5：房间定义与聊天消息落库） ----------

// RegisterRoom 房间定义落库（创建房间时调用；幂等：重复 id 忽略）
func (s *Store) RegisterRoom(rec domain.RoomRecord) error {
	_, err := s.db.Exec(
		`INSERT INTO rooms(id, edition_id, owner_token, created_at) VALUES(?, ?, ?, ?)
		 ON CONFLICT(id) DO NOTHING`,
		rec.ID, rec.EditionID, rec.OwnerToken, rec.CreatedAt.Unix(),
	)
	if err != nil {
		return fmt.Errorf("insert room: %w", err)
	}
	return nil
}

// ListRooms 列出全部房间定义（server 启动时恢复内存房间用）
func (s *Store) ListRooms() ([]domain.RoomRecord, error) {
	rows, err := s.db.Query(`SELECT id, edition_id, owner_token, created_at FROM rooms`)
	if err != nil {
		return nil, fmt.Errorf("list rooms: %w", err)
	}
	defer rows.Close()
	out := []domain.RoomRecord{} // 空列表输出 []（而非 null）
	for rows.Next() {
		var rec domain.RoomRecord
		var createdAt int64
		if err := rows.Scan(&rec.ID, &rec.EditionID, &rec.OwnerToken, &createdAt); err != nil {
			return nil, fmt.Errorf("scan room: %w", err)
		}
		rec.CreatedAt = time.Unix(createdAt, 0)
		out = append(out, rec)
	}
	return out, rows.Err()
}

// DeleteRoom 删除房间定义及聊天消息（显式两步删，不依赖外键 pragma；幂等）
func (s *Store) DeleteRoom(id string) error {
	if _, err := s.db.Exec(`DELETE FROM messages WHERE room_id = ?`, id); err != nil {
		return fmt.Errorf("delete messages: %w", err)
	}
	if _, err := s.db.Exec(`DELETE FROM rooms WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete room: %w", err)
	}
	return nil
}

// InsertMessage 追加聊天消息（追加日志模型），返回消息 id 与 created_at（unix 秒，单一时间来源）
func (s *Store) InsertMessage(roomID, member, nick, text string) (id, createdAt int64, err error) {
	createdAt = time.Now().Unix()
	res, err := s.db.Exec(
		`INSERT INTO messages(room_id, member, nick, text, created_at) VALUES(?, ?, ?, ?, ?)`,
		roomID, member, nick, text, createdAt,
	)
	if err != nil {
		return 0, 0, fmt.Errorf("insert message: %w", err)
	}
	id, err = res.LastInsertId()
	if err != nil {
		return 0, 0, fmt.Errorf("last insert id: %w", err)
	}
	return id, createdAt, nil
}

// ListMessages 按 id 升序拉取聊天历史；after = 只取 id > after（0 = 从头）；limit 限制条数
func (s *Store) ListMessages(roomID string, after int64, limit int) ([]domain.ChatMessage, error) {
	rows, err := s.db.Query(
		`SELECT id, room_id, member, nick, text, created_at FROM messages
		 WHERE room_id = ? AND id > ? ORDER BY id ASC LIMIT ?`, roomID, after, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("list messages: %w", err)
	}
	defer rows.Close()
	out := []domain.ChatMessage{} // 空列表输出 []（而非 null），客户端解析友好
	for rows.Next() {
		var m domain.ChatMessage
		if err := rows.Scan(&m.ID, &m.RoomID, &m.Member, &m.Nick, &m.Text, &m.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan message: %w", err)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
