/**
 * 房间会话共享态（渲染层模块级 store，2026-09-17 随「阅读器聊天室」立）。
 *
 * 为什么要有它：**聊天室的生命周期归属于房间**，但它的两个入口分处两个功能组件 ——
 * ① 「房间」功能组件的会话视图（大厅进房后的常态视图）；② 阅读器右抽屉的「聊天」页签。
 * 状态若各持一份必然分叉（同一 id 出现两条、历史只进一边、离开房间后一边还留着消息）。
 * 故按 `logStore` / `libraryNavBus` 同族做法：**模块级单例 + 订阅通知**，容器只在 AppShell 挂载时绑一次。
 *
 * 纪律（继承用例层）：
 * - 消息一律经 `mergeChatMessages` 合并（广播含发送者 = server 回执，与 REST 历史会交错同一 id）；
 * - 本 store **不自己判断协议**，只投影 `IRoomSession` 的事件（协议词汇在 `@core/domain/protocol`）。
 */
import { useSyncExternalStore } from 'react'
import type { ServiceContainer } from '@core/container'
import { mergeChatMessages } from '@core/domain/protocol'
import type { ChatMessage, ConnectionState, RoomMember } from '@core/domain/types'

export interface RoomView {
  /** 当前房间号（null = 不在任何房间里） */
  roomId: string | null
  /**
   * 这次房间会话绑定的**本地 edition id**（= 经房间打开的那本书）。
   * 聊天室只在**它的**阅读页出现 —— "没有通过房间进入一本书就不会有这个项"（用户 2026-09-17 定）。
   */
  editionId: string | null
  /** 房间绑定书的标题（会话视图显示用；来自本地记录，不是服务器字段） */
  bookTitle: string
  members: RoomMember[]
  messages: ChatMessage[]
  connection: ConnectionState
  /** 最近一条房间级错误（加入失败 / 拉历史失败）—— UI 显示一行，不弹窗 */
  error: string | null
}

const EMPTY_VIEW: RoomView = {
  roomId: null,
  editionId: null,
  bookTitle: '',
  members: [],
  messages: [],
  connection: 'disconnected',
  error: null
}

let view: RoomView = EMPTY_VIEW
let bound: ServiceContainer | null = null
const listeners = new Set<() => void>()

function set(patch: Partial<RoomView>): void {
  view = { ...view, ...patch }
  for (const fn of listeners) fn()
}

/**
 * 绑定容器（AppShell 挂载时调一次；幂等）。返回解绑函数（同时复位会话态）。
 * ⚠ 订阅的是**构造期常驻**的 `IRoomSession` 事件（net/room 生命周期随容器），
 * 因此"不在房间里"时也照常收到连接状态变化。
 */
export function bindRoomSession(container: ServiceContainer): () => void {
  if (bound === container) return () => {}
  bound = container
  const unsubs = [
    container.room.on('presence-updated', (members) => set({ members })),
    container.room.on('chat-message', (msg) => set({ messages: mergeChatMessages(view.messages, msg) })),
    container.room.on('chat-history', (msgs) => set({ messages: mergeChatMessages(view.messages, msgs) })),
    container.room.on('connection-changed', (connection) => set({ connection })),
    container.room.on('system-message', (m) => {
      if (m.type === 'error') set({ error: m.text })
    })
  ]
  return () => {
    unsubs.forEach((u) => u())
    bound = null
    view = EMPTY_VIEW
    for (const fn of listeners) fn()
  }
}

/** 加入成功（`joinRoom` ok）后登记会话 —— 阅读器据此决定要不要出现「聊天」页签 */
export function beginRoomSession(p: { roomId: string; editionId: string; bookTitle: string }): void {
  set({ roomId: p.roomId, editionId: p.editionId, bookTitle: p.bookTitle, error: null })
}

/** 离开房间 / 加入失败：会话态整体复位（**消息随房间会话结束**；历史仍在服务器，随房间级联清理） */
export function endRoomSession(): void {
  set({ ...EMPTY_VIEW, connection: view.connection })
}

/** 失败信息（加入失败等）——不改变会话归属，只显示一行 */
export function setRoomError(text: string | null): void {
  set({ error: text })
}

/** 发消息（房间会话中才有意义；失败抛错由调用方处置） */
export async function sendRoomChat(text: string): Promise<void> {
  if (!bound) throw new Error('房間會話尚未綁定')
  if (!view.roomId) throw new Error('尚未加入房間')
  await bound.room.sendChat(text)
}

export function getRoomView(): RoomView {
  return view
}

export function subscribeRoomView(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** React 接线（`useSyncExternalStore`：快照引用只在变化时更换，避免无谓重渲染） */
export function useRoomView(): RoomView {
  return useSyncExternalStore(subscribeRoomView, getRoomView, getRoomView)
}
