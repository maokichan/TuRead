/**
 * INetService 适配器（主进程侧，真实实现）—— WS（ws 包，握手带 token 双闸头）+ REST（fetch）。
 * 渲染进程通过 IPC 桥（core/adapters/net/ipcNetAdapter）调用本实现。
 * 依据：server/docs/API.md（认证 / REST / WebSocket / 同步协议）。
 *
 * ⚠ **v0.4.3：连接模型改成"按房间建连"**（原来是一条通用连接 + room.join）—— 服务器在
 * **WS 握手时**就取 `room` 与 `nick`（`transport/ws.go`：缺任一或昵称超长 → 直接关连接），
 * 所以旧模型在服务器上根本走不到 `room.join`（连接已被关），表现为"连上又立刻重连"。
 * 现在的分工：
 * - `connect(config)` = 建立**会话**：申请/复用成员 token（REST `POST /auth/token`），不开 WS；
 * - `openRoom(roomId)` = 按房间开 WS（握手带 `?room=&nick=`）；
 * - `closeRoom()` = 关房间 WS（离开房间即断开 —— 聊天的生命周期归属于房间）；
 * - `request()` = REST，会话建立后即可用（大厅/建房/聊天历史都不需要 WS）。
 */
import WebSocket from 'ws'
import { TypedEmitter } from '@core/ports/emitter'
import type { NetServiceEvents, HttpRequestOptions, HttpResult } from '@core/ports/net'
import { buildRoomWsUrl, isValidNick, MAX_NICK_LEN } from '@core/domain/protocol'
import type { ConnectionState, MessageEnvelope, NetConfig, TokenResponse } from '@core/domain/types'

const RECONNECT_DELAY_MS = 2000
const MAX_RECONNECT_ATTEMPTS = 5
/** REST 超时（TODO P2「REST 无超时」）：服务器挂死时按钮不能永久卡住 */
const REST_TIMEOUT_MS = 15000

export class WsNetAdapter extends TypedEmitter<NetServiceEvents> {
  private config: NetConfig | null = null
  private memberToken: string | null = null
  /** 当前房间（`openRoom` 成功时置，`closeRoom` 清）—— 重连时用它重建同一条握手地址 */
  private roomId: string | null = null
  private ws: WebSocket | null = null
  private explicitlyClosed = false
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  private get baseUrl(): string {
    return this.config?.serverUrl ?? ''
  }

  private get accessToken(): string {
    return this.config?.accessToken ?? ''
  }

  /** 建立会话：只申请/复用成员 token（不建 WS） */
  async connect(config: NetConfig): Promise<void> {
    // 重复 connect：先把上一条房间连接清干净（否则换服务器会留下旧 socket）
    await this.closeRoom()
    this.config = config
    if (config.memberToken) {
      this.memberToken = config.memberToken
    } else {
      this.memberToken = await this.ensureMemberToken()
    }
  }

  async openRoom(roomId: string): Promise<void> {
    if (!this.config) throw new Error('尚未建立会话（先 connect）')
    const room = roomId.trim().toLowerCase()
    if (!room) throw new Error('房间号为空')
    // 昵称是**握手参数**：服务器超长直接关连接，在这里先判，给出可解释的错误
    const nick = (this.config.nickName ?? '').trim()
    if (!isValidNick(nick)) {
      throw new Error(`昵称需为 1~${MAX_NICK_LEN} 个字（当前 ${Array.from(nick).length} 个）`)
    }
    if (this.roomId === room && this.ws && this.ws.readyState === WebSocket.OPEN) return
    // 换房/重入：先清掉旧连接与重连计时器（不再有"双连接 / 重连风暴"，TODO P2）
    this.teardownSocket()
    this.roomId = room
    this.reconnectAttempts = 0
    this.explicitlyClosed = false
    await this.openSocket()
  }

  async closeRoom(): Promise<void> {
    this.explicitlyClosed = true
    this.roomId = null
    this.teardownSocket()
    this.emitState('disconnected')
  }

  async disconnect(): Promise<void> {
    await this.closeRoom()
    this.config = null
    this.memberToken = null
  }

