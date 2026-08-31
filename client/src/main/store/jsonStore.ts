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
    } catch {
      this.data.books = []
      this.data.settings = {}
    }
  }

  private async save(): Promise<void> {
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
