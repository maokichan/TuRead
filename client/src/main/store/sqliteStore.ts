/**
 * ILibraryStore 适配器（主进程侧，真实实现）—— better-sqlite3 单库文件 + 封面目录。
 *
 * 数据建模依据：`client/docs/DATA_MODEL.md`（收束版 v2，2026-09-12 批复；spike 全绿 2026-09-13）。
 * 单一 SQLite 库文件 = 一份书库（books/containers/notes/settings 全在一个 .db）；
 * JSON 退役为引导文件 —— 本实现只负责把旧 `library.json`/`config.json` **一次性迁移**进库
 * （init 内 one-shot，迁移完改名 `.migrated` 留档），此后一切读写只走 SQLite。
 *
 * 文件布局（userData/）：
 *   turead.db           一切书库数据（schema 见 DATA_MODEL §2；WAL 模式）
 *   turead.db-wal/-shm  WAL 副产物（正常存在）
 *   covers/<id>.<ext>   封面缩略图（字节不进库；统一库后随库目录，见 DATA_MODEL §1）
 *   library.json.migrated / config.json.migrated   迁移留档（原文件改名，不删除）
 *
 * better-sqlite3 是原生模块：与 spike（dev/sqliteSpike.ts）同纪律 —— **动态 import**，
 * ABI 不匹配时在 init 处给出可行动的错误，而不是炸掉所有启动路径。
 * 换 Electron 版本后须重跑 `npm run rebuild:sqlite`（DATA_MODEL §5 开放问题 1）。
 */
import { promises as fs } from 'node:fs'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { BookContainer, BookRecord, BookLocation, Note } from '@core/domain/types'
import type { LibraryLevelQuery, NotePatch } from '@core/ports/store'
import { normalizeLocation } from '@core/domain/location'
import { anchorToColumns, columnsToAnchor } from '@core/domain/anchor'

export interface SqliteStoreOptions {
  /** 库文件绝对路径（<库名>.db；多书库时代每个 .db 一份书库） */
  dbPath: string
  coversDir: string
  /** 旧 JSON 的位置（仅迁移器读取；缺省 = 无旧数据可迁，直接建空库。
   *  只有从旧版 JSON 升级上来的"默认库"才带这两个字段，新建书库不带） */
  legacyLibraryPath?: string
  legacyConfigPath?: string
}

/** 与 DATA_MODEL §2 一致的建表语句（IF NOT EXISTS：老库升级安全）。
 *  containers/notes 本期未接 UI，表先立（schema 已批复，笔记/书箱落地即用）。 */
