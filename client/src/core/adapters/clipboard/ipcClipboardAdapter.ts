/**
 * 剪贴板适配器（渲染进程侧）—— 走 preload 的**具名方法** `writeClipboardText`。
 * 不用泛化 `invoke(channel, …)`：具名方法天然是白名单，符合「IPC 桥收敛」的方向（见端口注释）。
 */
import type { IClipboard } from '@core/ports/clipboard'
import type { TureadBridge } from '@shared/ipc'

export class IpcClipboardAdapter implements IClipboard {
  constructor(private readonly bridge: TureadBridge) {}

  async writeText(text: string): Promise<void> {
    await this.bridge.writeClipboardText(text)
  }
}
