/**
 * 功能组件：房间（RoomFeature）—— 服务器会话 + 大厅/会话（连接是房间组件的一部分）。
 *
 * 状态继承：进入房间成功后 host.openReader(bookId) —— 自动切到阅读器并打开对应书；
 * 房间会话（成员/聊天）在**跨功能共享态** `features/roomSession.ts` 里（v0.4.3 起）——
 * 阅读器右抽屉的「聊天」页签读的是同一份，两处不会分叉。
 *
 * ⚠ **v0.4.3：连接模型按服务器文本改了**（`server/docs/API.md`）：
 * - 「連接」= 建立**会话**（`POST /auth/token` 取成员 token），大厅（REST）随之可用；
 * - **房间 WebSocket 在进入房间时才建立**（服务器握手就要 `?room=&nick=`，缺任一直接关连接）；
 * - 「離開房間」= 断开这条房间连接（聊天的生命周期归属于房间）。
 */
import { useCallback, useEffect, useState } from 'react'
import type { BookRecord, ConnectionState, RoomInfo } from '@core/domain/types'
import type { FeatureProps } from '../types'
import { RoomRow } from '../../components/RoomRow'
import { ChatLog } from '../../components/ChatLog'
import { MemberList } from '../../components/MemberList'
import { StatePill } from '../../components/StatePill'
import {
  beginRoomSession,
  endRoomSession,
  sendRoomChat,
  setRoomError,
  useRoomView
} from '../roomSession'

// STYLE.md §5.1：**动作即文字** —— 样式统一定义在 styles.css 的 `.text-action` 家族
// （18px 加粗衬线、无框无底色；主/次动作靠色温区分，不靠边框）。
// 旧档（framed，回退用）：
//   btnGhost   = 'rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[13px] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40'
//   btnPrimary = 'rounded-lg border border-transparent bg-[var(--accent)] px-3 py-2 text-[13px] text-[var(--on-accent)] hover:brightness-110 disabled:opacity-40'
const btnPrimary = 'text-action text-action--primary'
const btnGhost = 'text-action'
// 例外①（STYLE.md §5.2）：输入类必须可见可点 —— 唯一保留边框的控件
const inputCls =
  'rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] outline-none focus:border-[var(--accent)]'
const h3Cls = 'mb-1.5 mt-2 text-[12.5px] tracking-[0.6px] text-[var(--muted)] uppercase'

