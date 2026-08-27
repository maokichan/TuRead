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

// Room 内存房间（不落库：成员/位置/订阅全是瞬态）
type Room struct {
	ID        string
	EditionID int64
	Owner     string
	CreatedAt time.Time

	mu          sync.RWMutex
	members     map[string]*domain.Member                       // memberID -> member
	subscribers map[string]func(domain.MessageEnvelope)         // memberID -> 发信回调（transport 注册）
}

func newRoom(id string, editionID int64, owner string) *Room {
	return &Room{
		ID:          id,
		EditionID:   editionID,
		Owner:       owner,
		CreatedAt:   time.Now(),
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
type RoomManager struct {
	mu         sync.RWMutex
	rooms      map[string]*Room
	maxMembers int
}

func NewManager(maxMembers int) *RoomManager {
	return &RoomManager{rooms: map[string]*Room{}, maxMembers: maxMembers}
}

func newID() (string, error) {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// Create 创建房间并绑定电子版
func (m *RoomManager) Create(editionID int64, owner string) (*Room, error) {
	id, err := newID()
	if err != nil {
		return nil, err
	}
	r := newRoom(id, editionID, owner)
	m.mu.Lock()
	m.rooms[id] = r
	m.mu.Unlock()
	return r, nil
}

func (m *RoomManager) Get(id string) (*Room, error) {
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
	r.mu.Unlock()
	return r, nil
}

// Leave 离开：移除成员与订阅；房间空了返回 true（可销毁）
func (m *RoomManager) Leave(roomID, memberID string) bool {
	r, err := m.Get(roomID)
	if err != nil {
		return false
	}
	r.mu.Lock()
	delete(r.members, memberID)
	delete(r.subscribers, memberID)
	empty := len(r.members) == 0
	r.mu.Unlock()
	if empty {
		m.mu.Lock()
		delete(m.rooms, roomID)
		m.mu.Unlock()
		return true
	}
	return false
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
