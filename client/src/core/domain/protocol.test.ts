/**
 * 房间协议词汇的判据（单测）—— 覆盖三处"曾经自行解释、出过偏差"的地方：
 * ① 服务器下发的失败 reason 归一（实测服务器发的是空格分词的错误串）；
 * ② 房间 WS 握手地址（按房间建连 + URL 编码）；
 * ③ 聊天合并去重排序（广播与 REST 历史会交错同一 id）。
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_NICK_LEN,
  buildChatHistoryPath,
  buildRoomWsUrl,
  clampChatHistoryLimit,
  isValidNick,
  mergeChatMessages,
  normalizeJoinReason
} from './protocol'
import type { ChatMessage } from './types'

const msg = (id: number, text = `m${id}`): ChatMessage => ({
  id,
  roomId: 'ab12cd34',
  member: 'Aaaa111',
  nick: 'alice',
  text,
  createdAt: 1756300000 + id
})

describe('protocol · 昵称约束（服务器 maxNickLen = 12）', () => {
  it('接受 1..12 个字符的昵称', () => {
    expect(isValidNick('a')).toBe(true)
    expect(isValidNick('一二三四五六七八九十甲乙')).toBe(true)
    expect(Array.from('一二三四五六七八九十甲乙').length).toBe(MAX_NICK_LEN)
  })

  it('拒绝空/纯空白/超长（按 rune 计，不是 UTF-16 长度）', () => {
    expect(isValidNick('')).toBe(false)
    expect(isValidNick('   ')).toBe(false)
    expect(isValidNick('一二三四五六七八九十甲乙丙')).toBe(false)
  })
})

describe('protocol · join-ack reason 归一（容错服务器的空格分词）', () => {
  it('文档形式（连字符）原样通过', () => {
    expect(normalizeJoinReason('book-mismatch')).toBe('book-mismatch')
    expect(normalizeJoinReason('room-not-found')).toBe('room-not-found')
    expect(normalizeJoinReason('room-full')).toBe('room-full')
  })

  it('⚠ 服务器实际形式（空格分词、大小写不一）也必须认出来', () => {
    // server/internal/room/manager.go: ErrMismatch = "book mismatch" / ErrFull = "room full" / ErrNotFound = "room not found"
    expect(normalizeJoinReason('book mismatch')).toBe('book-mismatch')
    expect(normalizeJoinReason('room full')).toBe('room-full')
    expect(normalizeJoinReason('room not found')).toBe('room-not-found')
    expect(normalizeJoinReason(' BOOK  MISMATCH ')).toBe('book-mismatch')
  })

  it('未知 / 缺失 / "bad payload" 一律归 server-error（不猜）', () => {
    expect(normalizeJoinReason('bad payload')).toBe('server-error')
    expect(normalizeJoinReason(undefined)).toBe('server-error')
    expect(normalizeJoinReason(null)).toBe('server-error')
    expect(normalizeJoinReason('something else')).toBe('server-error')
  })
})

describe('protocol · 房间 WS 握手地址（按房间建连）', () => {
  it('http → ws，路径 /ws，携带 room + nick', () => {
    expect(buildRoomWsUrl('http://127.0.0.1:8080', 'ab12cd34', 'alice')).toBe(
      'ws://127.0.0.1:8080/ws?room=ab12cd34&nick=alice'
    )
  })

  it('https → wss，且带基址路径之外的部分会被丢掉（握手地址只有 /ws）', () => {
    expect(buildRoomWsUrl('https://example.com/', 'ab12cd34', 'alice')).toBe(
      'wss://example.com/ws?room=ab12cd34&nick=alice'
    )
  })

  it('昵称里的空格与中文按 URL 编码（服务器从 query 取值，未编码会截断）', () => {
    const url = buildRoomWsUrl('http://127.0.0.1:8080', 'ab12cd34', '张三 李四')
    expect(url).toContain('nick=%E5%BC%A0%E4%B8%89+%E6%9D%8E%E5%9B%9B')
    expect(new URL(url).searchParams.get('nick')).toBe('张三 李四')
  })
})

describe('protocol · 聊天历史路径（after/limit 夹取）', () => {
  it('缺省 = 从头、50 条', () => {
    expect(buildChatHistoryPath('ab12cd34')).toBe('/rooms/ab12cd34/messages?limit=50')
  })

  it('after 只在 >0 时下发；limit 夹到 1..500（服务器越界返回 400）', () => {
    expect(buildChatHistoryPath('ab12cd34', { after: 0, limit: 0 })).toBe(
      '/rooms/ab12cd34/messages?limit=1'
    )
    expect(buildChatHistoryPath('ab12cd34', { after: 7, limit: 9999 })).toBe(
      '/rooms/ab12cd34/messages?after=7&limit=500'
    )
    expect(clampChatHistoryLimit(undefined)).toBe(50)
    expect(clampChatHistoryLimit(-3)).toBe(1)
  })

  it('房间号做 URL 编码（房间号是 8 位 hex，但不信任上游输入）', () => {
    expect(buildChatHistoryPath('a/b')).toBe('/rooms/a%2Fb/messages?limit=50')
  })
})

describe('protocol · 聊天合并（广播 + 历史交错）', () => {
  it('升序、按 id 去重（同一 id 从广播与增量补拉各来一次 → 只留一条）', () => {
    const merged = mergeChatMessages([msg(3), msg(1)], [msg(2), msg(3, 'updated')])
    expect(merged.map((m) => m.id)).toEqual([1, 2, 3])
    expect(merged[2].text).toBe('updated')
  })

  it('单条与数组两种入参等价（room.message 是单条）', () => {
    expect(mergeChatMessages([msg(1)], msg(2)).map((m) => m.id)).toEqual([1, 2])
  })

  it('脏数据丢弃，不把形状错误传进 UI', () => {
    const dirty = [
      { id: 'x', text: 'no' },
      { text: 'no id' },
      null,
      undefined,
      msg(5)
    ] as unknown as ChatMessage[]
    expect(mergeChatMessages([], dirty).map((m) => m.id)).toEqual([5])
  })

  it('不改动入参（返回新数组）', () => {
    const prev = [msg(1)]
    const next = mergeChatMessages(prev, msg(2))
    expect(prev).toHaveLength(1)
    expect(next).not.toBe(prev)
  })
})
