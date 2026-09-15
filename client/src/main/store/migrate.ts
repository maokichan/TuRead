/**
 * 存储迁移器（主进程）—— 把旧版数据搬进 **v3 全局单库**。
 * 依据：`client/docs/DATA_MODEL.md` §6.3 状态转移表。
 *
 * | # | 转移 | 本文对应 |
 * |---|---|---|
 * | T1 | 旧 JSON（`library.json`）→ SQLite | `migrateFromJson` |
 * | T2 | **多 `.db` → 全局单库**（v2 时代"一库一 .db"） | `migrateFromV2` |
 *
 * **纪律**：
 * - **幂等**：以 `meta.migrated_v3` 为标记，跑过一次就不再跑（防"迁移后删光书 → 从留档复活"）。
 * - **不删除旧数据**：旧 `.db` / 旧 JSON **原样留在磁盘上**（用户可回退旧版客户端），只写标记。
 * - **保留 id**：旧 `books.id` **原样作为 `editions.id`** → 笔记、封面文件名、阅读状态全部无需重映射；
 *   只有"同指纹在两库各有一份"时才需要归并（见下）。
 * - 失败不抛：迁移是**尽力而为**，坏文件跳过并记日志（启动不能因为一份旧文件而挂掉）。
 */
import { copyFileSync, existsSync, mkdirSync, promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { BookLocation, LibraryEntry } from '@core/domain/types'

/** 读 JSON；不存在/解析失败 → null（迁移是尽力而为，坏文件不当致命错误） */
async function readJsonFile<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(await fs.readFile(path, 'utf-8')) as T
  } catch (err) {
    console.error(`[store] 旧文件 ${path} 解析失败，按空处理：${(err as Error).message}`)
    return null
  }
}

/** 迁移完成标记（meta 表） */
const META_MIGRATED_V3 = 'migrated_v3'

/** 旧版 v2 引导文件形状（2026-09-13 落地：一库一 .db） */
interface V2Bootstrap {
  version?: number
  currentId?: string
  libraries?: Array<{
    id: string
    name: string
    dbPath?: string
    coversDir?: string
    mode?: 'source' | 'virtual'
    rootPath?: string
    legacyLibraryPath?: string
    legacyConfigPath?: string
  }>
}

/** 旧 JSON 书库形状（v1 时代） */
interface LegacyLibraryJson {
  books?: LegacyBook[]
  settings?: Record<string, unknown>
}

/** 旧 BookRecord（v1/v2 形状：阅读状态内嵌在书行里） */
interface LegacyBook {
  id: string
  fingerprint: { algorithm: string; hash: string; size: number }
  metadata?: { title?: string } & Record<string, unknown>
  format: string
  filePath: string
  createdAt: number
  lastReadAt?: number
  lastLocation?: BookLocation
  coverPath?: string
  coverFailed?: boolean
}

export interface MigrationInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
  coversDir: string
  bootstrapPath?: string
  legacyLibraryPath?: string
  legacyConfigPath?: string
}

export async function runMigrations(input: MigrationInput): Promise<void> {
  const { db } = input
  const done = db
    .prepare('SELECT value FROM meta WHERE key = ?')
    .get(META_MIGRATED_V3) as { value: string } | undefined
  /**
   * ⚠ **`'failed'` 视为"可重试"**（2026-09-15 修口径不一）：此前 `if (done) return` 会让
   * 标记一写就**再也不会重试**，而 `LibraryManager` 又特意保留旧引导文件"等下次重试"
   * （它只在 `migrationState() === 'failed'` 时不覆盖 config.json）—— 两边口径必须一致，
   * 否则用户看到的是"保留着旧文件，但永远不重试 = 书库永远空的"。
   */
  if (done && done.value !== 'failed') return

  const bootstrap = input.bootstrapPath
    ? await readJsonFile<V2Bootstrap>(input.bootstrapPath)
    : null

  let how = 'fresh'
  try {
    if (bootstrap && Array.isArray(bootstrap.libraries) && bootstrap.libraries.length > 0) {
      await migrateFromV2(input, bootstrap)
      how = 'from-v2'
    } else if (input.legacyLibraryPath && existsSync(input.legacyLibraryPath)) {
      await migrateFromJson(input, input.legacyLibraryPath, input.legacyConfigPath)
      how = 'from-json'
    }
  } catch (err) {
    // 迁移失败不阻塞启动：标记为 failed 让人能看出"没搬成功"，而不是静默假成功
    console.error(`[store] 迁移失败，按未迁移处理（旧数据未动）：${(err as Error).message}`)
    db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(
      META_MIGRATED_V3,
      'failed'
    )
    return
  }

  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(META_MIGRATED_V3, how)
  console.log(`[store] v3 迁移完成（${how}）`)
}

