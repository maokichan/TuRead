/**
 * ILibraryStore —— 本地持久化（端口）。
 * 依据：client/docs/CONTRACTS.md §4.4。
 * 骨架阶段实现：主进程 JSON 文件存储（userData/library.json）——只存文件路径 + 文件信息，够用且诚实；
 * 演进：无缝换成 better-sqlite3（koodo-reader 同款），接口不变。
 */
import type { BookRecord } from '@core/domain/types'

export interface ILibraryStore {
  addBook(record: BookRecord): Promise<void>
  updateBook(id: string, patch: Partial<BookRecord>): Promise<void>
  getBook(id: string): Promise<BookRecord | null>
  listBooks(): Promise<BookRecord[]>
  removeBook(id: string): Promise<void>
  getSetting<T>(key: string, fallback: T): Promise<T>
  setSetting(key: string, value: unknown): Promise<void>
}
