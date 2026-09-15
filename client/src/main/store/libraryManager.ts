/**
 * LibraryManager —— 引导文件 + **全局唯一** store 句柄（主进程）。
 *
 * ⚠ **v0.4.0（2026-09-15「书的身份」定案，DATA_MODEL §1/§4.2）职责已大幅收缩**：
 * - 旧职责"多库 = 多 .db、切库 = 换句柄"**作废** —— 现在是**全应用一个 .db**，
 *   书库降为**库内实体**（`libraries` 表 + `holdings` 收录），库管理方法在 `ILibraryStore` 上。
 * - 本类只剩三件事：① 读写**引导文件**（极小）；② 持有并初始化 `SqliteStore`；
 *   ③ 在首次启动（或从旧版升级）时把旧数据交给迁移器。
 *
 * 引导文件（`config.json`）：
 *   v2（现行）：{ version: 2, dbPath, window? }         ← 唯一必须留在库外的是 dbPath（鸡生蛋）
 *   v1（旧版）：{ version: 1, libraries: [...], currentId } ← 升级时由迁移器消费后改名留档
 *   v0（更早）：设置文件（无 libraries 数组）→ 同样交给迁移器
 */
import { promises as fs } from 'node:fs'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { SqliteStore } from './sqliteStore'

/** 现行引导文件 */
export interface BootstrapFile {
  version: 2
  dbPath: string
  window?: { width: number; height: number; x?: number; y?: number; maximized?: boolean }
}

/**
 * 全局库文件名。
 *
 * ⚠ **必须与旧版默认库的文件名（`turead.db`）不同** —— 2026-09-15 用户实测踩到的真 bug：
 * 升级用户的旧版引导文件里，**默认库的 `dbPath` 就是 `<userData>/turead.db`**，
 * 而这个文件是**旧 v2 schema**（`books`/`containers`/`notes`，没有 `library_id`/`edition_id`）。
 * 若把**全局库**也放在同一个路径上，`db.exec(SCHEMA_SQL)` 里的 `CREATE TABLE IF NOT EXISTS`
 * 会**静默跳过**已存在的旧表（形状完全不同！），紧接着针对新列的索引就以
 * `SqliteError: no such column: library_id` 炸掉 —— 且报错点远离真因，极难定位。
 *
 * 所以：**全局库另起一个文件名**，旧 `turead.db` 就只是一份"要迁移的旧书库文件"，
 * 既不冲突、也不会被改动（迁移只读它）。
 */
const DEFAULT_DB_NAME = 'store.db'

export class LibraryManager {
  private userDataDir: string
  private bootstrap: BootstrapFile | null = null
  private storeInstance: SqliteStore | null = null

  constructor(userDataDir: string) {
    this.userDataDir = userDataDir
  }

  get bootstrapPath(): string {
    return join(this.userDataDir, 'config.json')
  }

  get coversDir(): string {
    return join(this.userDataDir, 'covers')
  }

  /** 全局 store（init 后才可用） */
  get store(): SqliteStore {
    if (!this.storeInstance) throw new Error('LibraryManager 尚未 init')
    return this.storeInstance
  }

  async init(): Promise<void> {
    const raw = await this.readJson<Record<string, unknown>>(this.bootstrapPath)
    const isCurrent = raw?.version === 2 && typeof raw.dbPath === 'string'

    const dbPath = isCurrent
      ? (raw!.dbPath as string)
      : join(this.userDataDir, DEFAULT_DB_NAME)

    // 旧版线索：引导文件本身可能还是 v1（含 libraries[]），另有更早的 JSON 留档
    const legacyLibraryPath = pickExisting(
      join(this.userDataDir, 'library.json'),
      join(this.userDataDir, 'library.json.migrated')
    )
    /**
     * 旧**设置**文件（v1 时代：主题/阅读参数/导入选项写在 config.json 里）。
     * 优先取已留档的 `config.json.migrated`；**都没有时，当前的 `config.json` 本身就是它** ——
     * 同一个路径可同时充当"引导文件候选"（供迁移器探测 `libraries[]`）与"旧设置来源"，两者不冲突：
     * 迁移器先按 `libraries[]` 判定走 T2（多 `.db`，设置从各 `.db` 取），判不出来才走 T1（读这里的设置）。
     *
     * ⚠ 2026-09-15 自查发现并修：漏掉这个兜底会让**从未启动过 SQLite 版**的老用户在升级时
     * **丢掉全部设置**（书能迁过来，主题/阅读参数/导入选项没了）。
     */
    const legacyConfigPath =
      pickExisting(join(this.userDataDir, 'config.json.migrated')) ??
      (isCurrent ? undefined : this.bootstrapPath)

    const store = new SqliteStore({
      dbPath,
      coversDir: this.coversDir,
      // 只有"不是现行引导文件"时才把 config.json 交给迁移器读（否则它就是新版引导文件）
      bootstrapPath: isCurrent ? undefined : this.bootstrapPath,
      legacyLibraryPath,
      legacyConfigPath
    })
    await store.init()
    this.storeInstance = store

    // 迁移失败时**不覆盖**引导文件（否则 v1 的 libraries[] 一丢，重试就找不到旧 .db 了）
    if (isCurrent || store.migrationState() !== 'failed') {
      this.bootstrap = { version: 2, dbPath }
      if (isCurrent && raw?.window) this.bootstrap.window = raw.window as BootstrapFile['window']
      await this.writeBootstrap(this.bootstrap)
    } else {
      console.error('[library] 迁移未成功，保留旧引导文件以便下次重试')
    }
  }

  /**
   * 新建库已切换到该库后，把"当前库"落盘**不需要**动引导文件（它在库内 `settings` 里）——
   * 本方法只为将来扩展预留（如窗口状态），现无副作用。
   */
  async touch(): Promise<void> {
    if (this.bootstrap) await this.writeBootstrap(this.bootstrap)
  }

  private async writeBootstrap(b: BootstrapFile): Promise<void> {
    const tmp = `${this.bootstrapPath}.tmp`
    await fs.writeFile(tmp, JSON.stringify(b, null, 2), 'utf-8')
    await fs.rename(tmp, this.bootstrapPath)
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

function pickExisting(...paths: string[]): string | undefined {
  return paths.find((p) => existsSync(p))
}
