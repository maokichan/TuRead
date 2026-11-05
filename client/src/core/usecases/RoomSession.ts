/**
 * IRoomSession —— 房间会话（同步业务逻辑本体，用例层）。
 * 依据：client/docs/CONTRACTS.md §5.1 + server/docs/API.md「同步协议与转发规范」「WebSocket」。
 * 编排：INetService（传输）+ IRenderService（渲染位置事件）+ IBookIdentityService（标定校验）。
 * 关键语义：
 * - 状态转发而非操作转发：只同步 BookLocation 与聊天；翻页/滚动操作不转发。
 * - presence 全量快照广播、发送者除外；chat 广播含发送者（server 权威回执）。
 * - 位置上报节流是 client 职责。
 * REST 请求组（建房/副本/发现/历史）住 `roomRest.ts`，本类只做委托。
 *
 * ⚠ **连接模型 = "按房间建连"**——服务器 WS 握手就要求 `?room=&nick=`
 * （`transport/ws.go`：缺任一或昵称超长 → 直接关连接）。因此：
 * - `joinRoom` = `net.openRoom(roomId)`（握手）→ 发 `room.join`（指纹标定）→ 等 join-ack；
 * - `leaveRoom` = `net.closeRoom()`（**聊天的生命周期归属于房间**：离开即断开、历史留在服务器）；
 * - 断线重连后服务器侧是**全新连接**（成员/订阅都是瞬态的）→ 必须**重发 room.join**，
 *   并 `after=<最后一条 id>` 增量补拉断线期间的聊天。
 */
import type { INetService } from '@core/ports/net'
import type { IRenderService } from '@core/ports/render'
import type { IBookIdentityService } from '@core/ports/identity'
import { TypedEmitter } from '@core/ports/emitter'
import { extToFormat } from '@core/domain/format'
import { normalizeLocation, sameLocation } from '@core/domain/location'
import {
  ROOM_MSG,
  isChatMessage,
  normalizeJoinReason,
  normalizePresenceMembers,
  type JoinFailureReason
} from '@core/domain/protocol'
import type {
  BookFormat,
  BookFingerprint,
  BookLocation,
  BookRecord,
  ChatMessage,
  ConnectionState,
  JoinAck,
  JoinResult,
  MessageEnvelope,
  RoomInfo,
  RoomMember,
  RoomState,
  SystemMessage
} from '@core/domain/types'
import {
  createRoom as restCreateRoom,
  downloadBookCopy as restDownloadBookCopy,
  listChatMessages,
  listRooms as restListRooms,
  uploadBookCopy as restUploadBookCopy
} from './roomRest'

export type { JoinFailureReason, JoinResult }

export interface RoomSessionEvents {
  'location-updated': (location: BookLocation, from: RoomMember) => void
  'presence-updated': (members: RoomMember[]) => void
  /** 聊天广播（含自己发的 = server 回执）。消费者按 id 合并（见 `protocol.mergeChatMessages`） */
  'chat-message': (msg: ChatMessage) => void
  /**
   * 聊天历史（加入房间时的全量 / 重连后的增量）—— 与广播分开是因为**来源不同**：
   * 历史来自 `GET /rooms/{roomID}/messages`（追加日志），广播来自 `room.message`。
   * 两者会给同一 id（重连补拉与广播交错）→ 消费者一律走 `mergeChatMessages` 去重排序。
   */
  'chat-history': (messages: ChatMessage[]) => void
  'system-message': (msg: SystemMessage) => void
  /** `failed` = 断线重连耗尽：会话即将自动复位（自动 leaveRoom + system-message 告知） */
  'connection-changed': (state: ConnectionState) => void
  'book-mismatch': (detail: { local: BookRecord['fingerprint']; room: BookRecord['fingerprint'] }) => void
}

/** 位置上报节流窗口（ms）——广播频率节流是 client 职责 */
const LOCATION_THROTTLE_MS = 300
/** join 等待 join-ack 的超时（TODO P2「join 握手无超时」）——超时归 `server-error`，不挂死 */
const JOIN_TIMEOUT_MS = 10000
/** 聊天历史每页条数（服务器上限 500、默认 50；加入房间时拉最近一页） */
const CHAT_HISTORY_LIMIT = 50

