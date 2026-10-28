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
import type { BookFingerprint, BookRecord, ConnectionState, RoomInfo } from '@core/domain/types'
import { extToFormat } from '@core/domain/format'
import type { FeatureProps } from '../types'
import { RoomRow } from '../../components/RoomRow'
import { ChatLog } from '../../components/ChatLog'
import { MemberList } from '../../components/MemberList'
import { StatePill } from '../../components/StatePill'
import { PlaneHeader } from '../../components/PlaneHeader'
import {
  beginRoomSession,
  endRoomSession,
  sendRoomChat,
  setRoomError,
  useRoomView
} from '../roomSession'

// STYLE.md §5.1：**动作即文字** —— 样式统一定义在 styles.css 的 `.text-action` 家族
// （18px 加粗衬线、无框无底色；主/次动作靠色温区分，不靠边框）。
// （旧档 framed 字符串已随设计语法 v2 废弃删除：彼时用字面圆角档位与 --on-accent，均已不存在。）
const btnPrimary = 'text-action text-action--primary'
const btnGhost = 'text-action'
// 例外①（STYLE.md §5.2）：输入类必须可见可点 —— 唯一保留边框的控件
const inputCls =
  'rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] outline-none focus:border-[var(--accent)]'
const h3Cls = 'mb-1.5 mt-2 text-[12.5px] tracking-label text-[var(--muted)] uppercase'

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
    // 审计 B-3：先走 leaveRoom（幂等）清掉房间会话再断开 —— 直接 net.disconnect 会把
    // RoomSession 的 joined/joinUnsubs 留成幽灵会话（位置监听还活着，重进后互相污染）
    await container.room.leaveRoom()
    endRoomSession()
    await container.net.disconnect()
    setSessionReady(false)
    setMemberId(null)
    setRooms([])
  }, [container])

  /** join 失败的统一呈现（superseded = 并发 join 落败方，静默 —— 审计 C-2） */
  const reportJoinFailure = useCallback(
    (rid: string, res: { ok: true } | { ok: false; reason: string }): boolean => {
      if (res.ok) return true
      if (res.reason !== 'superseded') {
        const text = `加入失敗：${res.reason}`
        setRoomError(text)
        host.pushLog(text)
      } else {
        host.pushLog(`已取消进入房间 ${rid}（改进了其他房间）`)
      }
      return false
    },
    [host]
  )

  /** 进房成功后的会话登记 + 自动打开书（状态继承：切到阅读器并打开对应书） */
  const settleRoom = useCallback(
    (roomId: string, editionId: string, bookTitle: string): void => {
      beginRoomSession({ roomId, editionId, bookTitle })
      setRoomIdInput('')
      host.pushLog(`已加入房间 ${roomId}`)
      if (editionId) host.openReader(editionId)
    },
    [host]
  )

  /**
   * 无书进入（v0.4.8）：不带指纹 join（服务器必收）→ 拿到房间绑定的 edition 后补书：
   * ① 本地已有同内容书（指纹相等）→ 直接打开它；
   * ② 没有但服务器有副本（localCopy）→ 下载 → 落盘（userData/downloads）→ 导入当前库 → 打开；
   * ③ 都没有 → 留在房间（聊天/看位置不受影响），日志说明怎么补书。
   * 位置同步不受"何时拿到书"影响：打开的书与房间 edition 指纹一致即自动上报（B-2 判据）。
   */
  const joinAndResolveBook = useCallback(
    async (rid: string, roomTitle?: string): Promise<void> => {
      const res = await container.room.joinRoom(rid, null)
      if (!res.ok) {
        reportJoinFailure(rid, res)
        return
      }
      const edition = res.room.edition
      if (!edition) {
        // 服务器没回 edition（极旧服务器？）：会话照常建立，只是补不了书
        settleRoom(res.room.roomId, '', '')
        return
      }
      const fingerprint: BookFingerprint = {
        algorithm: (edition.hashAlgo as BookFingerprint['algorithm']) ?? 'md5-sample3-v1',
        hash: edition.hash,
        size: edition.size
      }
      // ① 本地已有同内容书
      const local = await container.store.findEditionByFingerprint(fingerprint)
      if (local) {
        host.pushLog(`本地已有这本书（《${local.metadata.title}》），直接打开`)
        settleRoom(res.room.roomId, local.id, local.metadata.title)
        return
      }
      // ② 服务器有副本 → 下载 → 落盘 → 导入
      if (edition.localCopy) {
        const title = roomTitle?.trim() || `房間書籍-${edition.id}`
        const fileName = `${title}.${edition.ext}`
        try {
          host.pushLog(`本地没有这本书，正在从服务器下载副本（${fileName}）…`)
          const bytes = await container.room.downloadBookCopy(edition.id)
          host.pushLog('下载完成，正在入库…')
          const savedPath = await container.picker.saveBookCopy(bytes, fileName)
          const { currentId } = await container.store.listLibraries()
          const imported = await container.books.importBook(
            bytes,
            title,
            extToFormat(`x.${edition.ext}`),
            savedPath,
            currentId,
            'import'
          )
          host.pushLog(`《${imported.edition.metadata.title}》已入库，打开阅读`)
          settleRoom(res.room.roomId, imported.edition.id, imported.edition.metadata.title)
        } catch (err) {
          const text = `补书失败：${(err as Error).message}（仍留在房间里，可稍后重试）`
          host.pushLog(text)
          settleRoom(res.room.roomId, '', '')
        }
        return
      }
      // ③ 服务器也没有副本
      host.pushLog('房主尚未上传副本，且没有外部来源 —— 先留在房间，等房主补传后重新进入')
      settleRoom(res.room.roomId, '', '')
    },
    [container, host, reportJoinFailure, settleRoom]
  )

  /** 进入房间：
   * - `opts.book` 给定（创建房间自入）= 带书标定加入（服务器校验内容一致）；
   * - 有选中书（手动进房）= 同上；
   * - 其余（大厅行点击 / 未选书）= **无书进入** → 自动按指纹找本地书或下载副本（joinAndResolveBook）。 */
  const enterRoom = useCallback(
    async (roomId: string, opts?: { book?: BookRecord | null; roomTitle?: string }) => {
      const rid = roomId.trim().toLowerCase()
      if (!rid) return
      setJoining(true)
      setRoomError(null)
      try {
        const target = opts?.book !== undefined ? opts.book : await getSelectedBook()
        if (target) {
          // v0.4.0：房间的初始位置取该书的**阅读状态**（已从书行拆到 `ReadingState`）——
          // 原来 `joinRoom` 自己读 `book.lastLocation`，现在由调用方显式给。
          const state = await container.books.getReadingState(target.id)
          const res = await container.room.joinRoom(rid, target, state?.lastLocation ?? null)
          if (reportJoinFailure(rid, res) && res.ok) {
            settleRoom(res.room.roomId, target.id, target.metadata.title)
          }
        } else {
          await joinAndResolveBook(rid, opts?.roomTitle)
        }
      } catch (err) {
        const text = `加入失败：${(err as Error).message}`
        setRoomError(text)
        host.pushLog(text)
      } finally {
        setJoining(false)
      }
    },
    [container, getSelectedBook, host, joinAndResolveBook, reportJoinFailure, settleRoom]
  )

  /** 创建房间（用选中书）→ 上传副本（无书成员才有得下）→ 自动进入 */
  const createRoom = useCallback(async () => {
    const book = await getSelectedBook()
    if (!book) {
      host.pushLog('请先在书架选择一本书')
      return
    }
    try {
      const owner = nick.trim() || '读者'
      const { roomId, editionId } = await container.room.createRoom(book, owner)
      host.pushLog(`已创建房间：${roomId}`)
      // v0.4.8：建房即传副本 —— server 本身即分发源，别的成员没有这本书时可直接下载。
      // 失败不挡进房（房间已建好；上传可稍后重做），但要在日志里说清后果。
      try {
        host.pushLog('正在上传副本到服务器…')
        const buffer = await container.picker.readFile(book.filePath)
        await container.room.uploadBookCopy(editionId, buffer)
        host.pushLog('副本已上传：没有这本书的成员进房后会自动下载')
      } catch (err) {
        host.pushLog(`副本上传失败：${(err as Error).message}（房间已建好；没有副本其他成员拿不到书）`)
      }
      await enterRoom(roomId, { book })
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
      <section className="cjk-ui flex h-full flex-col">
        <PlaneHeader className="pr-0">
          <h2 className="m-0 font-ui text-[15px] font-bold">房间会话</h2>
          <div className="flex items-center gap-2">
            <span className="font-ui text-[12.5px] text-[var(--accent)]">{joinedRoomId}</span>
            <StatePill state={displayConn} />
          </div>
        </PlaneHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pb-5 pt-4">
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
              // IME 组合守卫（审计 B-5）：组合中的 Enter = 确认候选词，不是发送
              onKeyDown={(e) => !e.nativeEvent.isComposing && e.key === 'Enter' && void sendChat()}
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
        </div>
      </section>
    )
  }

  return (
    <section className="cjk-ui flex h-full flex-col">
      <PlaneHeader>
        <h2 className="m-0 font-ui text-[15px] font-bold">房间</h2>
        <StatePill state={displayConn} />
      </PlaneHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pb-5 pt-4">
      <details className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--panel)] p-3 open:pb-4">
        <summary className="cursor-pointer text-[12.5px] font-semibold text-[var(--muted)] select-none">
          服务器连接{sessionReady ? ` · ${memberId ?? ''}` : ''}
        </summary>
        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] text-[var(--muted)]">地址</span>
            <input
              className={inputCls}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://host:8080"
              disabled={sessionReady}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] text-[var(--muted)]">二级令牌</span>
            <input
              className={inputCls}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="access_token（可留空）"
              disabled={sessionReady}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] text-[var(--muted)]">昵称</span>
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
        <h3 className="m-0 text-[12.5px] tracking-label text-[var(--muted)] uppercase">房间大厅</h3>
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
            未选书也可进房（自动匹配房间的书，没有就从服务器下载）；
            <button
              className="ml-3 text-[var(--accent)] hover:brightness-125"
              onClick={() => host.navigate('library')}
            >
              去书架选书（建房用）→
            </button>
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rooms.map((r) => (
          <RoomRow
            key={r.roomId}
            room={r}
            disabled={joining}
            onEnter={() => void enterRoom(r.roomId, { roomTitle: r.title })}
          />
        ))}
        {rooms.length === 0 && (
          <p className="m-0 py-4 text-center text-[12.5px] text-[var(--muted)]">
            （大厅为空，可刷新列表、手动输入房间号进入，或创建新房间）
          </p>
        )}
      </div>

      <div className="flex flex-none items-end gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[12.5px] text-[var(--muted)]">房间号（8 位 hex）</span>
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
      </div>
    </section>
  )
}
