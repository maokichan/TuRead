/**
 * IBookPicker 适配器（渲染进程侧）—— 经桥转发到主进程的 Electron 对话框与目录扫描。
 * 依据：client/docs/FEATURES.md §10；端口契约见 core/ports/picker.ts。
 */
import type { IBookPicker } from '@core/ports/picker'
import { IPC, type TureadBridge } from '@shared/ipc'

export class IpcPickerAdapter implements IBookPicker {
  constructor(private bridge: TureadBridge) {}

  async pickFiles(): Promise<string[]> {
    return (await this.bridge.invoke(IPC.pickerPickFiles)) as string[]
  }

  async pickDirectory(): Promise<string | null> {
    return (await this.bridge.invoke(IPC.pickerPickDirectory)) as string | null
  }

  async listEbooks(dir: string): Promise<string[]> {
    return (await this.bridge.invoke(IPC.pickerListEbooks, dir)) as string[]
  }

  async readFile(path: string): Promise<ArrayBuffer> {
    return (await this.bridge.invoke(IPC.fsReadFile, path)) as ArrayBuffer
  }
}
