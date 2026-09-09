/**
 * 功能组件：房间（RoomFeature）—— 服务器连接 + 大厅/会话（连接是房间组件的一部分）。
 * 状态继承：进入房间成功后 host.openReader(bookId) —— 自动切到阅读器并打开对应书；
 * 房间会话（成员/聊天）在本组件内保留，侧边栏切回「房间」即见。
 */
import { useCallback, useEffect, useState } from 'react'
import type { BookRecord, ChatMessage, ConnectionState, RoomInfo, RoomMember } from '@core/domain/types'
import type { FeatureProps } from '../types'
import { RoomRow } from '../../components/RoomRow'
import { ChatLog } from '../../components/ChatLog'
import { MemberList } from '../../components/MemberList'
import { StatePill } from '../../components/StatePill'

type RoomView = 'lobby' | 'session'

// STYLE.md §5.1：**动作即文字** —— 18px 加粗衬线、无框无底色；主/次动作靠色温区分，不靠边框。
// 旧档（framed，回退用）：
//   btnGhost   = 'rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[13px] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40'
//   btnPrimary = 'rounded-lg border border-transparent bg-[var(--accent)] px-3 py-2 text-[13px] text-[var(--on-accent)] hover:brightness-110 disabled:opacity-40'
const btnPrimary =
  'font-[var(--font-serif-cn)] text-[18px] font-bold text-[var(--accent)] hover:brightness-125 disabled:opacity-35'
const btnGhost =
  'font-[var(--font-serif-cn)] text-[18px] font-bold text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-35'
// 例外①（STYLE.md §5.2）：输入类必须可见可点 —— 唯一保留边框的控件
const inputCls =
  'rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] outline-none focus:border-[var(--accent)]'
const h3Cls = 'mb-1.5 mt-2 text-[12.5px] tracking-[0.6px] text-[var(--muted)] uppercase'

