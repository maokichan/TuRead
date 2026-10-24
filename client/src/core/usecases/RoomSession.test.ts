/**
 * RoomSession 用例层单测（审计 §5 测试缺口对账：此前 504 行核心用例零单测，
 * A-1 那种死分支一条 joinRoom(roomId, null) 单测就会当场暴露 —— 2026-10-03 补；
 * 2026-10-24 再补 presence diff / 节流尾发 / 断线重连 / B-2 位置校验 —— B-2 是跟随模式的前置）。
 * 不连真服务器：FakeNet 在 send(room.join) 时同步回 join-ack 信封。
 */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { RoomSession } from './RoomSession'
import { ROOM_MSG } from '@core/domain/protocol'
import type { BookLocation, ChatMessage, MessageEnvelope, RoomMember } from '@core/domain/types'
import type { INetService, HttpRequestOptions, HttpResult, Unsubscribe } from '@core/ports/net'
import type { IRenderService } from '@core/ports/render'
import type { IBookIdentityService } from '@core/ports/identity'

/** FakeNet：join 链路同步回 ack；request 可录制（历史路径断言用） */
class FakeNet implements INetService {
  sent: MessageEnvelope[] = []
  /** request 调用记录（断言 after= 增量补拉用） */
  requests: HttpRequestOptions[] = []
  /** request('/messages') 要回的聊天历史 */
  history: ChatMessage[] = []
  /** send(room.join) 时要回的 join-ack payload（测试用例注入） */
  ackOnJoin: unknown = { ok: true, roomId: 'ab12cd34', edition: undefined, members: [] }
  private listeners = new Map<string, Set<(...a: unknown[]) => void>>()

