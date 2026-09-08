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
  /**
   * 局部更新一个设置对象（v0.1.9）—— 在主进程内**原子合并**，避免两个 Feature 各自
   * "读-改-写"同一设置键时互相覆盖（见 FEATURES §10 审查记录）。
   */
  patchSetting(key: string, patch: Record<string, unknown>): Promise<void>
  /**
   * 封面缩略图落盘（v0.1.8）：返回写入的相对文件名（存入 `BookRecord.coverPath`）。
   * 字节不进 library.json（体积/写放大，见 BookRecord.coverPath 注释）。
   */
  setCover(bookId: string, bytes: ArrayBuffer, ext: string): Promise<string>
  /** 读封面缩略图字节；无封面 → null */
  getCover(bookId: string): Promise<ArrayBuffer | null>
  /** 删除封面文件（随书删除时调用；文件不存在不报错） */
  removeCover(bookId: string): Promise<void>
}
