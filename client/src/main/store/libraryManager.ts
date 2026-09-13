/**
 * LibraryManager —— 多书库管理（主进程，2026-09-13 用户立项：底部状态栏「書庫」入口）。
 *
 * 职能分层（DATA_MODEL §1 已批复：JSON 退役为**引导文件**）：
 *   config.json = 引导文件（app 级，极小）：已知库注册表 + 当前库 id。**不再存任何书库数据**。
 *   <库>.db     = 一份书库的一切数据（SqliteStore，见 DATA_MODEL §2）。
 *
 * 文件布局（userData/）：
 *   config.json        引导文件 { version, libraries[], currentId }
 *   turead.db          默认库（历史数据经 one-shot 迁移器进入，见 sqliteStore.ts）
 *   lib-<id>.db        新建库
 *   covers/            默认库封面（历史位置不动）；新建库封面在 covers/<库id>/
 *
 * 首次引导：config.json 缺失或还是旧版"设置文件"（无 libraries 数组）→
 * 建默认库条目（指向 turead.db，携带旧 JSON 路径给迁移器），旧设置文件改名 .migrated 让位。
 */
import { promises as fs } from 'node:fs'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { SqliteStore } from './sqliteStore'

export interface LibraryEntry {
  id: string
  name: string
  dbPath: string
  coversDir: string
  /** 旧 JSON 路径（只有默认库在升级首启时带；迁移完成前每次启动都要给迁移器看到） */
  legacyLibraryPath?: string
  legacyConfigPath?: string
}

interface BootstrapFile {
  version: 1
  libraries: LibraryEntry[]
  currentId: string
}

export class LibraryManager {
  private userDataDir: string
  private bootstrap: BootstrapFile | null = null
  private stores = new Map<string, SqliteStore>()
  private initPromise: Promise<void> | null = null

  constructor(userDataDir: string) {
    this.userDataDir = userDataDir
  }

  async init(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.load()
    await this.initPromise
  }

  private async load(): Promise<void> {
    this.bootstrap = await this.loadOrCreateBootstrap()
    await this.openStore(this.bootstrap.currentId)
  }

  /**
   * 载入/创建引导文件。三种起点：
   * ① config.json 是引导文件（有 libraries）→ 直接用；
   * ② config.json 是旧版设置文件 → 改名 .migrated 让位，建默认库条目（旧 JSON 路径交给迁移器）；
   * ③ 全新安装 → 建默认库条目（无 legacy 路径，迁移器标记 fresh）。
   */
  private async loadOrCreateBootstrap(): Promise<BootstrapFile> {
    const cfgPath = join(this.userDataDir, 'config.json')
    const parsed = await this.readJson<Partial<BootstrapFile>>(cfgPath)
    if (parsed && Array.isArray(parsed.libraries) && parsed.libraries.length > 0) {
      return { version: 1, libraries: parsed.libraries, currentId: parsed.currentId ?? parsed.libraries[0].id }
    }

    let legacyConfigPath: string | undefined
    if (parsed) {
      // 旧版设置文件让位（迁移器随后从 .migrated 读设置）；已留档则直接指向留档
      legacyConfigPath = join(this.userDataDir, 'config.json.migrated')
      if (existsSync(cfgPath) && !existsSync(legacyConfigPath)) {
        await fs.rename(cfgPath, legacyConfigPath).catch(() => undefined)
      }
    }
    const legacyLibraryPath = join(this.userDataDir, 'library.json')
    const entry: LibraryEntry = {
      id: 'default',
      name: '書庫',
      dbPath: join(this.userDataDir, 'turead.db'),
      coversDir: join(this.userDataDir, 'covers'),
      legacyLibraryPath: existsSync(legacyLibraryPath)
        ? legacyLibraryPath
        : existsSync(`${legacyLibraryPath}.migrated`)
          ? `${legacyLibraryPath}.migrated`
          : undefined,
      legacyConfigPath:
        legacyConfigPath ??
        (existsSync(join(this.userDataDir, 'config.json.migrated'))
          ? join(this.userDataDir, 'config.json.migrated')
          : undefined)
    }
    const bootstrap: BootstrapFile = {
      version: 1,
      libraries: [entry],
      currentId: entry.id
    }
    await this.writeBootstrap(bootstrap)
    return bootstrap
  }

  get currentId(): string {
    return this.bootstrap!.currentId
  }

  get current(): SqliteStore {
    return this.stores.get(this.bootstrap!.currentId)!
  }

  listLibraries(): { libraries: LibraryEntry[]; currentId: string } {
    return { libraries: this.bootstrap!.libraries, currentId: this.bootstrap!.currentId }
  }

  /** 切换当前库：关旧库句柄、开新库、持久化 currentId。同 id 幂等。 */
  async switchLibrary(id: string): Promise<LibraryEntry> {
    const entry = this.bootstrap!.libraries.find((l) => l.id === id)
    if (!entry) throw new Error(`書庫不存在：${id}`)
    if (id !== this.bootstrap!.currentId) {
      this.current.close()
      await this.openStore(id)
      this.bootstrap!.currentId = id
      await this.writeBootstrap(this.bootstrap!)
    }
    return entry
  }

  /** 新建库（空库；文件名用随机 id，与可改的显示名解耦）并切换过去 */
  async createLibrary(name?: string): Promise<LibraryEntry> {
    const existing = this.bootstrap!.libraries
    const autoName = name?.trim() || `書庫 ${existing.length + 1}`
    const id = `lib-${randomBytes(4).toString('hex')}`
    const entry: LibraryEntry = {
      id,
      name: autoName,
      dbPath: join(this.userDataDir, `${id}.db`),
      coversDir: join(this.userDataDir, 'covers', id)
    }
    this.bootstrap!.libraries.push(entry)
    await this.writeBootstrap(this.bootstrap!)
    await this.switchLibrary(id)
    return entry
  }

  /** 移除**引用**（不删 .db / 封面文件——引用模型，与"移除书=只删索引"同语义；最后一个库不可移除） */
  async removeLibrary(id: string): Promise<void> {
    const libs = this.bootstrap!.libraries
    if (libs.length <= 1) throw new Error('最後一個書庫不能移除')
    const idx = libs.findIndex((l) => l.id === id)
    if (idx < 0) return
    libs.splice(idx, 1)
    if (this.bootstrap!.currentId === id) {
      await this.switchLibrary(libs[0].id)
    }
    await this.writeBootstrap(this.bootstrap!)
  }

  private async openStore(id: string): Promise<void> {
    const entry = this.bootstrap!.libraries.find((l) => l.id === id)
    if (!entry) throw new Error(`書庫不存在：${id}`)
    let store = this.stores.get(id)
    if (!store) {
      store = new SqliteStore({
        dbPath: entry.dbPath,
        coversDir: entry.coversDir,
        legacyLibraryPath: entry.legacyLibraryPath,
        legacyConfigPath: entry.legacyConfigPath
      })
      this.stores.set(id, store)
    }
    await store.init()
  }

  private async writeBootstrap(b: BootstrapFile): Promise<void> {
    const cfgPath = join(this.userDataDir, 'config.json')
    const tmp = `${cfgPath}.tmp`
    await fs.writeFile(tmp, JSON.stringify(b, null, 2), 'utf-8')
    await fs.rename(tmp, cfgPath)
  }

  private async readJson<T>(path: string): Promise<T | null> {
    if (!existsSync(path)) return null
    try {
      return JSON.parse(await fs.readFile(path, 'utf-8')) as T
    } catch (err) {
      console.error(`[library] ${path} 解析失败，按全新安装处理：${(err as Error).message}`)
      return null
    }
  }
}
