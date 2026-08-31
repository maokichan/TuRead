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
  connect(config: NetConfig): Promise<void>
  disconnect(): Promise<void>
  send(envelope: MessageEnvelope): Promise<void>
  /** 当前成员 token（服务端签发；未连接/未取得时为 null） */
  getMemberId(): Promise<string | null>
  /** v0.2.1：REST 传输（自带 token 双闸头） */
  request<T = unknown>(options: HttpRequestOptions): Promise<HttpResult<T>>
}

// 保留类型导出，避免未使用告警
export type { Listener, Unsubscribe }