export function RoomFeature({ container, host, selectedBookId }: FeatureProps): React.JSX.Element {
  // ---- 服务器连接（会话） ----
  const [url, setUrl] = useState('http://127.0.0.1:8080')
  const [token, setToken] = useState('')
  const [nick, setNick] = useState('alice')
  /** 会话已建立（成员 token 到手）—— 大厅走 REST，不需要 WS */
  const [sessionReady, setSessionReady] = useState(false)
  const [memberId, setMemberId] = useState<string | null>(null)
  const [connError, setConnError] = useState<string | null>(null)

  // ---- 房间会话（跨功能共享态：与阅读器右抽屉的「聊天」同一份） ----
  const view = useRoomView()
  const joinedRoomId = view.roomId

  // ---- 大厅 ----
  const [rooms, setRooms] = useState<RoomInfo[]>([])
  const [roomIdInput, setRoomIdInput] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [joining, setJoining] = useState(false)

  // 会话状态订阅 + 恢复已保存的连接配置（WS 状态由会话层转发，进房间后才有意义）
  useEffect(() => {
    void container.store
      .getSetting<{ serverUrl?: string; nickName?: string }>('serverConfig', {})
      .then((cfg) => {
        if (cfg.serverUrl) setUrl(cfg.serverUrl)
        if (cfg.nickName) setNick(cfg.nickName)
      })
    return container.net.on('connection-changed', (s) => {
      // 会话建立后 WS 才有状态；'connected' 只可能来自房间连接
      if (s === 'connected') void container.net.getMemberId().then(setMemberId)
    })
  }, [container])

  /** 展示用连接态：不在房间里时，"已建立会话"就是大厅可用的状态（WS 尚未建立） */
  const displayConn: ConnectionState = joinedRoomId
    ? view.connection
    : sessionReady
      ? 'connected'
      : 'disconnected'

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
      // 会话 = 成员 token（REST 用）；房间 WS 在 enterRoom 里按房间建立
      await container.net.connect({ serverUrl: url, accessToken: token, nickName: nick })
      const id = await container.net.getMemberId()
      setMemberId(id)
      setSessionReady(true)
      void container.store.setSetting('serverConfig', { serverUrl: url, nickName: nick })
      void refreshRooms()
    } catch (err) {
      setConnError((err as Error).message)
      setSessionReady(false)
    }
  }, [container, url, token, nick, refreshRooms])

  const disconnect = useCallback(async () => {
    endRoomSession()
    await container.net.disconnect()
    setSessionReady(false)
    setMemberId(null)
    setRooms([])
  }, [container])

  /** 进入房间：按房间建连 → 标定加入 → 成功后状态继承（会话视图 + 自动打开阅读器与书） */
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
      setRoomError(null)
      try {
        // v0.4.0：房间的初始位置取该书的**阅读状态**（已从书行拆到 `ReadingState`）——
        // 原来 `joinRoom` 自己读 `book.lastLocation`，现在由调用方显式给。
        const state = await container.books.getReadingState(target.id)
        const res = await container.room.joinRoom(rid, target, state?.lastLocation ?? null)
        if (res.ok) {
          // 会话归属交给共享态：阅读器据此决定要不要出现「聊天」页签
          beginRoomSession({
            roomId: res.room.roomId,
            editionId: target.id,
            bookTitle: target.metadata.title
          })
          setRoomIdInput('')
          host.pushLog(`已加入房间 ${res.room.roomId}`)
          host.openReader(target.id) // 状态继承：自动切到阅读器并打开对应书
        } else {
          const text = `加入失敗：${res.reason}`
          setRoomError(text)
          host.pushLog(text)
        }
      } catch (err) {
        const text = `加入失败：${(err as Error).message}`
        setRoomError(text)
        host.pushLog(text)
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
      endRoomSession()
      host.pushLog('已离开房间')
    } catch (err) {
      host.pushLog(`离开失败：${(err as Error).message}`)
    }
  }, [container, host])

  const sendChat = useCallback(async () => {
    if (!chatInput.trim() || !joinedRoomId) return
    try {
      await sendRoomChat(chatInput)
      setChatInput('')
    } catch (err) {
      host.pushLog(`發送失敗：${(err as Error).message}`)
    }
  }, [chatInput, joinedRoomId, host])

  if (joinedRoomId) {
    return (
      <section className="cjk-ui flex h-full flex-col gap-3">
        <header className="flex items-center justify-between">
          <h2 className="m-0 font-[var(--font-serif-cn)] text-[15px] font-bold">房间会话</h2>
          <div className="flex items-center gap-2">
            <span className="font-[var(--mono)] text-[12px] text-[var(--accent)]">{joinedRoomId}</span>
            <StatePill state={displayConn} />
          </div>
        </header>

        <div className="flex flex-col gap-1.5 text-[13px]">
          <div className="flex gap-3">
            <span className="w-[72px] flex-none text-[var(--muted)]">当前书籍</span>
            <span className="truncate">{view.bookTitle || '—'}</span>
          </div>
          <div className="flex gap-3">
            <span className="w-[72px] flex-none text-[var(--muted)]">在线成员</span>
            <span>{view.members.length} 人</span>
          </div>
          {view.error && (
            <div className="flex gap-3">
              <span className="w-[72px] flex-none text-[var(--muted)]">提示</span>
              <span className="text-[var(--err)]">{view.error}</span>
            </div>
          )}
        </div>

        <div>
          <h3 className={h3Cls}>成员</h3>
          <MemberList members={view.members} />
        </div>

        <div className="min-h-0 flex-1">
          <h3 className={h3Cls}>聊天</h3>
          <ChatLog messages={view.messages} />
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
          <button className="text-action text-action--danger" onClick={() => void leaveRoom()}>
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
        <StatePill state={displayConn} />
      </header>

      <details className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 open:pb-4">
        <summary className="cursor-pointer text-[12.5px] font-semibold text-[var(--muted)] select-none">
          服务器连接{sessionReady ? ` · ${memberId ?? ''}` : ''}
        </summary>
        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-[var(--muted)]">地址</span>
            <input
              className={inputCls}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://host:8080"
              disabled={sessionReady}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-[var(--muted)]">二级令牌</span>
            <input
              className={inputCls}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="access_token（可留空）"
              disabled={sessionReady}
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
              disabled={sessionReady}
            />
          </label>
        </div>
        <p className="mt-3 mb-0 text-[12.5px] text-[var(--muted)]">
          「連接」= 建立會話（領取成員憑證，大廳可用）。房間連線在**進入房間**時建立 ——
          伺服器握手就要求房間號與暱稱，暱稱上限 12 字。
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button className={btnPrimary} onClick={() => void connect()} disabled={sessionReady}>
            连接
          </button>
          <button
            className="text-action text-action--danger"
            onClick={() => void disconnect()}
            disabled={!sessionReady}
          >
            断开
          </button>
          {connError && <span className="text-[12.5px] text-[var(--err)]">{connError}</span>}
        </div>
      </details>

      <div className="flex items-center justify-between">
        <h3 className="m-0 text-[12.5px] tracking-[0.6px] text-[var(--muted)] uppercase">房间大厅</h3>
        <button className={btnGhost} onClick={() => void refreshRooms()} disabled={!sessionReady}>
          刷新
        </button>
      </div>

      <div className="flex flex-wrap items-baseline gap-4 text-[12.5px]">
        {!sessionReady && (
          <span className="text-[var(--muted)]">未连接服务器，先在上方展开「服务器连接」配置</span>
        )}
        {sessionReady && view.error && <span className="text-[var(--err)]">{view.error}</span>}
        {!selectedBookId && (
          <span className="text-[var(--muted)]">
            未选择书籍
            <button
              className="ml-3 text-[var(--accent)] hover:brightness-125"
              onClick={() => host.navigate('library')}
            >
              去书架选书 →
            </button>
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
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
            disabled={!selectedBookId || !sessionReady || joining}
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