  async send(envelope: MessageEnvelope): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('未连接（WebSocket 未打开）')
    }
    this.ws.send(JSON.stringify(envelope))
  }

  getMemberId(): string | null {
    return this.memberToken
  }

  async request<T = unknown>(options: HttpRequestOptions): Promise<HttpResult<T>> {
    const url = `${this.baseUrl}${options.path}`
    const headers: Record<string, string> = {
      'X-Turead-Access': this.accessToken
    }
    if (this.memberToken) headers['Authorization'] = `Bearer ${this.memberToken}`

    let body: BodyInit | undefined
    if (options.body != null) {
      if (options.rawBody) {
        body = options.body as ArrayBuffer
        headers['Content-Type'] = 'application/octet-stream'
      } else {
        body = JSON.stringify(options.body)
        headers['Content-Type'] = 'application/json'
      }
    }

    // 超时兜底（TODO P2「REST 无超时」）：服务器不可达时 create/join/刷新不能永久卡住
    const res = await fetch(url, { method: options.method, headers, body, signal: AbortSignal.timeout(REST_TIMEOUT_MS) })

    let data: unknown
    if (res.status === 204) {
      data = undefined
    } else if (options.responseType === 'arraybuffer') {
      data = await res.arrayBuffer()
    } else if (options.responseType === 'text') {
      data = await res.text()
    } else {
      data = await res.json().catch(() => null)
    }

    return { status: res.status, ok: res.ok, data: data as T }
  }

  private async ensureMemberToken(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/auth/token`, {
      method: 'POST',
      headers: { 'X-Turead-Access': this.accessToken },
      signal: AbortSignal.timeout(REST_TIMEOUT_MS)
    })
    if (!res.ok) {
      throw new Error(`签发成员 token 失败（HTTP ${res.status}）：请检查服务器地址与二级令牌`)
    }
    const data = (await res.json()) as TokenResponse
    return data.token
  }

  /** 清掉连接与重连计时器（幂等；不清 roomId/config） */
  private teardownSocket(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    const ws = this.ws
    this.ws = null
    if (ws) {
      ws.removeAllListeners()
      try {
        ws.close()
      } catch {
        // 关闭已死连接时的异常无需上报
      }
    }
  }

  /** 作废某条连接：摘掉监听并关闭（其 close 不再触发，因此不会续连） */
  private invalidateSocket(ws: WebSocket): void {
    if (this.ws === ws) this.ws = null
    ws.removeAllListeners()
    try {
      ws.close()
    } catch {
      // 关闭已死连接时的异常无需上报
    }
  }

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.config || !this.roomId) return reject(new Error('无连接配置'))
      const url = buildRoomWsUrl(this.config.serverUrl, this.roomId, (this.config.nickName ?? '').trim())
      const ws = new WebSocket(url, {
        headers: {
          'X-Turead-Access': this.accessToken,
          Authorization: `Bearer ${this.memberToken ?? ''}`
        }
      })
      this.ws = ws
      /** 本次连接是否握手成功 —— 失败过的那次**不后台续连**（TODO P2「越权发 connected」） */
      let opened = false

      ws.on('open', () => {
        opened = true
        this.reconnectAttempts = 0
        this.emitState('connected')
        resolve()
      })
      ws.on('message', (raw) => {
        try {
          this.emit('message', JSON.parse(String(raw)) as MessageEnvelope)
        } catch {
          // 非法 JSON：丢弃（传输层只搬运合法信封）
        }
      })
      ws.on('error', (err) => {
        if (opened) return // 连上之后的错误交给 close 走重连
        this.invalidateSocket(ws)
        reject(err)
      })
      ws.on('close', () => {
        if (this.ws !== ws) return // 已作废/已换新连接：旧连接的 close 不再有意义
        this.ws = null
        if (this.explicitlyClosed || !opened) {
          this.emitState('disconnected')
          return
        }
        this.scheduleReconnect()
      })
    })
  }

  /** 断线自动重连（只对"曾经连上过"的房间连接；握手失败/主动关闭不重连） */
  private scheduleReconnect(): void {
    if (this.explicitlyClosed || !this.roomId) {
      this.emitState('disconnected')
      return
    }
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.emitState('disconnected')
      return
    }
    this.emitState('reconnecting')
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.explicitlyClosed || !this.roomId) return
      // ⚠ 重连成功 = 服务器侧是一条**全新连接**（成员/订阅都是瞬态的）→ 上层（RoomSession）
      // 必须重新发 room.join，否则会变成"在房间里却不是成员"的幽灵（收不到 presence/聊天）
      this.openSocket().catch(() => this.scheduleReconnect())
    }, RECONNECT_DELAY_MS)
  }

  private emitState(state: ConnectionState): void {
    this.emit('connection-changed', state)
  }
}
