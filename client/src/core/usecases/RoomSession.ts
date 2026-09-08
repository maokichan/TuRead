/**
 * IRoomSession —— 房间会话（同步业务逻辑本体，用例层）。
 * 依据：client/docs/CONTRACTS.md §5.1 + server/docs/API.md「同步协议与转发规范」。
 * 编排：INetService（传输）+ IRenderService（渲染位置事件）+ IBookIdentityService（标定校验）。
 * 关键语义：
 * - 状态转发而非操作转发：只同步 BookLocation 与聊天；翻页/滚动操作不转发。
 * - presence 全量快照广播、发送者除外；chat 广播含发送者（server 权威回执）。
 * - 位置上报节流是 client 职责。
 */
import type { INetService } from '@core/ports/net'
import type { IRenderService } from '@core/ports/render'
import type { IBookIdentityService } from '@core/ports/identity'
import { TypedEmitter } from '@core/ports/emitter'
import { normalizeLocation, sameLocation } from '@core/domain/location'
import type {
  BookFormat,
  BookLocation,
  BookRecord,
  ChatMessage,
  JoinAck,
  MessageEnvelope,
  RoomInfo,
  RoomMember,
  RoomState,
  SystemMessage
} from '@core/domain/types'

export interface RoomSessionEvents {
  'location-updated': (location: BookLocation, from: RoomMember) => void
  'presence-updated': (members: RoomMember[]) => void
  /** v0.1.5：聊天广播（含自己发的 = server 回执） */
  'chat-message': (msg: ChatMessage) => void
  'system-message': (msg: SystemMessage) => void
  'connection-changed': (state: 'connected' | 'disconnected' | 'reconnecting') => void
  'book-mismatch': (detail: { local: BookRecord['fingerprint']; room: BookRecord['fingerprint'] }) => void
}

export type JoinFailureReason = 'book-mismatch' | 'room-not-found' | 'room-full' | 'server-error'

export type JoinResult =
  | { ok: true; room: RoomState }
  | { ok: false; reason: JoinFailureReason }

export interface IRoomSession {
  on(event: 'location-updated', listener: RoomSessionEvents['location-updated']): () => void
  on(event: 'presence-updated', listener: RoomSessionEvents['presence-updated']): () => void
  on(event: 'chat-message', listener: RoomSessionEvents['chat-message']): () => void
  on(event: 'system-message', listener: RoomSessionEvents['system-message']): () => void
  on(event: 'connection-changed', listener: RoomSessionEvents['connection-changed']): () => void
  on(event: 'book-mismatch', listener: RoomSessionEvents['book-mismatch']): () => void

  /** 加入房间并完成标定：上报本地指纹 → 通过则订阅房间状态 */
  joinRoom(roomId: string, book: BookRecord): Promise<JoinResult>
  leaveRoom(): Promise<void>
  /** 手动广播当前位置（通常不需要：翻页由内部监听 render 自动广播） */
  emitLocation(location?: BookLocation): Promise<void>
  /** 发送聊天消息：server 落库后广播 room.message 回执（含发送者）；历史经 REST 拉取 */
  sendChat(text: string): Promise<void>
  getRoomState(): RoomState | null
  getMyMemberId(): string | null

  /**
   * v0.2.1 扩展：创建房间并注册 work/edition（POST /rooms）。
   * 协议固定 content-hash-v1（edition 内容指纹）——server 只登记不重算。
   */
  createRoom(book: BookRecord, owner: string): Promise<{ roomId: string; editionId: number }>
  /** v0.2.1 扩展：上传电子版副本（POST /books/{editionID}/file，幂等去重，分发源） */
  uploadBookCopy(editionId: number, buffer: ArrayBuffer): Promise<void>
  /** v0.2.1 扩展：房间发现（GET /rooms，可按 edition 找房） */
  listRooms(editionId?: number): Promise<RoomInfo[]>
}

/** 位置上报节流窗口（ms）——广播频率节流是 client 职责 */
const LOCATION_THROTTLE_MS = 300

export class RoomSession extends TypedEmitter<RoomSessionEvents> implements IRoomSession {
  private net: INetService
  private render: IRenderService
  private identity: IBookIdentityService

  private state: RoomState | null = null
  private myId: string | null = null

  /** 已加入房间绑定的书籍格式（presence diff 判定位置变化需按格式选 key） */
  private joinedFormat: BookFormat | null = null
  /** 各成员的最近一次位置基线（server 用 presence 全量快照推位置 → 本侧 diff 才 emit location-updated） */
  private memberLocs = new Map<string, BookLocation>()

