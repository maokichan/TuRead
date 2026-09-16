/**
 * ILibraryStore 适配器（主进程侧，真实实现）—— better-sqlite3 **全局单库** + 封面目录。
 *
 * 数据建模依据：`client/docs/DATA_MODEL.md` **§1/§2 v3（2026-09-15 批复，「书的身份」定案）**。
 *
 * ⚠ **相对 v2 的根本变化**：v2 是"一个 .db = 一份书库"；v3 是
 * **全应用一个 .db = 一份用户数据**（书库降为**组织模式**，成员关系 = **收录 holdings**）。
 * 身份三层：`works`（作品，只留接口）→ `editions`（内容，全局唯一键 = 指纹）→ `holdings`（收录）。
 * 笔记与阅读状态**挂 edition**（跨库共享、不随"移除收录"消失）。
 *
 * 文件布局（userData/）：
 *   turead.db            一切数据（schema 见 DATA_MODEL §2 v3；WAL 模式）
 *   turead.db-wal/-shm   WAL 副产物（正常存在）
 *   covers/<editionId>.<ext>  封面缩略图（字节不进库；封面是 **edition 级**）
 *   config.json          引导文件（**极小**）：{ version, dbPath, 窗口状态 }
 *   *.migrated           旧版留档（原文件改名，不删除 —— 用户可回退旧版客户端）
 *
 * better-sqlite3 是原生模块：**动态 import**，ABI 不匹配时在 init 处给出可行动的错误。
 * 换 Electron 版本后须重跑 `npm run rebuild:sqlite`（DATA_MODEL §5 开放问题 1）。
 */
import { promises as fs } from 'node:fs'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  BookContainer,
  BookFingerprint,
  BookLocation,
  EditionRecord,
  Holding,
  LibraryEntry,
  LibraryItem,
  Note,
  ReadingSession,
  ReadingState,
  WorkIdentity
} from '@core/domain/types'
import type {
  LibraryLevelQuery,
  LibraryListResult,
  NoteListItem,
  NotePatch,
  NoteQuery
} from '@core/ports/store'
import { normalizeLocation } from '@core/domain/location'
import { anchorToColumns, columnsToAnchor } from '@core/domain/anchor'
import { runMigrations } from './migrate'

export interface SqliteStoreOptions {
  /** **全局**库文件绝对路径（`<userData>/turead.db`） */
  dbPath: string
  /** **全局**封面目录（`<userData>/covers`） */
  coversDir: string
  /** 旧版引导文件（`config.json`）——迁移器读它才知道有哪些旧 .db 要合并 */
  bootstrapPath?: string
  /** 更早的 JSON 书库（`library.json`）——v1 时代留档 */
  legacyLibraryPath?: string
  /** 更早的设置文件（`config.json` 的旧形状）——v1 时代留档 */
  legacyConfigPath?: string
}

/** 当前库 id 存在**全局设置**里（D9：设置一律全局；"当前库"不再放引导文件） */
const SETTING_CURRENT_LIBRARY = 'currentLibraryId'

/** DATA_MODEL §2 v3 建表语句（IF NOT EXISTS：老库升级安全） */
const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- 身份 L1：作品（Work）——"这是哪本书"。只留接口，不做完整标准化（D11/F9）
CREATE TABLE IF NOT EXISTS works (
    id TEXT PRIMARY KEY,
    protocol TEXT NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    UNIQUE (protocol, code)
);

-- 身份 L2：电子版（Edition）——"这是哪个电子文件"。全局唯一键 = 指纹
CREATE TABLE IF NOT EXISTS editions (
    id TEXT PRIMARY KEY,
    work_id TEXT REFERENCES works(id) ON DELETE SET NULL,
    fp_algo TEXT NOT NULL, fp_hash TEXT NOT NULL, fp_size INTEGER NOT NULL,
    format TEXT NOT NULL,
    title TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    file_path TEXT NOT NULL,
    cover_path TEXT, cover_failed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    UNIQUE (fp_algo, fp_hash, fp_size)
);

-- 组织：书库（Library）——组织模式，非物理分区（D2）
CREATE TABLE IF NOT EXISTS libraries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mode TEXT NOT NULL,
    root_path TEXT,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

-- 组织：书箱（Container）——树在库内（v3 新增 library_id）
CREATE TABLE IF NOT EXISTS containers (
    id TEXT PRIMARY KEY,
    library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES containers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    collapsed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_containers_library ON containers(library_id, parent_id);

-- 收录（Holding）——"哪个书库里有这本书"
CREATE TABLE IF NOT EXISTS holdings (
    library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
    container_id TEXT REFERENCES containers(id) ON DELETE SET NULL,
    origin TEXT NOT NULL,
    path TEXT,
    parent_path TEXT,
    missing INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (library_id, edition_id)
);
CREATE INDEX IF NOT EXISTS idx_holdings_level ON holdings(library_id, parent_path);
CREATE INDEX IF NOT EXISTS idx_holdings_edition ON holdings(edition_id);

-- 笔记（物理挂 edition；跨库共享、不随条目消失）
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
    owner TEXT,
    kind TEXT NOT NULL,
    chapter_index INTEGER NOT NULL,
    anchor_key TEXT NOT NULL,
    anchor_hint TEXT NOT NULL DEFAULT '',
    color TEXT,
    excerpt TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    ink TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_edition ON notes(edition_id, chapter_index);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);
CREATE INDEX IF NOT EXISTS idx_notes_owner ON notes(owner);

-- 阅读状态（逐 edition）
CREATE TABLE IF NOT EXISTS reading_state (
    edition_id TEXT PRIMARY KEY REFERENCES editions(id) ON DELETE CASCADE,
    last_read_at INTEGER,
    last_location TEXT,
    total_read_ms INTEGER NOT NULL DEFAULT 0
);

