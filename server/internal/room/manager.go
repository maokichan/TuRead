package room

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
	"time"

	"turead/server/internal/domain"
)

var (
	ErrNotFound = errors.New("room not found")
	ErrMismatch = errors.New("book mismatch")
	ErrFull     = errors.New("room full")
)

// Room 内存房间（运行时状态不落库：成员/位置/订阅全是瞬态；房间定义落库，重启恢复）
type Room struct {
	ID          string
	EditionID   int64
	OwnerToken  string // 房主成员 token（v0.1.6 起；房主身份可验证）
	CreatedAt   time.Time

	mu          sync.RWMutex
	members     map[string]*domain.Member               // memberID -> member
	subscribers map[string]func(domain.MessageEnvelope) // memberID -> 发信回调（transport 注册）
	emptyAt     *time.Time                              // 房间变空时刻（nil = 非空）；空房间超过 TTL 被清理
}

func newRoom(id string, editionID int64, ownerToken string, now time.Time) *Room {
	return &Room{
		ID:          id,
		EditionID:   editionID,
		OwnerToken:  ownerToken,
		CreatedAt:   now,
		emptyAt:     &now, // 新房间为空，TTL 从创建时刻起算
		members:     map[string]*domain.Member{},
		subscribers: map[string]func(domain.MessageEnvelope){},
	}
}

// Members 返回成员快照（含当前位置）
func (r *Room) Members() []domain.Member {
	r.mu.RLock()
	defer r.mu.RUnlock()
	list := make([]domain.Member, 0, len(r.members))
	for _, m := range r.members {
		list = append(list, *m)
	}
	return list
}

func (r *Room) MemberCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.members)
}

// Broadcast 向除 except 外的所有订阅者广播信封
func (r *Room) Broadcast(except string, env domain.MessageEnvelope) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for id, send := range r.subscribers {
		if id == except {
			continue
		}
		send(env)
	}
}

// RoomManager 内存房间管理器（用例层：房间生命周期）
// 决策（2026-08-27/29）：房间定义落库（rooms 表，v0.1.5 起）但**运行时状态（成员/位置/订阅）纯内存**；
// 空房间进入 TTL 倒计时（默认 12h，可配/可热改），超时在 Get/List 时惰性清理（reap 并回调 onExpired 同步删 DB）；
// 有成员的房间一直存活；重新有人加入取消倒计时；admin DELETE /rooms 强制删除（transport 同步清 DB）。
type RoomManager struct {
	mu         sync.RWMutex
	rooms      map[string]*Room
	maxMembers int
	ttl        time.Duration
	now        func() time.Time      // 时钟（默认 time.Now；测试可注入）
	onExpired  func(roomID string)   // 房间因 TTL 过期被清理时的回调（transport 用它同步删 DB 记录）
}

func NewManager(maxMembers int, ttl time.Duration) *RoomManager {
	return &RoomManager{
		rooms:      map[string]*Room{},
		maxMembers: maxMembers,
		ttl:        ttl,
		now:        time.Now,
	}
}

// SetTTL 热重载：更新空房间 TTL（策略类配置）
func (m *RoomManager) SetTTL(ttl time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.ttl = ttl
}

// SetOnExpired 注册 TTL 过期清理回调（transport 用于同步删除持久化房间记录）
func (m *RoomManager) SetOnExpired(fn func(roomID string)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onExpired = fn
}

// Restore 启动恢复：从持久化房间定义重建内存房间（空房间，TTL 自恢复时刻起算）
func (m *RoomManager) Restore(rec domain.RoomRecord) {
	r := newRoom(rec.ID, rec.EditionID, rec.OwnerToken, m.now())
	r.CreatedAt = rec.CreatedAt
	m.mu.Lock()
	m.rooms[rec.ID] = r
	m.mu.Unlock()
}

