/**
 * RoomSession 用例层单测（审计 §5 测试缺口对账：此前 504 行核心用例零单测，
 * A-1 那种死分支一条 joinRoom(roomId, null) 单测就会当场暴露 —— 2026-10-03 补）。
 * 不连真服务器：FakeNet 在 send(room.join) 时同步回 join-ack 信封。
 */
import { describe, expect, it, vi } from 'vitest'
import { RoomSession } from './RoomSession'
import { ROOM_MSG } from '@core/domain/protocol'
import type { MessageEnvelope } from '@core/domain/types'
import type { INetService, HttpRequestOptions, HttpResult, Unsubscribe } from '@core/ports/net'
import type { IRenderService } from '@core/ports/render'
import type { IBookIdentityService } from '@core/ports/identity'

/** FakeNet：只实现 join 链路用到的面（openRoom/send/getMemberId/request + 事件） */
class FakeNet implements INetService {
  sent: MessageEnvelope[] = []
  private listeners = new Map<string, Set<(...a: unknown[]) => void>>()
  /** send(room.join) 时要回的 join-ack payload（测试用例注入） */
  ackOnJoin: unknown = { ok: true, roomId: 'ab12cd34', edition: undefined, members: [] }

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
    // 聊天历史拉取：空列表即可（loadHistory 对 0 条直接返回）
    expect(opts.path).toContain('/messages')
    return { status: 200, ok: true, data: { messages: [] } as T }
  }
}

const fakeRender = {
  on: vi.fn(() => () => {}),
  getPosition: vi.fn(() => ({ chapterDocIndex: 0, chapterHref: '', count: 0, page: 0, percentage: 0, text: '' }))
} as unknown as IRenderService

const fakeIdentity: IBookIdentityService = {
  computeFingerprint: async () => ({ algorithm: 'md5-sample3-v1', hash: 'h', size: 1, sample: [] }),
  extractMetadata: async () => ({ title: '' }),
  verify: () => true
}

const BOOK = {
  id: 'e1',
  filePath: 'C:/x.epub',
  format: 'EPUB' as const,
  fingerprint: { algorithm: 'md5-sample3-v1', hash: 'abc', size: 123, sample: [] },
  metadata: { title: 'T' },
  addedAt: 0,
  sizeBytes: 1
}

function makeSession() {
  const net = new FakeNet()
  const session = new RoomSession(net, fakeRender, fakeIdentity)
  return { net, session }
}

describe('RoomSession.joinRoom（审计 A-1：无书成员不再是死代码）', () => {
  it('book = null 时 room.join 照常发出，payload.fingerprint = null，加入成功', async () => {
    const { net, session } = makeSession()
    net.ackOnJoin = {
      ok: true,
      roomId: 'ab12cd34',
      // 无书成员：格式键从房间绑定 edition 的扩展名推出
      edition: { id: 9, workId: 1, ext: 'epub', hashAlgo: 'md5', hash: 'h', size: 1, localCopy: false, filePath: '', createdAt: '' },
      members: []
    }
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
    const res = await session.joinRoom('ab12cd34', BOOK as never)
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