-- 阅读会话（③ 阅读时间模型的落点）
CREATE TABLE IF NOT EXISTS reading_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
    owner TEXT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_edition ON reading_sessions(edition_id, started_at);

-- 自建目录存储位（目录是 edition 级数据，先留位不实现）
CREATE TABLE IF NOT EXISTS edition_toc (
    edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
    origin TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (edition_id, origin)
);

-- 全局设置（D9：没有库级设置）
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`

export class SqliteStore {
  private opts: SqliteStoreOptions
  // better-sqlite3 动态加载（原生模块，ABI 出错要在可行动的位置失败）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any = null
  private initPromise: Promise<void> | null = null

  constructor(opts: SqliteStoreOptions) {
    this.opts = opts
  }

  async init(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.open()
    await this.initPromise
  }

  private async open(): Promise<void> {
    const mod = await import('better-sqlite3')
    const Database = (mod as unknown as { default: typeof import('better-sqlite3') }).default
    let db: import('better-sqlite3').Database
    try {
      await fs.mkdir(dirname(this.opts.dbPath), { recursive: true })
      db = new Database(this.opts.dbPath)
    } catch (err) {
      throw new Error(
        `SQLite 库打开失败（${this.opts.dbPath}）：${(err as Error).message}。` +
          `若是原生模块 ABI 不匹配，请在 client/ 下执行 npm run rebuild:sqlite`
      )
    }
    // ⚠ **形状守卫（2026-09-15 用户实测事故后补）**：`CREATE TABLE IF NOT EXISTS` 对**已存在但形状
    // 不同**的表是**静默跳过**的 —— 于是后面针对新列的索引会以 `no such column: xxx` 炸掉，
    // 报错点离真因很远（用户实测：全局库误用旧 `turead.db` → `no such column: library_id`）。
    // 这里先判"这文件是不是旧版书库"，把密码般的 SQL 错误换成一句能直接照做的话。
    if (existsSync(this.opts.dbPath) && looksLikeLegacyStore(db)) {
      db.close()
      throw new Error(
        `全局库路径上是一个**旧版书库文件**（旧 schema：books/containers/notes），不能当作全局库打开：\n` +
          `  ${this.opts.dbPath}\n` +
          `旧版"一库一 .db"的文件应当交给迁移器**只读合并**，而不是直接在这里建表。\n` +
          `请确认 LibraryManager 给出的全局库路径不是旧默认库的 turead.db（全局库文件名 = store.db）。`
      )
    }
    db.exec(SCHEMA_SQL)
    this.db = db
    await runMigrations({
      db: this.db,
      coversDir: this.opts.coversDir,
      bootstrapPath: this.opts.bootstrapPath,
      legacyLibraryPath: this.opts.legacyLibraryPath,
      legacyConfigPath: this.opts.legacyConfigPath
    })
    await this.ensureDefaultLibrary()
  }

  /** 应用退出时关闭句柄（WAL checkpoint 随之落盘）。close 后允许 init() 重开 */
  close(): void {
    this.db?.close()
    this.db = null
    this.initPromise = null
  }

  /**
   * 迁移状态（`meta.migrated_v3`）：`'fresh' | 'from-v2' | 'from-json' | 'failed' | null`。
   * 引导文件只在**非 failed** 时才允许被覆盖写（否则 v1 的 `libraries[]` 一丢，重试就找不到旧 .db）。
   */
  migrationState(): string | null {
    if (!this.db) return null
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get('migrated_v3') as
      | { value: string }
      | undefined
    return row?.value ?? null
  }

  /** 全局库文件路径（只用于"在文件管理器中揭示"，不接受调用方给路径 —— 防任意路径 IPC） */
  describeDbPath(): string {
    return this.opts.dbPath
  }

  // ————— 内容身份（edition）—————

  async upsertEdition(record: EditionRecord): Promise<EditionRecord> {
    const existing = await this.findEditionByFingerprint(record.fingerprint)
    if (existing) {
      // 内容身份不变（指纹相同）；只有"这份文件在哪 / 元数据"可能变
      const patch: Partial<EditionRecord> = {}
      if (record.filePath && record.filePath !== existing.filePath) patch.filePath = record.filePath
      if (record.metadata?.title && record.metadata.title !== existing.metadata.title) {
        patch.metadata = record.metadata
      }
      if (record.work && !existing.work) patch.work = record.work
      if (Object.keys(patch).length > 0) {
        await this.updateEdition(existing.id, patch)
        return { ...existing, ...patch }
      }
      return existing
    }
    const workId = this.ensureWorkId(record.work ?? null)
    // `INSERT OR IGNORE` 而非裸 INSERT：指纹是**全局唯一键**，并发/重入（如导入与扫描交错）
    // 时裸 INSERT 会抛唯一约束错误，在上层表现为一条莫名其妙的"导入失败"。
    this.db
      .prepare(
        `INSERT OR IGNORE INTO editions
           (id, work_id, fp_algo, fp_hash, fp_size, format, title, metadata, file_path,
            cover_path, cover_failed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        workId,
        record.fingerprint.algorithm,
        record.fingerprint.hash,
        record.fingerprint.size,
        record.format,
        record.metadata?.title ?? '',
        JSON.stringify(record.metadata ?? { title: '' }),
        record.filePath,
        record.coverPath ?? null,
        record.coverFailed ? 1 : 0,
        record.createdAt
      )
    // 回读权威行：正常路径读回刚插入的那行；我 ignore 掉的那次则读回**先到的那行**
    // （唯一键保证了"同一指纹只有一行"，所以两种情形都返回正确结果）
    const stored = await this.findEditionByFingerprint(record.fingerprint)
    return stored ?? { ...record, work: record.work ?? null }
  }

  async getEdition(id: string): Promise<EditionRecord | null> {
    const row = this.db.prepare('SELECT * FROM editions WHERE id = ?').get(id)
    return row ? this.fromEditionRow(row) : null
  }

  async findEditionByFingerprint(fp: BookFingerprint): Promise<EditionRecord | null> {
    const row = this.db
      .prepare('SELECT * FROM editions WHERE fp_algo = ? AND fp_hash = ? AND fp_size = ?')
      .get(fp.algorithm, fp.hash, fp.size)
    return row ? this.fromEditionRow(row) : null
  }

  async updateEdition(id: string, patch: Partial<EditionRecord>): Promise<void> {
    const sets: string[] = []
    const args: unknown[] = []
    if (patch.filePath !== undefined) {
      sets.push('file_path = ?')
      args.push(patch.filePath)
    }
    if (patch.coverPath !== undefined) {
      sets.push('cover_path = ?')
      args.push(patch.coverPath ?? null)
    }
    if (patch.coverFailed !== undefined) {
      sets.push('cover_failed = ?')
      args.push(patch.coverFailed ? 1 : 0)
    }
    if (patch.metadata !== undefined) {
      sets.push('metadata = ?', 'title = ?')
      args.push(JSON.stringify(patch.metadata), patch.metadata?.title ?? '')
    }
    if (patch.work !== undefined) {
      // work 变更 = 标准化补录（T3 状态转移）。⚠ 只改这一列，**笔记零重写**（DATA_MODEL §6.1）
      sets.push('work_id = ?')
      args.push(this.ensureWorkId(patch.work ?? null))
    }
    if (sets.length === 0) return
    args.push(id)
    this.db.prepare(`UPDATE editions SET ${sets.join(', ')} WHERE id = ?`).run(...args)
  }

  /** 彻底删除内容（连带 notes/reading_state/sessions/holdings）——只在显式维护动作里用 */
  async removeEdition(id: string): Promise<void> {
    const record = await this.getEdition(id)
    this.db.prepare('DELETE FROM editions WHERE id = ?').run(id)
    if (record?.coverPath) {
      await fs.rm(join(this.opts.coversDir, record.coverPath), { force: true })
    }
  }

  // ————— 收录（holding）—————

  /**
   * 新增/更新一条收录。
   *
   * ⚠ **`container_id` 用 `COALESCE` 而不是直接覆盖**（2026-09-15 自查发现）：
   * 扫描（`ScanService`）与导入都会用 `containerId = null` 调本方法（"落在库根层"），
   * 而 null 的真实语义是"**未指定归属**"，不是"移到根层"。若直接 `= excluded.container_id`，
   * 用户把书拖进書箱之后**再扫一次就会被悄悄搬回根层** —— 用户的组织成了扫描的牺牲品。
   * 要真的把书移回根层，走**显式**的 `moveHolding(..., null)`（唯一的"移动"入口）。
   */
  async addHolding(holding: Holding): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO holdings
           (library_id, edition_id, container_id, origin, path, parent_path, missing, sort, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(library_id, edition_id) DO UPDATE SET
           container_id = COALESCE(excluded.container_id, holdings.container_id),
           path = excluded.path,
           parent_path = excluded.parent_path,
           missing = excluded.missing`
      )
      .run(
        holding.libraryId,
        holding.editionId,
        holding.containerId,
        holding.origin,
        holding.path ?? null,
        normalizeDir(holding.parentPath ?? (holding.path ? dirname(holding.path) : null)),
        holding.missing ? 1 : 0,
        holding.sort,
        holding.addedAt
      )
  }

  /**
   * 取消收录。**只删 holdings 行** —— edition / notes / reading_state **一律不动**
   * （CONTRACTS §2.2 不变量 ③：笔记与阅读时长是用户资产，"移除"只是让它在这个书库不可见）。
   */
  async removeHolding(libraryId: string, editionId: string): Promise<void> {
    this.db
      .prepare('DELETE FROM holdings WHERE library_id = ? AND edition_id = ?')
      .run(libraryId, editionId)
  }

  async getHolding(libraryId: string, editionId: string): Promise<Holding | null> {
    const row = this.db
      .prepare('SELECT * FROM holdings WHERE library_id = ? AND edition_id = ?')
      .get(libraryId, editionId)
    return row ? fromHoldingRow(row) : null
  }

  /** 某库的全部收录（跨层级，含 missing）—— 扫描对账算差集用 */
  async listHoldings(libraryId: string): Promise<Holding[]> {
    const rows = this.db
      .prepare('SELECT * FROM holdings WHERE library_id = ? ORDER BY parent_path, sort')
      .all(libraryId)
    return rows.map(fromHoldingRow)
  }

  async setHoldingMissing(libraryId: string, editionId: string, missing: boolean): Promise<void> {
    this.db
      .prepare('UPDATE holdings SET missing = ? WHERE library_id = ? AND edition_id = ?')
      .run(missing ? 1 : 0, libraryId, editionId)
  }

  /**
   * 层级取书（读模型）。
   * ⚠ **v3 修掉了 v2 的规模问题**：映射库不再 `SELECT * FROM books` 全量拉回再 JS 过滤，
   * 而是按 `holdings.parent_path` 做 **SQL 侧过滤**（父目录在写入时规范化并存好）。
   */
  async listItemsAtLevel(query: LibraryLevelQuery): Promise<LibraryItem[]> {
    /**
     * ⚠ **缺省不含"来源缺失"的收录**（2026-09-15 定）：用户对映射库的模型是
     * "**书不在真实路径上，从这个视角就看不到它**"（DATA_MODEL §6.1 / D5）——
     * 而收录与笔记/阅读状态**都留着**，文件回来时 `ScanService` 清掉 `missing`，书自动重现。
     * `includeMissing: true` 是给将来的"可见/标记/清理"界面留的开关（F3，见 §6.4）。
     */
    const includeMissing = query.includeMissing === true
    const missClause = includeMissing ? '' : ' AND h.missing = 0'
    const cols = `${EDITION_COLS}, h.library_id AS h_library_id, h.container_id AS h_container_id,
      h.origin AS h_origin, h.path AS h_path, h.parent_path AS h_parent_path,
      h.missing AS h_missing, h.sort AS h_sort, h.added_at AS h_added_at,
      rs.last_read_at AS rs_last_read_at, rs.last_location AS rs_last_location,
      rs.total_read_ms AS rs_total_read_ms`
    const from = 'FROM holdings h JOIN editions e ON e.id = h.edition_id LEFT JOIN reading_state rs ON rs.edition_id = e.id'
    let rows: Record<string, unknown>[]
    if (query.folder != null) {
      // 映射库：直接位于该文件夹的收录
      rows = this.db
        .prepare(
          `SELECT ${cols} ${from}
           WHERE h.library_id = ? AND h.parent_path = ?${missClause}
           ORDER BY e.title COLLATE NOCASE`
        )
        .all(query.libraryId, normalizeDir(query.folder) ?? '')
    } else if (query.containerId) {
      rows = this.db
        .prepare(
          `SELECT ${cols} ${from}
           WHERE h.library_id = ? AND h.container_id = ?${missClause}
           ORDER BY h.sort, e.title COLLATE NOCASE`
        )
        .all(query.libraryId, query.containerId)
    } else {
      rows = this.db
        .prepare(
          `SELECT ${cols} ${from}
           WHERE h.library_id = ? AND h.container_id IS NULL${missClause}
           ORDER BY e.created_at`
        )
        .all(query.libraryId)
    }
    return rows.map((r) => this.fromItemRow(r))
  }

  /** 移动收录到书箱（单亲归属；containerId=null = 移回库根层） */
  async moveHolding(
    editionId: string,
    libraryId: string,
    containerId: string | null
  ): Promise<void> {
    this.db
      .prepare('UPDATE holdings SET container_id = ? WHERE library_id = ? AND edition_id = ?')
      .run(containerId, libraryId, editionId)
  }

  /** 全部被收录的 edition（去重）——"全部书"顶层视角的读模型 */
  async listAllHeldEditions(): Promise<EditionRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT ${EDITION_COLS} FROM editions e
         WHERE EXISTS (SELECT 1 FROM holdings h WHERE h.edition_id = e.id)
         ORDER BY e.created_at DESC`
      )
      .all()
    return rows.map((r: Record<string, unknown>) => this.fromEditionRow(r))
  }

  // ————— 书库（组织模式）—————

  async listLibraries(): Promise<LibraryListResult> {
    const rows = this.db.prepare('SELECT * FROM libraries ORDER BY sort, created_at').all()
    const libraries = rows.map(fromLibraryRow)
    const currentId =
      (await this.getSetting<string | null>(SETTING_CURRENT_LIBRARY, null)) ??
      libraries[0]?.id ??
      ''
    return { libraries, currentId }
  }

  async getLibrary(id: string): Promise<LibraryEntry | null> {
    const row = this.db.prepare('SELECT * FROM libraries WHERE id = ?').get(id)
    return row ? fromLibraryRow(row) : null
  }

  async createLibrary(input: {
    name?: string
    mode: 'mapped' | 'curated'
    rootPath?: string
  }): Promise<LibraryEntry> {
    if (input.mode === 'mapped' && !input.rootPath) {
      throw new Error('映射庫必須指定跟蹤的文件夾')
    }
    const count = (this.db.prepare('SELECT COUNT(*) AS c FROM libraries').get() as { c: number }).c
    const id = `lib-${randomUUID().slice(0, 8)}`
    const entry: LibraryEntry = {
      id,
      name: input.name?.trim() || `書庫 ${count + 1}`,
      mode: input.mode,
      rootPath: input.mode === 'mapped' ? input.rootPath : undefined,
      sort: count
    }
    this.db
      .prepare(
        'INSERT INTO libraries (id, name, mode, root_path, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(id, entry.name, entry.mode, entry.rootPath ?? null, entry.sort, Date.now())
    await this.setSetting(SETTING_CURRENT_LIBRARY, id)
    return entry
  }

  async switchLibrary(id: string): Promise<void> {
    const entry = await this.getLibrary(id)
    if (!entry) throw new Error(`書庫不存在：${id}`)
    await this.setSetting(SETTING_CURRENT_LIBRARY, id)
  }

  async renameLibrary(id: string, name: string): Promise<LibraryEntry> {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('書庫名不能為空')
    this.db.prepare('UPDATE libraries SET name = ? WHERE id = ?').run(trimmed, id)
    const entry = await this.getLibrary(id)
    if (!entry) throw new Error(`書庫不存在：${id}`)
    return entry
  }

  /**
   * 移除书库（**移除引用**）：连带其 containers 与 holdings（外键级联）；
   * **edition / notes / reading_state 不删**（跨库资产）。最后一个库不可移除。
   */
  async removeLibrary(id: string): Promise<void> {
    const count = (this.db.prepare('SELECT COUNT(*) AS c FROM libraries').get() as { c: number }).c
    if (count <= 1) throw new Error('最後一個書庫不能移除')
    this.db.prepare('DELETE FROM libraries WHERE id = ?').run(id)
    const cur = await this.getSetting<string | null>(SETTING_CURRENT_LIBRARY, null)
    if (cur === id) {
      const next = this.db.prepare('SELECT id FROM libraries ORDER BY sort LIMIT 1').get() as
        | { id: string }
        | undefined
      if (next) await this.setSetting(SETTING_CURRENT_LIBRARY, next.id)
    }
  }

  // ————— 书箱（树在库内）—————

  async listContainers(libraryId: string, parentId: string | null): Promise<BookContainer[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM containers WHERE library_id = ? AND parent_id IS ? ORDER BY sort, name'
      )
      .all(libraryId, parentId)
    return rows.map(fromContainerRow)
  }

  async createContainer(params: {
    libraryId: string
    parentId: string | null
    name: string
  }): Promise<BookContainer> {
    const name = params.name.trim()
    if (!name) throw new Error('書箱名不能為空')
    const id = randomUUID()
    this.db
      .prepare(
        'INSERT INTO containers (id, library_id, parent_id, name, sort, collapsed) VALUES (?, ?, ?, ?, 0, 0)'
      )
      .run(id, params.libraryId, params.parentId, name)
    return { id, libraryId: params.libraryId, parentId: params.parentId, name, sort: 0 }
  }

  async renameContainer(id: string, name: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('書箱名不能為空')
    this.db.prepare('UPDATE containers SET name = ? WHERE id = ?').run(trimmed, id)
  }

  async removeContainer(id: string): Promise<void> {
    const children = this.db
      .prepare('SELECT COUNT(*) AS c FROM containers WHERE parent_id = ?')
      .get(id) as { c: number }
    if (children.c > 0) throw new Error('書箱仍有子書箱，先清空子级再移除')
    // 成员收录的 container_id 由外键 SET NULL 归回库根层（PRAGMA foreign_keys=ON）
    this.db.prepare('DELETE FROM containers WHERE id = ?').run(id)
  }

  /** 移动书箱（parentId=null = 移回库根层）；目标是自己或自己的后代时拒绝（防成环） */
  async moveContainer(id: string, parentId: string | null): Promise<void> {
    if (id === parentId) throw new Error('不能把書箱移进它自己')
    if (parentId !== null) {
      const exists = this.db.prepare('SELECT 1 FROM containers WHERE id = ?').get(parentId)
      if (!exists) throw new Error('目标書箱不存在')
      let cursor: string | null = parentId
      while (cursor !== null) {
        if (cursor === id) throw new Error('不能把書箱移进它自己的子書箱')
        const row = this.db.prepare('SELECT parent_id FROM containers WHERE id = ?').get(cursor) as
          | { parent_id: string | null }
          | undefined
        cursor = row?.parent_id ?? null
      }
    }
    this.db.prepare('UPDATE containers SET parent_id = ? WHERE id = ?').run(parentId, id)
  }

  // ————— 阅读状态 / 阅读时间 ——————

  async getReadingState(editionId: string): Promise<ReadingState | null> {
    const row = this.db.prepare('SELECT * FROM reading_state WHERE edition_id = ?').get(editionId)
    if (!row) return null
    const state: ReadingState = {
      editionId,
      totalReadMs: (row.total_read_ms as number) ?? 0
    }
    if (row.last_read_at != null) state.lastReadAt = row.last_read_at as number
    if (row.last_location) {
      const loc = safeParse<Partial<BookLocation>>(row.last_location as string)
      if (loc) state.lastLocation = normalizeLocation(loc)
    }
    return state
  }

  async putReadingState(state: ReadingState): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO reading_state (edition_id, last_read_at, last_location, total_read_ms)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(edition_id) DO UPDATE SET
           last_read_at = excluded.last_read_at,
           last_location = excluded.last_location,
           total_read_ms = excluded.total_read_ms`
      )
      .run(
        state.editionId,
        state.lastReadAt ?? null,
        state.lastLocation ? JSON.stringify(state.lastLocation) : null,
        state.totalReadMs ?? 0
      )
  }

  /** 追加一次阅读会话，并**在同一事务里**把时长累进 `reading_state.total_read_ms`（投影不许两处各写各的） */
  async appendReadingSession(session: Omit<ReadingSession, 'id'>): Promise<void> {
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO reading_sessions (edition_id, owner, started_at, ended_at, duration_ms)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          session.editionId,
          session.owner ?? null,
          session.startedAt,
          session.endedAt,
          session.durationMs
        )
      this.db
        .prepare(
          `INSERT INTO reading_state (edition_id, total_read_ms) VALUES (?, ?)
           ON CONFLICT(edition_id) DO UPDATE SET total_read_ms = total_read_ms + excluded.total_read_ms`
        )
        .run(session.editionId, session.durationMs)
    })
    tx()
  }

  /** 按 work 汇总阅读时长（逐 edition 记录、按 work 汇总是查询口径 —— DATA_MODEL §6.1） */
  async totalReadMsByWork(work: WorkIdentity): Promise<number> {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(rs.total_read_ms), 0) AS total
         FROM reading_state rs
         JOIN editions e ON e.id = rs.edition_id
         JOIN works w ON w.id = e.work_id
         WHERE w.protocol = ? AND w.code = ?`
      )
      .get(work.protocol, work.code) as { total: number } | undefined
    return row?.total ?? 0
  }

  /** 最近阅读的 edition（无阅读记录 → 回退最近入库） */
  async getLastReadEdition(): Promise<EditionRecord | null> {
    const row = this.db
      .prepare(
        `SELECT ${EDITION_COLS} FROM editions e
         LEFT JOIN reading_state rs ON rs.edition_id = e.id
         ORDER BY COALESCE(rs.last_read_at, 0) DESC, e.created_at DESC
         LIMIT 1`
      )
      .get()
    return row ? this.fromEditionRow(row) : null
  }

  // ————— 封面（edition 级）—————

  async setCover(editionId: string, bytes: ArrayBuffer, ext: string): Promise<string> {
    const safeExt = /^[a-z0-9]{2,5}$/i.test(ext) ? ext.toLowerCase() : 'jpg'
    const name = `${editionId}.${safeExt}`
    await fs.mkdir(this.opts.coversDir, { recursive: true })
    await fs.writeFile(join(this.opts.coversDir, name), Buffer.from(bytes))
    return name
  }

  async getCover(editionId: string): Promise<ArrayBuffer | null> {
    const record = await this.getEdition(editionId)
    if (!record?.coverPath) return null
    try {
      const buf = await fs.readFile(join(this.opts.coversDir, record.coverPath))
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    } catch {
      return null // 文件被手工删掉：视为无封面，不报错
    }
  }

  async removeCover(editionId: string): Promise<void> {
    const record = await this.getEdition(editionId)
    if (!record?.coverPath) return
    await fs.rm(join(this.opts.coversDir, record.coverPath), { force: true })
  }

  // ————— 设置（全局）—————

  async getSetting<T>(key: string, fallback: T): Promise<T> {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    if (!row) return fallback
    try {
      return JSON.parse(row.value) as T
    } catch {
      return fallback
    }
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    this.db
      .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .run(key, JSON.stringify(value))
  }

  /** 原子合并一个设置对象（避免渲染进程侧"读-改-写"造成的互相覆盖） */
  async patchSetting(key: string, patch: Record<string, unknown>): Promise<void> {
    const cur = await this.getSetting<Record<string, unknown>>(key, {})
    await this.setSetting(key, { ...cur, ...patch })
  }

  // ————— 笔记 / 划线（挂 edition）—————

  async listNotes(editionId: string, chapterIndex?: number): Promise<Note[]> {
    const rows =
      chapterIndex === undefined
        ? this.db
            .prepare('SELECT * FROM notes WHERE edition_id = ? ORDER BY chapter_index, id')
            .all(editionId)
        : this.db
            .prepare(
              'SELECT * FROM notes WHERE edition_id = ? AND chapter_index = ? ORDER BY chapter_index, id'
            )
            .all(editionId, chapterIndex)
    return rows.map(fromNoteRow).sort(compareNotes)
  }

  async addNote(note: Note): Promise<void> {
    const cols = anchorToColumns(note.anchor)
    this.db
      .prepare(
        `INSERT INTO notes
           (id, edition_id, owner, kind, chapter_index, anchor_key, anchor_hint, color, excerpt, body, ink, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        note.id,
        note.editionId,
        note.owner ?? null,
        note.kind,
        cols.chapterIndex,
        cols.anchorKey,
        cols.anchorHint,
        note.color ?? null,
        note.anchor.norm.quote.exact, // excerpt 列 = quote.exact 的投影（§3.1.1 ①）
        note.body,
        note.ink ?? null,
        note.createdAt,
        note.updatedAt
      )
  }

  /**
   * 局部更新。两条**必须由存储层统一保证**的一致性：
   * ① `anchor` 给了 → 三个锚点列**一起**重写（含 `excerpt`）—— 否则 quote 与 anchor_key 会脱节，
   *    而 `excerpt` 是 `anchor.norm.quote.exact` 的投影，绝不允许两处各写各的；
   * ② `updated_at` 一律由本方法盖时间戳，调用方不必（也不该）自己维护。
   */
  async updateNote(id: string, patch: NotePatch): Promise<void> {
    const sets: string[] = []
    const args: unknown[] = []
    if (patch.anchor) {
      const cols = anchorToColumns(patch.anchor)
      sets.push('chapter_index = ?', 'anchor_key = ?', 'anchor_hint = ?', 'excerpt = ?')
      args.push(cols.chapterIndex, cols.anchorKey, cols.anchorHint, patch.anchor.norm.quote.exact)
    }
    if (patch.color !== undefined) {
      sets.push('color = ?')
      args.push(patch.color ?? null)
    }
    if (patch.body !== undefined) {
      sets.push('body = ?')
      args.push(patch.body)
    }
    if (patch.ink !== undefined) {
      sets.push('ink = ?')
      args.push(patch.ink ?? null)
    }
    // 无可改字段也照样推进 updated_at：调用方表达的是"这条笔记被触碰过"
    sets.push('updated_at = ?')
    args.push(Date.now(), id)
    this.db.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ?`).run(...args)
  }

  async removeNote(id: string): Promise<void> {
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
  }

  // ————— 笔记读模型（跨书管理，v0.4.2）—————

  /**
   * 跨书列笔记（笔记管理工具的数据口）。
   *
   * 三处口径写死在这里（都对应契约，别在外部再解释一遍）：
   * ① **库作用域经 `holdings` 的 EXISTS**：笔记挂 edition、**不挂库** → "某库的笔记"是**查询口径**；
   *    用 EXISTS 而不是 JOIN，是为了不因同一 edition 被多库收录而**重复出行**。
   * ② **「划线 / 批注」按 `body` 是否为空判**，**不按 `kind`**（二者可矛盾，见 `NoteFilter` 注释）。
   * ③ **关键词 = 子串**（`LIKE '%q%'`，`excerpt` + `body` 两列）—— 中文语义正确且千条级足够快；
   *    换 FTS5 时**只换这里**，端口签名与调用方不动（换装条件见 DATA_MODEL §5 问题 6）。
   */
  async listAllNotes(query: NoteQuery = {}): Promise<NoteListItem[]> {
    const { where, args } = buildNoteFilter(query)
    const order = NOTE_ORDER[query.orderBy ?? 'updated']
    const limit = Number.isFinite(query.limit) ? Math.max(0, query.limit as number) : null
    const offset = Number.isFinite(query.offset) ? Math.max(0, query.offset as number) : 0
    const rows = this.db
      .prepare(
        `SELECT n.*, e.title AS edition_title, e.format AS edition_format
           FROM notes n
           JOIN editions e ON e.id = n.edition_id
          WHERE ${where}
          ORDER BY ${order}
          ${limit === null ? '' : 'LIMIT ? OFFSET ?'}`
      )
      .all(...args, ...(limit === null ? [] : [limit, offset])) as Array<Record<string, unknown>>

    // 展示投影：该 edition 被哪些库收录（库表与收录表都很小，一次拉全再按需取，不做 N+1）
    const libsByEdition = this.libraryNamesByEdition()
    return rows.map((r) => {
      const editionId = r.edition_id as string
      return {
        note: fromNoteRow(r),
        editionTitle: (r.edition_title as string) || '未命名',
        editionFormat: r.edition_format as NoteListItem['editionFormat'],
        libraryNames: libsByEdition.get(editionId) ?? []
      }
    })
  }

  /** 与 `listAllNotes` **同口径**的计数（筛选器显示"多少条"，不必取回全量再数） */
  async countAllNotes(query: NoteQuery = {}): Promise<number> {
    const { where, args } = buildNoteFilter(query)
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS c
           FROM notes n
           JOIN editions e ON e.id = n.edition_id
          WHERE ${where}`
      )
      .get(...args) as { c: number } | undefined
    return row?.c ?? 0
  }

  /** edition → 收录它的库名（按库 sort）；供读模型的展示投影用 */
  private libraryNamesByEdition(): Map<string, string[]> {
    const rows = this.db
      .prepare(
        `SELECT h.edition_id AS eid, l.name AS name
           FROM holdings h JOIN libraries l ON l.id = h.library_id
          ORDER BY l.sort, l.name`
      )
      .all() as Array<{ eid: string; name: string }>
    const map = new Map<string, string[]>()
    for (const r of rows) {
      const list = map.get(r.eid)
      if (list) list.push(r.name)
      else map.set(r.eid, [r.name])
    }
    return map
  }

  // ————— 内部 —————

  /**
   * work 身份 upsert（T3 状态转移的落点）：按 `(protocol, code)` 唯一。
   * ⚠ 本次**只留接口**（D11/F9）—— 没有 UI 也允许写入，"阅读时间按 work 汇总"要先能跑。
   */
  private ensureWorkId(work: WorkIdentity | null): string | null {
    if (!work) return null
    const found = this.db
      .prepare('SELECT id FROM works WHERE protocol = ? AND code = ?')
      .get(work.protocol, work.code) as { id: string } | undefined
    if (found) return found.id
    const id = randomUUID()
    this.db
      .prepare('INSERT INTO works (id, protocol, code, title, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, work.protocol, work.code, '', Date.now())
    return id
  }

  /** 保证至少有一个书库（全新安装 / 迁移后兜底），并把"当前库"设好 */
  private async ensureDefaultLibrary(): Promise<void> {
    const count = (this.db.prepare('SELECT COUNT(*) AS c FROM libraries').get() as { c: number }).c
    if (count === 0) {
      this.db
        .prepare(
          'INSERT INTO libraries (id, name, mode, root_path, sort, created_at) VALUES (?, ?, ?, NULL, 0, ?)'
        )
        .run('default', '書庫', 'curated', Date.now())
    }
    const cur = await this.getSetting<string | null>(SETTING_CURRENT_LIBRARY, null)
    if (!cur || !(await this.getLibrary(cur))) {
      const first = this.db.prepare('SELECT id FROM libraries ORDER BY sort LIMIT 1').get() as
        | { id: string }
        | undefined
      if (first) await this.setSetting(SETTING_CURRENT_LIBRARY, first.id)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private fromEditionRow(row: any): EditionRecord {
    const metadata = safeParse<Record<string, unknown>>(row.metadata as string) ?? {}
    if (!metadata.title) metadata.title = row.title as string
    const record: EditionRecord = {
      id: row.id as string,
      work: this.workOf(row.work_id as string | null),
      fingerprint: {
        algorithm: row.fp_algo as BookFingerprint['algorithm'],
        hash: row.fp_hash as string,
        size: row.fp_size as number
      },
      metadata: metadata as unknown as EditionRecord['metadata'],
      format: row.format as EditionRecord['format'],
      filePath: row.file_path as string,
      createdAt: row.created_at as number
    }
    if (row.cover_path) record.coverPath = row.cover_path as string
    if (row.cover_failed === 1) record.coverFailed = true
    return record
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private workOf(workId: string | null): WorkIdentity | null {
    if (!workId) return null
    const row = this.db.prepare('SELECT protocol, code FROM works WHERE id = ?').get(workId) as
      | { protocol: string; code: string }
      | undefined
    if (!row) return null
    return { protocol: row.protocol as WorkIdentity['protocol'], code: row.code }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private fromItemRow(row: any): LibraryItem {
    const hasState = row.rs_last_read_at != null || row.rs_last_location != null
    let readingState: ReadingState | null = null
    if (hasState) {
      readingState = { editionId: row.id as string, totalReadMs: (row.rs_total_read_ms as number) ?? 0 }
      if (row.rs_last_read_at != null) readingState.lastReadAt = row.rs_last_read_at as number
      if (row.rs_last_location) {
        const loc = safeParse<Partial<BookLocation>>(row.rs_last_location as string)
        if (loc) readingState.lastLocation = normalizeLocation(loc)
      }
    }
    return {
      edition: this.fromEditionRow(row),
      holding: {
        libraryId: row.h_library_id as string,
        editionId: row.id as string,
        containerId: (row.h_container_id as string | null) ?? null,
        origin: row.h_origin as Holding['origin'],
        path: (row.h_path as string | null) ?? undefined,
        parentPath: (row.h_parent_path as string | null) ?? undefined,
        missing: row.h_missing === 1,
        sort: (row.h_sort as number) ?? 0,
        addedAt: row.h_added_at as number
      },
      readingState
    }
  }
}

/** editions 列的单表前缀选择（JOIN 时两表都有 id/created_at，必须显式列出） */
const EDITION_COLS = `e.id AS id, e.work_id AS work_id, e.fp_algo AS fp_algo, e.fp_hash AS fp_hash,
  e.fp_size AS fp_size, e.format AS format, e.title AS title, e.metadata AS metadata,
  e.file_path AS file_path, e.cover_path AS cover_path, e.cover_failed AS cover_failed,
  e.created_at AS created_at`

/**
 * 路径父目录归一：去尾分隔符 + 统一为**反斜杠**（Windows 主导）。
 * ⚠ 只做这个程度：**不做大小写归一**（Windows 文件系统大小写不敏感，但用户可能用不同大小写
 * 登记同一目录 → 会各自成为一层。这是已知边界，登记在 `TODO.md` 工程组的规模条目里）。
 */
function normalizeDir(p: string | null | undefined): string | null {
  if (p == null) return null
  return p.replace(/[\\/]+$/, '').replace(/\//g, '\\')
}

/** holdings 行 → 领域 Holding（不含 edition） */
function fromHoldingRow(r: Record<string, unknown>): Holding {
  return {
    libraryId: r.library_id as string,
    editionId: r.edition_id as string,
    containerId: (r.container_id as string | null) ?? null,
    origin: r.origin as Holding['origin'],
    path: (r.path as string | null) ?? undefined,
    parentPath: (r.parent_path as string | null) ?? undefined,
    missing: r.missing === 1,
    sort: (r.sort as number) ?? 0,
    addedAt: r.added_at as number
  }
}

function fromLibraryRow(r: Record<string, unknown>): LibraryEntry {
  return {
    id: r.id as string,
    name: r.name as string,
    mode: r.mode as LibraryEntry['mode'],
    rootPath: (r.root_path as string | null) ?? undefined,
    sort: (r.sort as number) ?? 0
  }
}

function fromContainerRow(r: Record<string, unknown>): BookContainer {
  return {
    id: r.id as string,
    libraryId: r.library_id as string,
    parentId: (r.parent_id as string | null) ?? null,
    name: r.name as string,
    sort: (r.sort as number) ?? 0
  }
}

/**
 * 笔记阅读序比较：章 → 章内进度 → 创建时间。
 * 用锚点 **Norm 层**而非 Fragment —— Fragment 是不透明串、无可比性，Norm 才是"跨格式可比"的那层
 * （DATA_MODEL §3.1.1）；末位用 createdAt 兜底，保证进度相同的两条也有稳定次序。
 */
function compareNotes(a: Note, b: Note): number {
  const ca = a.anchor.norm.chapterIndex
  const cb = b.anchor.norm.chapterIndex
  if (ca !== cb) return ca - cb
  const pa = a.anchor.norm.progression
  const pb = b.anchor.norm.progression
  if (pa !== pb) return pa - pb
  return a.createdAt - b.createdAt
}

/** notes 行 → 领域 Note（锚点三列 + excerpt 走 columnsToAnchor 装配，与写入侧同一套映射） */
function fromNoteRow(r: Record<string, unknown>): Note {
  return {
    id: r.id as string,
    editionId: r.edition_id as string,
    owner: (r.owner as string | null) ?? null,
    kind: r.kind as Note['kind'],
    anchor: columnsToAnchor({
      chapterIndex: r.chapter_index as number,
      anchorKey: r.anchor_key as string,
      anchorHint: r.anchor_hint as string,
      excerpt: r.excerpt as string
    }),
    color: (r.color as Note['color'] | null) ?? undefined,
    body: (r.body as string) ?? '',
    ink: (r.ink as string | null) ?? undefined,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number
  }
}

/** 笔记读模型的排序口径（`NoteQuery.orderBy`；默认 `updated` = 最近改动在前） */
const NOTE_ORDER: Record<NonNullable<NoteQuery['orderBy']>, string> = {
  updated: 'n.updated_at DESC, n.id',
  created: 'n.created_at DESC, n.id',
  edition: 'n.edition_id, n.chapter_index, n.id'
}

/**
 * `NoteQuery` → WHERE 子句 + 参数。**筛选口径只此一处** —— `listAllNotes` 与 `countAllNotes`
 * 共用它，否则"列表与计数不一致"这类 bug 迟早出现。
 */
function buildNoteFilter(query: NoteQuery): { where: string; args: unknown[] } {
  const conds: string[] = ['1=1']
  const args: unknown[] = []
  if (query.libraryId) {
    // 库作用域 = 该库**收录**范围内的 edition（笔记挂 edition、不挂库）；
    // 用 EXISTS 而非 JOIN：同一 edition 被多库收录也不会重复出行
    conds.push(
      'EXISTS (SELECT 1 FROM holdings h WHERE h.edition_id = n.edition_id AND h.library_id = ?)'
    )
    args.push(query.libraryId)
  }
  if (query.editionId) {
    conds.push('n.edition_id = ?')
    args.push(query.editionId)
  }
  if (query.color) {
    conds.push('n.color = ?')
    args.push(query.color)
  }
  // 「划线 / 批注」判据 = body 是否为空（**不是 kind**，见 NoteFilter 注释）
  if (query.hasBody === true) conds.push("n.body <> ''")
  else if (query.hasBody === false) conds.push("n.body = ''")
  const text = query.text?.trim()
  if (text) {
    // ⚠ LIKE 的通配符要转义：否则用户搜 "100%" 会变成"匹配一切"
    const escaped = text.replace(/[\\%_]/g, (m) => `\\${m}`)
    conds.push("(n.excerpt LIKE ? ESCAPE '\\' OR n.body LIKE ? ESCAPE '\\')")
    args.push(`%${escaped}%`, `%${escaped}%`)
  }
  return { where: conds.join(' AND '), args }
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * 这个已存在的库文件是不是**旧版（一库一 .db 时代）的书库**？
 * 判据（任一命中即可）：① 有 `books` 表（v3 已改名 `editions`）；
 * ② 有 `notes` 表但**没有 `edition_id` 列**（v3 把 `book_id` 改成了 `edition_id`）。
 * 只读探测，不修改任何东西。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function looksLikeLegacyStore(db: any): boolean {
  try {
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
        name: string
      }>
    ).map((r) => r.name)
    if (tables.includes('books')) return true
    if (tables.includes('notes')) {
      const cols = (
        db.prepare('PRAGMA table_info(notes)').all() as Array<{ name: string }>
      ).map((c) => c.name)
      if (!cols.includes('edition_id')) return true
    }
    return false
  } catch {
    // 探测失败就放行：宁可让后面的 SQL 报错，也不要因为守卫生效而误拒一个正常库
    return false
  }
}
