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
import { normalizeLocation } from '@core/domain/location'
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
  /** open 的并发代次：close()/后一次 open() 推进它，让仍在读文件/解析的旧 open 作废 */
  private openToken = 0
  /** note key → 所属渲染节号（removeNote 需要章节号，不能拿"当前章节"顶替） */
  private noteChapters = new Map<string, number>()
  private scrollTimer: number | null = null

  constructor(readFile: ReadBookFile) {
    super()
    this.readFile = readFile
  }

  async open(record: BookRecord, options?: RenderOptions): Promise<void> {
    await this.close()
    // 竞态守卫：open 内部要等"读文件 + 解析"（PDF 可达秒级），期间用户可能已切到另一本书
    // （ReaderFeature 会取消旧流程，但适配器状态是共享的）。先发起的那次解析完若直接写
    // this.rendition，就会覆盖后发起的书 —— 用代次令牌让过期的那次直接作废。
    const token = ++this.openToken
    const [Kookit, buffer] = await Promise.all([loadKookit(), this.readFile(record.filePath)])
    if (token !== this.openToken) return
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
    this.openToken++ // 作废仍在进行的 open
    this.clearScrollWatch()
    this.noteChapters.clear()
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
    // PDF scroll 模式：kookit 的 handleIframeHeight（把 iframe 拉到正文高度）只被文字类渲染调用，
    // PDF 的页面容器全在外层 iframe 里（每页一个固定 paddingTop 的 div，懒渲染 canvas），
    // 无人拉高 iframe → 宿主（scroll 模式的滚动发生地，KOOKIT.md §5.10）永远不可滚。
    // 这里按容器总高补齐（与 handleIframeHeight 的 +300 余量同款）。
    if (this.record?.format === 'PDF') {
      const iframe = element.querySelector('iframe')
      const doc = iframe?.contentDocument
      if (iframe && doc?.body) {
        iframe.height = `${doc.body.scrollHeight + 300}px`
      }
    }
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
    // 坑 §5.10：文字类渲染【不监听宿主容器 scroll】—— 用户手动滚动既不触发位置事件，
    // 也不会有人补 record()，位置永远停在"上一次翻页/初始定位"的旧值（进度条、lastLocation
    // 持久化、房间同步全跟着错）。这里在宿主容器上自建滚动监听：停稳 400ms 后补一次 record()。
    // PDF 自带 scroll 监听，多这一次 record() 只是重复算一次，无副作用。
    element.removeEventListener('scroll', this.onHostScroll)
    element.addEventListener('scroll', this.onHostScroll, { passive: true })
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

  /** 目录跳转：透传 kookit goToChapterDocIndex（按渲染节号直达章节起点；PDF=页码） */
  async goToChapter(chapterDocIndex: number): Promise<void> {
    await this.rendition?.goToChapterDocIndex(chapterDocIndex)
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
    const map = (list: Array<{ label: string; href: string; index?: number; subitems?: unknown[] }>): Chapter[] =>
      list.map((c) => {
        const item = c as {
          label: string
          href: string
          index?: number
          subitems?: Array<{ label: string; href: string; index?: number; subitems?: unknown[] }>
        }
        return {
          label: item.label,
          href: item.href,
          // 目录项起始渲染节号透传（kookit Chapter.index = chapterDocIndex；PDF 下为页码）
          chapterDocIndex: typeof item.index === 'number' ? item.index : undefined,
          subitems: item.subitems ? map(item.subitems) : undefined
        }
      })
    return map(this.rendition.getChapter())
  }

  async search(keyword: string): Promise<unknown> {
    return this.rendition?.doSearch(keyword)
  }

  async createNote(note: Note): Promise<void> {
    this.noteChapters.set(note.key, normalizeLocation(note.location).chapterDocIndex)
    await this.rendition?.createOneNote({ ...note, notes: note.notes || [] }, () => {})
  }

  async removeNote(key: string): Promise<void> {
    // 用【笔记自身】所属的渲染节号：kookit removeOneNote(key, chapterDocIndex) 会在该节内查找。
    // 早期实现拿"当前所在章节"，跨章节删除会找不到/删错（笔记功能落地前先修掉这颗雷）。
    const chapterDocIndex =
      this.noteChapters.get(key) ?? normalizeLocation(this.getPosition()).chapterDocIndex
    await this.rendition?.removeOneNote(key, chapterDocIndex)
    this.noteChapters.delete(key)
  }

  async renderHighlighters(notes: Note[]): Promise<void> {
    for (const n of notes) {
      this.noteChapters.set(n.key, normalizeLocation(n.location).chapterDocIndex)
    }
    await this.rendition?.renderHighlighters(notes as unknown[], () => {})
  }

  /** 宿主容器滚动（防抖 400ms）—— 只在停稳后补 record()，避免滚动过程中反复重算 */
  private readonly onHostScroll = (): void => {
    if (this.scrollTimer !== null) window.clearTimeout(this.scrollTimer)
    this.scrollTimer = window.setTimeout(() => {
      this.scrollTimer = null
      void this.recordSettled()
    }, 400)
  }

  /** 滚动停稳后重算位置并上报（坑 §5.10：滚动刚开始时 record() 拿到的是旧位置） */
  private async recordSettled(): Promise<void> {
    const rendition = this.rendition
    if (!rendition) return
    await rendition.record()
    // record() 期间可能已 close() 或打开了另一本书 —— 此时再上报会把"零位置/他书位置"发出去
    if (rendition !== this.rendition) return
    this.emitLocationChanged()
  }

  private clearScrollWatch(): void {
    if (this.scrollTimer !== null) {
      window.clearTimeout(this.scrollTimer)
      this.scrollTimer = null
    }
    this.element?.removeEventListener('scroll', this.onHostScroll)
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
    // 统一经定位标准归一（kookit 内部是 string，域层一律 number；语义权威见 domain/location.ts）
    return normalizeLocation({
      chapterDocIndex: p.chapterDocIndex,
      chapterHref: p.chapterHref ?? '',
      count: Number(p.count ?? 0),
      page: Number(p.page ?? 0),
      percentage: Number(p.percentage ?? 0),
      text: p.text ?? '',
      chapterTitle: p.chapterTitle
    })
  }

  private emitLocationChanged(): void {
    // 未打开（或已 close）时不上报：getPosition() 会返回零位置，消费方可能把它当真实位置存下来
    if (!this.rendition) return
    this.emit('location-changed', this.getPosition())
  }
}
