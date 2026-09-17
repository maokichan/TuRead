/**
 * dev-only **双开联调**（`TUREAD_DEV_PROBE=room-peer`，2026-09-17 用户提："再起一个 client 试试效果"）。
 *
 * 它是什么：把本进程当成**第二个真人 client** —— 连服务器 → 进指定房间（默认取大厅里最新的一间）→
 * 用本地同一本书完成标定 → **打开阅读器**（于是右抽屉真的出现「聊天」格）→ 之后一直活着：
 * 打印成员快照与聊天（我能从日志里读到你发的消息），并对别人的消息**自动应答一句**（便于看往返效果）。
 *
 * ⚠ 与 `room` 探针的区别：`room` 是**断言型**（跑完即退，退出码 = 判定）；本探针是**驻留型**
 * （配 `TUREAD_DEV_KEEPALIVE=1`，不设自动退出计时器），要的就是一个真实窗口。
 *
 * ⚠ 同机双开的硬约束：服务器**按 IP 签发**成员 token 且「同 token 新连接踢旧连接」→ 第二个实例必须
 * 用**另一个 token**：`TUREAD_DEV_MEMBER_TOKEN=<7 位字母数字>`（见 `wsNetAdapter.connect` 的注释）。
 *
 * 用法（第二个实例，独立 userData）：
 * ```
 * $env:TUREAD_DEV_PROBE="room-peer"; $env:TUREAD_DEV_KEEPALIVE="1"
 * $env:TUREAD_DEV_MEMBER_TOKEN="Bbb2222"      # 必须是另一个 token，否则会把第一个 client 踢下线
 * $env:TUREAD_DEV_NICK="bob"
 * $env:TUREAD_DEV_SERVER="http://127.0.0.1:8080"; $env:TUREAD_DEV_ACCESS=""
 * $env:TUREAD_DEV_ROOM="80979f6a"              # 可留空 = 自动取大厅里最新的一间
 * $env:TUREAD_DEV_BOOK="D:\...\同一本.pdf"      # 标定用（不匹配时会退化为"无书成员"）
 * $env:TUREAD_USER_DATA="D:\PROJECT\TuRead\client\.probe-user-data-peer"
 * node_modules\electron\dist\electron.exe .
 * ```
 * 归属：开发工具，不是产品代码（同 dev/selfCheck.ts 纪律）。
 */
import type { ServiceContainer } from '@core/container'
import { extToFormat, basename } from '@core/domain/format'
import type { BookRecord, ChatMessage, RoomMember } from '@core/domain/types'
import { beginRoomSession } from '../features/roomSession'
import type { FeatureHost } from '../features/types'

let autoRan = false
const DEFAULT_SERVER = 'http://127.0.0.1:8080'
const DEFAULT_NICK = 'bob'

