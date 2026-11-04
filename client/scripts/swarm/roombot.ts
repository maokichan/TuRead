/**
 * roombot —— 蜂群机器人客户端（纯 Node，无窗口，dev-only 工具）。
 *
 * 它是什么：把**真实的核心层**（WsNetAdapter 传输适配器 + RoomSession 同步用例 + 协议词汇）
 * 原样搬进一个无头进程，渲染端口换成**脚本化假件**（按节奏吐位置、getOpenBook 返回与房间
 * edition 同指纹的合成书）—— 模仿一个"正在翻页/说话/离开"的真人客户端。
 * 依据（用户 2026-10-24 立项）：实机上才能验的问题先在单机蜂群里筛一遍；交互界面按"如约工作"假设。
 *
 * 为什么这是对的形态：同步逻辑与窗口本来就是两层（六边形 ports）—— 机器人只复用前一层，
 * 渲染/UI/IPC 桥不进蜂群的覆盖面（那两层的机械验证归 room/room-peer 真窗口探针，手感归人眼）。
 *
 * 输出契约（编排器 grep 依此）：单行、前缀 `[<tag>]`：
 *   STATE joined room=<id> members=<n>     加入成功（join-ack 的成员数）
 *   STATE left                              离开房间完成
 *   EVT presence n=<n> names=a,b,c          成员快照
 *   EVT location-updated from=<nick> ch=<i> pct=<p> t=+<ms>
 *   EVT chat from=<nick> mine=<0|1> text=<...>
 *   EVT connection s=<state>
 *   SYS <text>                              系统消息（error 会被编排器当失败）
 *
 * 用法：
 *   node roombot.cjs --server http://127.0.0.1:18234 --room <id> --nick bot1 --token Aaa1111 \
 *     --flip-every 900 --chat-every 1600 --leave-after 5000 --duration 9000
 */
import { RoomSession } from '@core/usecases/RoomSession'
import { WsNetAdapter } from '../../src/main/net/wsNetAdapter'
import { FingerprintService } from '../../src/core/adapters/identity/fingerprint'
import { extToFormat } from '@core/domain/format'
import type {
  BookLocation,
  BookRecord,
  ChatMessage,
  RoomMember
} from '@core/domain/types'
import type { IRenderService } from '@core/ports/render'