export interface IRoomSession {
  on(event: 'location-updated', listener: RoomSessionEvents['location-updated']): () => void
  on(event: 'presence-updated', listener: RoomSessionEvents['presence-updated']): () => void
  on(event: 'chat-message', listener: RoomSessionEvents['chat-message']): () => void
  on(event: 'chat-history', listener: RoomSessionEvents['chat-history']): () => void
  on(event: 'system-message', listener: RoomSessionEvents['system-message']): () => void
  on(event: 'connection-changed', listener: RoomSessionEvents['connection-changed']): () => void
  on(event: 'book-mismatch', listener: RoomSessionEvents['book-mismatch']): () => void

  /** 加入房间并完成标定：按房间建连（握手带 room+nick）→ 上报本地指纹 → 通过则订阅房间状态。
   *  `book` 允许 `null` = **无书成员**（服务器明确支持：`fingerprint: null` 可加入并拿回 edition
   *  供下载，见 `API.md`「room.join」）——UI 入口待定。
   *  `lastLocation` 由调用方给（阅读状态住 `ReadingState`）。 */
  joinRoom(roomId: string, book: BookRecord | null, lastLocation?: BookLocation | null): Promise<JoinResult>
  leaveRoom(): Promise<void>
  /** 手动广播当前位置（通常不需要：翻页由内部监听 render 自动广播） */
  emitLocation(location?: BookLocation): Promise<void>
  /** 发送聊天消息：server 落库后广播 room.message 回执（含发送者）；历史经 REST 拉取 */
  sendChat(text: string): Promise<void>
  /** 拉取聊天历史（追加日志）—— 加入房间自动拉最近一页；`after` 用于重连后增量补拉 */
  listMessages(roomId: string, opts?: { after?: number; limit?: number }): Promise<ChatMessage[]>
  getRoomState(): RoomState | null
  getMyMemberId(): string | null

  /** 创建房间并注册 work/edition（POST /rooms）—— 委托 `roomRest.createRoom` */
  createRoom(book: BookRecord, owner: string): Promise<{ roomId: string; editionId: number }>
  /** 上传电子版副本（POST /books/{editionID}/file，幂等去重，分发源） */
  uploadBookCopy(editionId: number, buffer: ArrayBuffer): Promise<void>
  /**
   * 下载电子版副本（GET /books/{editionID}/file → ArrayBuffer）。
   * 无书成员的获取路径；字节回来后由调用方落盘 → 导入 → 打开。
   */
  downloadBookCopy(editionId: number): Promise<ArrayBuffer>
  /** 房间发现（GET /rooms，可按 edition 找房） */
  listRooms(editionId?: number): Promise<RoomInfo[]>
}

export class RoomSession extends TypedEmitter<RoomSessionEvents> implements IRoomSession {
  private net: INetService
  private render: IRenderService
  private identity: IBookIdentityService

  private state: RoomState | null = null
  private myId: string | null = null

  /** 当前房间（与 net 侧的房间连接同生命周期） */
  private roomId: string | null = null
  /** 已加入房间绑定的书（格式用于 presence diff 选位置 key；指纹用于断线重连后重发 room.join） */
  private joinedBook: BookRecord | null = null
  private joinedFormat: BookFormat | null = null
  /**
   * 房间标定指纹：带书加入 = 本书指纹；无书加入 = join-ack 的 edition 指纹。
   * `location-changed` 是渲染端口的全局事件 —— 上报前必须校验"当前打开的书 ≡ 房间的书"，
   * 判据与服务器标定同口径（`identity.verify`：algorithm+hash+size 全等）。
   */
  private roomFingerprint: BookFingerprint | null = null
  /** 是否已在本房间完成标定（join-ack ok）—— 重连后据此决定要不要重发 join */
  private joined = false
  /** 各成员的最近一次位置基线（server 用 presence 全量快照推位置 → 本侧 diff 才 emit location-updated） */
  private memberLocs = new Map<string, BookLocation>()
  /** 已收到的最后一条聊天 id（重连后 `after=` 增量补拉的锚） */
  private lastChatId = 0

