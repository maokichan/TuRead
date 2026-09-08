/**
 * IBookService —— 书架 + 导入（应用服务/用例层）。
 * 依据：client/docs/CONTRACTS.md §5.2。
 * importBook 是导入用例：编排 IBookIdentityService（指纹+元数据）与 ILibraryStore（持久化）；
 * OCR 提 ISBN 是可插拔步骤（候选 IOcrService，v1 未定，见 TODO.md）。
 */
import type { IBookIdentityService } from '@core/ports/identity'
import type { ILibraryStore } from '@core/ports/store'
import type { BookFormat, BookLocation, BookRecord, BookMetadata } from '@core/domain/types'

export interface IBookService {
  /** 导入：文件 → 指纹 → 元数据 → 入库（内部编排 identity + store；OCR 可选）；filePath 为磁盘真实路径（重开书用） */
  importBook(file: ArrayBuffer, name: string, format: BookFormat, filePath: string): Promise<BookRecord>
  list(): Promise<BookRecord[]>
  get(id: string): Promise<BookRecord | null>
  remove(id: string): Promise<void>
  updateLastLocation(id: string, location: BookLocation): Promise<void>
}

export class BookService implements IBookService {
  private identity: IBookIdentityService
  private store: ILibraryStore

  constructor(identity: IBookIdentityService, store: ILibraryStore) {
    this.identity = identity
    this.store = store
  }

  async importBook(
    buffer: ArrayBuffer,
    name: string,
    format: BookFormat,
    filePath: string
  ): Promise<BookRecord> {
    const [fingerprint, metadata] = await Promise.all([
      this.identity.computeFingerprint(buffer),
      this.identity.extractMetadata(buffer, format, name)
    ])

    // 导入去重（P2，2026-09-08）：同一电子版（指纹三字段全等）复用已有记录，不产生重复条目。
    // 判定复用 identity.verify（内容指纹全等 = 同书同电子版，见 CONTRACTS §4.3 / docs/ARCHITECTURE §1）。
    // 若路径变化（用户移动/复制了文件）则把 filePath 更新到新位置，保证打开链路可用。
    const existing = (await this.store.listBooks()).find((b) =>
      this.identity.verify(b.fingerprint, fingerprint)
    )
    if (existing) {
      if (existing.filePath !== filePath) {
        await this.store.updateBook(existing.id, { filePath })
      }
      return { ...existing, filePath }
    }

    const record: BookRecord = {
      id: crypto.randomUUID(),
      fingerprint,
      metadata,
      format,
      filePath,
      createdAt: Date.now()
    }
    await this.store.addBook(record)
    return record
  }

  list(): Promise<BookRecord[]> {
    return this.store.listBooks()
  }

  get(id: string): Promise<BookRecord | null> {
    return this.store.getBook(id)
  }

  remove(id: string): Promise<void> {
    return this.store.removeBook(id)
  }

  async updateLastLocation(id: string, location: BookLocation): Promise<void> {
    await this.store.updateBook(id, { lastLocation: location, lastReadAt: Date.now() })
  }
}
