/**
 * ILibraryStore —— 本地持久化（端口）。
 * 依据：client/docs/CONTRACTS.md §4.4。
 * 骨架阶段实现：主进程 JSON 文件存储（userData/library.json）——只存文件路径 + 文件信息，够用且诚实；
 * 演进：无缝换成 better-sqlite3（koodo-reader 同款），接口不变。
 */
import type { BookContainer, BookRecord, LibraryEntry } from '@core/domain/types'

export interface LibraryListResult {
  libraries: LibraryEntry[]
  currentId: string
}

/** 层级浏览的取书口径（2026-09-13 用户定：书架 = 资源管理器式层级）。
 *  containerId=null（且无 folder）= 根层 = 不属于任何書箱的书；
 *  containerId=某書箱 = 其成员；folder=绝对路径 = 直接位于该文件夹的书（虚拟映射模式）。 */
export interface LibraryLevelQuery {
  containerId?: string | null
  folder?: string
}

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

  // ————— 多书库（2026-09-13 立项；一个条目 = 一份 .db 书库，注册表在主进程引导文件）—————
  /** 库列表 + 当前库 id */
  listLibraries(): Promise<LibraryListResult>
  /** 新建库并**切换**过去（2026-09-13 用户定：建库必须二选一模式——source 必须给 rootPath；
   *  缺省名自动编号）。main 随后广播 library-changed（重载信号以此为准） */
  createLibrary(
    name?: string,
    mode?: 'source' | 'virtual',
    rootPath?: string
  ): Promise<LibraryEntry>
  /** 切换当前库；main 随后广播 library-changed */
  switchLibrary(id: string): Promise<void>
  /** 更名（显示名，文件路径不变；不切库、不广播） */
  renameLibrary(id: string, name: string): Promise<LibraryEntry>

  // ————— 書箱 / 层级浏览（2026-09-13 用户定：书架 = 资源管理器式，書箱 = 文件夹）—————
  /** 当前层级的子書箱（parentId=null = 根层）；虚拟映射模式的"文件夹"不落库、不在此列 */
  listContainers(parentId: string | null): Promise<BookContainer[]>
  /** 新建書箱（virtual；parentId=null = 建在根层） */
  createContainer(params: { parentId: string | null; name: string }): Promise<BookContainer>
  /** 書箱更名 */
  renameContainer(id: string, name: string): Promise<void>
  /** 移除書箱（含其成员关系；**有子書箱时拒绝**——先清空子级，防误删整棵子树） */
  removeContainer(id: string): Promise<void>
  /** 按层级取书（口径见 LibraryLevelQuery） */
  listBooksAtLevel(query: LibraryLevelQuery): Promise<BookRecord[]>
  /**
   * 移动书到書箱（2026-09-13 用户定：资源管理器语义 = **移动**，单亲归属——
   * 清掉旧归属再落到新書箱；containerId=null = 移回根层/移出書箱）。
   */
  moveBookToContainer(bookId: string, containerId: string | null): Promise<void>
}