func newID() (string, error) {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// Create 创建房间并绑定电子版；ownerToken 为房主成员 token（来自请求认证上下文）
func (m *RoomManager) Create(editionID int64, ownerToken string) (*Room, error) {
	id, err := newID()
	if err != nil {
		return nil, err
	}
	r := newRoom(id, editionID, ownerToken, m.now())
	m.mu.Lock()
	m.rooms[id] = r
	m.mu.Unlock()
	return r, nil
}

func (m *RoomManager) Get(id string) (*Room, error) {
	m.reap()
	m.mu.RLock()
	defer m.mu.RUnlock()
	r, ok := m.rooms[id]
	if !ok {
		return nil, ErrNotFound
	}
	return r, nil
}

// Join 加入房间并标定：
//   - fp 非空：指纹必须与房间绑定 edition 一致，否则 ErrMismatch（严格模式）
//   - fp 为 nil：无书成员，允许加入（transport 用返回的 room 拿 edition 供下载）
//
// edition 为房间绑定的电子版（由 transport 从 store 查好传入，用于指纹比对）。
// 成功后自动注册成员与订阅；send 为 transport 写 WS 的回调。
func (m *RoomManager) Join(roomID, memberID, nick string, edition *domain.Edition, fp *domain.Fingerprint, send func(domain.MessageEnvelope)) (*Room, error) {
	r, err := m.Get(roomID)
	if err != nil {
		return nil, err
	}
	if fp != nil {
		if edition == nil || !editionMatches(fp, *edition) {
			return nil, ErrMismatch
		}
	}
	if m.maxMembers > 0 && r.MemberCount() >= m.maxMembers {
		return nil, ErrFull
	}
	r.mu.Lock()
	r.members[memberID] = &domain.Member{ID: memberID, NickName: nick}
	if send != nil {
		r.subscribers[memberID] = send
	}
	r.emptyAt = nil // 有人加入：取消空房间 TTL 倒计时
	r.mu.Unlock()
	return r, nil
}

// Leave 离开：移除成员与订阅；房间变空时记录 emptyAt 启动 TTL 倒计时（不再立即销毁）。
// 返回是否"刚变空"。
func (m *RoomManager) Leave(roomID, memberID string) bool {
	r, err := m.Get(roomID)
	if err != nil {
		return false
	}
	r.mu.Lock()
	delete(r.members, memberID)
	delete(r.subscribers, memberID)
	empty := len(r.members) == 0
	if empty {
		t := m.now()
		r.emptyAt = &t
	} else {
		r.emptyAt = nil
	}
	r.mu.Unlock()
	return empty
}

// reap 惰性清理超过 TTL 的空房间（Get / List 时调用），并回调 onExpired 供 transport 同步删 DB
func (m *RoomManager) reap() {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := m.now()
	for id, r := range m.rooms {
		r.mu.RLock()
		expired := r.emptyAt != nil && now.Sub(*r.emptyAt) > m.ttl
		r.mu.RUnlock()
		if expired {
			delete(m.rooms, id)
			if m.onExpired != nil {
				m.onExpired(id)
			}
		}
	}
}

// RoomInfo 房间概要（发现 / 大厅用）
type RoomInfo struct {
	ID          string
	EditionID   int64
	OwnerToken  string
	MemberCount int
	CreatedAt   time.Time
}

// List 返回全部存活房间概要（先清理过期空房间）
func (m *RoomManager) List() []RoomInfo {
	m.reap()
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]RoomInfo, 0, len(m.rooms))
	for id, r := range m.rooms {
		out = append(out, RoomInfo{
			ID:          id,
			EditionID:   r.EditionID,
			OwnerToken:  r.OwnerToken,
			MemberCount: r.MemberCount(),
			CreatedAt:   r.CreatedAt,
		})
	}
	return out
}

// Delete 删除房间并返回成员 ID 快照（管理操作；调用方负责踢掉这些成员的连接）
func (m *RoomManager) Delete(roomID string) ([]string, error) {
	m.mu.Lock()
	r, ok := m.rooms[roomID]
	if !ok {
		m.mu.Unlock()
		return nil, ErrNotFound
	}
	delete(m.rooms, roomID)
	m.mu.Unlock()
	r.mu.RLock()
	ids := make([]string, 0, len(r.members))
	for id := range r.members {
		ids = append(ids, id)
	}
	r.mu.RUnlock()
	return ids, nil
}

// SetLocation 更新成员位置并广播 presence 给其他人
func (m *RoomManager) SetLocation(roomID, memberID string, loc *domain.BookLocation) bool {
	r, err := m.Get(roomID)
	if err != nil {
		return false
	}
	r.mu.Lock()
	mem, ok := r.members[memberID]
	if ok {
		mem.Location = loc
	}
	members := make([]domain.Member, 0, len(r.members))
	for _, mbr := range r.members {
		members = append(members, *mbr)
	}
	r.mu.Unlock()
	if !ok {
		return false
	}
	r.Broadcast(memberID, domain.MessageEnvelope{
		Type:    domain.MsgPresence,
		Payload: members,
	})
	return true
}

// EditionID 返回房间绑定的电子版 id
func (m *RoomManager) EditionID(roomID string) (int64, error) {
	r, err := m.Get(roomID)
	if err != nil {
		return 0, err
	}
	return r.EditionID, nil
}

func editionMatches(fp *domain.Fingerprint, ed domain.Edition) bool {
	return fp.Hash != "" && fp.Hash == ed.Hash && fp.Size == ed.Size
}
