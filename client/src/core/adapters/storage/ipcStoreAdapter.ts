/**
 * ILibraryStore 适配器（渲染进程侧）—— IPC 桥，转发到主进程的 `SqliteStore`。
 *
 * ⚠ v0.4.0（2026-09-15「书的身份」）：主进程只有**一个全局 .db**，所以本桥**不再有"当前库"概念**——
 * 库是库内实体，凡涉及收录/书箱的调用都**显式带 `libraryId`**。切库以 main 广播的
 * `store:library-changed` 为准（渲染层据此重载各自状态）。
 */
import type {
  ILibraryStore,
  LibraryListResult,
  LibraryLevelQuery,
  NoteListItem,
  NotePatch,
  NoteQuery
} from '@core/ports/store'
import type {
  BookContainer,
  BookFingerprint,
  EditionRecord,
  Holding,
  LibraryEntry,
  LibraryItem,
  Note,
  ReadingSession,
  ReadingState,
  WorkIdentity
} from '@core/domain/types'
import { IPC, type TureadBridge } from '@shared/ipc'

export class IpcStoreAdapter implements ILibraryStore {
  constructor(private bridge: TureadBridge) {}

  // ————— 内容身份（edition）—————

  async upsertEdition(record: EditionRecord): Promise<EditionRecord> {
    return (await this.bridge.invoke(IPC.storeUpsertEdition, record)) as EditionRecord
  }

  async getEdition(id: string): Promise<EditionRecord | null> {
    return (await this.bridge.invoke(IPC.storeGetEdition, id)) as EditionRecord | null
  }

  async findEditionByFingerprint(fp: BookFingerprint): Promise<EditionRecord | null> {
    return (await this.bridge.invoke(
      IPC.storeFindEditionByFingerprint,
      fp
    )) as EditionRecord | null
  }

  async updateEdition(id: string, patch: Partial<EditionRecord>): Promise<void> {
    await this.bridge.invoke(IPC.storeUpdateEdition, { id, patch })
  }

  async removeEdition(id: string): Promise<void> {
    await this.bridge.invoke(IPC.storeRemoveEdition, id)
  }

  // ————— 收录（holding）—————

  async addHolding(holding: Holding): Promise<void> {
    await this.bridge.invoke(IPC.storeAddHolding, holding)
  }

  async removeHolding(libraryId: string, editionId: string): Promise<void> {
    await this.bridge.invoke(IPC.storeRemoveHolding, { libraryId, editionId })
  }

  async getHolding(libraryId: string, editionId: string): Promise<Holding | null> {
    return (await this.bridge.invoke(IPC.storeGetHolding, {
      libraryId,
      editionId
    })) as Holding | null
  }

  async listHoldings(libraryId: string): Promise<Holding[]> {
    return (await this.bridge.invoke(IPC.storeListHoldings, libraryId)) as Holding[]
  }

  async setHoldingMissing(libraryId: string, editionId: string, missing: boolean): Promise<void> {
    await this.bridge.invoke(IPC.storeSetHoldingMissing, { libraryId, editionId, missing })
  }

  async listItemsAtLevel(query: LibraryLevelQuery): Promise<LibraryItem[]> {
    return (await this.bridge.invoke(IPC.storeListItemsAtLevel, query)) as LibraryItem[]
  }

  async listAllHeldEditions(): Promise<EditionRecord[]> {
    return (await this.bridge.invoke(IPC.storeListAllHeldEditions)) as EditionRecord[]
  }

  async moveHolding(
    editionId: string,
    libraryId: string,
    containerId: string | null
  ): Promise<void> {
    await this.bridge.invoke(IPC.storeMoveHolding, { editionId, libraryId, containerId })
  }

  // ————— 设置（全局）—————

  async getSetting<T>(key: string, fallback: T): Promise<T> {
    return (await this.bridge.invoke(IPC.storeGetSetting, { key, fallback })) as T
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    await this.bridge.invoke(IPC.storeSetSetting, { key, value })
  }

  async patchSetting(key: string, patch: Record<string, unknown>): Promise<void> {
    await this.bridge.invoke(IPC.storePatchSetting, { key, patch })
  }

  // ————— 封面（edition 级）—————

  async setCover(editionId: string, bytes: ArrayBuffer, ext: string): Promise<string> {
    return (await this.bridge.invoke(IPC.storeSetCover, { editionId, bytes, ext })) as string
  }

