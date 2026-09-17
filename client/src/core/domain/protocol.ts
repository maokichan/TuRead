/**
 * 房间协议词汇（领域层，纯函数，零依赖）—— **唯一解释处**。
 * 依据：`server/docs/API.md`「同步协议与转发规范」「WebSocket」「认证」与 `client/docs/CONTRACTS.md` §4.2/§5.1。
 *
 * 为什么要专门一个文件（Rule of Three，2026-09-17 房间聊天室落地时立）：
 * 信封 type 字符串、失败 reason 的判定、昵称长度约束、房间 WS 的握手地址、聊天历史的路径与合并
 * 此前散落在 `RoomSession` 的 switch-case、`wsNetAdapter` 与 UI 里，**各处自行解释**。
 * 后果已经出现过一次：服务器实际下发的是 `"room not found"`（空格分词），而客户端按
 * `"room-not-found"` 精确匹配 → **"书不匹配"被静默降级成 server-error**，两侧都没报错。
 * 于是：凡是"协议长什么样"的判断，一律收进本文件（可单测、可对照服务器文本逐条核）。
 */
import type { ChatMessage } from './types'

/**
 * 信封 type 常量（`server/docs/API.md`「消息类型清单」）。
 * ⚠ 改这里 = 改协议 → 契约先行（同 commit 改 `server/docs/API.md` + `client/docs/CONTRACTS.md`）。
 */
export const ROOM_MSG = {
  /** client → server：加入房间（上报指纹标定） */
  join: 'room.join',
  /** server → client：加入结果（ok / reason / edition / members 全量快照） */
  joinAck: 'room.join-ack',
  /** client → server：位置上报（只同步状态，不转发翻页动作） */
  location: 'room.location',
  /** server → 房间其他人：成员全量快照（含每人位置） */
  presence: 'room.presence',
  /** client → server：发送聊天 */
  chat: 'room.chat',
  /** server → 房间**全部**成员（含发送者）：聊天广播（server 权威回执） */
  message: 'room.message',
  /** server → client：系统消息（已定义未发送） */
  system: 'room.system',
  /** server → client：书籍不匹配（已定义未发送，当前走 join-ack 的 reason） */
  bookMismatch: 'room.book-mismatch'
} as const

/** 客户端**归一后**的加入失败原因（UI 只认这四个） */
export type JoinFailureReason = 'book-mismatch' | 'room-not-found' | 'room-full' | 'server-error'

/**
 * 服务端允许的最大昵称长度（按"字"计，rune 数）。
 * 权威 = `server/internal/transport/ws.go` 的 `maxNickLen = 12`（`API.md`「用户」：昵称 ≤12 字，
 * **超长直接拒绝连接**）。客户端必须先自查 —— 否则超长昵称的表现是"连接被服务器静默关掉"，
 * 用户看到的是随机断线，而不是"昵称太长"。
 */
export const MAX_NICK_LEN = 12

/** 昵称是否合法（非空 + ≤12 字；按 rune 计，与服务器同一口径） */
export function isValidNick(nick: string): boolean {
  const n = (nick ?? '').trim()
  return n.length > 0 && Array.from(n).length <= MAX_NICK_LEN
}

/**
 * 归一服务端下发的 `join-ack.reason`。
 *
 * ⚠ **已实测的服务器/文档偏差（2026-09-17 复核，登记在 `TODO.md` 的「同步」组）**：
 * 服务器实际发的是 `room.ErrNotFound = "room not found"` / `ErrMismatch = "book mismatch"` /
 * `ErrFull = "room full"`（`server/internal/room/manager.go`，**空格分词**，且 `transport/ws.go`
 * 另硬编码了 `"room not found"` / `"bad payload"`），而 `API.md` 与客户端契约写的是**连字符**形式。
 * 客户端只做精确匹配时：`book-mismatch` → `server-error`（"书不匹配"的提示永远出不来）。
 * 处置（本轮，不改服务器）：**容错归一**——空格/下划线/大小写一律收，未知串归 `server-error`。
 */
export function normalizeJoinReason(reason: string | undefined | null): JoinFailureReason {
  const r = (reason ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-')
  switch (r) {
    case 'book-mismatch':
      return 'book-mismatch'
    case 'room-not-found':
      return 'room-not-found'
    case 'room-full':
      return 'room-full'
    default:
      return 'server-error'
  }
}

/**
 * 房间 WebSocket 握手地址：`ws(s)://host:port/ws?room=<id>&nick=<name>`。
 *
 * ⚠ **这是"按房间建连"的依据**（`API.md`「WebSocket —— GET /ws?room=<id>&nick=<name>」）：
 * 服务器在**握手时**就取 `room` 与 `nick`，缺任一或昵称超长 → 直接关连接（`transport/ws.go`）。
 * 所以正确的模型是"进房间才建连、离开就断开"，而不是"先连一条通用连接、再发 room.join"
 * —— 后者在服务器上根本走不到 `room.join`（连接已关）。握手之后才发 `room.join` 做指纹标定。
 */
export function buildRoomWsUrl(serverUrl: string, roomId: string, nick: string): string {
  const u = new URL(serverUrl)
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
  u.pathname = '/ws'
  u.search = new URLSearchParams({ room: roomId, nick }).toString()
  return u.toString()
}

/** 聊天历史条数：`API.md` 规定默认 50、上限 500（越界 → 400，故这里先夹取） */
export function clampChatHistoryLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return 50
  return Math.min(500, Math.max(1, Math.floor(limit)))
}

/**
 * 聊天历史路径：`GET /rooms/{roomID}/messages?after=<id>&limit=<n>`
 * （追加日志模型：`after` = 只取 id 更大的消息，0/缺省 = 从头）。
 */
export function buildChatHistoryPath(
  roomId: string,
  opts?: { after?: number; limit?: number }
): string {
  const q = new URLSearchParams()
  if (opts?.after != null && opts.after > 0) q.set('after', String(Math.floor(opts.after)))
  q.set('limit', String(clampChatHistoryLimit(opts?.limit)))
  return `/rooms/${encodeURIComponent(roomId)}/messages?${q.toString()}`
}

/**
 * 聊天消息合并（历史 + 实时广播）：**按 id 去重、升序**。
 *
 * 为什么必须去重：`room.message` 广播**含发送者**（server 权威回执），而历史走 REST 拉取 ——
 * 断线重连后的"增量补拉（after=最后一条 id）"与广播可能交错，同一 id 会从两条路进来；
 * 直接 concat 会出现重复条目（且顺序会乱）。id 是 server 分配的追加序号，天然可排序。
 * 非数组/非数字 id 的脏数据直接丢弃（传输层只保证是 JSON，不保证形状）。
 */
export function mergeChatMessages(
  prev: readonly ChatMessage[],
  incoming: ChatMessage | readonly ChatMessage[]
): ChatMessage[] {
  const list = Array.isArray(incoming) ? incoming : [incoming]
  const byId = new Map<number, ChatMessage>()
  for (const m of prev) if (isChatMessage(m)) byId.set(m.id, m)
  for (const m of list) if (isChatMessage(m)) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) => a.id - b.id)
}

/** 形状守卫：聊天消息的最小可信字段（server 的 payload 只保证是 JSON） */
export function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false
  const m = value as Partial<ChatMessage>
  return typeof m.id === 'number' && Number.isFinite(m.id) && typeof m.text === 'string'
}
