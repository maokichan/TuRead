/**
 * IRenderService 适配器 —— kookit（真实实现，黑盒引用 client/src/vendor/kookit.esm.js）。
 * 用法：BookHelper.getRendition(buffer, config, Kookit) → rendition.renderTo(el) → on('rendered'/'page-changed')。
 * 位置：kookit getPosition() 返回 tempLocation（chapterDocIndex/chapterHref/count/page/percentage/text/chapterTitle），
 *       与领域 BookLocation 对齐，本适配器负责换算（count/page/percentage 统一为 number）。
 *
 * PDF 注入口（KOOKIT.md §8.1）：kookit 在模块顶层 `const pdfjsLib = window.pdfjsLib` 捕获全局，
 * 因此 vendor 必须【动态加载】且先 `ensurePdfjs()`（import('pdfjs-dist') 求值时自动挂
 * globalThis.pdfjsLib）再 `import('@vendor/kookit.esm')` —— 不能静态 import vendor。
 */
import type {
  KookitConfig,
  KookitPosition,
  KookitRendition,
  KookitNamespace,
  KookitRenderClass
} from '@vendor/kookit.esm'
import { TypedEmitter } from '@core/ports/emitter'
import type { IRenderService, RenderServiceEvents } from '@core/ports/render'
import type { BookLocation, BookRecord, Chapter, Note, RenderOptions } from '@core/domain/types'
import { ensurePdfjs } from './pdfjsSetup'

export type ReadBookFile = (path: string) => Promise<ArrayBuffer>

type KookitModule = typeof import('@vendor/kookit.esm')

/** vendor 懒加载（只加载一次）；先注入 pdfjs 再 import vendor（顺序不可反，见文件头注释） */
let kookitPromise: Promise<KookitModule> | null = null
function loadKookit(): Promise<KookitModule> {
  if (!kookitPromise) {
    kookitPromise = (async () => {
      await ensurePdfjs()
      return await import('@vendor/kookit.esm')
    })()
  }
  return kookitPromise
}

function buildNamespace(Kookit: KookitModule): KookitNamespace {
  const cls = (c: unknown) => c as KookitRenderClass
  return {
    CacheRender: cls(Kookit.CacheRender),
    EpubRender: cls(Kookit.EpubRender),
    MobiRender: cls(Kookit.MobiRender),
    PdfRender: cls(Kookit.PdfRender),
    PdfTextRender: cls(Kookit.PdfTextRender),
    TxtRender: cls(Kookit.TxtRender),
    ComicRender: cls(Kookit.ComicRender),
    Fb2Render: cls(Kookit.Fb2Render),
    DocxRender: cls(Kookit.DocxRender),
    MdRender: cls(Kookit.MdRender),
    HtmlRender: cls(Kookit.HtmlRender)
  }
}

export class KookitRenderAdapter extends TypedEmitter<RenderServiceEvents> implements IRenderService {
  private readFile: ReadBookFile
  private record: BookRecord | null = null
  private rendition: KookitRendition | null = null
  private element: HTMLElement | null = null

  constructor(readFile: ReadBookFile) {
    super()
    this.readFile = readFile
  }

  async open(record: BookRecord, options?: RenderOptions): Promise<void> {
    await this.close()
    const [Kookit, buffer] = await Promise.all([loadKookit(), this.readFile(record.filePath)])
    const config = this.toKookitConfig(record.format, options)
    const rendition = Kookit.BookHelper.getRendition(buffer, config, buildNamespace(Kookit))
    this.record = record
    this.rendition = rendition
    rendition.on('rendered', (chapterDocIndex: number) => {
      this.emit('rendered', chapterDocIndex)
      this.emitLocationChanged()
    })
    rendition.on('page-changed', () => this.emitLocationChanged())
    rendition.on('scroll-text', () => this.emitLocationChanged())
  }

  async close(): Promise<void> {
    if (this.rendition) {
      this.rendition.removeContent()
    }
    if (this.element) {
      this.element.innerHTML = ''
    }
    this.rendition = null
    this.record = null
    this.element = null
  }

