/**
 * ILibraryStore 适配器（渲染进程侧）—— IPC 桥，转发到主进程的 LibraryManager/SqliteStore
 * （SQLite 单库持久化，多库下所有 store:* 打到「当前库」）。
 * 接口保持存储无关；本桥不感知库切换——切库以 main 广播的 library-changed 为准。
 */
import type { ILibraryStore, LibraryListResult } from '@core/ports/store'
import type { BookRecord, LibraryEntry } from '@core/domain/types'
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

  async patchSetting(key: string, patch: Record<string, unknown>): Promise<void> {
    await this.bridge.invoke(IPC.storePatchSetting, { key, patch })
  }

  async setCover(bookId: string, bytes: ArrayBuffer, ext: string): Promise<string> {
    return (await this.bridge.invoke(IPC.storeSetCover, { bookId, bytes, ext })) as string
  }

  async getCover(bookId: string): Promise<ArrayBuffer | null> {
    return (await this.bridge.invoke(IPC.storeGetCover, bookId)) as ArrayBuffer | null
  }

  async removeCover(bookId: string): Promise<void> {
    await this.bridge.invoke(IPC.storeRemoveCover, bookId)
  }

  async listLibraries(): Promise<LibraryListResult> {
    return (await this.bridge.invoke(IPC.storeListLibraries)) as LibraryListResult
  }

  async createLibrary(name?: string): Promise<LibraryEntry> {
    return (await this.bridge.invoke(IPC.storeCreateLibrary, name)) as LibraryEntry
  }

  async switchLibrary(id: string): Promise<void> {
    await this.bridge.invoke(IPC.storeSwitchLibrary, id)
  }
}
