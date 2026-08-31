/**
 * 领域层（core/domain）—— 纯类型与规则，零依赖、零副作用。
 * 依据：client/docs/CONTRACTS.md §2（权威）+ server/docs/API.md「数据形状参考」（wire 形状）。
 * 共享词汇 = 领域层，被所有层共享。
 */

/** 阅读位置 —— 房间同步的最小载荷，与 kookit getPosition() 对齐 */
export interface BookLocation {
  chapterDocIndex: number | string
  chapterHref: string
  /** scroll 模式下的滚动偏移 */
  count: number
  /** 单页模式下的页内位置 */
  page: number
  /** 全局进度 0 ~ 1 */
  percentage: number
  /** 所在段落文本（跨端/跨版本定位兜底） */
  text: string
  chapterTitle?: string
}

/** 书籍指纹 —— 标定"同一本书的同一电子版" */
export interface BookFingerprint {
  /** server 已定（2026-08-27）：头/中/尾三点采样（头64KB+中点64KB+尾64KB 拼接哈希）；预留演进（v2 换 sha256） */
  algorithm: 'md5-sample3-v1'
  /** 采样拼接后哈希值（hex） */
  hash: string
  /** 文件字节数 */
  size: number
}

export type BookFormat =
  | 'EPUB'
  | 'PDF'
  | 'MOBI'
  | 'AZW3'
  | 'AZW'
  | 'TXT'
  | 'MD'
  | 'FB2'
  | 'DOCX'
  | 'HTML'
  | 'MHTML'
  | 'XML'
  | 'CBZ'
  | 'CBR'
  | 'CBT'
  | 'CB7'

/** 书籍元数据（epub/fb2 等有结构化字段，pdf/txt 可能缺省） */
export interface BookMetadata {
  title: string
  author?: string
  publisher?: string
  /** 二级匹配，不强制 */
  isbn?: string
  language?: string
  description?: string
  /** data URL 或本地路径 */
  cover?: string
}

/** 本地书库条目 */
export interface BookRecord {
  /** 本地唯一 id（uuid） */
  id: string
  fingerprint: BookFingerprint
  metadata: BookMetadata
  format: BookFormat
  filePath: string
  createdAt: number
  lastReadAt?: number
  lastLocation?: BookLocation
}

/** 阅读渲染配置（领域层友好配置，适配器内部翻译为 kookit config） */
export interface RenderOptions {
  readerMode: 'single' | 'double' | 'scroll'
  animation: 'sliding' | 'mimical' | 'none'
  fontSize?: number
  lineHeight?: number
  fontFamily?: string
  theme?: 'light' | 'sepia' | 'dark' | 'custom'
  backgroundColor?: string
  textColor?: string
  isDarkMode?: boolean
  convertChinese?: boolean
  password?: string
  isScannedPDF?: boolean
  ocrEngine?: 'tesseract' | 'paddle' | 'official-ai-ocr' | 'external-engine'
}

/** 目录（TOC） */
export interface Chapter {
  label: string
  href: string
  subitems?: Chapter[]
}

/** 笔记/划线（v1 可选实现，接口先立；range 为格式相关序列化，与 kookit 对齐） */
export interface Note {
  key: string
  bookId: string
  location: BookLocation
  /** 格式相关：EPUB→CFI，PDF→页码+坐标，等 */
  range: string
  color: string
  /** 选中文本 */
  text: string
  notes?: string
  createdAt: number
  updatedAt: number
}

/** 聊天消息（v0.1.5 起 server 支持；追加日志模型，历史经 REST 拉取） */
export interface ChatMessage {
  /** server 分配（追加序号） */
  id: number
  roomId: string
  /** 发送者成员 token */
  member: string
  /** 发送时昵称快照 */
  nick: string
  text: string
  /** unix 秒 */
  createdAt: number
}

/** 房间成员（presence / join-ack 内；location 缺省 = 尚无位置） */
export interface RoomMember {
  id: string
  nickName: string
  location?: BookLocation
  isMe?: boolean
}

export interface RoomState {
  roomId: string
  /** 服务端书籍注册表 id（标定通过后返回） */
  bookId?: string
  members: RoomMember[]
  currentLocation: BookLocation | null
}

export interface SystemMessage {
  text: string
  type: 'join' | 'leave' | 'info' | 'error'
}

export type JoinResult =
  | { ok: true; room: RoomState }
  | { ok: false; reason: 'book-mismatch' | 'room-not-found' | 'room-full' | 'server-error' }

/**
 * 消息信封：传输层只搬运信封，不理解语义 —— 语义由上层用例解释。
 * type 枚举见 server/docs/API.md（消息类型清单）。
 */
export interface MessageEnvelope {
  type: string
  payload: unknown
}

export type ConnectionState = 'connected' | 'disconnected' | 'reconnecting'

/** 服务器连接配置（客户端 → 服务器）。v0.2.1 修订：补 accessToken / memberToken（token 双闸）。 */
export interface NetConfig {
  /** http(s)://host:port（REST 基址；WS 由此派生 ws(s)://host:port/ws） */
  serverUrl: string
  /** 第 2 层准入门禁（X-Turead-Access） */
  accessToken: string
  /** 成员 token（服务端签发，POST /auth/token 获取；缺省 = 由适配器申请/复用） */
  memberToken?: string
  nickName: string
  transport?: 'websocket'
}

/** 房间列表项（GET /rooms，server/docs/API.md RoomInfo） */
export interface RoomInfo {
  roomId: string
  editionId: number
  title: string
  ext: string
  ownerNick: string
  memberCount: number
  /** unix 秒 */
  createdAt: number
}

/** 电子版（server/docs/API.md Edition 完整字段；source/url 可选；createdAt 为 RFC3339 字符串） */
export interface Edition {
  id: number
  workId: number
  ext: string
  hashAlgo: string
  hash: string
  size: number
  source?: string
  url?: string
  localCopy: boolean
  filePath: string
  /** RFC3339 字符串（注意：与 RoomInfo/ChatMessage 的 unix 秒不同） */
  createdAt: string
}

/** room.join-ack 的 payload（reason 仅失败时有；edition/members 成功时有） */
export interface JoinAck {
  ok: boolean
  reason?: 'book-mismatch' | 'room-not-found' | 'room-full' | 'bad payload'
  roomId?: string
  edition?: Edition
  members?: RoomMember[]
}

/** POST /auth/token 响应（v0.1.6 服务端签发成员 token） */
export interface TokenResponse {
  token: string
  /** true=新签发，false=复用 */
  issued: boolean
}

/** 统一错误响应（所有非 2xx） */
export interface ApiError {
  error: string
}