// ————————————————— T2：多 .db → 全局单库 —————————————————

async function migrateFromV2(input: MigrationInput, bootstrap: V2Bootstrap): Promise<void> {
  const { db } = input
  const Database = await loadBetterSqlite()
  const libs = bootstrap.libraries ?? []
  const currentId = bootstrap.currentId ?? libs[0]?.id
  /** 合并失败的旧库（**不阻断其余库**，最后统一抛出让本次迁移标记为可重试） */
  const failures: string[] = []

  for (let i = 0; i < libs.length; i++) {
    const lib = libs[i]
    try {
      const mode: LibraryEntry['mode'] = mapLibraryMode(lib.mode)
      db.prepare(
        `INSERT OR IGNORE INTO libraries (id, name, mode, root_path, sort, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(lib.id, lib.name || `書庫 ${i + 1}`, mode, lib.rootPath ?? null, i, Date.now())

      // 该旧库的数据源：优先它的 .db；不存在则退回更早的 JSON（用户可能从未启动过 SQLite 版）
      const oldDbPath = lib.dbPath
      if (oldDbPath && existsSync(oldDbPath)) {
        try {
          const old = new Database(oldDbPath, { readonly: true })
          try {
            mergeOldDb(db, old, lib.id, lib.coversDir, input.coversDir, lib.id === currentId)
          } finally {
            old.close()
          }
        } catch (err) {
          /**
           * 只读打不开时**退一步用读写句柄重试一次**（2026-09-15 用户事故的余波）：
           * 那次失败运行曾把旧的 `turead.db` 切成 **WAL 模式**；只读打开一个带 `-wal`
           * 但缺 `-shm` 的库在部分环境下会失败（SQLite 需要 `-shm` 才能读 WAL）。
           * 读写打开会让 SQLite 顺带**把 WAL 归并回主库**（一次 checkpoint）——
           * 旧文件的数据内容不变，只是完成收尾。第一次的写入按 id 幂等（INSERT OR IGNORE），
           * 所以"半途失败再重试"是安全的。
           */
          console.error(`[store] 只读打开旧库失败，改用读写句柄重试：${(err as Error).message}`)
          const old = new Database(oldDbPath, { fileMustExist: true })
          try {
            mergeOldDb(db, old, lib.id, lib.coversDir, input.coversDir, lib.id === currentId)
          } finally {
            old.close()
          }
        }
      } else if (lib.legacyLibraryPath && existsSync(lib.legacyLibraryPath)) {
        const json = await readJsonFile<LegacyLibraryJson>(lib.legacyLibraryPath)
        importBooks(db, lib.id, json?.books ?? [], 'import', input.coversDir, lib.coversDir)
        if (lib.id === currentId) importSettings(db, json?.settings ?? {})
      }
    } catch (err) {
      // 一个旧库读不动（损坏/WAL 锁/权限）不该让**其余库**也迁不进来 ——
      // 先把能救的救回来，最后统一报失败。写入按 id 幂等（INSERT OR IGNORE），重试安全。
      const detail = `${lib.id}（${lib.name || '未命名'}）${lib.dbPath ? ` @ ${lib.dbPath}` : ''}：${(err as Error).message}`
      failures.push(detail)
      console.error(`[store] 旧库合并失败，已跳过（原文件未动）：${detail}`)
    }
  }

  // ⚠ **有失败就不要 renameAside** —— 旧引导文件是下次重试的唯一线索（`libraries[]` 在里面）；
  // 改名留档 + 抛出让 `meta='failed'`（可重试）配合，形成"保留线索 → 下次再来"的闭环。
  if (failures.length > 0) {
    throw new Error(
      `${failures.length} 个旧库未能合并（其余已迁入；原文件均未改动，下次启动会重试）：\n` +
        failures.join('\n')
    )
  }

  // 旧引导文件改名留档：**不删除**（用户可回退旧版；且旧 .db 仍在磁盘上）
  await renameAside(input.bootstrapPath)
}

/**
 * 合并一个旧 v2 库（books / containers / container_books / notes / settings）进全局库。
 *
 * ⚠ **同指纹归并**：v2 里同一本书可以在两个库各有一行（各自 uuid）。v3 的 `editions` 指纹唯一，
 * 所以第二个库遇到同指纹时**不新增 edition**，而是把它的笔记/阅读状态**并到既有 edition**上
 * （这正是"跨库共享天然成立"的迁移落点）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mergeOldDb(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  old: any,
  libraryId: string,
  oldCoversDir: string | undefined,
  targetCoversDir: string,
  isCurrent: boolean
): void {
  // ① 书箱（旧 kind='source' 的行从未被写入过，一律按用户自建箱处理）
  const containers = safeAll(old, 'SELECT * FROM containers')
  for (const c of containers) {
    db.prepare(
      `INSERT OR IGNORE INTO containers (id, library_id, parent_id, name, sort, collapsed)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      c.id as string,
      libraryId,
      (c.parent_id as string | null) ?? null,
      (c.name as string) ?? '書箱',
      (c.sort as number) ?? 0,
      (c.collapsed as number) ?? 0
    )
  }

  // ② 书箱成员关系：book_id（旧）→ container_id
  const memberOf = new Map<string, string>()
  for (const cb of safeAll(old, 'SELECT * FROM container_books')) {
    memberOf.set(cb.book_id as string, cb.container_id as string)
  }

  // ③ 书 → edition + holding（**保留旧 id 作为 edition id**）
  const idMap = new Map<string, string>() // 旧 book_id → 全局 edition_id
  const books = safeAll(old, 'SELECT * FROM books')
  for (const b of books) {
    const p = legacyRowToEditionParams(b)
    const oldId = p.id
    const existing = db
      .prepare('SELECT id FROM editions WHERE fp_algo = ? AND fp_hash = ? AND fp_size = ?')
      .get(p.fingerprint.algorithm, p.fingerprint.hash, p.fingerprint.size) as
      | { id: string }
      | undefined

    let editionId: string
    if (existing) {
      editionId = existing.id // 同内容已在别的库出现过 → 复用（跨库共享）
    } else {
      editionId = oldId
      const workId = ensureWork(db, p.work?.protocol ?? null, p.work?.code ?? null)
      db.prepare(
        `INSERT OR IGNORE INTO editions
           (id, work_id, fp_algo, fp_hash, fp_size, format, title, metadata, file_path,
            cover_path, cover_failed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        editionId,
        workId,
        p.fingerprint.algorithm,
        p.fingerprint.hash,
        p.fingerprint.size,
        p.format,
        p.title,
        p.metadata,
        p.filePath,
        p.coverPath,
        p.coverFailed,
        p.createdAt
      )
      copyCover(oldCoversDir, targetCoversDir, p.coverPath)
    }
    idMap.set(oldId, editionId)

    // 收录
    const filePath = p.filePath
    db.prepare(
      `INSERT OR IGNORE INTO holdings
         (library_id, edition_id, container_id, origin, path, parent_path, missing, sort, added_at)
       VALUES (?, ?, ?, 'import', ?, ?, 0, ?, ?)`
    ).run(
      libraryId,
      editionId,
      memberOf.get(oldId) ?? null,
      filePath,
      normalizeDir(dirname(filePath)),
      (b.sort as number) ?? 0,
      Date.now()
    )

    // 阅读状态（v2 是书行内嵌列 → v3 拆表）：同内容多条时**取最近的那条**
    const prevState = legacyRowToReadingState(b)
    if (prevState) {
      const prev = db
        .prepare('SELECT last_read_at FROM reading_state WHERE edition_id = ?')
        .get(editionId) as { last_read_at: number | null } | undefined
      if (!prev || (prevState.lastReadAt ?? 0) >= (prev.last_read_at ?? 0)) {
        db.prepare(
          `INSERT OR REPLACE INTO reading_state (edition_id, last_read_at, last_location, total_read_ms)
           VALUES (?, ?, ?, COALESCE((SELECT total_read_ms FROM reading_state WHERE edition_id = ?), 0))`
        ).run(editionId, prevState.lastReadAt, prevState.lastLocation, editionId)
      }
    }
  }

  // ④ 笔记：book_id → edition_id（同指纹归并后可能改指到既有 edition）
  for (const n of safeAll(old, 'SELECT * FROM notes')) {
    const editionId = idMap.get(n.book_id as string) ?? (n.book_id as string)
    db.prepare(
      `INSERT OR IGNORE INTO notes
         (id, edition_id, owner, kind, chapter_index, anchor_key, anchor_hint, color, excerpt, body, ink, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      n.id as string,
      editionId,
      (n.owner as string | null) ?? null,
      (n.kind as string) ?? 'highlight',
      (n.chapter_index as number) ?? 0,
      (n.anchor_key as string) ?? '',
      (n.anchor_hint as string) ?? '',
      (n.color as string | null) ?? null,
      (n.excerpt as string) ?? '',
      (n.body as string) ?? '',
      (n.ink as string | null) ?? null,
      (n.created_at as number) ?? Date.now(),
      (n.updated_at as number) ?? Date.now()
    )
  }

  // ⑤ 设置：**只取旧"当前库"的设置**（v3 设置全局唯一 —— 多库各有一套时以现在在用的那套为准）
  if (isCurrent) {
    const settings: Record<string, unknown> = {}
    for (const s of safeAll(old, 'SELECT key, value FROM settings')) {
      settings[s.key as string] = safeParse(s.value as string)
    }
    importSettings(db, settings)
  }
}

// ————————————————— T1：旧 JSON → 全局单库 —————————————————

async function migrateFromJson(
  input: MigrationInput,
  libraryJsonPath: string,
  configJsonPath?: string
): Promise<void> {
  const { db } = input
  const json = await readJsonFile<LegacyLibraryJson>(libraryJsonPath)
  const config = configJsonPath ? await readJsonFile<{ settings?: Record<string, unknown> }>(configJsonPath) : null

  db.prepare(
    'INSERT OR IGNORE INTO libraries (id, name, mode, root_path, sort, created_at) VALUES (?, ?, ?, NULL, 0, ?)'
  ).run('default', '書庫', 'curated', Date.now())

  importBooks(
    db,
    'default',
    json?.books ?? [],
    'import',
    input.coversDir,
    join(dirname(libraryJsonPath), 'covers')
  )
  importSettings(db, { ...(json?.settings ?? {}), ...(config?.settings ?? {}) })
  await renameAside(libraryJsonPath)
  await renameAside(configJsonPath)
}

/** 旧 JSON books[] → editions + holdings（+ 阅读状态） */
function importBooks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  libraryId: string,
  books: LegacyBook[],
  origin: 'scan' | 'import',
  targetCoversDir: string,
  oldCoversDir?: string
): void {
  for (const b of books) {
    if (!b?.id || !b.fingerprint) continue
    // 与 v2 路径共用同一套映射（`legacyRowToEditionParams` 同时认下划线/驼峰两种旧形状）
    const p = legacyRowToEditionParams(b as unknown as Record<string, unknown>)
    const existing = db
      .prepare('SELECT id FROM editions WHERE fp_algo = ? AND fp_hash = ? AND fp_size = ?')
      .get(p.fingerprint.algorithm, p.fingerprint.hash, p.fingerprint.size) as
      | { id: string }
      | undefined
    const editionId = existing?.id ?? p.id
    if (!existing) {
      db.prepare(
        `INSERT OR IGNORE INTO editions
           (id, work_id, fp_algo, fp_hash, fp_size, format, title, metadata, file_path,
            cover_path, cover_failed, created_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        editionId,
        p.fingerprint.algorithm,
        p.fingerprint.hash,
        p.fingerprint.size,
        p.format,
        p.title,
        p.metadata,
        p.filePath,
        p.coverPath,
        p.coverFailed,
        p.createdAt
      )
      copyCover(oldCoversDir, targetCoversDir, p.coverPath)
    }
    db.prepare(
      `INSERT OR IGNORE INTO holdings
         (library_id, edition_id, container_id, origin, path, parent_path, missing, sort, added_at)
       VALUES (?, ?, NULL, ?, ?, ?, 0, 0, ?)`
    ).run(libraryId, editionId, origin, p.filePath, normalizeDir(dirname(p.filePath)), Date.now())

    const prevState = legacyRowToReadingState(b as unknown as Record<string, unknown>)
    if (prevState) {
      db.prepare(
        `INSERT OR REPLACE INTO reading_state (edition_id, last_read_at, last_location, total_read_ms)
         VALUES (?, ?, ?, COALESCE((SELECT total_read_ms FROM reading_state WHERE edition_id = ?), 0))`
      ).run(editionId, prevState.lastReadAt, prevState.lastLocation, editionId)
    }
  }
}

/** 旧设置 → 全局 settings（JSON 值原样透传；v3 起无库级设置） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function importSettings(db: any, settings: Record<string, unknown>): void {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) continue
    stmt.run(key, JSON.stringify(value))
  }
}

/** work 身份：旧列（此前恒 NULL）非空时补一条 works 行 —— 接口就位后可写（D11/F9） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ensureWork(db: any, protocol: string | null, code: string | null): string | null {
  if (!protocol || !code) return null
  const found = db
    .prepare('SELECT id FROM works WHERE protocol = ? AND code = ?')
    .get(protocol, code) as { id: string } | undefined
  if (found) return found.id
  const id = randomUUID()
  db.prepare('INSERT INTO works (id, protocol, code, title, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    protocol,
    code,
    '',
    Date.now()
  )
  return id
}

/** 封面文件搬进全局 covers 目录（文件名 = `<旧 bookId>.<ext>`，与 edition id 一致，故只复制不改名） */
function copyCover(oldDir: string | undefined, targetDir: string, coverPath: string | null): void {
  if (!oldDir || !coverPath) return
  const from = join(oldDir, coverPath)
  const to = join(targetDir, coverPath)
  if (!existsSync(from) || existsSync(to) || from === to) return
  try {
    mkdirSync(targetDir, { recursive: true })
    copyFileSync(from, to)
  } catch {
    /* 封面缺失不影响数据正确性：UI 回落"文字封面" */
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeAll(db: any, sql: string): Record<string, unknown>[] {
  try {
    return db.prepare(sql).all() as Record<string, unknown>[]
  } catch {
    return [] // 旧库缺表/结构异常 → 该步跳过（尽力而为）
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadBetterSqlite(): Promise<any> {
  const mod = await import('better-sqlite3')
  return (mod as unknown as { default: unknown }).default
}

async function renameAside(path?: string): Promise<void> {
  if (!path || !existsSync(path) || path.endsWith('.migrated')) return
  await fs.rename(path, `${path}.migrated`).catch(() => undefined)
}

/**
 * 父目录归一（**导出供单测**）：去尾分隔符 + 统一为反斜杠（Windows 主导）。
 * ⚠ 只做这个程度 —— **不做大小写归一**（已知边界，登记在 `TODO.md` 工程组的规模条目里）。
 */
export function normalizeDir(p: string | null | undefined): string | null {
  if (p == null) return null
  return p.replace(/[\\/]+$/, '').replace(/\//g, '\\')
}

/**
 * 旧库模式 → v3 模式（**导出供单测**）。
 * `'source'`（旧：虚拟映射/跟踪真实文件夹）→ **`'mapped'`**；其余与缺省 → **`'curated'`**。
 * 术语改名的理由见 `DATA_MODEL.md` §6.2（旧的 `'source'|'virtual'` 一读就错）。
 */
export function mapLibraryMode(mode?: string): LibraryEntry['mode'] {
  return mode === 'source' ? 'mapped' : 'curated'
}

/** 旧行 → v3 edition 行参数（**纯函数，导出供单测**） */
export interface LegacyEditionParams {
  id: string
  fingerprint: { algorithm: string; hash: string; size: number }
  format: string
  title: string
  metadata: string
  filePath: string
  coverPath: string | null
  coverFailed: number
  createdAt: number
  /** 旧 `work_protocol`/`work_code` 列（历史上恒 NULL）——非空时迁移成 works 行 */
  work: { protocol: string; code: string } | null
}

/**
 * 把一条旧书行（v2 `books` 表行 **或** v1 `library.json` 的 books[] 项）映射成 v3 的 edition 参数。
 * 两种旧形状的列名不同（下划线 vs 驼峰），故统一在这里读 —— 这是迁移最容易写错的一段，
 * 抽成纯函数就是为了能被单测钉住。
 */
export function legacyRowToEditionParams(row: Record<string, unknown>): LegacyEditionParams {
  const fp = row.fingerprint as LegacyBook['fingerprint'] | undefined
  const metadata = row.metadata
  const protocol = (row.work_protocol as string | null) ?? null
  const code = (row.work_code as string | null) ?? null
  const meta = row.meta as { title?: string } | undefined
  return {
    id: (row.id as string) ?? '',
    fingerprint: {
      algorithm: fp?.algorithm ?? (row.fp_algo as string) ?? 'md5-sample3-v1',
      hash: fp?.hash ?? (row.fp_hash as string) ?? '',
      size: fp?.size ?? (row.fp_size as number) ?? 0
    },
    format: (row.format as string) ?? '',
    title:
      (row.title as string) ??
      (metadata as { title?: string } | undefined)?.title ??
      meta?.title ??
      '',
    metadata:
      typeof metadata === 'string'
        ? metadata
        : JSON.stringify(metadata ?? { title: (row.title as string) ?? '' }),
    filePath: (row.file_path as string) ?? (row.filePath as string) ?? '',
    coverPath: (row.cover_path as string | null) ?? (row.coverPath as string | null) ?? null,
    coverFailed: (row.cover_failed as number) ?? (row.coverFailed ? 1 : 0),
    createdAt: (row.created_at as number) ?? (row.createdAt as number) ?? Date.now(),
    work: protocol && code ? { protocol, code } : null
  }
}

/**
 * 旧行里的阅读状态（v2 是书行内嵌列 `last_read_at`/`last_location`，v1 JSON 是驼峰）→ v3 拆表后的值。
 * 都没有 → `null`（不必写 `reading_state` 行）。
 */
export function legacyRowToReadingState(
  row: Record<string, unknown>
): { lastReadAt: number | null; lastLocation: string | null } | null {
  const lastReadAt = (row.last_read_at as number | null) ?? (row.lastReadAt as number | null) ?? null
  const rawLoc = row.last_location ?? row.lastLocation
  const lastLocation =
    typeof rawLoc === 'string' ? rawLoc : rawLoc ? JSON.stringify(rawLoc) : null
  if (lastReadAt == null && !lastLocation) return null
  return { lastReadAt, lastLocation }
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