  on(event: 'message' | 'connection-changed', fn: (...a: unknown[]) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(fn)
    return () => this.listeners.get(event)!.delete(fn)
  }
  off(event: 'message' | 'connection-changed', fn: (...a: unknown[]) => void): void {
    this.listeners.get(event)?.delete(fn)
  }
  emit(event: 'message' | 'connection-changed', ...args: unknown[]): void {
    for (const fn of this.listeners.get(event) ?? []) fn(...args)
  }
  async connect(): Promise<void> {}
  async openRoom(): Promise<void> {}
  async closeRoom(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async send(envelope: MessageEnvelope): Promise<void> {
    this.sent.push(envelope)
    if (envelope.type === ROOM_MSG.join) {
      this.emit('message', { type: ROOM_MSG.joinAck, payload: this.ackOnJoin })
    }
  }
  async getMemberId(): Promise<string | null> {
    return 'member-1'
  }
  async request<T>(opts: HttpRequestOptions): Promise<HttpResult<T>> {
    this.requests.push(opts)
    return { status: 200, ok: true, data: { messages: this.history } as T }
  }
}

/** FakeRender：location-changed 手动触发；getOpenBook 返回当前打开的书（审计 B-2 的校验对象） */
class FakeRender {
  private listeners = new Set<(loc: BookLocation) => void>()
  openBook: import('@core/domain/types').BookRecord | null = null
  position: BookLocation = LOC0
  on(event: 'location-changed', fn: (loc: BookLocation) => void): Unsubscribe {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  /** 模拟渲染侧位置变化（ReaderFeature 翻页的真实来源） */
  emitLocation(loc: BookLocation): void {
    this.position = loc
    for (const fn of this.listeners) fn(loc)
  }
  getPosition(): BookLocation {
    return this.position
  }
  getOpenBook(): import('@core/domain/types').BookRecord | null {
    return this.openBook
  }
  /** 满足 IRenderService 的面（RoomSession 只用这几个成员） */
  toPort(): IRenderService {
    return this as unknown as IRenderService
  }
}

const fakeIdentity: IBookIdentityService = {
  computeFingerprint: async () => ({ algorithm: 'md5-sample3-v1', hash: 'h', size: 1 }),
  extractMetadata: async () => ({ title: '' }),
  // 与服务器标定同口径（fingerprint.ts）：algorithm+hash+size 全等
  verify: (local, room) =>
    local.algorithm === room.algorithm && local.hash === room.hash && local.size === room.size
}

const EPUB_EDITION = {
  id: 9,
  workId: 1,
  ext: 'epub',
  hashAlgo: 'md5-sample3-v1',
  hash: 'abc',
  size: 123,
  localCopy: false,
  filePath: '',
  createdAt: ''
}

const BOOK = {
  id: 'e1',
  filePath: 'C:/x.epub',
  format: 'EPUB' as const,
  fingerprint: { algorithm: 'md5-sample3-v1' as const, hash: 'abc', size: 123 },
  metadata: { title: 'T' },
  createdAt: 0
}

/** 同内容不同 id 的另一条本地记录（不该被当成房间的书） */
const OTHER_BOOK = {
  ...BOOK,
  id: 'e2',
  filePath: 'C:/y.epub',
  fingerprint: { algorithm: 'md5-sample3-v1' as const, hash: 'zzz', size: 999 }
}

const LOC0: BookLocation = { chapterDocIndex: 0, chapterHref: '', count: 0, page: 0, percentage: 0, text: '' }
const LOC1: BookLocation = { ...LOC0, chapterDocIndex: 1, percentage: 0.1 }
const LOC2: BookLocation = { ...LOC0, chapterDocIndex: 2, percentage: 0.2 }

function makeSession() {
  const net = new FakeNet()
  const render = new FakeRender()
  const session = new RoomSession(net, render.toPort(), fakeIdentity)
  return { net, render, session }
}

function presenceEnvelope(members: RoomMember[]): MessageEnvelope {
  return { type: ROOM_MSG.presence, payload: { members } }
}

function collector<T>(): { got: T[]; on: (args: T) => void } {
  const got: T[] = []
  return { got, on: (args: T) => void got.push(args) }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('RoomSession.joinRoom（审计 A-1：无书成员不再是死代码）', () => {
  it('book = null 时 room.join 照常发出，payload.fingerprint = null，加入成功', async () => {
    const { net, session } = makeSession()
    net.ackOnJoin = { ok: true, roomId: 'ab12cd34', edition: EPUB_EDITION, members: [] }
    const res = await session.joinRoom('AB12CD34', null)
    expect(res.ok).toBe(true)
    const join = net.sent.find((e) => e.type === ROOM_MSG.join)
    expect(join).toBeDefined()
    expect((join!.payload as { fingerprint: string | null }).fingerprint).toBeNull()
    // 无书成员的位置比较格式键：从 ack.edition.ext 推出 epub
    expect(session.getRoomState()?.members).toEqual([])
  })

  it('带书加入：payload 携带本书指纹', async () => {
    const { net, session } = makeSession()
    const res = await session.joinRoom('ab12cd34', BOOK)
    expect(res.ok).toBe(true)
    const join = net.sent.find((e) => e.type === ROOM_MSG.join)
    expect((join!.payload as { fingerprint: { hash: string } }).fingerprint.hash).toBe('abc')
  })

  it('join 失败：closeRoom + reset，不残留 joined 状态', async () => {
    const { net, session } = makeSession()
    net.ackOnJoin = { ok: false, reason: 'room not found' }
    const res = await session.joinRoom('ab12cd34', null)
    expect(res).toEqual({ ok: false, reason: 'room-not-found' })
    expect(session.getRoomState()).toBeNull()
  })
})

describe('RoomSession presence diff → location-updated（v0.2.4 派生）', () => {
  it('他人位置变化才 emit；相同快照不重复；离开快照清出基线后再次出现会重新 emit', async () => {
    const { net, session } = makeSession()
    await session.joinRoom('ab12cd34', BOOK)
    const located = collector<{ loc: BookLocation; from: RoomMember }>()
    session.on('location-updated', (loc, from) => located.on({ loc, from }))

    const bob = (loc: BookLocation | undefined): RoomMember[] => [
      { id: 'member-1', nickName: 'me' },
      { id: 'm2', nickName: 'bob', ...(loc ? { location: loc } : {}) }
    ]

    net.emit('message', presenceEnvelope(bob(LOC1)))
    expect(located.got).toHaveLength(1)
    expect(located.got[0].from.id).toBe('m2')
    expect(located.got[0].loc.percentage).toBe(0.1)

    // 同一位置的重复快照：不 emit（presence 是全量快照，diff 才是事件）
    net.emit('message', presenceEnvelope(bob(LOC1)))
    expect(located.got).toHaveLength(1)

    net.emit('message', presenceEnvelope(bob(LOC2)))
    expect(located.got).toHaveLength(2)
    expect(located.got[1].loc.percentage).toBe(0.2)

    // bob 从快照里消失（离开房间）：无事件；基线被清出
    net.emit('message', presenceEnvelope([{ id: 'member-1', nickName: 'me' }]))
    expect(located.got).toHaveLength(2)
    // bob 带着与离开前相同的位置再次出现：基线已清 → 重新 emit（否则 UI 不知道他回来了）
    net.emit('message', presenceEnvelope(bob(LOC2)))
    expect(located.got).toHaveLength(3)
  })

  it('自己的位置（isMe）不 emit；成员无位置时不 emit', async () => {
    const { net, session } = makeSession()
    await session.joinRoom('ab12cd34', BOOK)
    const located = collector<unknown>()
    session.on('location-updated', () => located.on(undefined))
    net.emit('message', presenceEnvelope([{ id: 'member-1', nickName: 'me', location: LOC1 }]))
    net.emit('message', presenceEnvelope([{ id: 'm2', nickName: 'bob' }]))
    expect(located.got).toHaveLength(0)
  })
})

describe('RoomSession 位置上报校验（审计 B-2：位置事件必须属于房间的书）', () => {
  it('打开的就是房间的书 → room.location 上报', async () => {
    const { net, render, session } = makeSession()
    await session.joinRoom('ab12cd34', BOOK)
    render.openBook = BOOK
    render.emitLocation(LOC1)
    expect(net.sent.filter((e) => e.type === ROOM_MSG.location)).toHaveLength(1)
  })

  it('房间里打开了另一本书（指纹不同）→ 不上报，也不污染 currentLocation', async () => {
    const { net, render, session } = makeSession()
    await session.joinRoom('ab12cd34', BOOK)
    render.openBook = OTHER_BOOK
    render.emitLocation(LOC1)
    expect(net.sent.filter((e) => e.type === ROOM_MSG.location)).toHaveLength(0)
    expect(session.getRoomState()?.currentLocation).toBeNull()
  })

  it('书尚未打开（getOpenBook = null）→ 不上报', async () => {
    const { net, render, session } = makeSession()
    await session.joinRoom('ab12cd34', BOOK)
    render.emitLocation(LOC1)
    expect(net.sent.filter((e) => e.type === ROOM_MSG.location)).toHaveLength(0)
  })

  it('无书成员下载副本后打开（指纹与 ack.edition 一致）→ 上报', async () => {
    const { net, render, session } = makeSession()
    net.ackOnJoin = { ok: true, roomId: 'ab12cd34', edition: EPUB_EDITION, members: [] }
    await session.joinRoom('ab12cd34', null)
    // 下载副本 → 导入 → 打开：新记录的指纹与房间 edition 同内容（hash+size 相同）
    const downloaded = { ...OTHER_BOOK, fingerprint: { algorithm: 'md5-sample3-v1' as const, hash: 'abc', size: 123 } }
    render.openBook = downloaded
    render.emitLocation(LOC1)
    expect(net.sent.filter((e) => e.type === ROOM_MSG.location)).toHaveLength(1)
  })

  it('离开房间后位置事件不再上报（订阅已解绑）', async () => {
    const { net, render, session } = makeSession()
    await session.joinRoom('ab12cd34', BOOK)
    render.openBook = BOOK
    await session.leaveRoom()
    render.emitLocation(LOC1)
    expect(net.sent.filter((e) => e.type === ROOM_MSG.location)).toHaveLength(0)
  })
})

describe('RoomSession 位置上报节流（300ms 窗口 + 尾发补齐）', () => {
  it('窗口内多次位置合并成一次尾发；窗口外立即发', async () => {
    vi.useFakeTimers()
    const { net, render, session } = makeSession()
    await session.joinRoom('ab12cd34', BOOK)
    render.openBook = BOOK

    render.emitLocation(LOC1) // 立即发（窗口已空）
    expect(net.sent.filter((e) => e.type === ROOM_MSG.location)).toHaveLength(1)

    vi.advanceTimersByTime(50)
    render.emitLocation(LOC2) // 窗口内：缓存为尾发
    expect(net.sent.filter((e) => e.type === ROOM_MSG.location)).toHaveLength(1)

    vi.advanceTimersByTime(300) // 窗口结束：尾发补齐，且是最新位置
    const locations = net.sent.filter((e) => e.type === ROOM_MSG.location)
    expect(locations).toHaveLength(2)
    expect((locations[1].payload as { location: BookLocation }).location.percentage).toBe(0.2)

    vi.advanceTimersByTime(350) // 距尾发（t=350 记账）已超窗口
    render.emitLocation({ ...LOC0, percentage: 0.3 }) // 立即发
    expect(net.sent.filter((e) => e.type === ROOM_MSG.location)).toHaveLength(3)
  })
})

describe('RoomSession 断线重连（重发 join + 增量补拉）', () => {
  it('connected 且已入房 → 重发 room.join，重新广播 presence，after=<最后一条 id> 补拉', async () => {
    const { net, session } = makeSession()
    net.history = [{ id: 7, roomId: 'ab12cd34', member: 'm2', nick: 'bob', text: 'hi', createdAt: 1756300000 }]
    const presences = collector<RoomMember[]>()
    session.on('presence-updated', (members) => presences.on(members))

    await session.joinRoom('ab12cd34', BOOK)

    net.emit('connection-changed', 'disconnected')
    net.emit('connection-changed', 'connected')
    // 补拉请求在 rejoin 的 loadHistory 里发出 —— waitFor 它，而不是只等 join 信封
    await vi.waitFor(() => {
      expect(net.requests.some((r) => r.path.includes('after=7'))).toBe(true)
      expect(net.sent.filter((e) => e.type === ROOM_MSG.join)).toHaveLength(2) // 首次 + 重连
    })
    expect(presences.got).toHaveLength(2) // join 成功时 + rejoin 成功时
  })

  it('未入房时 connected 不触发 join', async () => {
    const { net } = makeSession()
    const session = new RoomSession(net, new FakeRender().toPort(), fakeIdentity)
    net.emit('connection-changed', 'connected')
    await new Promise((r) => setTimeout(r, 0))
    expect(net.sent.filter((e) => e.type === ROOM_MSG.join)).toHaveLength(0)
  })

  it('重连后重发 join 被拒（如房已删）→ 发 system-message，会话保持待重试', async () => {
    const { net, session } = makeSession()
    await session.joinRoom('ab12cd34', BOOK)
    net.ackOnJoin = { ok: false, reason: 'room not found' }

    const systems = collector<{ type: string; text: string }>()
    session.on('system-message', (m) => systems.on(m))
    net.emit('connection-changed', 'disconnected')
    net.emit('connection-changed', 'connected')
    await vi.waitFor(() => expect(systems.got).toHaveLength(1))
    expect(systems.got[0].text).toContain('重連後重新加入失敗')
    // 会话未销毁：后续重连成功仍可恢复（不自动 leaveRoom —— 房间可能是暂时不可见）
    expect(session.getRoomState()).not.toBeNull()
  })
})

describe('RoomSession 聊天（回执与历史）', () => {
  it('sendChat 发 room.chat；空文本不发', async () => {
    const { net, session } = makeSession()
    await session.joinRoom('ab12cd34', BOOK)
    await session.sendChat('  大家好  ')
    await session.sendChat('   ')
    const chats = net.sent.filter((e) => e.type === ROOM_MSG.chat)
    expect(chats).toHaveLength(1)
    expect((chats[0].payload as { text: string }).text).toBe('大家好')
  })

  it('未入房 sendChat 抛错', async () => {
    const { session } = makeSession()
    await expect(session.sendChat('hi')).rejects.toThrow('尚未加入房間')
  })
})
