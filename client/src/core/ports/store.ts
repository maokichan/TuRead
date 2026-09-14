/**
 * ILibraryStore —— 本地持久化（端口）。
 * 依据：client/docs/CONTRACTS.md §4.4。
 * 骨架阶段实现：主进程 JSON 文件存储（userData/library.json）——只存文件路径 + 文件信息，够用且诚实；
 * 演进：无缝换成 better-sqlite3（koodo-reader 同款），接口不变。
 */
import type { BookContainer, BookRecord, LibraryEntry, Note } from '@core/domain/types'

export interface LibraryListResult {
  libraries: LibraryEntry[]
  currentId: string
}

/**
 * 笔记的可更新字段（v0.3.9）。
 * 白名单式：`id`/`bookId`/`kind`/`createdAt` **不可改**（身份与种类是既成事实，
 * 改身份等于换一条记录；改 kind 要先删再建）。`anchor` 可改 = 重锚（`remeasure` 的落点）。
 */
export type NotePatch = Partial<Pick<Note, 'anchor' | 'color' | 'body' | 'ink'>>

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
  /**
   * 移动書箱到另一个書箱下（资源管理器"剪切文件夹"语义；parentId=null = 移回根层）。
   * 目标是自己或自己的后代时拒绝——树不许成环。
   */
  moveContainer(id: string, parentId: string | null): Promise<void>

  // ————— 笔记/划线（2026-09-14 落地；DATA_MODEL §2 notes 表 + §3.1/§3.2 建模）—————
  /**
   * 按书取笔记。`chapterIndex` 给值 = 只取该渲染节（高亮回显用）；缺省 = 全书（笔记面板用）。
   * 排序 = 阅读顺序（章 → 章内进度正序），排序依据走锚点 Norm 层 —— 于是**无需 Fragment**
   * 也能给出一致的阅读序（弱锚点笔记不会掉队）。
   */
  listNotes(bookId: string, chapterIndex?: number): Promise<Note[]>
  /**
   * 新增一条笔记。**整条 Note 由调用方给全**（含 `id`/`createdAt`/`updatedAt`）——
   * `id` 是同步主键，须由用例层一次生成、跨端稳定；存储层不代生成（否则"谁定的身份"会含糊）。
   */
  addNote(note: Note): Promise<void>
  /** 局部更新（批注正文/颜色/墨迹/重锚）。`updatedAt` 由本方法统一写入，调用方不必自己维护 */
  updateNote(id: string, patch: NotePatch): Promise<void>
  /** 删除一条笔记（按书删除时由外键级联，不必逐条调本方法） */
  removeNote(id: string): Promise<void>
}
