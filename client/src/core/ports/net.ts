/**
 * INetService —— 传输能力（端口）。
 * 适配器：主进程 wsNetAdapter（真实 WS + REST）↔ 渲染进程 ipcNetAdapter（IPC 桥）。
 * 依据：client/docs/CONTRACTS.md §4.2 + server/docs/API.md（协议已定）。
 *
 * v0.2.1 修订：端口增加 `request()`（REST），服务仍"只搬运信封、不理解业务语义"——
 * REST（auth/token、rooms、books、messages）同样只是传输，业务语义在用例层解释。
 */
import type { Listener, EventEmitter, Unsubscribe } from './events'
import type { MessageEnvelope, NetConfig, ConnectionState } from '@core/domain/types'

export interface NetServiceEvents {
  /** 收到服务器消息信封（只搬运，不解语义） */
  message: (envelope: MessageEnvelope) => void
  'connection-changed': (state: ConnectionState) => void
}

export interface HttpRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** 以 / 开头的路径（如 /rooms、/auth/token） */
  path: string
  /** 自动序列化为 JSON 并带 Content-Type: application/json */
  body?: unknown
  /** body 为原始二进制（ArrayBuffer，文件上传用），跳过 JSON 序列化 */
  rawBody?: boolean
  /** 响应期望类型：json（默认）| text | arraybuffer（文件下载） */
  responseType?: 'json' | 'text' | 'arraybuffer'
}

export interface HttpResult<T = unknown> {
  status: number
  ok: boolean
  data: T
}

export interface INetService extends EventEmitter<NetServiceEvents> {
  /**
   * 建立会话（**v0.4.3 语义收窄**）：只做身份与准入 —— 带二级令牌调 `POST /auth/token`
   * 申请/复用成员 token，并记住服务器地址；**不建立 WebSocket**。
   * 为什么改：服务器在 **WS 握手时**就要求 `room` 与 `nick`（见 `openRoom`），
   * "先连一条通用连接"在服务器上根本走不到 `room.join`。
   */
  connect(config: NetConfig): Promise<void>
  /**
   * 按房间建立 WebSocket（v0.4.3）—— 握手 = `GET /ws?room=<id>&nick=<name>`（token 双闸走 header）。
   * 依据 `server/docs/API.md`「WebSocket」与 `transport/ws.go`（缺 room/nick 或昵称 >12 字 → 直接关连接）。
   * ⚠ 同一成员 token 的新连接会**踢掉旧连接**（单设备登录）→ 换房前必须先 `closeRoom()`。
   * 连接身份（nick）取自 `connect()` 时的 `NetConfig.nickName`。
   */
  openRoom(roomId: string): Promise<void>
  /** 关闭房间连接。离开房间 = 位置/聊天同步一并结束（聊天的**生命周期归属于房间**） */
  closeRoom(): Promise<void>
  /** 断开：关闭房间连接并清掉会话（成员 token 一并丢弃，下次 connect 重新申请） */
  disconnect(): Promise<void>
  /** 发送信封（只在 `openRoom` 之后有效；传输层只搬运，不解语义） */
  send(envelope: MessageEnvelope): Promise<void>
  /** 当前成员 token（服务端签发；未连接/未取得时为 null） */
  getMemberId(): Promise<string | null>
  /** v0.2.1：REST 传输（自带 token 双闸头；**不需要 WS**，会话建立后即可用） */
  request<T = unknown>(options: HttpRequestOptions): Promise<HttpResult<T>>
}

// 保留类型导出，避免未使用告警
export type { Listener, Unsubscribe }
