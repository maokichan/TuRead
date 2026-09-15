/**
 * dev-only 夹具：**T1/T2 存储迁移的端到端真链路验证**（`DATA_MODEL.md` §6.3 状态转移表）。
 *
 * 三个模式（`TUREAD_DEV_MIGRATE`）：
 *   `fixture` —— 在 `TUREAD_USER_DATA` 造一份 **v1/v2 时代**的 userData：v1 引导文件
 *                （`config.json` 带 `libraries[]`）+ 两个**旧 v2 schema** 的 `.db`
 *                （同指纹跨库一本、各库独有各一本、书箱/成员/笔记/设置/阅读状态俱全）。
 *   `json`    —— 造 **T1（v1 JSON 时代）**：旧"设置文件"形状的 `config.json`（无 `libraries`）
 *                + `library.json`（books/settings），逼 `migrateFromJson` 跑。
 *   `verify`  —— 走**真实启动路径**（`LibraryManager.init()` = `main/index.ts` 同一行调用）让迁移发生，
 *                再用 `SqliteStore` 公共读方法 + 一条**只读** better-sqlite3 连接断言迁移结果，
 *                最后重开一次确认**幂等**。
 *
 * 为什么必须在 Electron 里跑（不能进 vitest）：`better-sqlite3` 在本机是按 **Electron ABI** 重建的
 * （`npm run rebuild:sqlite`），普通 Node 进程加载不了 —— 与 `dev/sqliteSpike.ts` 同一条理由。
 * 分工口径：单测（`store/migrate.test.ts`）钉纯函数，这里验链路。
 *
 * 纪律：只在 `TUREAD_DEV_MIGRATE` 置位时才由 `main/index.ts` 调用 —— env 缺省时本文件完全不参与启动。
 * `TUREAD_USER_DATA` 必须显式给出（否则夹具会写进真实书库，这里直接判失败）。
 * 边界：夹具只清自己写的文件（`config.json*` / `library.json*` / `turead.db*` / `store.db*` / `lib-*.db*` / covers-*），
 * 不碰 Chromium 在 userData 下的其它产物。
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EditionRecord, Holding } from '@core/domain/types'
import { LibraryManager } from '../store/libraryManager'
import type { SqliteStore } from '../store/sqliteStore'

type Db = import('better-sqlite3').Database
type DatabaseCtor = typeof import('better-sqlite3')

/** 断言日志前缀（与探针的 `[TUREAD-TEST-*]` 约定同源，便于外部 grep） */
const SCOPE = 'migrate'
/** `TUREAD_DEV_MIGRATE` 的合法取值 */
const MODES = ['fixture', 'json', 'verify'] as const

// ————————————— 夹具常量（fixture 与 verify 共用，避免两边期望漂移）—————————————

const FP_ALGO = 'md5-sample3-v1'
/** 跨库同指纹（两库各一行 `books`、id 不同 → 迁移后只准剩一条 edition） */
const SHARED_HASH = 'fixture-shared-hash'
const SHARED_SIZE = 4242
/** 固定时间戳：`reading_state` 的"取最近"要有确定判据 */
const T_CREATED = 1_760_000_000_000
const T_READ_OLD = 1_760_000_100_000 // default 库读共有书的时间（旧）
const T_READ_NEW = 1_760_000_900_000 // lib-b 库读同一本书的时间（新 → 迁移后应以它为准）
const T_READ_A_ONLY = 1_760_000_500_000
/** 映射库的 rootPath（断言"原样保留"） */
const MAPPED_ROOT = 'D:\\mapped\\ebooks'
/** 共有书在两个库里的落地文件（各库自己的路径 —— holdings.path 各留各的，只并 edition） */
const SHARED_FILE_A = 'C:/books/shared/two-libs.epub'
const SHARED_FILE_B = 'D:/media/ebooks/two-libs.epub'
/** T1（旧 JSON）里的阅读时间 */
const T_JSON_READ = 1_700_000_100_000

