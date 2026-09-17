/**
 * dev-only 无头探针：**房间同步对真实 server 的链路验证**（2026-09-17，v0.4.3 随聊天室落地）。
 *
 * 为什么需要它：`STATUS.md` 长期记着"**同步未与真实 server 打通**（房间是半成品）"，而 2026-09-17
 * 复核发现**根因是连接模型与服务器文本不一致**：服务器 WS 握手就要求 `?room=&nick=`（缺任一直接
 * 关连接），而客户端当时是"先连一条通用连接、再发 room.join" —— 在服务器上根本走不到 join。
 * 这类"两端各自解释协议"的错误，单测证不了（都自洽）、样张证不了（没有网络）→ **只有对真 server 跑**。
 *
 * 链路（全部走客户端**真实实现**：`INetService` 适配器 + `IRoomSession` 用例）：
 * ① 会话 = 成员 token（REST `POST /auth/token`）且**不含 WS**（此时 send 必须抛错）；
 * ② `POST /rooms` 建房（注册 work/edition，协议 content-hash-v1）；
 * ③ 按房间建连 + `room.join` 指纹标定 → join-ack 带**全量成员快照**；
 * ④ 发聊天 → 收 `room.message` **回执（含发送者）**；空文本不落库不广播；
 * ⑤ `GET /rooms/{id}/messages` 追加日志（REST，独立于 WS）；
 * ⑥ 离开房间 = 断连，但**历史留在服务器**；再进房 → `chat-history` 预载（聊天的生命周期归属于房间）。
 *
 * 触发（**必须独立 userData**）：
 * ```
 * $env:TUREAD_DEV_PROBE="room"
 * $env:TUREAD_DEV_BOOK="D:\...\test_docs\任意.epub"
 * $env:TUREAD_DEV_SERVER="http://127.0.0.1:8080"   # 可选，默认同值
 * $env:TUREAD_DEV_ACCESS="<服务器 access_token>"    # 可选，服务器未配门禁则留空
 * $env:TUREAD_USER_DATA="D:\PROJECT\TuRead\client\.probe-user-data"
 * npm run dev
 * ```
 * 服务器侧建议用**一次性的 data 目录**（本仓库的 `server/data/turead.db` 是入库文件，别拿它做探针）：
 * ```
 * $env:TUREAD_ADDR=":8099"; $env:TUREAD_DATA_DIR="$env:TEMP\turead-probe-data"
 * $env:TUREAD_ACCESS_TOKEN="probe-access"; go run ./cmd/server
 * ```
 * 归属：开发工具，不是产品代码（同 dev/selfCheck.ts 纪律）。
 */
import type { ServiceContainer } from '@core/container'
import { extToFormat } from '@core/domain/format'
import type { ChatMessage } from '@core/domain/types'
import { beginRoomSession, endRoomSession, getRoomView } from '../features/roomSession'
import type { FeatureHost } from '../features/types'

let autoRan = false

const DEFAULT_SERVER = 'http://127.0.0.1:8080'
const PROBE_NICK = 'probe'

