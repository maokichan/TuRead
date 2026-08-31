/**
 * ILibraryStore 适配器（渲染进程侧）—— IPC 桥，转发到主进程的 JsonStore（JSON 文件持久化）。
 * 接口保持存储无关；后续换 better-sqlite3 只需替换主进程实现，本桥不变。
 */
import type { ILibraryStore } from '@core/ports/store'
import type { BookRecord } from '@core/domain/types'
import { IPC, type TureadBridge } from '@shared/ipc'

export class IpcStoreAdapter implements ILibraryStore {
  constructor(private bridge: TureadBridge) {}

  async addBook(record: BookRecord): Promise<void> {
    await this.bridge.invoke(IPC.storeAddBook, record)
  }

  async updateBook(id: string, patch: Partial<BookRecord>): Promise<void> {
    await this.bridge.invoke(IPC.storeUpdateBook, { id, patch })
  }

  async getBook(id: string): Promise<BookRecord | null> {
    return (await this.bridge.invoke(IPC.storeGetBook, id)) as BookRecord | null
  }

  async listBooks(): Promise<BookRecord[]> {
    return (await this.bridge.invoke(IPC.storeListBooks)) as BookRecord[]
  }

  async removeBook(id: string): Promise<void> {
    await this.bridge.invoke(IPC.storeRemoveBook, id)
  }

  async getSetting<T>(key: string, fallback: T): Promise<T> {
    return (await this.bridge.invoke(IPC.storeGetSetting, { key, fallback })) as T
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    await this.bridge.invoke(IPC.storeSetSetting, { key, value })
  }
}
