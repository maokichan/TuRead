package domain

import "time"

// BookLocation 阅读位置 —— 房间同步的最小载荷，与 client 契约 client/docs/CONTRACTS.md 对齐
type BookLocation struct {
	ChapterDocIndex any     `json:"chapterDocIndex"`
	ChapterHref     string  `json:"chapterHref"`
	Count           int     `json:"count"`
	Page            int     `json:"page"`
	Percentage      float64 `json:"percentage"`
	Text            string  `json:"text"`
	ChapterTitle    string  `json:"chapterTitle,omitempty"`
}

// Fingerprint 电子版指纹 —— 头/中/尾三点采样（头64KB + 中点64KB + 尾64KB 拼接后哈希）
type Fingerprint struct {
	Algorithm string `json:"algorithm"`
	Hash      string `json:"hash"`
	Size      int64  `json:"size"`
}

// Work 作品（同一本书）—— 由识别协议 + 识别编码唯一确定。
// 决策（2026-08-27）：不设 author / publisher 字段 ——
//   - 一本书可能有多位作者，单作者字段是错误建模；多作者需 work_author 联结表 + 倒查表 + 核对机制，远期复杂，现阶段不做；
//   - ISBN 等外部标识符已提供可查询性（作者/出版商可经 ISBN 外部解析）；
//   - language / cover / description 保留（当前未填充，预留书架展示）。
type Work struct {
	ID          int64
	Title       string
	Protocol    string
	Code        string
	Language    string
	Cover       string
	Description string
	CreatedAt   time.Time
}

// Edition 电子版（同一电子文件）—— 扩展名 + 指纹唯一确定
type Edition struct {
	ID        int64
	WorkID    int64
	Ext       string
	HashAlgo  string
	Hash      string
	Size      int64
	Source    string
	URL       string // 下载来源（外部平台 zlib/anna 等，或本机地址）；可选
	LocalCopy bool   // 本机（server 内容寻址存储）是否已存副本；上传成功后置 1
	FilePath  string
	CreatedAt time.Time
}

// Member 房间成员（内存态，不落库；json 与 client 契约 RoomMember 对齐：id / nickName / location）
type Member struct {
	ID       string         `json:"id"`
	NickName string         `json:"nickName"`
	Location *BookLocation  `json:"location,omitempty"`
}

// 用户角色枚举（v0.1.1 只存不 enforce，权限逻辑远期实现）
const (
	RoleUser    = "user"    // 正常
	RoleAdmin   = "admin"   // 管理
	RoleLimited = "limited" // 限制
)

// User 用户档案（token = 成员 token = 用户 ID；远期迁用户系统时 token 即用户名）
type User struct {
	Token     string
	Nick      string
	Bio       string
	Role      string
	CreatedAt time.Time
}

// RoomRecord 房间定义（持久化，v0.1.5 起落库；成员/位置/订阅仍内存）
// v0.1.6：owner 由昵称快照改为成员 token（owner_token）——房主身份可验证（房主权限远期）；展示昵称从 users 表解析。
type RoomRecord struct {
	ID         string
	EditionID  int64
	OwnerToken string
	CreatedAt  time.Time
}

// ChatMessage 聊天消息（追加日志模型，随房间删除级联清理）
type ChatMessage struct {
	ID        int64  `json:"id"`
	RoomID    string `json:"roomId"`
	Member    string `json:"member"` // 发送者成员 token
	Nick      string `json:"nick"`   // 发送时昵称快照
	Text      string `json:"text"`
	CreatedAt int64  `json:"createdAt"` // unix 秒
}

// MessageEnvelope 消息信封 —— transport 只搬运信封，语义由用例层解释
type MessageEnvelope struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

// 消息类型（server 定义，client 适配）
const (
	MsgJoin        = "room.join"     // client → server：加入房间
	MsgJoinAck     = "room.join-ack" // server → client：加入结果
	MsgLocation    = "room.location" // client → server：广播当前位置
	MsgPresence    = "room.presence" // server → 房间：成员/位置更新
	MsgChat        = "room.chat"     // client → server：发送聊天消息（v0.1.5）
	MsgChatMessage = "room.message"  // server → 房间：聊天消息广播（含发送者）（v0.1.5）
	MsgSystem      = "room.system"   // server → client：系统消息
	MsgBookMismatch = "room.book-mismatch" // server → client：书籍不匹配
)

// JoinAck 加入房间结果
type JoinAck struct {
	OK      bool     `json:"ok"`
	Reason  string   `json:"reason,omitempty"` // book-mismatch | room-not-found | room-full
	RoomID  string   `json:"roomId,omitempty"`
	Edition *Edition `json:"edition,omitempty"` // 无书成员加入时返回 edition 供下载
	Members []Member `json:"members,omitempty"`
}
