/**
 * ILibraryStore 适配器（主进程侧，真实实现）—— 两个 JSON 文件 + 封面目录。
 *
 * 为什么拆成两个文件（v0.1.8）：设置与书库数据的生命周期完全不同 ——
 * 设置是"用户偶尔点一下"，书库是"阅读中每 2s 写一次位置"。同文件时每次位置保存都要
 * 连带重写设置；拆开后 `library.json` 只放书、`config.json` 只放设置（各自独立写盘队列）。
 *
 * 文件布局（userData/）：
 *   library.json        { version, books[] }
 *   config.json         { version, settings{} }
 *   covers/<id>.<ext>   封面缩略图（字节不落 JSON，见 BookRecord.coverPath 注释）
 *
 * 兼容：旧版把 books + settings 合在 library.json 里 → 首次加载自动拆分（migrateLegacy）。
 */
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import type { BookRecord } from '@core/domain/types'

const LIBRARY_VERSION = 1
const CONFIG_VERSION = 1

interface LibraryFile {
  version: number
  books: BookRecord[]
}

interface ConfigFile {
  version: number
  settings: Record<string, unknown>
}

export interface JsonStoreOptions {
  libraryPath: string
  configPath: string
  coversDir: string
}

export class JsonStore {
  private opts: JsonStoreOptions
  private library: LibraryFile = { version: LIBRARY_VERSION, books: [] }
  private config: ConfigFile = { version: CONFIG_VERSION, settings: {} }
  private loading: Promise<void> | null = null
  /** 写盘队列（串行化并发 save；两个文件各自独立） */
  private libraryChain: Promise<void> = Promise.resolve()
  private configChain: Promise<void> = Promise.resolve()

  constructor(opts: JsonStoreOptions) {
    this.opts = opts
  }

  async init(): Promise<void> {
    if (!this.loading) this.loading = this.load()
    await this.loading
  }

  private async load(): Promise<void> {
    const legacy = await readJson<Partial<LibraryFile> & { settings?: Record<string, unknown> }>(
      this.opts.libraryPath
    )
    const configFile = await readJson<Partial<ConfigFile>>(this.opts.configPath)

    if (legacy) {
      this.library = {
        version: LIBRARY_VERSION,
        books: Array.isArray(legacy.books) ? legacy.books : []
      }
      // 旧格式：设置与书挤在同一文件 → 迁移到 config.json（一次），再重写 library.json
      if (legacy.settings && !configFile) {
        this.config = { version: CONFIG_VERSION, settings: legacy.settings }
        await this.saveConfig()
        await this.saveLibrary()
        console.log('[store] 已把 settings 从 library.json 迁移到 config.json')
      }
    }
    if (configFile) {
      this.config = {
        version: CONFIG_VERSION,
        settings: configFile.settings ?? {}
      }
    }
  }

  private async writeJson(path: string, data: unknown): Promise<void> {
    await fs.mkdir(dirname(path), { recursive: true })
    const tmp = `${path}.tmp`
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
    await fs.rename(tmp, path)
  }

  /** 写盘串行化：并发 save 共用同一个 .tmp 路径，交错写会把半截 JSON rename 成正式文件 */
  private saveLibrary(): Promise<void> {
    const next = this.libraryChain.then(() => this.writeJson(this.opts.libraryPath, this.library))
    this.libraryChain = next.catch(() => undefined)
    return next
  }

  private saveConfig(): Promise<void> {
    const next = this.configChain.then(() => this.writeJson(this.opts.configPath, this.config))
    this.configChain = next.catch(() => undefined)
    return next
  }

  async addBook(record: BookRecord): Promise<void> {
    if (!this.library.books.some((b) => b.id === record.id)) this.library.books.push(record)
    await this.saveLibrary()
  }

  async updateBook(id: string, patch: Partial<BookRecord>): Promise<void> {
    const idx = this.library.books.findIndex((b) => b.id === id)
    if (idx >= 0) this.library.books[idx] = { ...this.library.books[idx], ...patch }
    await this.saveLibrary()
  }

  async getBook(id: string): Promise<BookRecord | null> {
    return this.library.books.find((b) => b.id === id) ?? null
  }

  async listBooks(): Promise<BookRecord[]> {
    return [...this.library.books]
  }

  async removeBook(id: string): Promise<void> {
    // 先取记录再过滤：删完再查就找不到 coverPath，封面文件会留在磁盘上
    const record = this.library.books.find((b) => b.id === id)
    this.library.books = this.library.books.filter((b) => b.id !== id)
    await this.saveLibrary()
    if (record?.coverPath) {
      await fs.rm(join(this.opts.coversDir, record.coverPath), { force: true })
    }
  }

  async getSetting<T>(key: string, fallback: T): Promise<T> {
    return (this.config.settings[key] as T) ?? fallback
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    this.config.settings[key] = value
    await this.saveConfig()
  }

  /** 原子合并一个设置对象（避免渲染进程侧"读-改-写"造成的互相覆盖） */
  async patchSetting(key: string, patch: Record<string, unknown>): Promise<void> {
    const cur = this.config.settings[key]
    const base = cur && typeof cur === 'object' && !Array.isArray(cur) ? cur : {}
    this.config.settings[key] = { ...(base as Record<string, unknown>), ...patch }
    await this.saveConfig()
  }

  /** 写封面缩略图：文件名固定为 `<bookId>.<ext>`（覆盖式），返回文件名供 BookRecord.coverPath */
  async setCover(bookId: string, bytes: ArrayBuffer, ext: string): Promise<string> {
    const safeExt = /^[a-z0-9]{2,5}$/i.test(ext) ? ext.toLowerCase() : 'jpg'
    const name = `${bookId}.${safeExt}`
    await fs.mkdir(this.opts.coversDir, { recursive: true })
    await fs.writeFile(join(this.opts.coversDir, name), Buffer.from(bytes))
    return name
  }

  /** 读封面：按记录里的 coverPath 取文件；无记录/无文件 → null */
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
}

/** 读 JSON；文件不存在或解析失败 → null（解析失败会先备份原文件，避免被后续写盘覆盖） */
async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path, 'utf-8')) as T
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      const backup = `${path}.corrupt-${Date.now()}`
      await fs.rename(path, backup).catch(() => undefined)
      console.error(`[store] ${path} 解析失败，已备份到 ${backup}：${(err as Error).message}`)
    }
    return null
  }
}