  /** 生命周期订阅：构造期（net）常驻，随实例销毁；joinRoom 期（render）随 leaveRoom 解绑 */
  private netUnsubs: Array<() => void> = []
  private joinUnsubs: Array<() => void> = []
  /**
   * join 等待槽：**单槽 + 代次** ——
   * 并发 join 时旧的那次立即结束（而不是被覆盖后永久挂起），只有最新一次等 ack。
   */
  private pendingJoin: { gen: number; resolve: (ack: JoinAck | null) => void } | null = null
  private joinGen = 0
  private joinTimer: ReturnType<typeof setTimeout> | null = null
  /** joinRoom 调用代次：大厅快速连点两个房间 = 并发 join —— 旧的那次在每个
   *  await 恢复点作废自己（返回 `superseded`），不得再碰共享状态或触发失败清理路径。 */
  private joinCallGen = 0
  private lastSentAt = 0
  private pendingEmit: BookLocation | null = null
  private emitTimer: ReturnType<typeof setTimeout> | null = null

  constructor(net: INetService, render: IRenderService, identity: IBookIdentityService) {
    super()
    this.net = net
    this.render = render
    this.identity = identity
    this.netUnsubs.push(
      net.on('message', (env) => this.handleEnvelope(env)),
      net.on('connection-changed', (s) => {
        this.emit('connection-changed', s)
        // 断线重连：服务器侧已是全新连接 → 重发 join（否则是"在房间里却不是成员"的幽灵）。
        // 无书成员（joinedBook = null）同样要重入
        if (s === 'connected' && this.joined && this.roomId) {
          void this.rejoin()
        } else if (s === 'failed' && this.joined) {
          // 重连耗尽 = 会话没有出口了（服务器不再可达）—— 自动复位回大厅并告知，
          // 而不是留着"UI 显示未连接、会话仍 joined"的半死态。可预期优于沉默。
          void this.leaveRoom().then(() => {
            this.emit('system-message', {
              type: 'error',
              text: '重連多次失敗，已離開房間（檢查網路後可重新進入）'
            })
          })
        }
      })
    )
  }

  async joinRoom(
    roomId: string,
    book: BookRecord | null,
    lastLocation?: BookLocation | null
  ): Promise<JoinResult> {
    // 并发 join 的代次守卫 —— 旧调用在每个 await 恢复点自检，落败方立即作废。
    // 若不做，落败方的失败清理（closeRoom/resetJoinState）会砸掉胜方的会话。
    const gen = ++this.joinCallGen
    const superseded = (): JoinResult => ({ ok: false, reason: 'superseded' })
    if (this.roomId) await this.leaveRoom()
    if (gen !== this.joinCallGen) return superseded()
    const rid = roomId.trim().toLowerCase()
    if (!rid) return { ok: false, reason: 'room-not-found' }

    this.myId = await this.net.getMemberId()
    if (gen !== this.joinCallGen) return superseded()
    this.joinedBook = book
    // 无书成员（book = null）：位置比较的格式键晚一步从 join-ack 的 edition 扩展名推出来
    this.joinedFormat = book ? book.format : null
    this.roomId = rid
    this.lastChatId = 0

    // ① 按房间建连（握手带 room+nick；服务器要求，见 wsNetAdapter 的注释）
    try {
      await this.net.openRoom(rid)
    } catch (err) {
      if (gen !== this.joinCallGen) return superseded()
      this.resetJoinState()
      this.emit('system-message', {
        type: 'error',
        text: `連接房間失敗：${(err as Error).message}`
      })
      return { ok: false, reason: 'server-error' }
    }
    if (gen !== this.joinCallGen) return superseded()

    // ② 指纹标定
    const ack = await this.sendJoin()
    if (gen !== this.joinCallGen) return superseded()
    if (!ack || !ack.ok) {
      const reason = normalizeJoinReason(ack?.reason)
      if (reason === 'book-mismatch' && ack?.edition && book) {
        this.emit('book-mismatch', {
          local: book.fingerprint,
          room: {
            algorithm: 'md5-sample3-v1',
            hash: ack.edition.hash,
            size: ack.edition.size
          }
        })
      }
      await this.net.closeRoom()
      this.resetJoinState()
      return { ok: false, reason }
    }

    // ③ 成功：登记成员并接上 render 位置事件
    const members = (ack.members ?? []).map((m) => this.decorateMe(m))
    // 无书成员：位置比较的格式键从房间绑定的 edition 扩展名推（否则 presence diff 整条不工作，
    // 见 deriveRemoteLocations 的 `!this.joinedFormat` 早退）
    if (!this.joinedFormat && ack.edition?.ext) this.joinedFormat = extToFormat(`x.${ack.edition.ext}`)
    // 标定指纹 —— 带书 = 本书指纹；无书 = 服务器告知的 edition 指纹
    //（无书成员下载副本导入后打开的就是同内容文件，指纹比对天然成立）
    this.roomFingerprint = book
      ? book.fingerprint
      : ack.edition
        ? {
            algorithm: (ack.edition.hashAlgo as BookFingerprint['algorithm']) ?? 'md5-sample3-v1',
            hash: ack.edition.hash,
            size: ack.edition.size
          }
        : null
    this.state = {
      roomId: ack.roomId ?? rid,
      bookId: ack.edition ? String(ack.edition.id) : undefined,
      edition: ack.edition,
      members,
      currentLocation: lastLocation ?? null
    }
    this.joined = true
    this.seedMemberLocs(members)
    this.joinUnsubs.push(this.render.on('location-changed', (loc) => this.onRenderLocation(loc)))
    this.emit('presence-updated', members)
    // ④ 聊天历史（追加日志模型；历史生命周期与房间一致）。
    // isCurrent：上一会话遗留的历史请求回来时不再入账（emit 与 lastChatId 都不碰）
    await this.loadHistory(0, () => gen === this.joinCallGen)
    if (gen !== this.joinCallGen) return superseded()
    return { ok: true, room: this.state }
  }