export function RoomFeature({ container, host, selectedBookId }: FeatureProps): React.JSX.Element {
  // ---- 服务器连接（房间组件的一部分） ----
  const [url, setUrl] = useState('http://127.0.0.1:8080')
  const [token, setToken] = useState('')
  const [nick, setNick] = useState('alice')
  const [connState, setConnState] = useState<ConnectionState>('disconnected')
  const [memberId, setMemberId] = useState<string | null>(null)
  const [connError, setConnError] = useState<string | null>(null)

  // ---- 房间 ----
  const [view, setView] = useState<RoomView>('lobby')
  const [rooms, setRooms] = useState<RoomInfo[]>([])
  const [roomIdInput, setRoomIdInput] = useState('')
  const [joinedRoomId, setJoinedRoomId] = useState<string | null>(null)
  const [sessionBookTitle, setSessionBookTitle] = useState('')
  const [members, setMembers] = useState<RoomMember[]>([])
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [joining, setJoining] = useState(false)

  // 连接状态订阅 + 恢复已保存的连接配置
  useEffect(() => {
    void container.store
      .getSetting<{ serverUrl?: string; nickName?: string }>('serverConfig', {})
      .then((cfg) => {
        if (cfg.serverUrl) setUrl(cfg.serverUrl)
        if (cfg.nickName) setNick(cfg.nickName)
      })
    return container.net.on('connection-changed', (s) => {
      setConnState(s)
      if (s === 'connected') void container.net.getMemberId().then(setMemberId)
      else setMemberId(null)
    })
  }, [container])

  // 常驻订阅（功能组件常驻挂载 → 会话事件即使在阅读器中也持续累积，状态继承）
  useEffect(() => {
    const unsubs = [
      container.room.on('presence-updated', (ms) => setMembers(ms)),
      container.room.on('chat-message', (msg) => setChat((prev) => [...prev, msg])),
      container.room.on('system-message', (msg) => host.pushLog(`[${msg.type}] ${msg.text}`)),
      container.room.on('book-mismatch', ({ local, room }) =>
        host.pushLog(`书不匹配：本地 ${local.hash} vs 房间 ${room.hash}`)
      )
    ]
    return () => unsubs.forEach((u) => u())
  }, [container, host])

  const getSelectedBook = useCallback(async (): Promise<BookRecord | null> => {
    if (!selectedBookId) return null
    return container.books.get(selectedBookId)
  }, [container, selectedBookId])

  const refreshRooms = useCallback(async () => {
    try {
      const list = await container.room.listRooms()
      setRooms(list)
      host.pushLog(`发现 ${list.length} 个房间`)
    } catch (err) {
      host.pushLog(`拉取房间列表失败：${(err as Error).message}`)
    }
  }, [container, host])

  const connect = useCallback(async () => {
    setConnError(null)
    try {
      await container.net.connect({ serverUrl: url, accessToken: token, nickName: nick })
      const id = await container.net.getMemberId()
      setMemberId(id)
      void container.store.setSetting('serverConfig', { serverUrl: url, nickName: nick })
      void refreshRooms()
    } catch (err) {
      setConnError((err as Error).message)
    }
  }, [container, url, token, nick, refreshRooms])

  /** 进入房间：标定加入 → 成功后状态继承（会话视图 + 自动打开阅读器与书） */
  const enterRoom = useCallback(
    async (roomId: string, book?: BookRecord | null) => {
      const target = book ?? (await getSelectedBook())
      if (!target) {
        host.pushLog('请先在书架选择这本书')
        return
      }
      const rid = roomId.trim().toLowerCase()
      if (!rid) return
      setJoining(true)
      try {
        const res = await container.room.joinRoom(rid, target)
        if (res.ok) {
          setJoinedRoomId(rid)
          setSessionBookTitle(target.metadata.title)
          setView('session')
          setChat([])
          setRoomIdInput('')
          host.pushLog(`已加入房间 ${rid}`)
          host.openReader(target.id) // 状态继承：自动切到阅读器并打开对应书
        } else {
          host.pushLog(`加入失败：${res.reason}`)
        }
      } catch (err) {
        host.pushLog(`加入失败：${(err as Error).message}`)
      } finally {
        setJoining(false)
      }
    },
    [container, getSelectedBook, host]
  )

  /** 创建房间（用选中书）→ 自动进入（状态继承同 enterRoom） */
  const createRoom = useCallback(async () => {
    const book = await getSelectedBook()
    if (!book) {
      host.pushLog('请先在书架选择一本书')
      return
    }
    try {
      const owner = nick.trim() || '读者'
      const { roomId } = await container.room.createRoom(book, owner)
      host.pushLog(`已创建房间：${roomId}`)
      await enterRoom(roomId, book)
    } catch (err) {
      host.pushLog(`创建失败：${(err as Error).message}`)
    }
  }, [container, getSelectedBook, enterRoom, host, nick])

  const leaveRoom = useCallback(async () => {
    try {
      await container.room.leaveRoom()
      setJoinedRoomId(null)
      setSessionBookTitle('')
      setView('lobby')
      setChat([])
      setMembers([])
      host.pushLog('已离开房间')
    } catch (err) {
      host.pushLog(`离开失败：${(err as Error).message}`)
    }
  }, [container, host])

  const sendChat = useCallback(async () => {
    if (!chatInput.trim() || !joinedRoomId) return
    await container.room.sendChat(chatInput)
    setChatInput('')
  }, [chatInput, joinedRoomId, container])

  if (view === 'session' && joinedRoomId) {
    return (
      <section className="cjk-ui flex h-full flex-col gap-3">
        <header className="flex items-center justify-between">
          <h2 className="m-0 font-[var(--font-serif-cn)] text-[15px] font-bold">房间会话</h2>
          <div className="flex items-center gap-2">
            <span className="font-[var(--mono)] text-[12px] text-[var(--accent)]">{joinedRoomId}</span>
            <StatePill state={connState} />
          </div>
        </header>

        <div className="flex flex-col gap-1.5 rounded-xl border border-[var(--border-soft)] px-3.5 py-3 text-[13px]">
          <div className="flex gap-3">
            <span className="w-[72px] flex-none text-[var(--muted)]">当前书籍</span>
            <span className="truncate">{sessionBookTitle || '—'}</span>
          </div>
          <div className="flex gap-3">
            <span className="w-[72px] flex-none text-[var(--muted)]">在线成员</span>
            <span>{members.length} 人</span>
          </div>
        </div>

        <div>
          <h3 className={h3Cls}>成员</h3>
          <MemberList members={members} />
        </div>

        <div className="min-h-0 flex-1">
          <h3 className={h3Cls}>聊天</h3>
          <ChatLog messages={chat} />
          <div className="mt-2 flex gap-2">
            <input
              className={`${inputCls} flex-1`}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void sendChat()}
              placeholder="发消息，回车发送…"
            />
            <button className={btnGhost} onClick={() => void sendChat()} disabled={!chatInput.trim()}>
              发送
            </button>
          </div>
        </div>

        <div className="flex-none">
          <button
            className={`${btnGhost} hover:text-[var(--err)]`}
            onClick={() => void leaveRoom()}
          >
            离开房间
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="cjk-ui flex h-full flex-col gap-3">
      <header className="flex items-center justify-between">
        <h2 className="m-0 font-[var(--font-serif-cn)] text-[15px] font-bold">房间</h2>
        <StatePill state={connState} />
      </header>

      <details className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 open:pb-4">
        <summary className="cursor-pointer text-[12.5px] font-semibold text-[var(--muted)] select-none">
          服务器连接{connState === 'connected' ? ` · ${memberId ?? ''}` : ''}
        </summary>
        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-[var(--muted)]">地址</span>
            <input
              className={inputCls}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://host:8080"
              disabled={connState === 'connected'}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-[var(--muted)]">二级令牌</span>
            <input
              className={inputCls}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="access_token（可留空）"
              disabled={connState === 'connected'}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-[var(--muted)]">昵称</span>
            <input
              className={inputCls}
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              maxLength={12}
              placeholder="≤ 12 字"
              disabled={connState === 'connected'}
            />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button className={btnPrimary} onClick={() => void connect()} disabled={connState === 'connected'}>
            连接
          </button>
          <button
            className={`${btnGhost} hover:text-[var(--err)]`}
            onClick={() => void container.net.disconnect()}
            disabled={connState === 'disconnected'}
          >
            断开
          </button>
          {connError && <span className="text-[12.5px] text-[var(--err)]">{connError}</span>}
        </div>
      </details>

      <div className="flex items-center justify-between">
        <h3 className="m-0 text-[12.5px] tracking-[0.6px] text-[var(--muted)] uppercase">房间大厅</h3>
        <button className={btnGhost} onClick={() => void refreshRooms()} disabled={connState !== 'connected'}>
          刷新
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-[12px]">
        {connState !== 'connected' && (
          <span className="rounded-lg border border-[var(--border-soft)] bg-[var(--panel)] px-3 py-1.5 text-[var(--muted)]">
            未连接服务器，先在上方展开「服务器连接」配置
          </span>
        )}
        {!selectedBookId && (
          <span className="rounded-lg border border-[var(--border-soft)] bg-[var(--panel)] px-3 py-1.5 text-[var(--muted)]">
            未选择书籍
            <button className="ml-2 text-[var(--accent)] underline" onClick={() => host.navigate('library')}>
              去书架选书 →
            </button>
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--border-soft)]">
        {rooms.map((r) => (
          <RoomRow key={r.roomId} room={r} onEnter={() => void enterRoom(r.roomId)} />
        ))}
        {rooms.length === 0 && (
          <p className="m-0 py-4 text-center text-[12.5px] text-[var(--muted)]">
            （大厅为空，可刷新列表、手动输入房间号进入，或创建新房间）
          </p>
        )}
      </div>

      <div className="flex flex-none items-end gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[12px] text-[var(--muted)]">房间号（8 位 hex）</span>
          <input
            className={inputCls}
            value={roomIdInput}
            onChange={(e) => setRoomIdInput(e.target.value)}
            placeholder="手动输入房间号进入"
          />
        </label>
        <div className="flex gap-2">
          <button
            className={btnPrimary}
            onClick={() => void createRoom()}
            disabled={!selectedBookId || connState !== 'connected' || joining}
          >
            创建房间
          </button>
          <button
            className={btnGhost}
            onClick={() => void enterRoom(roomIdInput)}
            disabled={!selectedBookId || !roomIdInput.trim() || joining}
          >
            进入
          </button>
        </div>
      </div>
    </section>
  )
}