const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    format TEXT NOT NULL,
    fp_algo TEXT NOT NULL, fp_hash TEXT NOT NULL, fp_size INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    cover_path TEXT, cover_failed INTEGER NOT NULL DEFAULT 0,
    work_protocol TEXT, work_code TEXT,
    last_read_at INTEGER, last_location TEXT,
    created_at INTEGER NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS containers (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES containers(id),
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    paths TEXT,
    collapsed INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS container_books (
    container_id TEXT NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    sort INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (container_id, book_id)
);
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_notes_book ON notes(book_id, chapter_index);
CREATE INDEX IF NOT EXISTS idx_container_books_book ON container_books(book_id);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`

/** 迁移完成标记（meta 表）：防止"迁移后删光书 → 下次启动从留档 JSON 复活已删书" */
const META_MIGRATED = 'migrated_v1'

/** BookRecord 字段 ↔ books 列的映射（updateBook 的 patch 逐字段翻译用） */
type BookColumns = {
  title: string
  format: string
  fp_algo: string
  fp_hash: string
  fp_size: number
  file_path: string
  cover_path: string | null
  cover_failed: number
  last_read_at: number | null
  last_location: string | null
  created_at: number
  metadata: string
}

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
    db.exec(SCHEMA_SQL)
    this.db = db
    await this.migrateLegacyIfPresent()
  }

  /** 应用退出/切库时关闭句柄（WAL checkpoint 随之落盘）。
   *  ⚠ close 后允许 init() 重开（initPromise 清零）—— 多库切换会来回开关同一个库。 */
  close(): void {
    this.db?.close()
    this.db = null
    this.initPromise = null
  }

  // ————— 迁移器（DATA_MODEL §5 开放问题 2）：library.json / config.json → 本库，one-shot —————

  /**
   * 条件 = 库内无迁移标记 **且** 旧文件存在。迁移内容：books 全量（事务）+ settings
   * （config.json 的 settings；旧格式 library.json 内嵌 settings 也收）。完成后旧文件
   * 改名 `.migrated` 留档（不删除，用户可随时回退到旧版客户端），并写标记位。
   */
  private async migrateLegacyIfPresent(): Promise<void> {
    const migrated = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(META_MIGRATED)
    if (migrated) return
    if (!this.opts.legacyLibraryPath && !this.opts.legacyConfigPath) {
      this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(META_MIGRATED, 'fresh')
      return
    }
    const libPath = this.opts.legacyLibraryPath
    const cfgPath = this.opts.legacyConfigPath
    if ((!libPath || !existsSync(libPath)) && (!cfgPath || !existsSync(cfgPath))) {
      this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(META_MIGRATED, 'fresh')
      return
    }

    const library = libPath
      ? await readJson<{ books?: BookRecord[]; settings?: Record<string, unknown> }>(libPath)
      : null
    const config = cfgPath
      ? await readJson<{ settings?: Record<string, unknown> }>(cfgPath)
      : null

    const books = Array.isArray(library?.books) ? library.books : []
    const settings = { ...(library?.settings ?? {}), ...(config?.settings ?? {}) }

    const tx = this.db.transaction(() => {
      const ins = this.db.prepare(
        `INSERT OR IGNORE INTO books (
           id, title, format, fp_algo, fp_hash, fp_size, file_path,
           cover_path, cover_failed, work_protocol, work_code,
           last_read_at, last_location, created_at, metadata
         ) VALUES (
           @id, @title, @format, @fp_algo, @fp_hash, @fp_size, @file_path,
           @cover_path, @cover_failed, NULL, NULL,
           @last_read_at, @last_location, @created_at, @metadata
         )`
      )
      for (const record of books) ins.run(toRow(record))
      const set = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      for (const [key, value] of Object.entries(settings)) set.run(key, JSON.stringify(value))
      this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(META_MIGRATED, 'json')
    })
    tx()

    await renameAside(this.opts.legacyLibraryPath)
    await renameAside(this.opts.legacyConfigPath)
    console.log(
      `[store] 已迁移旧书库进 SQLite：${books.length} 本书 + ${Object.keys(settings).length} 个设置键（旧文件改名 .migrated 留档）`
    )
  }

  // ————— ILibraryStore —————

  async addBook(record: BookRecord): Promise<void> {
    // 旧 JsonStore 语义：同 id 不覆盖（importBook 的去重在上游做）
    this.db
      .prepare(
        `INSERT OR IGNORE INTO books (
           id, title, format, fp_algo, fp_hash, fp_size, file_path,
           cover_path, cover_failed, work_protocol, work_code,
           last_read_at, last_location, created_at, metadata
         ) VALUES (
           @id, @title, @format, @fp_algo, @fp_hash, @fp_size, @file_path,
           @cover_path, @cover_failed, NULL, NULL,
           @last_read_at, @last_location, @created_at, @metadata
         )`
      )
      .run(toRow(record))
  }

  async updateBook(id: string, patch: Partial<BookRecord>): Promise<void> {
    // 只 SET 出现的字段（patch 语义，与旧 JsonStore 的浅合并一致）
    const sets: string[] = []
    const params: Record<string, unknown> = { id }
    for (const [key, value] of Object.entries(patch)) {
      const col = PATCH_COLUMNS[key]
      if (!col) continue
      sets.push(`${col} = @${col}`)
      params[col] = encodePatchValue(col, value)
    }
    if (sets.length === 0) return
    // patch 带了 metadata → title 列随之同步（title 是 metadata.title 的规范化投影）
    if (patch.metadata !== undefined) {
      sets.push('title = @title')
      params.title = patch.metadata.title ?? ''
    }
    // fingerprint 是三列的整体（algorithm/hash/size 同生共死），不支持部分更新
    if (patch.fingerprint) {
      sets.push('fp_algo = @fp_algo', 'fp_hash = @fp_hash', 'fp_size = @fp_size')
      params.fp_algo = patch.fingerprint.algorithm
      params.fp_hash = patch.fingerprint.hash
      params.fp_size = patch.fingerprint.size
    }
    this.db.prepare(`UPDATE books SET ${sets.join(', ')} WHERE id = @id`).run(params)
  }

  async getBook(id: string): Promise<BookRecord | null> {
    const row = this.db.prepare('SELECT * FROM books WHERE id = ?').get(id)
    return row ? fromRow(row) : null
  }

  async listBooks(): Promise<BookRecord[]> {
    const rows = this.db.prepare('SELECT * FROM books ORDER BY created_at').all()
    return rows.map(fromRow)
  }

  async removeBook(id: string): Promise<void> {
    // 先取记录再删：删完就查不到 coverPath，封面文件会留在磁盘上
    const record = await this.getBook(id)
    this.db.prepare('DELETE FROM books WHERE id = ?').run(id)
    if (record?.coverPath) {
      await fs.rm(join(this.opts.coversDir, record.coverPath), { force: true })
    }
  }

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

  // ————— 封面（字节不进库，与旧实现同布局：covers/<bookId>.<ext>）—————

  async setCover(bookId: string, bytes: ArrayBuffer, ext: string): Promise<string> {
    const safeExt = /^[a-z0-9]{2,5}$/i.test(ext) ? ext.toLowerCase() : 'jpg'
    const name = `${bookId}.${safeExt}`
    await fs.mkdir(this.opts.coversDir, { recursive: true })
    await fs.writeFile(join(this.opts.coversDir, name), Buffer.from(bytes))
    return name
  }

  async getCover(bookId: string): Promise<ArrayBuffer | null> {
    const record = await this.getBook(bookId)
    if (!record?.coverPath) return null
    try {
      const buf = await fs.readFile(join(this.opts.coversDir, record.coverPath))
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    } catch {
      return null // 文件被手工删掉：视为无封面，不报错
    }
  }

  async removeCover(bookId: string): Promise<void> {
    const record = await this.getBook(bookId)
    if (!record?.coverPath) return
    await fs.rm(join(this.opts.coversDir, record.coverPath), { force: true })
  }

  // ————— 書箱 / 层级浏览（DATA_MODEL §2 containers 表；虚拟映射模式不落库、不经这里）—————

  async listContainers(parentId: string | null): Promise<BookContainer[]> {
    const rows = this.db
      .prepare('SELECT * FROM containers WHERE parent_id IS ? ORDER BY sort, name')
      .all(parentId)
    return rows.map(
      (r: Record<string, unknown>) =>
        ({
          id: r.id as string,
          parentId: (r.parent_id as string | null) ?? null,
          kind: r.kind as BookContainer['kind'],
          name: r.name as string
        }) satisfies BookContainer
    )
  }

  async createContainer(params: { parentId: string | null; name: string }): Promise<BookContainer> {
    const name = params.name.trim()
    if (!name) throw new Error('書箱名不能為空')
    const id = randomUUID()
    this.db
      .prepare(
        'INSERT INTO containers (id, parent_id, kind, name, paths, collapsed, sort) VALUES (?, ?, ?, ?, NULL, 0, 0)'
      )
      .run(id, params.parentId, 'virtual', name)
    return { id, parentId: params.parentId, kind: 'virtual', name }
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
    // container_books 由外键级联清理（PRAGMA foreign_keys=ON，SCHEMA_SQL 顶部）
    this.db.prepare('DELETE FROM containers WHERE id = ?').run(id)
  }

  /**
   * 移动书到書箱（资源管理器语义 = 移动，单亲归属）：清掉旧归属再落到新書箱；
   * containerId=null = 移回根层。
   */
  async moveBookToContainer(bookId: string, containerId: string | null): Promise<void> {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM container_books WHERE book_id = ?').run(bookId)
      if (containerId) {
        this.db
          .prepare('INSERT OR REPLACE INTO container_books (container_id, book_id, sort) VALUES (?, ?, 0)')
          .run(containerId, bookId)
      }
    })
    tx()
  }

  /**
   * 移动書箱到另一个書箱下（资源管理器语义 = 移动；parentId=null = 移回根层）。
   * 沿目标祖先链上行查环：目标是自己或自己的后代时拒绝（树不许成环）。
   */
  async moveContainer(id: string, parentId: string | null): Promise<void> {
    if (id === parentId) throw new Error('不能把書箱移进它自己')
    if (parentId !== null) {
      const exists = this.db.prepare('SELECT 1 FROM containers WHERE id = ?').get(parentId)
      if (!exists) throw new Error('目标書箱不存在')
      let cursor: string | null = parentId
      while (cursor !== null) {
        if (cursor === id) throw new Error('不能把書箱移进它自己的子書箱')
        const row = this.db
          .prepare('SELECT parent_id FROM containers WHERE id = ?')
          .get(cursor) as { parent_id: string | null } | undefined
        cursor = row?.parent_id ?? null
      }
    }
    this.db.prepare('UPDATE containers SET parent_id = ? WHERE id = ?').run(parentId, id)
  }

  async listBooksAtLevel(query: LibraryLevelQuery): Promise<BookRecord[]> {    if (query.folder != null) {
      // 虚拟映射：直接位于该文件夹的书（子文件夹的书属于子层级）
      const rows = this.db.prepare('SELECT * FROM books ORDER BY created_at').all()
      const base = query.folder.replace(/[\\/]+$/, '')
      return rows
        .map(fromRow)
        .filter((b: BookRecord) => dirname(b.filePath).replace(/[\\/]+$/, '') === base)
    }
    if (query.containerId) {
      const rows = this.db
        .prepare(
          'SELECT b.* FROM books b JOIN container_books cb ON cb.book_id = b.id WHERE cb.container_id = ? ORDER BY cb.sort'
        )
        .all(query.containerId)
      return rows.map(fromRow)
    }
    // 根层：不属于任何書箱的书
    const rows = this.db
      .prepare(
        'SELECT * FROM books WHERE id NOT IN (SELECT book_id FROM container_books) ORDER BY created_at'
      )
      .all()
    return rows.map(fromRow)
  }

  // ————— 笔记/划线（DATA_MODEL §2 notes 表；锚点落库映射走 domain/anchor.ts，勿在此另立一套）—————

  async listNotes(bookId: string, chapterIndex?: number): Promise<Note[]> {
    const rows =
      chapterIndex === undefined
        ? this.db
            .prepare('SELECT * FROM notes WHERE book_id = ? ORDER BY chapter_index, id')
            .all(bookId)
        : this.db
            .prepare(
              'SELECT * FROM notes WHERE book_id = ? AND chapter_index = ? ORDER BY chapter_index, id'
            )
            .all(bookId, chapterIndex)
    return rows.map(fromNoteRow).sort(compareNotes)
  }

  async addNote(note: Note): Promise<void> {
    const cols = anchorToColumns(note.anchor)
    this.db
      .prepare(
        `INSERT INTO notes
           (id, book_id, owner, kind, chapter_index, anchor_key, anchor_hint, color, excerpt, body, ink, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        note.id,
        note.bookId,
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
    bookId: r.book_id as string,
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

/** patch 键 → 列名（updateBook 白名单：未登记的键忽略，防任意列名进 SQL） */
const PATCH_COLUMNS: Record<string, string> = {
  title: 'title',
  format: 'format',
  filePath: 'file_path',
  coverPath: 'cover_path',
  coverFailed: 'cover_failed',
  lastReadAt: 'last_read_at',
  lastLocation: 'last_location',
  createdAt: 'created_at',
  metadata: 'metadata'
}

/** patch 值 → 可绑定类型：对象列（metadata/last_location）序列化为 JSON，布尔列转 0/1 */
function encodePatchValue(col: string, value: unknown): string | number | null {
  if (value === null || value === undefined) return null
  if (col === 'metadata' || col === 'last_location') return JSON.stringify(value)
  if (col === 'cover_failed') return value ? 1 : 0
  if (typeof value === 'string' || typeof value === 'number') return value
  return JSON.stringify(value)
}

/** BookRecord → 行参数。lastLocation 序列化为 JSON；布尔 → 0/1 */
function toRow(record: BookRecord): BookColumns & {
  id: string
  cover_failed: number
  last_location: string | null
} {
  return {
    id: record.id,
    title: record.metadata.title,
    format: record.format,
    fp_algo: record.fingerprint.algorithm,
    fp_hash: record.fingerprint.hash,
    fp_size: record.fingerprint.size,
    file_path: record.filePath,
    cover_path: record.coverPath ?? null,
    cover_failed: record.coverFailed ? 1 : 0,
    last_read_at: record.lastReadAt ?? null,
    last_location: record.lastLocation ? JSON.stringify(record.lastLocation) : null,
    created_at: record.createdAt,
    metadata: JSON.stringify(record.metadata ?? { title: '' })
  }
}

/** 行 → BookRecord。位置读回先过定位系统归一（容错旧 JSON 里的 string 数值形态） */
function fromRow(row: Record<string, unknown>): BookRecord {
  const metadata = safeParse<Record<string, unknown>>(row.metadata as string) ?? {}
  if (!metadata.title) metadata.title = row.title as string
  const record: BookRecord = {
    id: row.id as string,
    fingerprint: {
      algorithm: row.fp_algo as BookRecord['fingerprint']['algorithm'],
      hash: row.fp_hash as string,
      size: row.fp_size as number
    },
    metadata: metadata as unknown as BookRecord['metadata'],
    format: row.format as BookRecord['format'],
    filePath: row.file_path as string,
    createdAt: row.created_at as number
  }
  if (row.last_read_at !== null && row.last_read_at !== undefined) {
    record.lastReadAt = row.last_read_at as number
  }
  if (row.last_location) {
    const loc = safeParse<Partial<BookLocation>>(row.last_location as string)
    if (loc) record.lastLocation = normalizeLocation(loc)
  }
  if (row.cover_path) record.coverPath = row.cover_path as string
  if (row.cover_failed === 1) record.coverFailed = true
  return record
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** 读旧 JSON；不存在 → null */
async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(await fs.readFile(path, 'utf-8')) as T
  } catch (err) {
    // 解析失败也要继续：把坏文件改名留档，迁移按空处理（不清掉用户数据）
    console.error(`[store] 旧文件 ${path} 解析失败，按空处理：${(err as Error).message}`)
    return null
  }
}

/** 旧文件改名留档（.migrated 后缀）；缺失/已留档/失败不阻塞迁移 */
async function renameAside(path?: string): Promise<void> {
  if (!path || !existsSync(path) || path.endsWith('.migrated')) return
  await fs.rename(path, `${path}.migrated`).catch(() => undefined)
}