  async renderTo(element: HTMLElement): Promise<void> {
    if (!this.rendition) throw new Error('未打开书籍（先调 open）')
    this.element = element
    element.innerHTML = ''
    await this.rendition.renderTo(element)
    // 首次定位：有历史位置就回到那里，否则渲染初始章节。
    // ⚠ kookit 契约（KOOKIT.md §2/§8）：renderTo 只建 iframe + 布局，【不渲染正文】，
    //   必须再补一次导航调用（goToChapterIndex(0) / goToPosition）才真正渲染章节；
    //   record() 只算位置不渲染，用它会导致正文空白（v0.1.1 遗留根因）。
    //   harness 验证的成功序列是 renderTo → record() → goToChapterIndex(0)，这里保持同序。
    await this.rendition.record()
    if (this.record?.lastLocation) {
      await this.rendition.goToPosition(JSON.stringify(this.record.lastLocation))
    } else {
      await this.rendition.goToChapterIndex(0)
    }
  }

  async next(): Promise<void> {
    await this.rendition?.next()
  }

  async prev(): Promise<void> {
    await this.rendition?.prev()
  }

  async goToPage(page: number): Promise<void> {
    await this.rendition?.goToPage(page)
  }

  async goToPercentage(percentage: number): Promise<void> {
    await this.rendition?.goToPercentage(percentage)
  }

  async goToPosition(location: BookLocation): Promise<void> {
    await this.rendition?.goToPosition(JSON.stringify(location))
  }

  getPosition(): BookLocation {
    if (!this.rendition) {
      return { chapterDocIndex: 0, chapterHref: '', count: 0, page: 0, percentage: 0, text: '' }
    }
    const p = this.rendition.getPosition()
    return this.toBookLocation(p)
  }

  getProgress(): { totalPage: number; currentPage: number } {
    const p = this.rendition?.getProgress()
    return { totalPage: p?.totalPage ?? 0, currentPage: p?.currentPage ?? 0 }
  }

  getChapter(): Chapter[] {
    if (!this.rendition) return []
    return this.rendition
      .getChapter()
      .map((c) => ({ label: c.label, href: c.href, subitems: c.subitems }))
  }

  async search(keyword: string): Promise<unknown> {
    return this.rendition?.doSearch(keyword)
  }

  async createNote(note: Note): Promise<void> {
    await this.rendition?.createOneNote({ ...note, notes: note.notes || [] }, () => {})
  }

  async removeNote(key: string): Promise<void> {
    const chapterDocIndex = parseInt(String(this.getPosition().chapterDocIndex)) || 0
    await this.rendition?.removeOneNote(key, chapterDocIndex)
  }

  async renderHighlighters(notes: Note[]): Promise<void> {
    await this.rendition?.renderHighlighters(notes as unknown[], () => {})
  }

  private toKookitConfig(format: BookRecord['format'], options?: RenderOptions): KookitConfig {
    return {
      format: format.toUpperCase(),
      readerMode: options?.readerMode || 'scroll',
      charset: '',
      animation: options?.animation || 'none',
      convertChinese: options?.convertChinese ? 'yes' : 'no',
      parserRegex: '',
      isDarkMode: options?.isDarkMode ? 'yes' : 'no',
      isMobile: 'no',
      password: options?.password || '',
      isConvertPDF: 'no',
      backgroundColor: options?.backgroundColor || '',
      isScannedPDF: options?.isScannedPDF ? 'yes' : 'no',
      ocrEngine: options?.ocrEngine || ''
    }
  }

  private toBookLocation(p: KookitPosition): BookLocation {
    return {
      chapterDocIndex: p.chapterDocIndex,
      chapterHref: p.chapterHref ?? '',
      count: Number(p.count ?? 0),
      page: Number(p.page ?? 0),
      percentage: Number(p.percentage ?? 0),
      text: p.text ?? '',
      chapterTitle: p.chapterTitle
    }
  }

  private emitLocationChanged(): void {
    this.emit('location-changed', this.getPosition())
  }
}