/** 旧 v2 建表语句：重构前 `client/src/main/store/sqliteStore.ts` 的 SCHEMA_SQL（`git show HEAD:` 抄录） */
const OLD_V2_SCHEMA = `
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

// ————————————— 夹具形状 —————————————

interface OldBook {
  id: string
  title: string
  format: string
  fpHash: string
  fpSize: number
  filePath: string
  createdAt: number
  lastReadAt?: number | null
  /** 旧库列里存的就是 JSON 文本 */
  lastLocation?: string | null
}

interface OldLibrarySpec {
  id: string
  name: string
  /** 旧词汇：'source'（映射）/ 'virtual'（自建）；缺省 = 旧版迁移库 */
  mode?: string
  rootPath?: string
  coversDir: string
  dbPath: string
  books: OldBook[]
  containers: Array<{ id: string; name: string; sort: number; collapsed: number }>
  members: Array<{ containerId: string; bookId: string; sort: number }>
  notes: Array<{ id: string; bookId: string; chapterIndex: number; excerpt: string; body: string }>
  /** 旧 `settings` 表是 key → JSON 文本（迁移器 safeParse 后再 stringify） */
  settings: Record<string, string>
}

/** v1/v2 时代夹具的完整描述（写盘与断言共用同一份） */
function v2Scenario(userDataDir: string): { currentId: string; libs: OldLibrarySpec[] } {
  return {
    currentId: 'default',
    libs: [
      {
        id: 'default',
        name: '預設書庫',
        mode: 'virtual',
        coversDir: join(userDataDir, 'covers-default'),
        /**
         * ⚠ **必须是 `turead.db`（= 旧版默认库的真实文件名）**，这是 2026-09-15 用户实测事故的
         * 复现条件：旧版 `LibraryManager` 给默认库的 `dbPath` 就是 `<userData>/turead.db`，
         * 而它里面是**旧 v2 schema**。全局库若也落在同一路径，`CREATE TABLE IF NOT EXISTS`
         * 会静默跳过旧表，紧接着新列索引以 `no such column: library_id` 炸掉。
         * （早先夹具把它命名成 `lib-default.db`，恰好绕开了这个碰撞 —— 于是漏掉了这个 bug。）
         */
        dbPath: join(userDataDir, 'turead.db'),
        books: [
          {
            id: 'book-shared-a',
            title: '兩庫共有的書',
            format: 'EPUB',
            fpHash: SHARED_HASH,
            fpSize: SHARED_SIZE,
            filePath: SHARED_FILE_A,
            createdAt: T_CREATED,
            lastReadAt: T_READ_OLD,
            lastLocation: '{"chapterDocIndex":1,"page":0}'
          },
          {
            id: 'book-a-only',
            title: '只屬預設庫的書',
            format: 'PDF',
            fpHash: 'fixture-hash-a-only',
            fpSize: 1111,
            filePath: 'C:/books/shelf-a/a-only.pdf',
            createdAt: T_CREATED + 1,
            lastReadAt: T_READ_A_ONLY,
            lastLocation: '{"chapterDocIndex":2,"page":4}'
          }
        ],
        containers: [{ id: 'c-default', name: '預設書箱', sort: 0, collapsed: 0 }],
        members: [{ containerId: 'c-default', bookId: 'book-shared-a', sort: 0 }],
        notes: [
          {
            id: 'n-a-shared',
            bookId: 'book-shared-a',
            chapterIndex: 1,
            excerpt: '預設庫在共有書上的划線',
            body: ''
          },
          {
            id: 'n-a-only',
            bookId: 'book-a-only',
            chapterIndex: 2,
            excerpt: '只在預設庫那本書上的划線',
            body: '批注'
          }
        ],
        settings: { theme: '"dark"', fontSize: '16' }
      },
      {
        id: 'lib-b',
        name: '映射書庫',
        mode: 'source',
        rootPath: MAPPED_ROOT,
        coversDir: join(userDataDir, 'covers-b'),
        dbPath: join(userDataDir, 'lib-b.db'),
        books: [
          {
            id: 'book-shared-b',
            title: '兩庫共有的書',
            format: 'EPUB',
            fpHash: SHARED_HASH,
            fpSize: SHARED_SIZE,
            filePath: SHARED_FILE_B,
            createdAt: T_CREATED + 2,
            lastReadAt: T_READ_NEW,
            lastLocation: '{"chapterDocIndex":7,"page":3}'
          },
          {
            id: 'book-b-only',
            title: '只屬映射庫的書',
            format: 'MOBI',
            fpHash: 'fixture-hash-b-only',
            fpSize: 2222,
            filePath: 'D:/mapped/sub/b-only.mobi',
            createdAt: T_CREATED + 3,
            // 只有位置没有时间：`reading_state` 该有行、last_read_at 为 NULL
            lastReadAt: null,
            lastLocation: '{"chapterDocIndex":0,"page":5}'
          }
        ],
        containers: [{ id: 'c-b', name: '映射書箱', sort: 0, collapsed: 0 }],
        members: [{ containerId: 'c-b', bookId: 'book-shared-b', sort: 0 }],
        notes: [
          {
            id: 'n-b-shared',
            bookId: 'book-shared-b',
            chapterIndex: 3,
            excerpt: '映射庫在共有書上的划線',
            body: ''
          },
          {
            id: 'n-b-only',
            bookId: 'book-b-only',
            chapterIndex: 0,
            excerpt: '只在映射庫那本書上的划線',
            body: ''
          }
        ],
        settings: { theme: '"light"', libOnlyKey: '{"x":1}' }
      }
    ]
  }
}

/** T1 的 `library.json.books[]`：v1 形状 = 驼峰 + 内嵌 fingerprint 对象 */
const JSON_BOOKS = [
  {
    id: 'json-book-1',
    fingerprint: { algorithm: FP_ALGO, hash: 'fixture-json-h1', size: 3333 },
    metadata: { title: '舊 JSON 書一' },
    format: 'EPUB',
    filePath: 'C:/legacy/json-book-1.epub',
    createdAt: 1_700_000_000_000,
    lastReadAt: T_JSON_READ,
    lastLocation: { chapterDocIndex: 1, page: 2 }
  },
  {
    id: 'json-book-2',
    fingerprint: { algorithm: FP_ALGO, hash: 'fixture-json-h2', size: 4444 },
    metadata: { title: '舊 JSON 書二' },
    format: 'PDF',
    filePath: 'D:/legacy/sub/json-book-2.pdf',
    createdAt: 1_700_000_001_000
  },
  {
    id: 'json-book-3',
    fingerprint: { algorithm: FP_ALGO, hash: 'fixture-json-h3', size: 5555 },
    metadata: { title: '舊 JSON 書三' },
    format: 'MOBI',
    filePath: 'C:/legacy/json-book-3.mobi',
    createdAt: 1_700_000_002_000
  }
]

/** 旧 `library.json` 内嵌设置（同名键被 config.json 的设置覆盖） */
const JSON_LIBRARY_SETTINGS = { fontSize: 18 }
/** T1 里的 config.json 只是"设置文件"（无 libraries 数组）—— 这份设置同样必须搬进库、文件必须留档 */
const JSON_CONFIG_FILE = { version: 1, settings: { theme: 'sepia', configOnlyKey: 42 } }

// ————————————— 入口 —————————————

export async function runMigrateFixture(mode: string): Promise<void> {
  if (!(MODES as readonly string[]).includes(mode)) {
    console.error(`[${SCOPE}] TUREAD_DEV_MIGRATE='${mode}' 不认识（合法值：${MODES.join(' | ')}）`)
    process.exitCode = 1
    return
  }
  const userDataDir = process.env['TUREAD_USER_DATA']
  if (!userDataDir) {
    // 夹具会**清空并重写**目标目录里的库文件 —— 没有显式目录就绝不动手（防写进真实书库）
    console.error(`[${SCOPE}] 必须同时给 TUREAD_USER_DATA=<临时目录>（防夹具写进真实书库）`)
    process.exitCode = 1
    return
  }
  mkdirSync(userDataDir, { recursive: true })

  try {
    if (mode === 'verify') {
      process.exitCode = await runVerify(userDataDir)
      return
    }
    if (mode === 'fixture') buildV2Fixture(userDataDir, await loadDatabase())
    else buildJsonFixture(userDataDir)
    console.log(`[TUREAD-TEST-OK][${SCOPE}] 夹具已就绪（${mode}，userData=${userDataDir}）`)
    process.exitCode = 0
  } catch (err) {
    console.error(`[TUREAD-TEST-FAIL][${SCOPE}] ${(err as Error).message}`)
    process.exitCode = 1
  }
}

// ————————————— 造夹具 —————————————

/** 清掉夹具自己的历史产物（含上次 verify 留下的全局库 —— 否则第二次 verify 会对着旧库断言） */
function resetFixtureFiles(userDataDir: string): void {
  const files = [
    'config.json',
    'config.json.migrated',
    'library.json',
    'library.json.migrated',
    'turead.db',
    'turead.db-wal',
    'turead.db-shm',
    // v3 全局库（**不能叫 turead.db** —— 那是旧默认库的文件名，见 libs[0].dbPath 的注释）
    'store.db',
    'store.db-wal',
    'store.db-shm',
    'lib-default.db',
    'lib-default.db-wal',
    'lib-default.db-shm',
    'lib-b.db',
    'lib-b.db-wal',
    'lib-b.db-shm'
  ]
  const dirs = ['covers', 'covers-default', 'covers-b']
  for (const f of files) rmSync(join(userDataDir, f), { force: true })
  for (const d of dirs) rmSync(join(userDataDir, d), { recursive: true, force: true })
}

function shortName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

function buildV2Fixture(userDataDir: string, Database: DatabaseCtor): void {
  resetFixtureFiles(userDataDir)
  const scenario = v2Scenario(userDataDir)

  for (const lib of scenario.libs) {
    writeOldDb(Database, lib)
    mkdirSync(lib.coversDir, { recursive: true })
  }

  // v1 引导文件：{ version: 1, libraries: [...], currentId }（旧 LibraryManager 的形状）
  const bootstrap = {
    version: 1,
    currentId: scenario.currentId,
    libraries: scenario.libs.map((l) => ({
      id: l.id,
      name: l.name,
      dbPath: l.dbPath,
      coversDir: l.coversDir,
      ...(l.mode ? { mode: l.mode } : {}),
      ...(l.rootPath ? { rootPath: l.rootPath } : {})
    }))
  }
  writeFileSync(join(userDataDir, 'config.json'), JSON.stringify(bootstrap, null, 2), 'utf-8')

  console.log(`[${SCOPE}] 夹具目录：${userDataDir}`)
  console.log(
    `[${SCOPE}] config.json（v1 引导文件）：libraries=${scenario.libs.length}，currentId=${scenario.currentId}`
  )
  for (const lib of scenario.libs) {
    const mode = lib.mode ? `'${lib.mode}' → ${lib.mode === 'source' ? 'mapped' : 'curated'}` : '缺省 → curated'
    console.log(
      `[${SCOPE}]   - ${lib.id}（${lib.name}）mode=${mode}` +
        `${lib.rootPath ? ` rootPath=${lib.rootPath}` : ''} db=${shortName(lib.dbPath)}`
    )
    console.log(
      `[${SCOPE}]     ${shortName(lib.dbPath)}（旧 v2 schema）：books=${lib.books.length}` +
        ` containers=${lib.containers.length} members=${lib.members.length}` +
        ` notes=${lib.notes.length} settings=${Object.keys(lib.settings).length}` +
        ` 共有指纹书=${lib.books.find((b) => b.fpHash === SHARED_HASH)?.id ?? '无'}`
    )
  }
  console.log(
    `[${SCOPE}] 期望迁移结果：libraries=2 editions=3（同指纹只留 1 条）holdings=4 notes=4 reading_state=3`
  )
}

function buildJsonFixture(userDataDir: string): void {
  resetFixtureFiles(userDataDir)
  writeFileSync(join(userDataDir, 'config.json'), JSON.stringify(JSON_CONFIG_FILE, null, 2), 'utf-8')
  writeFileSync(
    join(userDataDir, 'library.json'),
    JSON.stringify({ books: JSON_BOOKS, settings: JSON_LIBRARY_SETTINGS }, null, 2),
    'utf-8'
  )
  console.log(`[${SCOPE}] 夹具目录：${userDataDir}`)
  console.log(
    `[${SCOPE}] config.json（v0 旧设置文件，无 libraries 数组）：settings=${Object.keys(JSON_CONFIG_FILE.settings).join(',')}`
  )
  console.log(
    `[${SCOPE}] library.json（v1 JSON 书库）：books=${JSON_BOOKS.length} settings=${Object.keys(JSON_LIBRARY_SETTINGS).join(',')}`
  )
  console.log(`[${SCOPE}] 期望迁移结果：libraries=1 editions=3 holdings=3 reading_state=1 notes=0`)
}

/** 按**旧 v2 schema** 落一个 `.db`（真实旧库就是这些表/列；迁移器的 SELECT 全对着它们） */
function writeOldDb(Database: DatabaseCtor, spec: OldLibrarySpec): void {
  const db = new Database(spec.dbPath)
  db.exec(OLD_V2_SCHEMA)
  const insBook = db.prepare(
    `INSERT INTO books (id, title, format, fp_algo, fp_hash, fp_size, file_path, cover_path,
       cover_failed, work_protocol, work_code, last_read_at, last_location, created_at, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, NULL, ?, ?, ?, ?)`
  )
  const insContainer = db.prepare(
    `INSERT INTO containers (id, parent_id, kind, name, paths, collapsed, sort)
     VALUES (?, NULL, 'user', ?, NULL, ?, ?)`
  )
  const insMember = db.prepare(
    'INSERT INTO container_books (container_id, book_id, sort) VALUES (?, ?, ?)'
  )
  const insNote = db.prepare(
    `INSERT INTO notes (id, book_id, owner, kind, chapter_index, anchor_key, anchor_hint, color,
       excerpt, body, ink, created_at, updated_at)
     VALUES (?, ?, NULL, 'highlight', ?, ?, '', NULL, ?, ?, NULL, ?, ?)`
  )
  const insSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
  const tx = db.transaction(() => {
    for (const b of spec.books) {
      insBook.run(
        b.id,
        b.title,
        b.format,
        FP_ALGO,
        b.fpHash,
        b.fpSize,
        b.filePath,
        b.lastReadAt ?? null,
        b.lastLocation ?? null,
        b.createdAt,
        JSON.stringify({ title: b.title })
      )
    }
    for (const c of spec.containers) insContainer.run(c.id, c.name, c.collapsed, c.sort)
    for (const m of spec.members) insMember.run(m.containerId, m.bookId, m.sort)
    for (const n of spec.notes) {
      insNote.run(
        n.id,
        n.bookId,
        n.chapterIndex,
        `p:${n.chapterIndex}:0`,
        n.excerpt,
        n.body,
        T_CREATED,
        T_CREATED
      )
    }
    for (const [key, value] of Object.entries(spec.settings)) insSetting.run(key, value)
    // 旧库自己的迁移标记（旧的 `migrated_v1`，与 v3 的 `migrated_v3` 互不干扰）
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('migrated_v1', 'json')
  })
  tx()
  db.close()
}

async function loadDatabase(): Promise<DatabaseCtor> {
  // 动态 import：ABI 不匹配要在可行动的位置炸（同 sqliteSpike / migrate.ts）
  const mod = await import('better-sqlite3')
  return (mod as unknown as { default: DatabaseCtor }).default
}

// ————————————— 验证（真实迁移路径 + 只读断言）—————————————

/** 走真实启动路径跑迁移，再断言结果；返回 0 = 全过 */
async function runVerify(userDataDir: string): Promise<number> {
  const checks = new Checks()
  const Database = await loadDatabase()
  if (
    !existsSync(join(userDataDir, 'config.json')) &&
    !existsSync(join(userDataDir, 'config.json.migrated'))
  ) {
    checks.fail('夹具不存在（先跑 TUREAD_DEV_MIGRATE=fixture 或 json）', userDataDir)
    return checks.finish()
  }

  // ① 真实启动路径：`LibraryManager.init()` —— 与 main/index.ts 里那次调用完全同一段代码
  const lm = new LibraryManager(userDataDir)
  await lm.init()
  const store = lm.store
  const dbPath = store.describeDbPath()

  const state = store.migrationState()
  const kind = state === 'from-v2' ? 'v2' : state === 'from-json' ? 'json' : null
  checks.ok(kind !== null, 'meta.migrated_v3 ∈ {from-v2, from-json}', `实际=${state}`)
  console.log(`[${SCOPE}] 迁移路径跑完：meta.migrated_v3=${state}，全局库=${dbPath}`)

  const raw = new Database(dbPath, { readonly: true, fileMustExist: true })
  let before: Record<string, unknown>
  try {
    if (kind === 'v2') await checkV2(checks, userDataDir, store, raw)
    else if (kind === 'json') await checkJson(checks, userDataDir, store, raw)
    else checks.fail('无法判定夹具类型（meta.migrated_v3 不是 from-*）')
    before = snapshot(raw)
  } finally {
    raw.close()
  }

  // ② 幂等：关掉再按真实路径重开一次（此时 config.json 已是 v2 引导文件，迁移器拿不到旧线索）
  store.close()
  const lm2 = new LibraryManager(userDataDir)
  await lm2.init()
  checks.eq(lm2.store.migrationState(), state, '二次启动 meta.migrated_v3 不变')
  const raw2 = new Database(lm2.store.describeDbPath(), { readonly: true, fileMustExist: true })
  try {
    checks.eq(snapshot(raw2), before, '二次启动后各表行数/关键值不变（幂等）')
  } finally {
    raw2.close()
  }

  // ③ 附加段：store 侧"重复导入/重扫不许破坏数据"的不变量（非迁移断言）。
  // 会往库里写探针行（新库/新箱/新书），所以必须放在迁移断言与幂等快照**之后**。
  await checkStoreInvariants(checks, lm2.store)
  lm2.store.close()

  return checks.finish()
}

/**
 * 附加段（2026-09-15 加，非迁移断言）：把 store 的两条不变量钉住 ——
 * ① `addHolding(containerId: null)`（重扫/重复导入常这么调）**不许**把书从書箱里挪出去；
 * ② 同指纹重复 `upsertEdition` 复用既有 edition（v3 指纹唯一，不许新增行）。
 */
async function checkStoreInvariants(checks: Checks, store: SqliteStore): Promise<void> {
  const lib = await store.createLibrary({ name: '探针書庫', mode: 'curated' })
  const container = await store.createContainer({
    libraryId: lib.id,
    parentId: null,
    name: '探针書箱'
  })
  const base: EditionRecord = {
    id: 'probe-edition-1',
    fingerprint: { algorithm: FP_ALGO, hash: 'fixture-probe-hash', size: 9001 },
    metadata: { title: '探针书' },
    format: 'EPUB',
    filePath: 'C:/probe/probe.epub',
    createdAt: T_CREATED
  }
  const edition = await store.upsertEdition(base)
  const holding: Holding = {
    libraryId: lib.id,
    editionId: edition.id,
    containerId: container.id,
    origin: 'import',
    path: 'C:/probe/probe.epub',
    parentPath: 'C:\\probe',
    missing: false,
    sort: 0,
    addedAt: T_CREATED
  }
  await store.addHolding(holding)
  checks.eq(
    (await store.getHolding(lib.id, edition.id))?.containerId,
    container.id,
    '收录时给了 containerId → 书落在書箱里'
  )
  await store.addHolding({ ...holding, containerId: null, path: 'C:/probe/probe-moved.epub' })
  const after = await store.getHolding(lib.id, edition.id)
  checks.eq(after?.containerId, container.id, '重扫 addHolding(containerId=null) 不清掉已有書箱归属')
  checks.eq(after?.path, 'C:/probe/probe-moved.epub', '重扫仍更新路径（只有 container 不被空值覆盖）')

  // 收录可见性口径（2026-09-15）：缺省**不显示** missing 收录 —— 收录行与笔记/阅读状态都还在，
  // 只是这个视角看不到（映射库语义）；includeMissing: true 是将来"可见/标记/清理"界面的开关。
  const levelQuery = { libraryId: lib.id, containerId: container.id }
  await store.setHoldingMissing(lib.id, edition.id, true)
  checks.eq(
    (await store.listItemsAtLevel(levelQuery)).length,
    0,
    'listItemsAtLevel 缺省不显示 missing 收录'
  )
  checks.eq(
    (await store.listItemsAtLevel({ ...levelQuery, includeMissing: true })).length,
    1,
    'includeMissing: true 才显示 missing 收录'
  )
  await store.setHoldingMissing(lib.id, edition.id, false)

  const dup = await store.upsertEdition({ ...base, id: 'probe-edition-2' })
  checks.eq(dup.id, 'probe-edition-1', '同指纹重复 upsertEdition 复用既有 edition（不新增行）')
}

/** T2 断言：多 `.db` → 全局单库 */
async function checkV2(checks: Checks, userDataDir: string, store: SqliteStore, db: Db): Promise<void> {
  const scenario = v2Scenario(userDataDir)
  const libDefault = scenario.libs[0]
  const libB = scenario.libs[1]

  checks.eq(store.describeDbPath(), join(userDataDir, 'store.db'), '全局库落在 userData/store.db（不与旧 turead.db 冲突）')

  // —— libraries：模式改名 + rootPath 保留
  checks.eq(num(db, 'libraries'), 2, 'libraries 行数 = 2')
  const libs = db
    .prepare('SELECT id, mode, root_path, sort FROM libraries ORDER BY sort')
    .all() as Array<{ id: string; mode: string; root_path: string | null; sort: number }>
  checks.eq(
    libs.map((l) => l.id),
    ['default', 'lib-b'],
    'libraries 顺序 = 旧引导文件顺序'
  )
  const byId = new Map(libs.map((l) => [l.id, l]))
  checks.eq(
    byId.get('default')?.mode,
    'curated',
    "default.mode = 'curated'（旧 mode='virtual' → curated）"
  )
  checks.eq(byId.get('default')?.root_path ?? null, null, 'default.root_path = null')
  checks.eq(byId.get('lib-b')?.mode, 'mapped', "lib-b.mode = 'mapped'（旧 mode='source' → mapped）")
  checks.eq(byId.get('lib-b')?.root_path, libB.rootPath, 'lib-b.root_path 原样保留')

  // —— editions：跨库同指纹只准一条，且 id = 第一个库的 books.id
  checks.eq(num(db, 'editions'), 3, 'editions 行数 = 3（同指纹跨库只留 1 条）')
  checks.eq(
    one(db, 'SELECT id FROM editions WHERE fp_algo = ? AND fp_hash = ? AND fp_size = ?', FP_ALGO, SHARED_HASH, SHARED_SIZE),
    'book-shared-a',
    '共有书 edition.id = 第一个库的 books.id（保留 id 纪律）'
  )
  checks.eq(
    one(db, 'SELECT id FROM editions WHERE id = ?', 'book-shared-b'),
    undefined,
    '第二库的 books.id 没有另建 edition'
  )
  const sharedEdition = await store.findEditionByFingerprint({
    algorithm: FP_ALGO,
    hash: SHARED_HASH,
    size: SHARED_SIZE
  })
  checks.eq(sharedEdition?.id, 'book-shared-a', 'SqliteStore.findEditionByFingerprint 查到同一条')

  // —— holdings：一库一条，parent_path 走 normalizeDir(dirname(path))
  checks.eq(num(db, 'holdings'), 4, 'holdings 行数 = 4（两库各 2 本书）')
  checks.eq(
    num(db, 'holdings WHERE missing <> 0'),
    0,
    '迁移落库的收录 missing 全为 0（迁移不误标"来源缺失"，否则新默认可见性会把书藏起来）'
  )
  const hA = holdingRow(db, 'default', 'book-shared-a')
  checks.eq(hA?.path, SHARED_FILE_A, 'default 收录保留自己那份路径')
  checks.eq(hA?.parent_path, 'C:\\books\\shared', 'default 收录 parent_path = normalizeDir(dirname(path))')
  checks.eq(hA?.container_id, 'c-default', 'default 收录接上旧书箱成员')
  checks.eq(hA?.origin, 'import', "holdings.origin = 'import'")
  const hB = holdingRow(db, 'lib-b', 'book-shared-a')
  checks.eq(hB?.path, SHARED_FILE_B, 'lib-b 收录保留自己那份路径')
  checks.eq(hB?.parent_path, 'D:\\media\\ebooks', 'lib-b 收录 parent_path 各自归一（正斜杠 → 反斜杠）')
  checks.eq(hB?.container_id, 'c-b', 'lib-b 收录也指向同一个 edition（跨库共享）')
  checks.eq(num(db, "holdings WHERE library_id = 'lib-b'"), 2, 'lib-b holdings = 2')
  checks.eq(
    holdingRow(db, 'lib-b', 'book-b-only')?.parent_path,
    'D:\\mapped\\sub',
    '子目录书的 parent_path = 上一层目录'
  )
  checks.eq((await store.listHoldings('default')).length, 2, 'SqliteStore.listHoldings(default) = 2')

  // —— containers：带上 library_id（v3 新增列）
  checks.eq(num(db, 'containers'), 2, 'containers 行数 = 2')
  checks.eq(
    one(db, 'SELECT library_id FROM containers WHERE id = ?', 'c-default'),
    'default',
    '书箱 c-default 挂到 default 库'
  )
  checks.eq(one(db, 'SELECT library_id FROM containers WHERE id = ?', 'c-b'), 'lib-b', '书箱 c-b 挂到 lib-b 库')

  // —— notes：改指合并后的 edition（第二库的 book_id → 第一库的 edition id）
  checks.eq(num(db, 'notes'), 4, 'notes 行数 = 4')
  checks.eq(
    one(db, 'SELECT edition_id FROM notes WHERE id = ?', 'n-b-shared'),
    'book-shared-a',
    "第二库在共有书上的笔记改指合并后的 edition（edition_id='book-shared-a'）"
  )
  checks.eq(
    one(db, 'SELECT edition_id FROM notes WHERE id = ?', 'n-a-only'),
    'book-a-only',
    '非共有书的笔记保持原 edition id'
  )
  const mergedNotes = await store.listNotes('book-shared-a')
  checks.eq(
    mergedNotes.map((n) => n.id).sort(),
    ['n-a-shared', 'n-b-shared'],
    '两库对同一内容（同一 edition）的笔记都挂在它下面'
  )

  // —— reading_state：v2 内嵌列 → 拆表；同一内容多条时取最近
  checks.eq(num(db, 'reading_state'), 3, 'reading_state 行数 = 3（有阅读状态的书）')
  const rs = one(
    db,
    'SELECT last_read_at, last_location FROM reading_state WHERE edition_id = ?',
    'book-shared-a'
  ) as { last_read_at: number | null; last_location: string | null } | undefined
  checks.eq(rs?.last_read_at, T_READ_NEW, '共有书 last_read_at 取最近的一条（lib-b 的更晚）')
  checks.eq(rs?.last_location, '{"chapterDocIndex":7,"page":3}', '共有书 last_location 同步取最近的一条')
  const rsB = one(
    db,
    'SELECT last_read_at, last_location FROM reading_state WHERE edition_id = ?',
    'book-b-only'
  ) as { last_read_at: number | null; last_location: string | null } | undefined
  checks.eq(rsB?.last_read_at ?? null, null, '只有位置没有时间的书：last_read_at 为 NULL')
  checks.eq(rsB?.last_location, '{"chapterDocIndex":0,"page":5}', '只有位置的书位置照样保留')
  checks.eq(
    one(db, 'SELECT last_read_at FROM reading_state WHERE edition_id = ?', 'book-a-only'),
    T_READ_A_ONLY,
    '独有书的阅读状态保留'
  )
  checks.eq(
    (await store.getReadingState('book-shared-a'))?.lastReadAt,
    T_READ_NEW,
    'SqliteStore.getReadingState 读回最近的那条'
  )

  // —— settings：只取旧"当前库"那一套（v3 设置全局唯一）
  checks.eq(one(db, "SELECT value FROM settings WHERE key = 'theme'"), '"dark"', 'settings.theme 来自旧当前库（default）')
  checks.eq(one(db, "SELECT value FROM settings WHERE key = 'fontSize'"), '16', 'settings.fontSize 原样透传')
  checks.eq(
    one(db, "SELECT value FROM settings WHERE key = 'libOnlyKey'"),
    undefined,
    '非当前库独有的设置键不存在（libOnlyKey）'
  )
  checks.eq(
    one(db, "SELECT value FROM settings WHERE key = 'currentLibraryId'"),
    '"default"',
    "当前库落到全局 settings（currentLibraryId='default'）"
  )
  checks.eq(await store.getSetting<string | null>('theme', null), 'dark', 'SqliteStore.getSetting 读回全局设置')
  checks.eq(
    await store.getSetting<unknown>('libOnlyKey', ABSENT),
    ABSENT,
    'SqliteStore 侧同样看不到非当前库的设置键'
  )

  // —— 旧文件留档：不删旧数据
  checks.ok(
    existsSync(join(userDataDir, 'config.json.migrated')),
    '旧 v1 引导文件改名留档 config.json.migrated'
  )
  const archived = readJson(join(userDataDir, 'config.json.migrated'))
  checks.eq(archived?.['version'], 1, '留档内容仍是旧 v1 引导文件（version=1）')
  checks.eq(
    Array.isArray(archived?.['libraries']) ? (archived['libraries'] as unknown[]).length : -1,
    2,
    '留档里 2 个旧库条目仍在'
  )
  checks.ok(existsSync(libDefault.dbPath), `旧 .db 原样留在磁盘上（${shortName(libDefault.dbPath)}）`)
  checks.ok(existsSync(libB.dbPath), `旧 .db 原样留在磁盘上（${shortName(libB.dbPath)}）`)
  const cur = readJson(join(userDataDir, 'config.json'))
  checks.eq(cur?.['version'], 2, '引导文件已升到 v2（version=2）')
  checks.ok(typeof cur?.['dbPath'] === 'string', 'v2 引导文件带 dbPath')
}

/** T1 断言：旧 JSON（`library.json` + 旧设置文件 `config.json`）→ SQLite */
async function checkJson(
  checks: Checks,
  userDataDir: string,
  store: SqliteStore,
  db: Db
): Promise<void> {
  checks.eq(store.describeDbPath(), join(userDataDir, 'store.db'), '全局库落在 userData/store.db（不与旧 turead.db 冲突）')

  // —— libraries：T1 只有兜底的默认库
  checks.eq(num(db, 'libraries'), 1, 'libraries 行数 = 1')
  checks.eq(one(db, 'SELECT id FROM libraries'), 'default', "默认库 id = 'default'")
  checks.eq(one(db, "SELECT mode FROM libraries WHERE id = 'default'"), 'curated', "默认库 mode = 'curated'")
  checks.eq(one(db, "SELECT root_path FROM libraries WHERE id = 'default'") ?? null, null, '默认库 root_path = null')

  // —— editions：id 保留、metadata.title 走 v1 驼峰形状
  checks.eq(num(db, 'editions'), 3, 'editions 行数 = 3')
  checks.eq(one(db, 'SELECT title FROM editions WHERE id = ?', 'json-book-1'), '舊 JSON 書一', 'v1 的 metadata.title 搬进 editions.title')
  checks.eq(
    (await store.findEditionByFingerprint({ algorithm: FP_ALGO, hash: 'fixture-json-h2', size: 4444 }))?.id,
    'json-book-2',
    'v1 books[].id 原样作为 edition.id'
  )
  checks.eq(one(db, "SELECT work_id FROM editions WHERE id = 'json-book-1'") ?? null, null, 'v1 没有 work 线索 → work_id 为 NULL')

  // —— holdings：一库一条，parent_path 归一
  checks.eq(num(db, 'holdings'), 3, 'holdings 行数 = 3')
  checks.eq(num(db, 'holdings WHERE missing <> 0'), 0, '迁移落库的收录 missing 全为 0')
  checks.eq(holdingRow(db, 'default', 'json-book-2')?.parent_path, 'D:\\legacy\\sub', 'JSON 书的 parent_path = normalizeDir(dirname(path))')
  checks.eq(holdingRow(db, 'default', 'json-book-1')?.parent_path, 'C:\\legacy', 'JSON 书的 parent_path（同目录另一种写法）')
  checks.eq(holdingRow(db, 'default', 'json-book-1')?.origin, 'import', "holdings.origin = 'import'")

  // —— reading_state：v1 驼峰 + 对象位置 → 拆表 + 序列化
  checks.eq(num(db, 'reading_state'), 1, 'reading_state 行数 = 1（只有 json-book-1 有阅读状态）')
  const rs = one(db, 'SELECT last_read_at, last_location FROM reading_state WHERE edition_id = ?', 'json-book-1') as
    | { last_read_at: number | null; last_location: string | null }
    | undefined
  checks.eq(rs?.last_read_at, T_JSON_READ, 'v1 lastReadAt 搬进 reading_state.last_read_at')
  checks.eq(rs?.last_location, '{"chapterDocIndex":1,"page":2}', 'v1 位置对象序列化成 JSON 文本')

  // —— notes：v1 时代没有笔记表
  checks.eq(num(db, 'notes'), 0, 'notes 行数 = 0（v1 JSON 里没有笔记）')

  // —— settings：library.json 内嵌 + 旧设置文件 config.json（后者靠留档才能读到）
  checks.eq(await store.getSetting<number | null>('fontSize', null), 18, 'library.json.settings 搬进全局 settings')
  checks.eq(await store.getSetting<string | null>('theme', null), 'sepia', 'config.json.settings 搬进全局 settings')
  checks.eq(
    await store.getSetting<number | null>('configOnlyKey', null),
    42,
    '★ 旧设置文件 config.json 的键进入全局 settings（T1 的 config.json 只是设置文件）'
  )
  checks.eq(await store.getSetting<string | null>('currentLibraryId', null), 'default', "当前库落到全局 settings（currentLibraryId='default'）")

  // —— 旧文件留档：不删旧数据
  checks.ok(existsSync(join(userDataDir, 'library.json.migrated')), '旧 library.json 改名留档')
  const libArchived = readJson(join(userDataDir, 'library.json.migrated'))
  checks.eq(
    Array.isArray(libArchived?.['books']) ? (libArchived['books'] as unknown[]).length : -1,
    3,
    '留档里 3 本书仍在'
  )
  checks.ok(
    existsSync(join(userDataDir, 'config.json.migrated')),
    '★ 旧设置文件 config.json 改名留档（不能既没读、又被 v2 引导文件覆盖）'
  )
  const cfgArchived = readJson(join(userDataDir, 'config.json.migrated'))
  checks.eq(cfgArchived?.['version'], 1, '留档内容 = 旧设置文件（version=1）')
  const cur = readJson(join(userDataDir, 'config.json'))
  checks.eq(cur?.['version'], 2, '引导文件已升到 v2（version=2）')
  checks.ok(typeof cur?.['dbPath'] === 'string', 'v2 引导文件带 dbPath')
}

// ————————————— 断言 / 读库小工具 —————————————

/** `getSetting` 缺失判据的哨兵值（设置值可以是任意 JSON，必须与"缺键"区分开） */
const ABSENT = Symbol('absent')

class Checks {
  private failures: string[] = []
  private passed = 0

  ok(cond: boolean, label: string, detail = ''): void {
    if (cond) {
      this.passed++
      console.log(`[${SCOPE}] ok: ${label}`)
      return
    }
    this.fail(label, detail)
  }

  eq(actual: unknown, expected: unknown, label: string): void {
    this.ok(
      same(actual, expected),
      label,
      `期望=${display(expected)} 实际=${display(actual)}`
    )
  }

  fail(label: string, detail = ''): void {
    this.failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
    console.error(`[${SCOPE}] ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }

  /** 打印 `[TUREAD-TEST-OK/FAIL]` 并返回退出码（与探针约定一致：0 = 全过） */
  finish(): number {
    if (this.failures.length === 0) {
      console.log(`[TUREAD-TEST-OK][${SCOPE}] 迁移结果与期望一致（${this.passed} 条断言全过）`)
      return 0
    }
    console.error(`[TUREAD-TEST-FAIL][${SCOPE}] ${this.failures.length} 条断言未过（共 ${this.passed + this.failures.length} 条）：`)
    for (const f of this.failures) console.error(`  ✗ ${f}`)
    return 1
  }
}