export function runRoomPeer(container: ServiceContainer, host: FeatureHost): void {
  if (window.turead.devProbe !== 'room-peer' || autoRan) return
  autoRan = true

  const say = (line: string): void => console.error(`[peer] ${line}`)
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

  void (async () => {
    try {
      const serverUrl = window.turead.devServer || DEFAULT_SERVER
      const accessToken = window.turead.devAccess ?? ''
      const nick = (window.turead.devNick || DEFAULT_NICK).trim()
      const devBook = window.turead.devBook

      // ① 会话（成员 token 由 TUREAD_DEV_MEMBER_TOKEN 指定，见 wsNetAdapter）
      await container.net.connect({ serverUrl, accessToken, nickName: nick })
      const myId = await container.net.getMemberId()
      say(`已連上 ${serverUrl}，成員 token=${myId} 昵稱=${nick}`)

      // ② 定房间：显式给 → 用它；否则取大厅里**最新创建**的一间
      const wanted = (window.turead.devRoom ?? '').trim().toLowerCase()
      let roomId = wanted
      if (!roomId) {
        const rooms = await container.room.listRooms()
        if (rooms.length === 0) throw new Error('大厅为空：请先在第一个 client 里建/进一间房')
        const newest = [...rooms].sort((a, b) => b.createdAt - a.createdAt)[0]
        roomId = newest.roomId
        say(`未指定房號 → 取大廳最新一間 ${roomId}（${newest.title || '—'}，${newest.memberCount} 人在內）`)
      }

      // ③ 本地书（可选）：导入后用**同一份文件**标定；没有/不匹配 → 退化为"无书成员"
      let book: BookRecord | null = null
      if (devBook) {
        try {
          const { currentId: libraryId } = await container.store.listLibraries()
          const buffer = await container.picker.readFile(devBook)
          const imported = await container.books.importBook(
            buffer,
            basename(devBook),
            extToFormat(devBook),
            devBook,
            libraryId
          )
          book = imported.edition
          say(`已導入本地書《${book.metadata.title}》（指紋 ${book.fingerprint.hash.slice(0, 8)}…）`)
        } catch (err) {
          say(`導入失敗（將以無書成員加入）：${(err as Error).message}`)
        }
      } else {
        say('未給 TUREAD_DEV_BOOK → 以**無書成員**加入（伺服器允許，見 API.md「room.join」）')
      }

      // ④ 进房（标定）；书不匹配时按服务端的"无书成员"路径重试
      let joined = await container.room.joinRoom(roomId, book, null)
      if (!joined.ok && joined.reason === 'book-mismatch' && book) {
        say(`書不匹配（本地指紋與房間 edition 不同）→ 以無書成員重試`)
        book = null
        joined = await container.room.joinRoom(roomId, book, null)
      }
      if (!joined.ok) throw new Error(`加入失敗：${joined.reason}`)
      const room = joined.room
      say(
        `已進房 ${room.roomId}：成員 ${room.members.length} 人 —— ` +
          room.members.map((m) => `${m.nickName}${m.isMe ? '(我)' : ''}`).join('、')
      )

      // ⑤ 共享会话态 + 打开阅读器：右抽屉出现「聊天」格（本轮功能的可见形态）
      beginRoomSession({
        roomId: room.roomId,
        editionId: book ? book.id : (room.bookId ?? ''),
        bookTitle: book?.metadata.title ?? `${room.roomId} 房間`
      })
      if (book) host.openReader(book.id)
      else host.navigate('room')

      // ⑥ 驻留：把房间事件打到日志（主进程会转发 error 级 → 我能读到），并对别人的消息自动应答
      let replies = 0
      container.room.on('presence-updated', (members: RoomMember[]) => {
        say(
          `成員快照（${members.length}）：` +
            members
              .map((m) => {
                const loc = m.location
                return `${m.nickName}${m.isMe ? '(我)' : ''}${loc ? `@第${Number(loc.chapterDocIndex) + 1}章 ${Math.round((loc.percentage ?? 0) * 100)}%` : '@無位置'}`
              })
              .join('、')
        )
      })
      container.room.on('location-updated', (loc, from) => {
        say(`位置：${from.nickName} → 第${Number(loc.chapterDocIndex) + 1}章 ${Math.round((loc.percentage ?? 0) * 100)}%`)
      })
      container.room.on('chat-message', (msg: ChatMessage) => {
        const mine = msg.member === myId
        say(`聊天${mine ? '(我)' : ''} ${msg.nick}：${msg.text}`)
        if (mine) return
        replies += 1
        void container.room
          .sendChat(`（${nick} 自動應答 #${replies}）收到：${msg.text.slice(0, 16)}`)
          .catch((err) => say(`應答失敗：${(err as Error).message}`))
      })
      container.room.on('system-message', (m) => say(`系統消息[${m.type}]：${m.text}`))

      await container.room.sendChat(`（${nick} 已進房 · 第二個 client${book ? '' : '（無書）'}）`)
      console.error(
        `[TUREAD-TEST-OK][room-peer] 第二個 client 已就位：room=${room.roomId} nick=${nick} ` +
          `book=${book ? book.metadata.title : '(無書成員)'} —— 之後持續駐留（keepalive）`
      )
    } catch (err) {
      console.error(`[TUREAD-TEST-FAIL] room-peer 失敗：${(err as Error).message}`)
    }
  })()
}
