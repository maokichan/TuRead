/**
 * ILibraryStore —— 本地持久化（端口）。
 * 依据：client/docs/CONTRACTS.md §4.4（**v0.4.0**）。
 * 实现 = 主进程 `SqliteStore`；**v0.4.0 起全应用一个全局 `.db`**（不再是"一库一 .db"）。
 *
 * ⚠ v0.4.0（2026-09-15「书的身份」定案，DATA_MODEL §4.2/§6）：本端口从"书库条目 CRUD"
 * 改为三层 —— **内容（edition）／收录（holding）／书库（library）**。
 * 书库管理职责从 `main/store/libraryManager.ts` **收敛进来**（库也是库内实体）。
 */
import type {
  BookContainer,
  BookFingerprint,
  BookFormat,
  EditionRecord,
  Holding,
  LibraryEntry,
  LibraryItem,
  Note,
  NoteColor,
  ReadingSession,
  ReadingState,
  WorkIdentity
} from '@core/domain/types'

export interface LibraryListResult {
  libraries: LibraryEntry[]
  currentId: string
}

/**
 * 笔记的可更新字段。白名单式：`id`/`editionId`/`kind`/`createdAt` **不可改**
 * （身份与种类是既成事实；改身份等于换一条记录）。`anchor` 可改 = 重锚（`remeasure` 的落点）。
 */
export type NotePatch = Partial<Pick<Note, 'anchor' | 'color' | 'body' | 'ink'>>

/**
 * 层级浏览的取入口径（v0.4.0：**必须带库** —— 收录关系是库内的）。
 * `containerId` 与 `folder` 互斥：自建库用前者，映射库用后者。
 */
export interface LibraryLevelQuery {
  libraryId: string
  /** 自建库：书箱 id；`null` = 库根层（未入箱）。 */
  containerId?: string | null
  /** 映射库：绝对路径 = 直接位于该文件夹的收录（按 `parent_path` 做 **SQL 侧过滤**）。 */
  folder?: string
  /**
   * 是否包含"来源缺失"的收录。**缺省 false = 不显示**（映射库的可见性语义：书不在真实路径上
   * 就看不见它；收录与笔记/阅读状态仍留着，文件回来后自动重现）。
   * `true` 是给将来的"可见/标记/清理"界面留的开关（DATA_MODEL §6.4 F3，未定）。
   */
  includeMissing?: boolean
}

/**
 * 笔记管理的查询口径（**v0.4.2**；形态 = `FEATURES.md` §12，视觉 = `STYLE.md` §5.10）。
 * 读模型性质的类型，故与 `LibraryLevelQuery` 同处端口层（不塞进领域层 —— 里面的
 * `editionTitle` 是**展示投影**，不是领域概念）。
 */
export interface NoteQuery {
  /** 库作用域：缺省 / null = **全部库**；给值 = 该库**收录**范围内的 edition（UI 默认传当前库）。
   *  实现 = `holdings` 的 EXISTS 子查询（笔记挂 edition、**不挂库** —— 所以这是**查询口径**）。 */
  libraryId?: string | null
  editionId?: string | null
  color?: NoteColor | null
  /**
   * 有无批注正文（`body` 非空）：`true` = 只看批注 / `false` = 只看划线 / 缺省 = 不限。
   * ⚠ **这是「划线 / 批注」的判据，不是 `kind`** —— 二者在实现里可互相矛盾
   * （`highlight` 可能带 body、`note` 可能 body 为空），详见 `domain/types.ts` 的 `NoteFilter` 注释。
   */
  hasBody?: boolean | null
  /**
   * 关键词：对 `excerpt`（摘录）+ `body`（批注）做**子串**匹配。
   * v1 = `LIKE '%q%'`（2000 条中文笔记实测 0.32 ms）；**将来换 FTS5 时签名与语义都不变**
   * （换装条件与两个静默坑见 `DATA_MODEL.md` §5 问题 6）。
   */
  text?: string | null
  /** 排序：`updated`（默认，最近改动在前）/ `created` / `edition`（书内阅读序） */
  orderBy?: 'updated' | 'created' | 'edition'
  /** 分页（近千条列表的窗口化取数）；缺省 = 全量 */
  limit?: number
  offset?: number
}