function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  return JSON.stringify(a) === JSON.stringify(b)
}

function display(v: unknown): string {
  if (typeof v === 'symbol') return String(v)
  const json = JSON.stringify(v)
  return json === undefined ? String(v) : json
}

function num(db: Db, fromWhere: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${fromWhere}`).get() as { c: number }
  return row.c
}

function one(db: Db, sql: string, ...args: unknown[]): unknown {
  const row = db.prepare(sql).get(...(args as never[])) as Record<string, unknown> | undefined
  if (!row) return undefined
  const keys = Object.keys(row)
  return keys.length === 1 ? row[keys[0]] : row
}

function holdingRow(
  db: Db,
  libraryId: string,
  editionId: string
): { path: string | null; parent_path: string | null; container_id: string | null; origin: string } | undefined {
  return one(db, 'SELECT path, parent_path, container_id, origin, missing FROM holdings WHERE library_id = ? AND edition_id = ?', libraryId, editionId) as
    | { path: string | null; parent_path: string | null; container_id: string | null; origin: string }
    | undefined
}

/** 幂等快照：行数 + 关键值（迁移若被重复执行，这里必须一模一样） */
function snapshot(db: Db): Record<string, unknown> {
  return {
    libraries: num(db, 'libraries'),
    editions: num(db, 'editions'),
    holdings: num(db, 'holdings'),
    containers: num(db, 'containers'),
    notes: num(db, 'notes'),
    reading_state: num(db, 'reading_state'),
    editionsById: db.prepare('SELECT id FROM editions ORDER BY id').all(),
    holdingsByKey: db.prepare('SELECT library_id, edition_id, parent_path FROM holdings ORDER BY library_id, edition_id').all(),
    readingStates: db.prepare('SELECT edition_id, last_read_at, last_location FROM reading_state ORDER BY edition_id').all(),
    settingsKeys: db.prepare('SELECT key FROM settings ORDER BY key').all(),
    migrated: one(db, 'SELECT value FROM meta WHERE key = ?', 'migrated_v3')
  }
}

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
  } catch {
    return null
  }
}