  async getCover(editionId: string): Promise<ArrayBuffer | null> {
    return (await this.bridge.invoke(IPC.storeGetCover, editionId)) as ArrayBuffer | null
  }

  async removeCover(editionId: string): Promise<void> {
    await this.bridge.invoke(IPC.storeRemoveCover, editionId)
  }

  // ————— 阅读状态 / 阅读时间 ——————

  async getReadingState(editionId: string): Promise<ReadingState | null> {
    return (await this.bridge.invoke(IPC.storeGetReadingState, editionId)) as ReadingState | null
  }

  async putReadingState(state: ReadingState): Promise<void> {
    await this.bridge.invoke(IPC.storePutReadingState, state)
  }

  async appendReadingSession(session: Omit<ReadingSession, 'id'>): Promise<void> {
    await this.bridge.invoke(IPC.storeAppendReadingSession, session)
  }

  async totalReadMsByWork(work: WorkIdentity): Promise<number> {
    return (await this.bridge.invoke(IPC.storeTotalReadMsByWork, work)) as number
  }

  async getLastReadEdition(): Promise<EditionRecord | null> {
    return (await this.bridge.invoke(IPC.storeGetLastReadEdition)) as EditionRecord | null
  }

  // ————— 书库（组织模式）—————

  async listLibraries(): Promise<LibraryListResult> {
    return (await this.bridge.invoke(IPC.storeListLibraries)) as LibraryListResult
  }

  async createLibrary(input: {
    name?: string
    mode: 'mapped' | 'curated'
    rootPath?: string
  }): Promise<LibraryEntry> {
    return (await this.bridge.invoke(IPC.storeCreateLibrary, input)) as LibraryEntry
  }

  async switchLibrary(id: string): Promise<void> {
    await this.bridge.invoke(IPC.storeSwitchLibrary, id)
  }

  async renameLibrary(id: string, name: string): Promise<LibraryEntry> {
    return (await this.bridge.invoke(IPC.storeRenameLibrary, { id, name })) as LibraryEntry
  }

  async removeLibrary(id: string): Promise<void> {
    await this.bridge.invoke(IPC.storeRemoveLibrary, id)
  }

  async getLibrary(id: string): Promise<LibraryEntry | null> {
    return (await this.bridge.invoke(IPC.storeGetLibrary, id)) as LibraryEntry | null
  }

  // ————— 书箱（树在库内）—————

  async listContainers(libraryId: string, parentId: string | null): Promise<BookContainer[]> {
    return (await this.bridge.invoke(IPC.storeListContainers, {
      libraryId,
      parentId
    })) as BookContainer[]
  }

  async createContainer(params: {
    libraryId: string
    parentId: string | null
    name: string
  }): Promise<BookContainer> {
    return (await this.bridge.invoke(IPC.storeCreateContainer, params)) as BookContainer
  }

  async renameContainer(id: string, name: string): Promise<void> {
    await this.bridge.invoke(IPC.storeRenameContainer, { id, name })
  }

  async removeContainer(id: string): Promise<void> {
    await this.bridge.invoke(IPC.storeRemoveContainer, id)
  }

  async moveContainer(id: string, parentId: string | null): Promise<void> {
    await this.bridge.invoke(IPC.storeMoveContainer, { id, parentId })
  }

  // ————— 笔记 / 划线（挂 edition）—————

  async listNotes(editionId: string, chapterIndex?: number): Promise<Note[]> {
    return (await this.bridge.invoke(IPC.storeListNotes, {
      editionId,
      chapterIndex
    })) as Note[]
  }

  async addNote(note: Note): Promise<void> {
    await this.bridge.invoke(IPC.storeAddNote, note)
  }

  async updateNote(id: string, patch: NotePatch): Promise<void> {
    await this.bridge.invoke(IPC.storeUpdateNote, { id, patch })
  }

  async removeNote(id: string): Promise<void> {
    await this.bridge.invoke(IPC.storeRemoveNote, id)
  }

  // ————— 笔记读模型（跨书管理，v0.4.2）—————

  async listAllNotes(query?: NoteQuery): Promise<NoteListItem[]> {
    return (await this.bridge.invoke(IPC.storeListAllNotes, query ?? {})) as NoteListItem[]
  }

  async countAllNotes(query?: NoteQuery): Promise<number> {
    return (await this.bridge.invoke(IPC.storeCountAllNotes, query ?? {})) as number
  }
}