// ---------- CLI ----------

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] != null ? String(process.argv[i + 1]) : fallback
}
function argNum(name: string, fallback: number): number {
  const v = parseInt(arg(name, ''), 10)
  return Number.isFinite(v) ? v : fallback
}
const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`)

const SERVER = arg('server', 'http://127.0.0.1:18234')
const ROOM = arg('room', '')
const NICK = arg('nick', 'bot1')
const TOKEN = arg('token', 'Aaa1111')
const FLIP_EVERY = argNum('flip-every', 0)
const CHAT_EVERY = argNum('chat-every', 0)
const LEAVE_AFTER = argNum('leave-after', 0)
const DURATION = argNum('duration', 0)
const TAG = arg('tag', NICK)
const QUIET = hasFlag('quiet')

const t0 = Date.now()
const say = (line: string): void => {
  if (QUIET && !/^(STATE|EVT|SYS)/.test(line)) return
  process.stdout.write(`[${TAG}] ${line}\n`)
}
const elapsed = (): string => `+${Date.now() - t0}ms`

// ---------- 假渲染端口（脚本化位置源） ----------

/**
 * RoomSession 实际用到的渲染面只有三个成员：on('location-changed') / getPosition() /
 * getOpenBook()（B-2 校验）。假件持有一本**合成书**（指纹 = 房间 edition，进房后注入），
 * 翻页 = 直接 emit 一个递进位置 —— 与真人翻页在同步逻辑眼里不可区分。
 */
class FakeRender {
  private listeners = new Set<(loc: BookLocation) => void>()
  openBook: BookRecord | null = null
  private pos: BookLocation = {
    chapterDocIndex: 0,
    chapterHref: 'swarm-0',
    count: 0,
    page: 0,
    percentage: 0,
    text: '蜂群位置 0',
    chapterTitle: '第 1 章'
  }
  private page = 0

  on(event: 'location-changed', fn: (loc: BookLocation) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getPosition(): BookLocation {
    return this.pos
  }
  getOpenBook(): BookRecord | null {
    return this.openBook
  }
  /** 模拟翻页（roombot 的节奏器调用） */
  flip(): void {
    this.page += 1
    this.pos = {
      chapterDocIndex: this.page % 12,
      chapterHref: `swarm-${this.page}`,
      count: 0,
      page: this.page,
      percentage: (this.page % 100) / 100,
      text: `蜂群位置 ${this.page}`,
      chapterTitle: `第 ${(this.page % 12) + 1} 章`
    }
    for (const fn of this.listeners) fn(this.pos)
  }
  toPort(): IRenderService {
    return this as unknown as IRenderService
  }
}

// ---------- 机器人主体 ----------

async function main(): Promise<void> {
  const net = new WsNetAdapter()
  const render = new FakeRender()
  const identity = new FingerprintService()
  const room = new RoomSession(net, render.toPort(), identity)

  room.on('presence-updated', (members: RoomMember[]) => {
    say(`EVT presence n=${members.length} names=${members.map((m) => m.nickName).join(',')}`)
  })
  room.on('location-updated', (loc: BookLocation, from: RoomMember) => {
    say(
      `EVT location-updated from=${from.nickName} ch=${loc.chapterDocIndex} pct=${Math.round((loc.percentage ?? 0) * 100)} t=${elapsed()}`
    )
  })
  room.on('chat-message', (msg: ChatMessage) => {
    say(`EVT chat from=${msg.nick} mine=${msg.member === room.getMyMemberId() ? 1 : 0} text=${msg.text}`)
  })
  room.on('connection-changed', (s) => say(`EVT connection s=${s}`))
  room.on('system-message', (m) => say(`SYS[${m.type}] ${m.text}`))

  // ① 会话（成员 token 显式给定 —— 同机多机器人绝不能依赖环境变量，见 wsNetAdapter 注释）
  await net.connect({ serverUrl: SERVER, accessToken: arg('access', ''), nickName: NICK, memberToken: TOKEN })
  say(`STATE connected server=${SERVER} token=${TOKEN}`)

  // ② 定房间：显式给 → 用它；否则取大厅最新一间
  let roomId = ROOM.trim().toLowerCase()
  if (!roomId) {
    const rooms = await room.listRooms()
    if (rooms.length === 0) throw new Error('大厅为空且未给 --room')
    roomId = [...rooms].sort((a, b) => b.createdAt - a.createdAt)[0].roomId
    say(`STATE picked-room room=${roomId}`)
  }

  // ③ 无书进入（机器人没有真书）→ 用 join-ack 的 edition 造合成书注入假渲染端口：
  //    指纹与房间 edition 相同 → B-2 校验通过，位置照常上报（真人在场时不可区分）
  const res = await room.joinRoom(roomId, null, null)
  if (!res.ok) throw new Error(`加入失败：${res.reason}`)
  const edition = res.room.edition
  if (edition) {
    render.openBook = {
      id: `swarm-${edition.id}`,
      fingerprint: {
        algorithm: (edition.hashAlgo as 'md5-sample3-v1') ?? 'md5-sample3-v1',
        hash: edition.hash,
        size: edition.size
      },
      metadata: { title: `蜂群書-${edition.id}` },
      format: extToFormat(`x.${edition.ext}`),
      filePath: '',
      createdAt: 0
    }
  }
  say(`STATE joined room=${res.room.roomId} members=${res.room.members.length}`)

  // ④ 行为节奏（真人节奏，不是洪泛 —— 洪泛是另一类测试，服务器侧已有专项）
  if (FLIP_EVERY > 0) {
    const timer = setInterval(() => render.flip(), FLIP_EVERY)
    timers.push(timer)
  }
  let chatNo = 0
  if (CHAT_EVERY > 0) {
    const timer = setInterval(() => {
      chatNo += 1
      void room.sendChat(`${NICK} 冒泡 #${chatNo}`).catch((err: Error) => say(`SYS[error] 發送失敗：${err.message}`))
    }, CHAT_EVERY)
    timers.push(timer)
  }
  if (LEAVE_AFTER > 0) {
    const timer = setTimeout(() => {
      void room
        .leaveRoom()
        .then(() => say('STATE left'))
        .catch((err: Error) => say(`SYS[error] 離開失敗：${err.message}`))
    }, LEAVE_AFTER)
    timers.push(timer)
  }
  if (DURATION > 0) {
    const timer = setTimeout(() => {
      say('STATE done')
      process.exit(0)
    }, DURATION)
    timers.push(timer)
  }
}

const timers: Array<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>> = []

main().catch((err: Error) => {
  process.stderr.write(`[${TAG}] STATE fatal ${err.message}\n`)
  process.exit(1)
})