  async leaveRoom(): Promise<void> {
    // 只解绑 joinRoom 期订阅（render location-changed）；net 订阅属构造期生命周期，随实例存活
    this.joinUnsubs.forEach((u) => u())
    this.joinUnsubs = []
    if (this.emitTimer) clearTimeout(this.emitTimer)
    this.emitTimer = null
    // 节流窗口内未发出的位置一并作废 —— 不清的话重进房间会把上一会话的旧位置带出去
    this.pendingEmit = null
    this.clearPendingJoin()
    this.resetJoinState()
    // 握手即房间：离开 = 断开连接（聊天/位置同步随房间结束；历史留在服务器，随房间级联清理）
    await this.net.closeRoom()
  }

  async emitLocation(location?: BookLocation): Promise<void> {
    // 手动路径与自动路径同一出口、同一校验
    if (!this.isOpenBookTheRoomsBook()) return
    const loc = location ?? this.render.getPosition()
    this.throttleSend(loc)
  }

  async sendChat(text: string): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed) return
    if (!this.joined) throw new Error('尚未加入房間')
    await this.net.send({ type: ROOM_MSG.chat, payload: { text: trimmed } })
  }

  /** 委托 `roomRest.listChatMessages`（保持 IRoomSession 接口面不变） */
  async listMessages(roomId: string, opts?: { after?: number; limit?: number }): Promise<ChatMessage[]> {
    return listChatMessages(this.net, roomId, opts)
  }

  getRoomState(): RoomState | null {
    return this.state
  }

  getMyMemberId(): string | null {
    return this.myId
  }

  async createRoom(book: BookRecord, owner: string): Promise<{ roomId: string; editionId: number }> {
    return restCreateRoom(this.net, book, owner)
  }

  async uploadBookCopy(editionId: number, buffer: ArrayBuffer): Promise<void> {
    await restUploadBookCopy(this.net, editionId, buffer)
  }

  async downloadBookCopy(editionId: number): Promise<ArrayBuffer> {
    return restDownloadBookCopy(this.net, editionId)
  }

  async listRooms(editionId?: number): Promise<RoomInfo[]> {
    return restListRooms(this.net, editionId)
  }

  /** 发 room.join 并等 join-ack（带超时 + 单槽代次，见 pendingJoin 注释） */
  private async sendJoin(): Promise<JoinAck | null> {
    const gen = ++this.joinGen
    this.clearPendingJoin()
    const wait = new Promise<JoinAck | null>((resolve) => {
      this.pendingJoin = { gen, resolve }
      this.joinTimer = setTimeout(() => {
        if (this.pendingJoin?.gen === gen) {
          this.pendingJoin = null
          this.joinTimer = null
          resolve(null)
        }
      }, JOIN_TIMEOUT_MS)
    })
    try {
      await this.net.send({
        type: ROOM_MSG.join,
        // 无书成员（joinedBook = null）= fingerprint: null —— 服务器允许加入并返回 edition
        // 供下载（API.md「room.join」）。
        payload: { fingerprint: this.joinedBook?.fingerprint ?? null }
      })
    } catch (err) {
      this.clearPendingJoin()
      this.emit('system-message', { type: 'error', text: `發送加入請求失敗：${(err as Error).message}` })
      return null
    }
    return wait
  }

  private clearPendingJoin(): void {
    if (this.joinTimer) clearTimeout(this.joinTimer)
    this.joinTimer = null
    if (this.pendingJoin) {
      // 旧的那次等不到 ack 了：立即结束（不让调用方永久挂起）
      this.pendingJoin.resolve(null)
      this.pendingJoin = null
    }
  }

  private resetJoinState(): void {
    this.state = null
    this.myId = null
    this.roomId = null
    this.joined = false
    this.joinedBook = null
    this.joinedFormat = null
    this.roomFingerprint = null
    this.memberLocs.clear()
  }

  /** 断线重连后重发 join（服务器侧成员表已随旧连接消失）；无书成员同样要重入 */
  private async rejoin(): Promise<void> {
    if (!this.roomId) return
    const ack = await this.sendJoin()
    const reason = normalizeJoinReason(ack?.reason)
    if (!ack || !ack.ok) {
      this.emit('system-message', {
        type: 'error',
        text: `重連後重新加入失敗：${reason}`
      })
      return
    }
    const members = (ack.members ?? []).map((m) => this.decorateMe(m))
    this.state = this.state ? { ...this.state, members } : null
    this.joined = true
    this.seedMemberLocs(members)
    this.emit('presence-updated', members)
    // 断线期间的聊天：按最后一条 id 增量补拉（广播与补拉交错由消费者去重）
    await this.loadHistory(this.lastChatId)
  }

  /** 拉聊天历史：after=0 = 加入时的最近一页；after=lastChatId = 重连增量。
   *  isCurrent：并发 join 落败方的在途请求回来时不入账（lastChatId 是新会话的补拉锚，
   *  旧会话的历史也不能 emit 进新会话的共享态）。 */
  private async loadHistory(after = 0, isCurrent?: () => boolean): Promise<void> {
    if (!this.roomId) return
    try {
      const msgs = await this.listMessages(this.roomId, { after, limit: CHAT_HISTORY_LIMIT })
      if (isCurrent && !isCurrent()) return
      if (msgs.length === 0) return
      this.lastChatId = Math.max(this.lastChatId, ...msgs.map((m) => m.id))
      this.emit('chat-history', msgs)
    } catch (err) {
      if (isCurrent && !isCurrent()) return
      this.emit('system-message', { type: 'error', text: `拉取聊天歷史失敗：${(err as Error).message}` })
    }
  }

  private decorateMe(m: RoomMember): RoomMember {
    // 网络载荷（join-ack / presence）进入域层先归一位置；无位置成员保持缺省
    const normalized = m.location ? { ...m, location: normalizeLocation(m.location) } : m
    return this.myId ? { ...normalized, isMe: normalized.id === this.myId } : normalized
  }

  /** join-ack members 作为 presence diff 基线：记录各成员归一化位置 */
  private seedMemberLocs(members: RoomMember[]): void {
    this.memberLocs.clear()
    for (const m of members) {
      if (m.location) this.memberLocs.set(m.id, normalizeLocation(m.location))
    }
  }

  /**
   * 远端位置派生：
   * server 不单独下发 room.location 信封，而是广播 room.presence 全量快照（含每人位置）。
   * 本侧以 join-ack 为基线、逐次 presence 快照 diff：某成员位置变化才 emit location-updated。
   * 位置一律先归一、比较走 sameLocation（定位系统纪律：不自行解释字段）。
   */
  private deriveRemoteLocations(members: RoomMember[]): void {
    if (!this.joinedFormat) return
    for (const m of members) {
      if (m.isMe || !m.location) continue
      const loc = normalizeLocation(m.location)
      const prev = this.memberLocs.get(m.id)
      if (!prev || !sameLocation(prev, loc, this.joinedFormat)) {
        this.memberLocs.set(m.id, loc)
        this.emit('location-updated', loc, m)
      }
    }
    // presence 是全量快照：不在其中的旧成员已离开 → 清出基线
    const live = new Set(members.map((m) => m.id))
    for (const id of this.memberLocs.keys()) {
      if (!live.has(id)) this.memberLocs.delete(id)
    }
  }

  private handleEnvelope(env: MessageEnvelope): void {
    switch (env.type) {
      case ROOM_MSG.joinAck: {
        if (this.pendingJoin) {
          const pending = this.pendingJoin
          this.pendingJoin = null
          if (this.joinTimer) {
            clearTimeout(this.joinTimer)
            this.joinTimer = null
          }
          pending.resolve(env.payload as JoinAck)
        }
        break
      }
      case ROOM_MSG.presence: {
        // 载荷形状归一：契约 = {members:[...]}（兼容旧 server 的裸数组——
        // 形状不符曾致真客户端成员快照恒空，归一细节见 protocol.ts）
        const members = normalizePresenceMembers(env.payload).map((m) => this.decorateMe(m))
        if (this.state) this.state = { ...this.state, members }
        this.emit('presence-updated', members)
        this.deriveRemoteLocations(members)
        break
      }
      case ROOM_MSG.message: {
        const msg = env.payload
        if (!isChatMessage(msg)) break
        if (msg.id > this.lastChatId) this.lastChatId = msg.id
        this.emit('chat-message', msg)
        break
      }
      case ROOM_MSG.system: {
        this.emit('system-message', env.payload as SystemMessage)
        break
      }
      case ROOM_MSG.bookMismatch: {
        const p = env.payload as { local?: BookRecord['fingerprint']; room?: BookRecord['fingerprint'] }
        if (p.local && p.room) this.emit('book-mismatch', { local: p.local, room: p.room })
        break
      }
      default:
        break
    }
  }

  /**
   * `location-changed` 是渲染端口的全局事件，在 A 书的房间里打开 B 书会把
   * B 的位置广播进 A 房。上报前校验"当前打开的书 ≡ 房间标定的那本"（指纹口径与服务器一致）。
   * 渲染未打开任何书（书还没开/已关）时同样不上报 —— 没有可验证的归属。
   */
  private isOpenBookTheRoomsBook(): boolean {
    if (!this.roomFingerprint) return false
    const open = this.render.getOpenBook()
    if (!open) return false
    return this.identity.verify(open.fingerprint, this.roomFingerprint)
  }

  private onRenderLocation(loc: BookLocation): void {
    if (!this.state) return
    if (!this.isOpenBookTheRoomsBook()) return
    this.state = { ...this.state, currentLocation: loc }
    this.throttleSend(loc)
  }

  /** 节流：300ms 窗口内最多发一次，末尾补齐 */
  private throttleSend(loc: BookLocation): void {
    const now = Date.now()
    const since = now - this.lastSentAt
    if (since >= LOCATION_THROTTLE_MS) {
      this.lastSentAt = now
      void this.net.send({ type: ROOM_MSG.location, payload: { location: loc } }).catch(() => {
        // 断线期间的位置上报失败无需冒泡（重连后由下一次位置事件补齐）
      })
    } else {
      this.pendingEmit = loc
      if (this.emitTimer) clearTimeout(this.emitTimer)
      this.emitTimer = setTimeout(() => {
        this.emitTimer = null
        if (this.pendingEmit) {
          this.lastSentAt = Date.now()
          void this.net
            .send({ type: ROOM_MSG.location, payload: { location: this.pendingEmit } })
            .catch(() => {})
          this.pendingEmit = null
        }
      }, LOCATION_THROTTLE_MS - since)
    }
  }
}