export function runRoomProbe(container: ServiceContainer, host: FeatureHost): void {
  if (window.turead.devProbe !== 'room' || autoRan) return
  autoRan = true

  void (async () => {
    const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
    const ok = (msg: string): void => console.log(`[TUREAD-TEST-OK][room] ${msg}`)
    let failed = false
    const assert = (cond: boolean, what: string): void => {
      console.error(`[probe] ${cond ? 'PASS' : 'FAIL'} ${what}`)
      if (!cond) failed = true
    }
    /** 等一个房间事件（带超时）—— 服务器广播是异步的，判据必须等它，而不是"发完就算过" */
    const waitFor = <T,>(register: (cb: (v: T) => void) => () => void, ms = 5000): Promise<T | null> =>
      new Promise((resolve) => {
        const timer = setTimeout(() => {
          unsub()
          resolve(null)
        }, ms)
        const unsub = register((v) => {
          clearTimeout(timer)
          unsub()
          resolve(v)
        })
      })

    try {
      const devBook = window.turead.devBook
      if (!devBook) throw new Error('room 探针需要 TUREAD_DEV_BOOK 指向任意电子书')
      const serverUrl = window.turead.devServer || DEFAULT_SERVER
      const accessToken = window.turead.devAccess ?? ''

      // 0) 导入这本书（房间要绑定一个 edition）
      const { currentId: libraryId } = await container.store.listLibraries()
      const buffer = await container.picker.readFile(devBook)
      const { edition } = await container.books.importBook(
        buffer,
        devBook.split(/[\\/]/).pop() ?? devBook,
        extToFormat(devBook),
        devBook,
        libraryId
      )

      // ① 会话（REST 身份）；⚠ 此时**不该有 WS** —— 有的话就是又回到了"通用连接"的旧模型
      await container.net.connect({ serverUrl, accessToken, nickName: PROBE_NICK })
      const memberId = await container.net.getMemberId()
      assert(
        typeof memberId === 'string' && /^[A-Za-z0-9]{7}$/.test(memberId),
        `会话拿到服务端签发的成员 token（${memberId}）`
      )
      let sendBeforeRoom = false
      try {
        await container.net.send({ type: 'room.join', payload: { fingerprint: null } })
      } catch {
        sendBeforeRoom = true
      }
      // ⚠ 这条负向断言会在 Electron 日志里留一行 `Error occurred in handler for 'net:send'`
      //   （IPC 把主进程的抛错原样报出）—— 那是**预期**的，不是失败。
      assert(sendBeforeRoom, '会话不含 WS（未进房间时发送信封必须失败）—— 按房间建连才符合服务器握手')

      // ② 建房（POST /rooms：注册 work/edition，协议 content-hash-v1）
      const { roomId, editionId } = await container.room.createRoom(edition, PROBE_NICK)
      assert(/^[0-9a-f]{8}$/.test(roomId), `POST /rooms 返回 8 位 hex 房间号（${roomId}）`)
      assert(editionId > 0, `POST /rooms 注册了 edition（editionId=${editionId}）`)

      // ③ 按房间建连 + 指纹标定
      const joined = await container.room.joinRoom(roomId, edition, null)
      assert(joined.ok, `按房间建连并完成标定（ok=${joined.ok}${joined.ok ? '' : ` reason=${joined.reason}`}）`)
      const state = container.room.getRoomState()
      assert(
        state?.members.length === 1 && state.members[0].id === memberId,
        `join-ack 带全量成员快照（${state?.members.length ?? 0} 人，我是 ${state?.members[0]?.nickName ?? '—'}）`
      )

      // ④ 聊天：广播**含发送者**（server 权威回执）
      const text = `probe-${Date.now()}`
      const echo = waitFor<ChatMessage>((cb) => container.room.on('chat-message', cb))
      await container.room.sendChat(text)
      const got = await echo
      assert(
        Boolean(got && got.text === text && got.member === memberId && got.roomId === roomId && got.id > 0),
        `room.message 回执含发送者（id=${got?.id} nick=${got?.nick}）`
      )

      // ④b 空文本（全空白）：服务器不落库不广播
      const beforeCount = (await container.room.listMessages(roomId)).length
      await container.room.sendChat('   ')
      await wait(800)
      const afterBlank = (await container.room.listMessages(roomId)).length
      assert(afterBlank === beforeCount, `空文本不落库（${beforeCount} → ${afterBlank}）`)

      // ⑤ 历史（REST 追加日志）
      const history = await container.room.listMessages(roomId)
      assert(
        history.some((m) => m.id === got?.id && m.text === text),
        `GET /rooms/{id}/messages 取到刚发的那条（历史 ${history.length} 条）`
      )

      // ⑥ 离开 = 断连（聊天生命周期归属于房间）；历史仍留在服务器
      await container.room.leaveRoom()
      assert(container.room.getRoomState() === null, '离开房间后本地会话态清空')
      const afterLeave = await container.room.listMessages(roomId)
      assert(
        afterLeave.some((m) => m.id === got?.id),
        `离开房间后历史仍在服务器（${afterLeave.length} 条，随房间级联清理）`
      )

      // ⑦ 再进房 → chat-history 预载（客户端加入即拉一页历史）
      const preload = waitFor<ChatMessage[]>((cb) => container.room.on('chat-history', cb))
      const rejoined = await container.room.joinRoom(roomId, edition, null)
      const loaded = await preload
      assert(rejoined.ok, `再次加入同一房间（ok=${rejoined.ok}）`)
      assert(
        Boolean(loaded?.some((m) => m.id === got?.id)),
        `加入即预载聊天历史（chat-history ${loaded?.length ?? 0} 条）`
      )

      // ⑧ 跨功能共享会话态（阅读器右抽屉「聊天」与「房间」组件读的是这同一份）：
      //    走 RoomFeature 的真实动作（beginRoomSession）+ 真实广播，断言 store 收得到、离开会复位。
      beginRoomSession({
        roomId,
        editionId: edition.id,
        bookTitle: edition.metadata.title
      })
      const view0 = getRoomView()
      assert(
        view0.roomId === roomId && view0.editionId === edition.id && view0.messages.length >= 1,
        `共享会话态登记了房间与书（roomId=${view0.roomId} editionId 命中=${view0.editionId === edition.id} 消息 ${view0.messages.length} 条）`
      )
      const liveText = `probe-live-${Date.now()}`
      await container.room.sendChat(liveText)
      await wait(600)
      assert(
        getRoomView().messages.some((m) => m.text === liveText),
        '共享会话态收到 room.message 广播（两处入口同一份消息）'
      )
      endRoomSession()
      assert(
        getRoomView().roomId === null && getRoomView().messages.length === 0,
        '离开房间 → 共享会话态复位（聊天室的生命周期归属于房间）'
      )

      await container.room.leaveRoom()
      await container.net.disconnect()
      if (failed) {
        console.error('[TUREAD-TEST-FAIL] room 探针有断言失败（见上面 [probe] FAIL 行）')
        return
      }
      ok(`房间链路全通（server=${serverUrl} room=${roomId} 聊天 id=${got?.id} 历史=${history.length} 条）`)
      host.pushLog('（房间探针完成）')
    } catch (err) {
      console.error(`[TUREAD-TEST-FAIL] room 探针失败：${(err as Error).message}`)
    }
  })()
}