/** 跨书列表项 = 笔记本体 + **展示投影**（列表要显示书名，而笔记自己不存书名）。
 *  ⚠ 不含章标题：v1 只显示「書名 · 節 N」（章标题冗余存列**已定不做**，见 `DATA_MODEL.md` §5 问题 6）。 */
export interface NoteListItem {
  note: Note
  editionTitle: string
  editionFormat: BookFormat
  /** 该 edition 被哪些库收录（全局视角下标注来源；按库 sort 排序） */
  libraryNames: string[]
}

export interface ILibraryStore {
  // ————— 内容身份（edition；**全局唯一键 = 指纹**，跨库共享的根）—————

  /**
   * 按指纹 upsert：已存在则返回既有行（`filePath` 变化时更新），否则新建。
   * **导入去重的唯一入口** —— 取代原先"只扫当前库"的 `listBooks().find(verify)`。
   */
  upsertEdition(record: EditionRecord): Promise<EditionRecord>
  getEdition(id: string): Promise<EditionRecord | null>
  /** 全局按指纹查 —— "这本书别处也有吗"的判定入口 */
  findEditionByFingerprint(fp: BookFingerprint): Promise<EditionRecord | null>
  updateEdition(id: string, patch: Partial<EditionRecord>): Promise<void>
  /**
   * **彻底删除内容**（连带 `notes` / `reading_state` / `reading_sessions`）。
   * ⚠ 只在**显式维护动作**「清理未收录内容」时调用；"移除书"走 `removeHolding`，**不是**这个。
   */
  removeEdition(id: string): Promise<void>

  // ————— 收录（holding）："哪个书库里有这本书" —————
  /** 新增/更新一条收录（同一 `(libraryId, editionId)` 至多一行） */
  addHolding(holding: Holding): Promise<void>
  /**
   * 取消收录。⚠ **不得级联删除 edition / notes / reading_state**（CONTRACTS §2.2 不变量 ③）——
   * 笔记与阅读时长是用户资产，"移除"只是让它在这个书库里不可见。
   */
  removeHolding(libraryId: string, editionId: string): Promise<void>
  /** 层级取书（读模型）。映射库走 `parent_path` 的 SQL 侧过滤（不再全量拉回 JS 过滤） */
  listItemsAtLevel(query: LibraryLevelQuery): Promise<LibraryItem[]>
  /** 移动收录到书箱（资源管理器语义 = 移动，单亲归属；`containerId=null` = 移回库根层） */
  moveHolding(editionId: string, libraryId: string, containerId: string | null): Promise<void>
  /** 取某 edition 在某库的收录；`null` = 该库没有收录它 */
  getHolding(libraryId: string, editionId: string): Promise<Holding | null>
  /**
   * 某库的**全部**收录（跨层级，含 `missing`）—— **扫描对账**要用它算差集
   * （"旧收录里有哪些路径已经不在磁盘上了"）。`listItemsAtLevel` 只给一层，不够用。
   */
  listHoldings(libraryId: string): Promise<Holding[]>
  /** 标记「来源缺失」（映射库扫描对账的产物；**只影响可见性**） */
  setHoldingMissing(libraryId: string, editionId: string, missing: boolean): Promise<void>
  /** 全部被收录的 edition（去重）——"全部书"顶层视角的读模型 */
  listAllHeldEditions(): Promise<EditionRecord[]>

  // ————— 书库（组织模式；**不是物理分区**）—————
  /** 库列表 + 当前库 id */
  listLibraries(): Promise<LibraryListResult>
  /** 新建库并**切换**过去（用户 2026-09-13 定：建库必须二选一模式；`mapped` 必须给 `rootPath`） */
  createLibrary(input: {
    name?: string
    mode: 'mapped' | 'curated'
    rootPath?: string
  }): Promise<LibraryEntry>
  /** 切换当前库；main 随后广播 `store:library-changed` */
  switchLibrary(id: string): Promise<void>
  /** 更名（显示名；不切库、不广播） */
  renameLibrary(id: string, name: string): Promise<LibraryEntry>
  /**
   * 移除书库（**移除引用**）：连带其 `containers` 与 `holdings`；
   * ⚠ **edition / notes / reading_state 不删**（内容与笔记是跨库资产）。最后一个库不可移除。
   */
  removeLibrary(id: string): Promise<void>
  getLibrary(id: string): Promise<LibraryEntry | null>

