/**
 * ICoverQueue —— 封面缩略图异步提取（应用服务 / 用例层）。
 * 依据：client/docs/FEATURES.md §10（封面提取时机：导入后异步）。
 *
 * 为什么异步 + 队列：封面提取要读整个文件 + 解析（大 PDF 可达秒级）。导入时同步做会把
 * "选完文件"变成"卡住不动"；改成导入后串行后台跑，界面立刻可用，进度经事件上报。
 *
 * 编排（用例 = 编排多个能力服务）：
 *   readFile（文件系统）→ IRenderService.getMetadata（kookit 解析）→ makeThumbnail（canvas）
 *   → ILibraryStore.setCover / updateBook（落盘 + 记 coverPath）
 *
 * 纪律：串行（一次一本，避免 N 个大文件同时进内存）；可取消；单本失败不影响其余（事件上报）。
 */
import type { IRenderService } from '@core/ports/render'
import type { ILibraryStore } from '@core/ports/store'
import { TypedEmitter } from '@core/ports/emitter'
import { makeThumbnail } from '@core/adapters/image/thumbnail'

export interface CoverSummary {
  total: number
  ok: number
  failed: number
  cancelled: boolean
}

export interface CoverQueueEvents {
  /** done/total 随队列增长而更新（导入过程中可继续入队） */
  progress: (done: number, total: number) => void
  'cover-ready': (bookId: string) => void
  'cover-failed': (bookId: string, message: string) => void
  done: (summary: CoverSummary) => void
}

export interface ICoverQueue extends TypedEmitter<CoverQueueEvents> {
  /** 入队提取封面（重复 id 只入队一次；已有 coverPath 的会被跳过） */
  enqueue(bookIds: string[]): void
  /** 取消剩余队列（正在处理的那本会跑完） */
  cancel(): void
  isRunning(): boolean
}

export class CoverQueue extends TypedEmitter<CoverQueueEvents> implements ICoverQueue {
  private queue: string[] = []
  private planned = new Set<string>()
  private total = 0
  private done = 0
  private ok = 0
  private failed = 0
  private running = false
  private cancelled = false

  constructor(
    private readFile: (path: string) => Promise<ArrayBuffer>,
    private render: IRenderService,
    private store: ILibraryStore
  ) {
    super()
  }

  enqueue(bookIds: string[]): void {
    this.cancelled = false
    for (const id of bookIds) {
      if (this.planned.has(id)) continue
      this.planned.add(id)
      this.queue.push(id)
      this.total++
    }
    this.emit('progress', this.done, this.total)
    void this.pump()
  }

  cancel(): void {
    this.cancelled = true
    this.queue = []
  }

  isRunning(): boolean {
    return this.running
  }

  private async pump(): Promise<void> {
    if (this.running) return
    this.running = true
    while (this.queue.length > 0 && !this.cancelled) {
      const id = this.queue.shift() as string
      try {
        await this.extractOne(id)
        this.ok++
      } catch (err) {
        this.failed++
        this.emit('cover-failed', id, (err as Error).message)
      }
      this.done++
      this.emit('progress', this.done, this.total)
    }
    this.running = false
    this.emit('done', {
      total: this.total,
      ok: this.ok,
      failed: this.failed,
      cancelled: this.cancelled
    })
    // 重置批次统计，等待下一轮入队
    this.queue = []
    this.planned.clear()
    this.total = 0
    this.done = 0
    this.ok = 0
    this.failed = 0
  }

  private async extractOne(id: string): Promise<void> {
    const book = await this.store.getBook(id)
    if (!book) throw new Error('书不在书库中')
    if (book.coverPath) return // 已有封面：跳过（计入 ok，保证进度连续）

    const buffer = await this.readFile(book.filePath)
    const metadata = await this.render.getMetadata(buffer, book.format)
    if (!metadata.cover) throw new Error('该书没有封面')

    const thumb = await makeThumbnail(metadata.cover)
    const coverPath = await this.store.setCover(id, thumb.bytes, thumb.ext)
    await this.store.updateBook(id, { coverPath })
    this.emit('cover-ready', id)
  }
}
