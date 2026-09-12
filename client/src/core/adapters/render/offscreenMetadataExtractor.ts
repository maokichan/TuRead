/**
 * IMetadataExtractor 适配器 —— 离屏解析窗口的客户端（2026-09-12）。
 *
 * 为什么：kookit getMetadata 全书解析（EPUB zip / PDF pdfjs）计算密集，跑在主窗口
 * 渲染进程会把 UI 饿死（328 本书库实测启动挂死）。本适配器只做**转发与配对**：
 * invoke(metadataParseRequest) → main 中继给隐藏解析窗口（独立进程）→ 结果经
 * metadataParseResult 回来 resolve。文件字节走"路径"不走过境（解析窗口自己读文件），
 * 主窗口从头到尾不碰大 buffer。
 * 失败模型：单任务 60s 超时 reject（调用方 CoverQueue 会标 coverFailed）；
 * 解析窗口崩溃由 main 逐任务回错误（见 main/index.ts 中继）。
 */
import { IPC, type TureadBridge } from '@shared/ipc'
import type { BookFormat, BookMetadata } from '@core/domain/types'
import type { IMetadataExtractor } from '@core/ports/metadata'

interface PendingJob {
  resolve: (meta: BookMetadata) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const JOB_TIMEOUT_MS = 60000

export class OffscreenMetadataExtractor implements IMetadataExtractor {
  private pending = new Map<string, PendingJob>()
  private seq = 0
  private subscribed = false

  constructor(private bridge: TureadBridge) {}

  async extractFromFile(path: string, format: BookFormat): Promise<BookMetadata> {
    this.ensureSubscribed()
    const jobId = `${Date.now().toString(36)}-${++this.seq}`
    return new Promise<BookMetadata>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(jobId)
        reject(new Error('离屏解析超时（60s）'))
      }, JOB_TIMEOUT_MS)
      this.pending.set(jobId, { resolve, reject, timer })
      void this.bridge.invoke(IPC.metadataParseRequest, { jobId, path, format })
    })
  }

  private ensureSubscribed(): void {
    if (this.subscribed) return
    this.subscribed = true
    this.bridge.subscribe(IPC.metadataParseResult, (payload) => {
      const p = payload as { jobId?: string; meta?: BookMetadata; error?: string } | null
      if (!p?.jobId) return
      const job = this.pending.get(p.jobId)
      if (!job) return
      this.pending.delete(p.jobId)
      clearTimeout(job.timer)
      if (p.error || !p.meta) job.reject(new Error(p.error || '离屏解析返回空结果'))
      else job.resolve(p.meta)
    })
  }
}
