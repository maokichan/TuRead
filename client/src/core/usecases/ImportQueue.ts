/**
 * IImportQueue —— 批量导入编排（应用服务 / 用例层，v0.1.9）。
 * 依据：client/docs/FEATURES.md §10（导入：串行 + 进度 + 可取消 + 失败逐条上报）。
 *
 * 为什么下沉到用例层：这套编排（串行、进度、取消、失败上报）此前写在 `LibraryFeature` 里，
 * 与同构的 `CoverQueue`（用例）职责重复且位置不一致 —— UI 应当是 driving adapter，
 * 只负责"显示进度、把失败写进诊断日志"。移动后 LibraryFeature 不再持有编排状态。
 *
 * 编排：readFile（文件能力）→ IBookService.importBook（指纹 + 元数据 + 入库，含指纹去重）
 */
import type { BookRecord } from '@core/domain/types'
import { basename, extToFormat } from '@core/domain/format'
import { TypedEmitter } from '@core/ports/emitter'
import type { IBookService } from './BookService'

export interface ImportSummary {
  total: number
  /** 成功处理的条目数（含指纹复用） */
  imported: number
  /** 其中指纹命中、复用了已有条目的数量 */
  reused: number
  failed: number
  cancelled: boolean
}

export interface ImportQueueEvents {
  /** done/total 随队列增长而更新 */
  progress: (done: number, total: number) => void
  imported: (book: BookRecord, reused: boolean) => void
  'import-failed': (path: string, message: string) => void
  done: (summary: ImportSummary) => void
}

export interface IImportQueue extends TypedEmitter<ImportQueueEvents> {
  /** 入队导入（同一路径只入队一次；运行中可继续入队） */
  enqueue(paths: string[]): void
  /** 取消剩余队列（正在处理的那本会跑完） */
  cancel(): void
  isRunning(): boolean
}

export class ImportQueue extends TypedEmitter<ImportQueueEvents> implements IImportQueue {
  private queue: string[] = []
  private planned = new Set<string>()
  private total = 0
  private done = 0
  private imported = 0
  private reused = 0
  private failed = 0
  private running = false
  private cancelled = false

  constructor(
    private readFile: (path: string) => Promise<ArrayBuffer>,
    private books: IBookService
  ) {
    super()
  }

  enqueue(paths: string[]): void {
    this.cancelled = false
    for (const path of paths) {
      if (this.planned.has(path)) continue
      this.planned.add(path)
      this.queue.push(path)
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
      const path = this.queue.shift() as string
      try {
        const buffer = await this.readFile(path)
        const name = basename(path)
        const res = await this.books.importBook(buffer, name, extToFormat(name), path)
        this.imported++
        if (res.reused) this.reused++
        this.emit('imported', res.book, res.reused)
      } catch (err) {
        this.failed++
        this.emit('import-failed', path, (err as Error).message)
      }
      this.done++
      this.emit('progress', this.done, this.total)
    }
    this.running = false
    this.emit('done', {
      total: this.total,
      imported: this.imported,
      reused: this.reused,
      failed: this.failed,
      cancelled: this.cancelled
    })
    // 重置批次统计，等待下一轮入队
    this.queue = []
    this.planned.clear()
    this.total = 0
    this.done = 0
    this.imported = 0
    this.reused = 0
    this.failed = 0
  }
}