  /** 生命周期订阅：构造期（net）常驻，随实例销毁；joinRoom 期（render）随 leaveRoom 解绑 */
  private netUnsubs: Array<() => void> = []
  private joinUnsubs: Array<() => void> = []
  private pendingJoin: ((ack: JoinAck) => void) | null = null
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
      net.on('connection-changed', (s) => this.emit('connection-changed', s))
    )
  }

  async joinRoom(roomId: string, book: BookRecord): Promise<JoinResult> {
    if (this.state) await this.leaveRoom()
    this.myId = await this.net.getMemberId()
    this.joinedFormat = book.format
    const ackPromise = new Promise<JoinAck>((resolve) => {
      this.pendingJoin = resolve
    })
    await this.net.send({ type: 'room.join', payload: { fingerprint: book.fingerprint } })
    const ack = await ackPromise
    this.pendingJoin = null

    if (!ack.ok) {
      this.state = null
      this.joinedFormat = null
      if (ack.reason === 'book-mismatch' && ack.edition) {
        const room: BookRecord['fingerprint'] = {
          algorithm: 'md5-sample3-v1',
          hash: ack.edition.hash,
          size: ack.edition.size
        }
        this.emit('book-mismatch', { local: book.fingerprint, room })
      }
      return { ok: false, reason: this.mapReason(ack.reason) }
    }

    const members = (ack.members ?? []).map((m) => this.decorateMe(m))
    this.state = {
      roomId: ack.roomId ?? roomId,
      bookId: ack.edition ? String(ack.edition.id) : undefined,
      members,
      currentLocation: book.lastLocation ?? null
    }
    // join-ack 已带全量成员位置 → 作为 presence diff 的基线
    this.seedMemberLocs(members)

    this.joinUnsubs.push(this.render.on('location-changed', (loc) => this.onRenderLocation(loc)))
    this.emit('presence-updated', members)
    return { ok: true, room: this.state }
  }

  async leaveRoom(): Promise<void> {
    // 只解绑 joinRoom 期订阅（render location-changed）；net 订阅属构造期生命周期，随实例存活
    this.joinUnsubs.forEach((u) => u())
    this.joinUnsubs = []
    if (this.emitTimer) clearTimeout(this.emitTimer)
    this.emitTimer = null
    this.state = null
    this.myId = null
    this.joinedFormat = null
    this.memberLocs.clear()
  }

  async emitLocation(location?: BookLocation): Promise<void> {
    const loc = location ?? this.render.getPosition()
    await this.net.send({ type: 'room.location', payload: { location: loc } })
  }

  async sendChat(text: string): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed) return
    await this.net.send({ type: 'room.chat', payload: { text: trimmed } })
  }

  getRoomState(): RoomState | null {
    return this.state
  }

  getMyMemberId(): string | null {
    return this.myId
  }

  async createRoom(book: BookRecord, owner: string): Promise<{ roomId: string; editionId: number }> {
    const res = await this.net.request<{ roomId: string; editionId: number }>({
      method: 'POST',
      path: '/rooms',
      body: {
        owner,
        book: {
          protocol: 'content-hash-v1',
          code: book.fingerprint.hash,
          title: book.metadata.title,
          ext: book.format.toLowerCase(),
          hashAlgo: book.fingerprint.algorithm,
          hash: book.fingerprint.hash,
          size: book.fingerprint.size
        }
      }
    })
    if (!res.ok) throw new Error(`创建房间失败: ${JSON.stringify(res.data)}`)
    return res.data
  }

  async uploadBookCopy(editionId: number, buffer: ArrayBuffer): Promise<void> {
    const res = await this.net.request<unknown>({
      method: 'POST',
      path: `/books/${editionId}/file`,
      body: buffer,
      rawBody: true,
      responseType: 'text'
    })
    if (!res.ok) throw new Error(`上传副本失败: ${JSON.stringify(res.data)}`)
  }

  async listRooms(editionId?: number): Promise<RoomInfo[]> {
    const q = editionId != null ? `?edition=${editionId}` : ''
    const res = await this.net.request<{ rooms: import('@core/domain/types').RoomInfo[] }>({
      method: 'GET',
      path: `/rooms${q}`
    })
    if (!res.ok) throw new Error(`拉取房间列表失败: ${JSON.stringify(res.data)}`)
    return res.data.rooms
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
   * 远端位置派生（v0.2.4 修复"location-updated 死端口"）：
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
      case 'room.join-ack': {
        if (this.pendingJoin) {
          const resolve = this.pendingJoin
          this.pendingJoin = null
          resolve(env.payload as JoinAck)
        }
        break
      }
      case 'room.presence': {
        const members = ((env.payload as { members?: RoomMember[] }).members ?? []).map((m) =>
          this.decorateMe(m)
        )
        if (this.state) this.state = { ...this.state, members }
        this.emit('presence-updated', members)
        this.deriveRemoteLocations(members)
        break
      }
      case 'room.message': {
        this.emit('chat-message', env.payload as ChatMessage)
        break
      }
      case 'room.system': {
        this.emit('system-message', env.payload as SystemMessage)
        break
      }
      case 'room.book-mismatch': {
        const p = env.payload as { local?: BookRecord['fingerprint']; room?: BookRecord['fingerprint'] }
        if (p.local && p.room) this.emit('book-mismatch', { local: p.local, room: p.room })
        break
      }
      default:
        break
    }
  }

  private onRenderLocation(loc: BookLocation): void {
    if (!this.state) return
    this.state = { ...this.state, currentLocation: loc }
    this.throttleSend(loc)
  }

  /** 节流：300ms 窗口内最多发一次，末尾补齐 */
  private throttleSend(loc: BookLocation): void {
    const now = Date.now()
    const since = now - this.lastSentAt
    if (since >= LOCATION_THROTTLE_MS) {
      this.lastSentAt = now
      void this.net.send({ type: 'room.location', payload: { location: loc } })
    } else {
      this.pendingEmit = loc
      if (this.emitTimer) clearTimeout(this.emitTimer)
      this.emitTimer = setTimeout(() => {
        this.emitTimer = null
        if (this.pendingEmit) {
          this.lastSentAt = Date.now()
          void this.net.send({ type: 'room.location', payload: { location: this.pendingEmit } })
          this.pendingEmit = null
        }
      }, LOCATION_THROTTLE_MS - since)
    }
  }

  private mapReason(reason: JoinAck['reason'] | undefined): JoinFailureReason {
    switch (reason) {
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
}
