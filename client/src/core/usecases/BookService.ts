/**
 * IBookService —— 书架 + 导入（应用服务/用例层）。
 * 依据：client/docs/CONTRACTS.md §5.2（**v0.4.0**）。
 *
 * ⚠ v0.4.0（2026-09-15「书的身份」）：本用例从"往书库里加一条 BookRecord"改为
 * **两层写入** —— ① 按指纹 upsert **内容（edition，全局去重）**；
 * ② 往目标书库加一条**收录（holding）**。于是"同一本书登记进多个库"不再产生两份数据。
 *
 * `importBook` 是导入**用例**：编排 `IBookIdentityService`（指纹+元数据）与 `ILibraryStore`（持久化）；
 * OCR 提 ISBN 是可插拔步骤（候选 `IOcrService`，v1 未定，见 TODO.md）。
 */
import type { IBookIdentityService } from '@core/ports/identity'
import type { ILibraryStore } from '@core/ports/store'
import type {
  BookFormat,
  BookLocation,
  EditionRecord,
  Holding,
  ReadingState
} from '@core/domain/types'

export interface ImportResult {
  /** 内容身份（全局唯一；指纹命中时是既有那一行） */
  edition: EditionRecord
  /** 本次建立的收录关系 */
  holding: Holding
  /** true = 指纹命中已有内容（未新建 edition）；false = 本次新入库一份新内容 */
  reused: boolean
}

export interface IBookService {
  /**
   * 导入：文件 → 指纹 → 元数据 → **upsert edition** → **加收录**（进 `libraryId` 这个库）。
   * ⚠ **映射库（`mode='mapped'`）不该调这个** —— 映射库的书只能靠扫描真实文件夹进来
   * （DATA_MODEL D5/F4）。这一条由调用方（UI）按库模式把关，用例层不替它判断。
   */
  importBook(
    file: ArrayBuffer,
    name: string,
    format: BookFormat,
    filePath: string,
    libraryId: string,
    origin?: 'scan' | 'import'
  ): Promise<ImportResult>
  /** 全部被收录的内容（"全部书"顶层视角） */
  listAll(): Promise<EditionRecord[]>
  get(id: string): Promise<EditionRecord | null>
  /**
   * 从书库移除（**只删收录**）：真实文件不动、**笔记与阅读状态也不动**
   * （DATA_MODEL §6.1 / CONTRACTS §2.2 不变量 ③）。
   */
  remove(editionId: string, libraryId: string): Promise<void>
  /** 记录阅读位置（同时刷新 `lastReadAt`）；`totalReadMs` 由会话接口累加，这里不动它 */
  updateLastLocation(editionId: string, location: BookLocation): Promise<void>
  /** 最近阅读的内容（无阅读记录 → 回退最近入库）；供"进入阅读器恢复上次内容" */
  getLastRead(): Promise<EditionRecord | null>
  /** 读阅读状态（UI 常用查询的便捷口径：避免 UI 直接碰存储端口） */
  getReadingState(editionId: string): Promise<ReadingState | null>
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
    filePath: string,
    libraryId: string,
    origin: 'scan' | 'import' = 'import'
  ): Promise<ImportResult> {
    const [fingerprint, metadata] = await Promise.all([
      this.identity.computeFingerprint(buffer),
      this.identity.extractMetadata(buffer, format, name)
    ])

    // ① 内容身份：**全局按指纹去重**（v0.4.0 起跨库；此前只扫当前库，同一本书进两个库会各存一份）
    const before = await this.store.findEditionByFingerprint(fingerprint)
    const edition = await this.store.upsertEdition({
      id: before?.id ?? crypto.randomUUID(),
      work: before?.work ?? null,
      fingerprint,
      metadata,
      format,
      filePath,
      createdAt: before?.createdAt ?? Date.now()
    })

    // ② 收录关系：这本书出现在这个库里
    const holding: Holding = {
      libraryId,
      editionId: edition.id,
      containerId: null, // 落在库根层；要入箱由 UI 后续 moveHolding
      origin,
      path: filePath,
      parentPath: parentDir(filePath),
      missing: false,
      sort: 0,
      addedAt: Date.now()
    }
    await this.store.addHolding(holding)

    return { edition, holding, reused: before != null }
  }

  listAll(): Promise<EditionRecord[]> {
    return this.store.listAllHeldEditions()
  }

  get(id: string): Promise<EditionRecord | null> {
    return this.store.getEdition(id)
  }

  async remove(editionId: string, libraryId: string): Promise<void> {
    await this.store.removeHolding(libraryId, editionId)
  }

  async updateLastLocation(editionId: string, location: BookLocation): Promise<void> {
    const prev = await this.store.getReadingState(editionId)
    await this.store.putReadingState({
      editionId,
      lastReadAt: Date.now(),
      lastLocation: location,
      totalReadMs: prev?.totalReadMs ?? 0
    })
  }

  /**
   * 最近阅读的书：优先 `lastReadAt` 最大者；都没有阅读记录时回退最近入库（`createdAt`）。
   * 排序口径收敛在**存储层的一条查询**里（此前在用例层拉全表再排序 —— 全量读没必要）。
   */
  getLastRead(): Promise<EditionRecord | null> {
    return this.store.getLastReadEdition()
  }

  getReadingState(editionId: string): Promise<ReadingState | null> {
    return this.store.getReadingState(editionId)
  }
}

/** 父目录归一（与 `SqliteStore` 的 holdings.parent_path 口径一致：去尾分隔符 + 统一反斜杠） */
function parentDir(filePath: string): string | undefined {
  const idx = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  if (idx <= 0) return undefined
  return filePath.slice(0, idx).replace(/[\\/]+$/, '').replace(/\//g, '\\')
}
