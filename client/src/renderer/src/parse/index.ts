/**
 * 离屏解析页（parse.html，隐藏 BrowserWindow 加载 = **独立进程**）。
 *
 * 为什么存在：kookit getMetadata 是全书解析（EPUB zip / PDF pdfjs），计算密集；
 * 跑在主窗口渲染进程会把 UI 饿死（328 本书库实测启动挂死）。本页在独立进程里
 * 复用同一份 kookit loader（DOM 齐全，kookit 零改动），只做一件事：
 * 收任务（metadataParseJob）→ 读文件（fsReadFile）→ getMetadata → 回结果
 * （metadataParseResult）。任务**串行**执行（避免解析窗口自己内存爆掉）。
 * 就绪后发 metadataParseReady —— main 在此之前只排队不派发（防早派丢任务）。
 */
import { IPC } from '@shared/ipc'
import type { BookFormat, BookMetadata } from '@core/domain/types'
import { loadKookit, buildNamespace } from '@core/adapters/render/kookitLoader'

interface ParseJob {
  jobId: string
  path: string
  format: BookFormat
}

/** 串行任务链：一次只解析一本，后面排队（独立进程的富余也算资源，但不挥霍） */
let chain = Promise.resolve()

function toMetadata(raw: {
  name?: string
  author?: string
  publisher?: string
  description?: string
  language?: string
  cover?: string
}): BookMetadata {
  return {
    title: (raw.name ?? '').trim(),
    author: raw.author || undefined,
    publisher: raw.publisher || undefined,
    description: raw.description || undefined,
    language: raw.language || undefined,
    cover: raw.cover || undefined
  }
}

window.turead.subscribe(IPC.metadataParseJob, (payload) => {
  const job = payload as ParseJob | null
  if (!job?.jobId || !job.path) return
  chain = chain.then(async () => {
    try {
      const buffer = (await window.turead.invoke(IPC.fsReadFile, job.path)) as ArrayBuffer
      const Kookit = await loadKookit()
      const rendition = Kookit.BookHelper.getRendition(
        buffer,
        {
          format: job.format.toUpperCase(),
          readerMode: 'scroll',
          charset: '',
          animation: 'none',
          convertChinese: 'no',
          parserRegex: '',
          isDarkMode: 'no',
          isMobile: 'no',
          password: '',
          isConvertPDF: 'no',
          backgroundColor: 'rgba(255,255,255,1)',
          isScannedPDF: 'no',
          ocrEngine: ''
        },
        buildNamespace(Kookit)
      )
      const raw = await rendition.getMetadata()
      await window.turead.invoke(IPC.metadataParseResult, { jobId: job.jobId, meta: toMetadata(raw) })
    } catch (err) {
      await window.turead.invoke(IPC.metadataParseResult, {
        jobId: job.jobId,
        error: (err as Error).message
      })
    }
  })
})

// 就绪通告：main 收到后才开始派发任务（含积压队列）
void window.turead.invoke(IPC.metadataParseReady)