  // ————— 书箱（树在库内，v0.4.0 增 libraryId）—————
  /** 某库某层的子书箱（`parentId=null` = 库根层）；映射库的"文件夹"不落库、不在此列 */
  listContainers(libraryId: string, parentId: string | null): Promise<BookContainer[]>
  createContainer(params: {
    libraryId: string
    parentId: string | null
    name: string
  }): Promise<BookContainer>
  renameContainer(id: string, name: string): Promise<void>
  /** 移除书箱（**有子书箱时拒绝** —— 先清空子级，防误删整棵子树） */
  removeContainer(id: string): Promise<void>
  /** 移动书箱（`parentId=null` = 移回库根层）；目标是自己或自己的后代时拒绝（防成环） */
  moveContainer(id: string, parentId: string | null): Promise<void>

  // ————— 阅读状态 / 阅读时间（③ 的落点）—————
  getReadingState(editionId: string): Promise<ReadingState | null>
  putReadingState(state: ReadingState): Promise<void>
  appendReadingSession(session: Omit<ReadingSession, 'id'>): Promise<void>
  /**
   * 按 work 汇总阅读时长（**逐 edition 记录、按 work 汇总是查询口径**，DATA_MODEL §6.1）——
   * "我在这本书上花了多少时间"。无 work 时退化为单 edition。
   */
  totalReadMsByWork(work: WorkIdentity): Promise<number>
  /** 最近阅读的 edition（无阅读记录 → 回退最近入库）—— "进入阅读器恢复上次内容" */
  getLastReadEdition(): Promise<EditionRecord | null>

  // ————— 封面（**edition 级**：封面由内容决定）—————
  /** 封面缩略图落盘；返回写入的相对文件名（存入 `EditionRecord.coverPath`）。字节不进库 */
  setCover(editionId: string, bytes: ArrayBuffer, ext: string): Promise<string>
  /** 读封面缩略图字节；无封面 → null */
  getCover(editionId: string): Promise<ArrayBuffer | null>
  /** 删除封面文件（文件不存在不报错） */
  removeCover(editionId: string): Promise<void>

  // ————— 设置（**一律全局**，D9/F7：没有库级设置）—————
  getSetting<T>(key: string, fallback: T): Promise<T>
  setSetting(key: string, value: unknown): Promise<void>
  /** 局部更新一个设置对象（主进程内**原子合并**，避免两个 Feature "读-改-写"互相覆盖） */
  patchSetting(key: string, patch: Record<string, unknown>): Promise<void>

  // ————— 笔记 / 划线（**挂 edition**：跨库共享、不随条目消失）—————
  /**
   * 按内容取笔记。`chapterIndex` 给值 = 只取该渲染节（高亮回显用）；缺省 = 全书（笔记面板用）。
   * 排序 = 阅读顺序（章 → 章内进度正序），依据走锚点 Norm 层（弱锚点笔记不会掉队）。
   */
  listNotes(editionId: string, chapterIndex?: number): Promise<Note[]>
  /**
   * 新增一条笔记。**整条 Note 由调用方给全**（含 `id`/`createdAt`/`updatedAt`）——
   * `id` 是同步主键，须由用例层一次生成、跨端稳定；存储层不代生成。
   */
  addNote(note: Note): Promise<void>
  /** 局部更新（批注正文/颜色/墨迹/重锚）。`updatedAt` 由本方法统一写入 */
  updateNote(id: string, patch: NotePatch): Promise<void>
  /** 删除一条笔记（按 edition 删除内容时由外键级联，不必逐条调本方法） */
  removeNote(id: string): Promise<void>

  // ————— 笔记读模型（**跨书管理**，v0.4.2；笔记管理工具的数据口）—————
  /**
   * 跨书列笔记：库作用域 / 按书 / 按色 / 有无批注 / 关键词子串。
   * 排序默认 `updated` 倒序；`limit`/`offset` 供近千条列表分页取数。
   */
  listAllNotes(query?: NoteQuery): Promise<NoteListItem[]>
  /** 与 `listAllNotes` **同口径**的计数（筛选器要显示"多少条"，不必取回全量再数） */
  countAllNotes(query?: NoteQuery): Promise<number>
}
