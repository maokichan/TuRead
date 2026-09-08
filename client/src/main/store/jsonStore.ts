/**
 * ILibraryStore 适配器（主进程侧，真实实现）—— JSON 文件持久化。
 * 骨架阶段：只存书库条目（文件路径 + 文件信息）与设置，存于 userData/library.json。
 * 演进：接口不变，可换 better-sqlite3。
 */
import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import type { BookRecord } from '@core/domain/types'

interface StoreFile {
  books: BookRecord[]
  settings: Record<string, unknown>
}

export class JsonStore {
  private filePath: string
  private data: StoreFile = { books: [], settings: {} }
  private loading: Promise<void> | null = null
  /** 写盘队列（串行化并发 save，见 save()） */
  private saveChain: Promise<void> = Promise.resolve()

  constructor(filePath: string) {
    this.filePath = filePath
  }

  async init(): Promise<void> {
    if (!this.loading) this.loading = this.load()
    await this.loading
  }

  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<StoreFile>
      this.data.books = Array.isArray(parsed.books) ? parsed.books : []
      this.data.settings = parsed.settings ?? {}
    } catch (err) {
      // 文件不存在 = 首次启动（正常）。能读到却解析失败 = 数据损坏：先改名留证再空库启动 ——
      // 否则紧接着的第一次 save 就会把唯一副本覆盖掉（旧实现 catch 一切 → 静默丢整个书库）。
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        const backup = `${this.filePath}.corrupt-${Date.now()}`
        await fs.rename(this.filePath, backup).catch(() => undefined)
        console.error(`[store] library.json 解析失败，已备份到 ${backup}：${(err as Error).message}`)
      }
      this.data.books = []
      this.data.settings = {}
    }
  }

  /**
   * 写盘串行化（v0.1.7）：并发 save() 会共用同一个 `.tmp` 路径，两次 writeFile 交错 →
   * 可能把半截 JSON rename 成 library.json（书库全丢）。位置持久化是每 2s 一次的自动写入，
   * 与用户的导入/删除天然会并发，所以这里必须排队，而不是"快就完事"。
   */
  private save(): Promise<void> {
    const next = this.saveChain.then(() => this.writeNow())
    // 单次失败不阻断后续写入（错误照常抛给调用方）
    this.saveChain = next.catch(() => undefined)
    return next
  }

  private async writeNow(): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.tmp`
    await fs.writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf-8')
    await fs.rename(tmp, this.filePath)
  }

  async addBook(record: BookRecord): Promise<void> {
    if (!this.data.books.some((b) => b.id === record.id)) this.data.books.push(record)
    await this.save()
  }

  async updateBook(id: string, patch: Partial<BookRecord>): Promise<void> {
    const idx = this.data.books.findIndex((b) => b.id === id)
    if (idx >= 0) this.data.books[idx] = { ...this.data.books[idx], ...patch }
    await this.save()
  }

  async getBook(id: string): Promise<BookRecord | null> {
    return this.data.books.find((b) => b.id === id) ?? null
  }

  async listBooks(): Promise<BookRecord[]> {
    return [...this.data.books]
  }

  async removeBook(id: string): Promise<void> {
    this.data.books = this.data.books.filter((b) => b.id !== id)
    await this.save()
  }

  async getSetting<T>(key: string, fallback: T): Promise<T> {
    return (this.data.settings[key] as T) ?? fallback
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    this.data.settings[key] = value
    await this.save()
  }
}
