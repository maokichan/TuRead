/**
 * INetService 适配器（主进程侧，真实实现）—— WS（ws 包，握手带 token 双闸头）+ REST（fetch）。
 * 渲染进程通过 IPC 桥（core/adapters/net/ipcNetAdapter）调用本实现。
 * 依据：server/docs/API.md（认证 / REST / 同步协议）。
 */
import WebSocket from 'ws'
import { TypedEmitter } from '@core/ports/emitter'
import type { NetServiceEvents, HttpRequestOptions, HttpResult } from '@core/ports/net'
import type { ConnectionState, MessageEnvelope, NetConfig, TokenResponse } from '@core/domain/types'

const RECONNECT_DELAY_MS = 2000
const MAX_RECONNECT_ATTEMPTS = 5

export class WsNetAdapter extends TypedEmitter<NetServiceEvents> {
  private config: NetConfig | null = null
  private memberToken: string | null = null
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

  async connect(config: NetConfig): Promise<void> {
    this.config = config
    this.explicitlyClosed = false
    this.reconnectAttempts = 0

    if (config.memberToken) {
      this.memberToken = config.memberToken
    } else {
      this.memberToken = await this.ensureMemberToken()
    }
    await this.openSocket()
  }

  async disconnect(): Promise<void> {
    this.explicitlyClosed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
    this.emitState('disconnected')
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

    const res = await fetch(url, { method: options.method, headers, body })

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
      headers: { 'X-Turead-Access': this.accessToken }
    })
    if (!res.ok) {
      throw new Error(`签发成员 token 失败（HTTP ${res.status}）：请检查服务器地址与二级令牌`)
    }
    const data = (await res.json()) as TokenResponse
    return data.token
  }

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.config) return reject(new Error('无连接配置'))
      const url = this.toWsUrl(this.config.serverUrl)
      const ws = new WebSocket(url, {
        headers: {
          'X-Turead-Access': this.accessToken,
          Authorization: `Bearer ${this.memberToken ?? ''}`
        }
      })
      this.ws = ws

      ws.on('open', () => {
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
        reject(err)
      })
      ws.on('close', () => {
        if (this.explicitlyClosed) {
          this.emitState('disconnected')
          return
        }
        this.scheduleReconnect()
      })
    })
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.emitState('disconnected')
      return
    }
    this.emitState('reconnecting')
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => {
      this.openSocket().catch(() => this.scheduleReconnect())
    }, RECONNECT_DELAY_MS)
  }

  private emitState(state: ConnectionState): void {
    this.emit('connection-changed', state)
  }

  private toWsUrl(serverUrl: string): string {
    const u = new URL(serverUrl)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    u.pathname = '/ws'
    return u.toString()
  }
}
