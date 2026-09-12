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
  KookitRendition
} from '@vendor/kookit.esm'
import { TypedEmitter } from '@core/ports/emitter'
import { normalizeLocation } from '@core/domain/location'
import { isDarkResolvedTheme, type ResolvedTheme } from '@core/domain/theme'
import type { IRenderService, RenderServiceEvents } from '@core/ports/render'
import type {
  BookFormat,
  BookLocation,
  BookMetadata,
  BookRecord,
  Chapter,
  Note,
  ReaderTypography,
  RenderOptions
} from '@core/domain/types'
import { loadKookit, buildNamespace } from './kookitLoader'
import { ensurePdfjs } from './pdfjsSetup'
import { detectTextCharset } from './charset'

export type ReadBookFile = (path: string) => Promise<ArrayBuffer>

/** 正文溢出的"真伪阈值"（px）：kookit 给文字类 iframe 的 height 留了 +300px 余量，
 *  ≤ 这个量级不算真的需要滚动，滚动条宽度归零（见 refreshScrollAffordance）。 */
const SCROLL_SLACK_PX = 320

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
  /** 当前主题（open 时由 options.theme 写入；applyTheme 热更新；深色 → 注入正文 CSS） */
  private theme: ResolvedTheme | null = null
  /**
   * 当前排版参数（`applyTypography` 写入）。**跨书保留**（是用户偏好，不是某本书的状态），
   * `close()` 不清它 —— 换书后 renderTo 末尾的注入会用同一份值。
   */
  private typography: ReaderTypography | null = null

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
    this.theme = options?.theme ?? null
    const [Kookit, buffer] = await Promise.all([loadKookit(), this.readFile(record.filePath)])
    if (token !== this.openToken) {
      // 代次守卫命中：这次 open 已被更晚的 open/close 作废。**静默返回**是调用方无法区分的
      // "成功 / 什么都没发生"（TODO「适配器方法静默 no-op」）；至少让它留下痕迹，
      // 便于定位"重开书偶发空白"（2026-09-11 dev 自检观察到间歇性 恢复=失败）。
      console.warn(`[render] open 作废（代次守卫）：${record.filePath}`)
      return
    }
    const config = this.toKookitConfig(record.format, options)
    // TXT 的渲染路径要求调用方提供编码（kookit TxtRender `new TextDecoder(config.charset)`，
    // 传 '' 直接 RangeError —— 此前 TXT 全格式打不开的根因，2026-09-12）；MD 固定按 UTF-8 读，不在此列
    if (record.format === 'TXT') {
      config.charset = detectTextCharset(buffer)
    }
    const rendition = Kookit.BookHelper.getRendition(buffer, config, buildNamespace(Kookit))
    this.record = record
    this.rendition = rendition
    rendition.on('rendered', (chapterDocIndex: number) => {
      this.emit('rendered', chapterDocIndex)
      this.refreshScrollAffordance()
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
    this.theme = null
  }

  /**
   * 解析元数据（**无状态**，不碰当前阅读会话）：临时构造 rendition 取 metadata 后丢弃。
   * 用于封面提取（CoverQueue）——不能借用实例上的 rendition，否则会把用户正在读的书顶掉。
   * kookit 的 getMetadata() 内部会自行 parse（EPUB 读 zip / PDF 走 pdfjs），cover 是 data URL。
   */
  async getMetadata(buffer: ArrayBuffer, format: BookFormat): Promise<BookMetadata> {
    const Kookit = await loadKookit()
    const rendition = Kookit.BookHelper.getRendition(
      buffer,
      this.toKookitConfig(format),
      buildNamespace(Kookit)
    )
    const raw = await rendition.getMetadata()
    return {
      title: (raw.name ?? '').trim(),
      author: raw.author || undefined,
      publisher: raw.publisher || undefined,
      description: raw.description || undefined,
      language: raw.language || undefined,
      cover: raw.cover || undefined
    }
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
    // 深色模式：注入正文深色 CSS（浅色不注入，保留书的自有外观）
    await this.applyStoredTheme()
    // 内容高度已定 → 决定滚动条是否该出现（见 refreshScrollAffordance）
    this.refreshScrollAffordance()
  }

  /** 向已打开的正文注入/更新主题样式（CONTRACTS.md §4.1）。未 open 时只记录、renderTo 时生效。 */
  async applyTheme(theme: ResolvedTheme): Promise<void> {
    this.theme = theme
    await this.applyStoredTheme()
  }

  /** 向已打开的正文注入/更新排版参数（CONTRACTS.md §4.1，v0.3.3）。与 applyTheme 共用一份 CSS。 */
  async applyTypography(typography: ReaderTypography): Promise<void> {
    this.typography = typography
    await this.applyStoredTheme()
  }

  private async applyStoredTheme(): Promise<void> {
    const rendition = this.rendition
    if (!rendition) return
    // PDF 是位图（canvas），正文深色走像素处理（TODO 单独立项）；这里对 PDF 无操作。
    if (this.record?.format === 'PDF') return
    // ⚠ 注意：**排版参数（纸内边距）与主题无关，任何主题下都要注入** ——
    // "浅色不注入"这条只针对**颜色**（保留书的自有外观），不是整份样式。
    rendition.setStyle(this.buildReaderCss())
  }

  /**
   * 正文样式（kookit 唯一注入口 `setStyle`，换章只重写 `body`、我们的 `<style>` 留在 `head`，
   * 一次注入全书生效）。三部分：
   * ① **纸内边距**（`--page-pad-x`）：正文与纸边之间的距离（用户 2026-09-11 指出"出血留得太少"）。
   *    注入到 `body` 而不是宿主容器 —— 见 styles.css `--page-pad-x` 的注释（kookit 排版宽度算术）。
   * ② **排版参数**（`applyTypography`）：字号/行距/段距；**缺省项不注入**（尊重书自带排版）。
   *    字号/行距同时打到 `html,body` 与常见块级元素 —— 书若用相对单位（em/%）会随之缩放，
   *    而写成 px 的那些元素只有显式覆盖才动得了（"保守但有效"）。
   * ③ **深色正文颜色**（仅深色模式）：颜色取自宿主语义 token `--page-bg/--page-text`。
   */
  private buildReaderCss(): string {
    const cs = getComputedStyle(document.documentElement)
    const readVar = (name: string): string => (cs.getPropertyValue(name) || '').trim()
    const padX = readVar('--page-pad-x') || '44px'
    const parts = [`body{padding-inline:${padX}!important;}`]

    const t = this.typography
    const blocks = 'body,p,div,li,dd,blockquote,td'
    if (t?.fontSize) parts.push(`html,body{font-size:${t.fontSize}px!important;}`)
    if (t?.lineHeight) parts.push(`html,body,${blocks}{line-height:${t.lineHeight}!important;}`)
    if (t?.paragraphSpacing !== undefined) {
      parts.push(`p{margin-top:0!important;margin-bottom:${t.paragraphSpacing}px!important;}`)
    }

    const dark = this.theme ? isDarkResolvedTheme(this.theme) : false
    if (dark) {
      const bg = readVar('--page-bg') || '#141619'
      const text = readVar('--page-text') || '#d8dbe0'
      parts.push(
        `body,html{background-color:${bg}!important;color:${text}!important;-webkit-text-fill-color:${text}!important;}` +
          `a{text-decoration:underline!important;}` +
          `code,pre{background-color:transparent!important;}` +
          `img{opacity:0.85;}` +
          `table{border-color:currentColor!important;}`
      )
    }
    return parts.join('')
  }

  /** 读取宿主 CSS 变量（页面配色单一来源 = styles.css token） */
  private readCssVar(name: string, fallback = ''): string {
    return (getComputedStyle(document.documentElement).getPropertyValue(name) || fallback).trim()
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
    this.refreshScrollAffordance()
    this.emitLocationChanged()
  }

  /**
   * kookit 对文字类 iframe 的 height 硬留了 **+300px 余量**（`handleIframeHeight`，KOOKIT §5.8），
   * 所以"短章节"也总有 ~300px 可滚 —— 那不是真正的内容溢出。这种量级下**隐藏滚动条**，
   * 否则短章节会顶着一根接近满高的长条（用户 2026-09-11 反馈）。
   *
   * 隐藏手段：设内联 `scrollbar-width: none` —— 标准属性优先于 `::-webkit-scrollbar`
   * （Chromium 121+，见 styles.css 的坑注释），正好当开关用，而且**完全不占位**；
   * 真正溢出时清掉它，让 2px 的 webkit 规则生效。
   * 用内联 style 而不是 class：宿主元素的 `className` 归 React 管，外部改 class 会被渲染冲掉。
   * 溢出像素数写到 `data-scroll-overflow`（排查用，自检读它）。
   */
  private refreshScrollAffordance(): void {
    const el = this.element
    if (!el) return
    const overflow = el.scrollHeight - el.clientHeight
    const fits = overflow <= SCROLL_SLACK_PX
    el.style.setProperty('scrollbar-width', fits ? 'none' : '')
    el.dataset.scrollOverflow = String(overflow)
  }

  private clearScrollWatch(): void {
    if (this.scrollTimer !== null) {
      window.clearTimeout(this.scrollTimer)
      this.scrollTimer = null
    }
    this.element?.removeEventListener('scroll', this.onHostScroll)
  }

  private toKookitConfig(format: BookRecord['format'], options?: RenderOptions): KookitConfig {
    // 深色判定优先走 theme（v0.3.0 规正）：纯色·深 / 羊皮纸·深 = 深色；isDarkMode 为兼容兜底
    const isDark = options?.theme
      ? isDarkResolvedTheme(options.theme)
      : (options?.isDarkMode ?? false)
    return {
      format: format.toUpperCase(),
      readerMode: options?.readerMode || 'scroll',
      charset: '',
      animation: options?.animation || 'none',
      convertChinese: options?.convertChinese ? 'yes' : 'no',
      parserRegex: '',
      isDarkMode: isDark ? 'yes' : 'no',
      isMobile: 'no',
      password: options?.password || '',
      isConvertPDF: 'no',
      // 正文纸色单一来源 = 宿主 --page-bg token（styles.css）；分页模式的折页阴影据此配色
      backgroundColor: options?.backgroundColor || this.readCssVar('--page-bg'),
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
