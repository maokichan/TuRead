/**
 * INetService 适配器（渲染进程侧）—— IPC 桥，转发到主进程的 wsNetAdapter（真实 WS + REST）。
 * 本适配器只搬运信封与传输，不理解业务语义（与端口职责一致）。
 */
import { TypedEmitter } from '@core/ports/emitter'
import type { INetService, NetServiceEvents, HttpRequestOptions, HttpResult } from '@core/ports/net'
import type { ConnectionState, MessageEnvelope, NetConfig } from '@core/domain/types'
import { IPC, type TureadBridge } from '@shared/ipc'

export class IpcNetAdapter extends TypedEmitter<NetServiceEvents> implements INetService {
  private config: NetConfig | null = null

  constructor(private bridge: TureadBridge) {
    super()
    bridge.subscribe(IPC.netMessage, (payload) => {
      this.emit('message', payload as MessageEnvelope)
    })
    bridge.subscribe(IPC.netConnectionChanged, (payload) => {
      this.emit('connection-changed', payload as ConnectionState)
    })
  }

  async connect(config: NetConfig): Promise<void> {
    this.config = config
    await this.bridge.invoke(IPC.netConnect, config)
  }

  async disconnect(): Promise<void> {
    this.config = null
    await this.bridge.invoke(IPC.netDisconnect)
  }

  async send(envelope: MessageEnvelope): Promise<void> {
    await this.bridge.invoke(IPC.netSend, envelope)
  }

  async getMemberId(): Promise<string | null> {
    return (await this.bridge.invoke(IPC.netGetMemberId)) as string | null
  }

  async request<T = unknown>(options: HttpRequestOptions): Promise<HttpResult<T>> {
    return (await this.bridge.invoke(IPC.netRequest, options)) as HttpResult<T>
  }
}
