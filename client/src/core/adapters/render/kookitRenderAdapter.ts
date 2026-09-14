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
import { normalizeLocation, isZeroLocation } from '@core/domain/location'
import { isDarkResolvedTheme, type ResolvedTheme } from '@core/domain/theme'
import type { IRenderService, RenderServiceEvents } from '@core/ports/render'
import type {
  AnchorQuote,
  BookFormat,
  BookLocation,
  BookMetadata,
  BookRecord,
  Chapter,
  Note,
  NoteColor,
  ReaderTypography,
  RenderOptions,
  TextAnchor
} from '@core/domain/types'
import {
  QUOTE_CONTEXT_MAX,
  QUOTE_EXACT_MAX,
  clipQuote,
  normalizeAnchor,
  quoteSimilarity
} from '@core/domain/anchor'
import { loadKookit, buildNamespace, buildKookitConfig } from './kookitLoader'
import { ensurePdfjs } from './pdfjsSetup'
import { detectTextCharset } from './charset'

export type ReadBookFile = (path: string) => Promise<ArrayBuffer>/** 正文溢出的"真伪阈值"（px）：kookit 给文字类 iframe 的 height 留了 +300px 余量，
 *  ≤ 这个量级不算真的需要滚动，滚动条宽度归零（见 refreshScrollAffordance）。 */
const SCROLL_SLACK_PX = 320

/** 笔记色缺省：`Note.color` 未给时（书签/墨迹无色的语义回退）用哪一支 token */
const DEFAULT_NOTE_COLOR: NoteColor = 'yellow'

/**
 * 文字类的引擎载荷标识（锚点 `Fragment.engine`）。
 * 2026-09-14 逆向核实：kookit 文字类笔记载荷是 **rangy 序列化字符范围**，不是 CFI
 * （`getHightlightCoords()` = `rangy.getSelection(iframe).saveCharacterRanges(doc.body)[0]`）。
 * 换渲染内核时新增取值，旧值由适配器按名分派（见 `anchor.ts` 的 Fragment 设计）。
 */
const TEXT_FRAGMENT_ENGINE = 'kookit-rangy'

export class KookitRenderAdapter extends TypedEmitter<RenderServiceEvents> implements IRenderService {
  private readFile: ReadBookFile
  private record: BookRecord | null = null
  private rendition: KookitRendition | null = null
  private element: HTMLElement | null = null
  /** open 的并发代次：close()/后一次 open() 推进它，让仍在读文件/解析的旧 open 作废 */
  private openToken = 0
  /** 笔记 id → 所属渲染节号（removeNote 需要章节号，不能拿"当前章节"顶替） */
  private noteChapters = new Map<string, number>()
  /**
   * 当前**已渲染**的节号（由 `rendered` 事件写入）。
   * 高亮回显的过滤依据：kookit 文字类只有一个 iframe（`GeneralRender.getIframe()` =
   * `#page-area` 下第一个 iframe），`renderHighlighters` 是在"当前那一节的 document"上
   * 按**字符偏移**重锚的 —— 喂进别的节的笔记会错位或抛错。null = 尚未渲染过任何节。
   */
  private renderedChapter: number | null = null
  /** 已挂选区监听的**书文档**（换章可能换文档 → 每次 rendered 重新对齐绑定） */
  private selectionDoc: Document | null = null
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
    rendition.on('rendered', (chapterDocIndex?: number) => {
      this.renderedChapter = this.resolveRenderedChapter(chapterDocIndex)
      this.attachSelectionWatch()
      this.emit('rendered', this.renderedChapter)
      this.refreshScrollAffordance()
      this.emitLocationChanged()
    })
    rendition.on('page-changed', () => this.emitLocationChanged())
    rendition.on('scroll-text', () => this.emitLocationChanged())
  }

  async close(): Promise<void> {
    this.openToken++ // 作废仍在进行的 open
    this.clearScrollWatch()
    this.detachSelectionWatch()
    this.noteChapters.clear()
    this.renderedChapter = null
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
   * ④ **选区配色**（v0.3.13，用户 2026-09-14 指出"选中文字仍是系统自带蓝色，不好看"）：
   *    `::selection` 也只能在这份注入 CSS 里定（宿主 CSS 跨不过文档边界）；颜色取宿主 token
   *    `--selection-bg`（四套取向各一组，低饱和、跟主题）→ **在任何主题下都不再是系统蓝**。
   */
  private buildReaderCss(): string {
    const cs = getComputedStyle(document.documentElement)
    const readVar = (name: string): string => (cs.getPropertyValue(name) || '').trim()
    const padX = readVar('--page-pad-x') || '44px'
    const parts = [`body{padding-inline:${padX}!important;}`]

    // ④ 选区：**始终注入**（与颜色不同——它不是"书自有外观"的一部分，而是我们接手的选择反馈）。
    // 只给背景不给前景色：做成一层低饱和"淡扫"，而不是反色块 —— 阅读时更温和，且不必担心
    // 在深色纸上把正文色配错。token 缺失时留空（退回浏览器默认），并在控制台留痕。
    const selectionBg = readVar('--selection-bg')
    if (selectionBg) {
      parts.push(`::selection{background:${selectionBg}!important;}`)
    } else {
      console.warn('[render] 缺少 --selection-bg token（styles.css 未定义？）——选区将回落浏览器默认色')
    }

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
    await this.requireRendition('next').next()
  }

  async prev(): Promise<void> {
    await this.requireRendition('prev').prev()
  }

  async goToPage(page: number): Promise<void> {
    await this.requireRendition('goToPage').goToPage(page)
  }

  async goToPercentage(percentage: number): Promise<void> {
    await this.requireRendition('goToPercentage').goToPercentage(percentage)
  }

  /** 目录跳转：透传 kookit goToChapterDocIndex（按渲染节号直达章节起点；PDF=页码） */
  async goToChapter(chapterDocIndex: number): Promise<void> {
    await this.requireRendition('goToChapter').goToChapterDocIndex(chapterDocIndex)
  }

  async goToPosition(location: BookLocation): Promise<void> {
    await this.requireRendition('goToPosition').goToPosition(JSON.stringify(location))
  }

  /**
   * 导航方法的未打开守卫（TODO「适配器方法静默 no-op」销案，2026-09-13）：
   * 与 renderTo 同口径——**未 open 即抛错**，调用方（UI/自检/用例）能明确收到"什么都没发生"
   * 的失败，而不是把静默 no-op 当成功吞掉。getPosition/getProgress/getChapter 例外：
   * 它们是查询，返回零值是文档化语义（CONTRACTS §4.1）。
   */
  private requireRendition(method: string): KookitRendition {
    if (!this.rendition) throw new Error(`渲染未打开：${method}（先调 open）`)
    return this.rendition
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
    const chapterIndex = note.anchor.norm.chapterIndex
    // 无引擎载荷 = 引擎无从回显（弱锚点笔记只该存库、不该走到渲染）。抛错而非静默 no-op。
    if (!note.anchor.fragment) {
      throw new Error(
        `[render] createNote 缺少引擎载荷（engine fragment）：note=${note.id} chapter=${chapterIndex}`
      )
    }
    this.noteChapters.set(note.id, chapterIndex)
    await this.rendition?.createOneNote(this.toKookitNote(note), this.onNoteClick)
  }

  async removeNote(noteId: string): Promise<void> {
    // 用【笔记自身】所属的渲染节号：kookit removeOneNote(key, chapterDocIndex) 会在该节内查找。
    // 早期实现拿"当前所在章节"，跨章节删除会找不到/删错（笔记功能落地前先修掉这颗雷）。
    const chapterDocIndex =
      this.noteChapters.get(noteId) ?? normalizeLocation(this.getPosition()).chapterDocIndex
    await this.rendition?.removeOneNote(noteId, chapterDocIndex)
    this.noteChapters.delete(noteId)
  }

  async renderHighlighters(notes: Note[]): Promise<void> {
    for (const n of notes) {
      this.noteChapters.set(n.id, n.anchor.norm.chapterIndex)
    }
    // ① 过滤到"当前已渲染的节"：kookit 只对当前 document 按字符偏移重锚，
    //    跨节笔记喂进去会错位或抛错（此前不过滤 —— 见 CONTRACTS §4.1 注）。
    const chapter = this.renderedChapter
    const current = chapter === null
      ? []
      : notes.filter((n) => n.anchor.norm.chapterIndex === chapter)
    // ② 无载荷的笔记跳过（合法降级态；不是调用方的编程错误，故只记日志不抛）
    const renderable = current.filter((n) => n.anchor.fragment)
    if (renderable.length < current.length) {
      console.warn(
        `[render] renderHighlighters 跳过 ${current.length - renderable.length} 条无引擎载荷的笔记（章 ${chapter}）`
      )
    }
    if (renderable.length === 0) return
    // ③ 传**拷贝**：kookit `renderHighlighters` 内部 `notes.reverse()` 是原地修改入参，
    //    直接传调用方数组会把 store/Feature 持有的顺序改掉。
    await this.rendition?.renderHighlighters(
      renderable.map((n) => this.toKookitNote(n)),
      this.onNoteClick
    )
  }

  // ————— 选区级锚点（定位转换机制的引擎侧原语，DATA_MODEL §3.1.1）—————

  /**
   * `fromSelection`：把当前正文选区取成统一锚点。
   * 三层证据一次取齐 —— Fragment（引擎精确载荷 = kookit 自己的 rangy 序列化）、
   * Norm（章 + 章内进度）、quote（划线原文快照 + 前后文，供 remeasure）。
   * 只读：不改引擎状态、不落库（落库是用例层的事）。
   */
  async getSelectionAnchor(): Promise<TextAnchor | null> {
    const rendition = this.rendition
    if (!rendition) return null
    // PDF 是「页 + 归一化坐标」的另一套载荷（第二批；用户 2026-09-14 定文字类优先）
    if (this.record?.format === 'PDF') return null

    const doc = rendition.getDocument()
    const sel = doc?.getSelection()
    if (!doc || !sel || sel.rangeCount === 0 || sel.isCollapsed) return null
    const range = sel.getRangeAt(0)
    const exact = range.toString()
    // 纯空白/图片选区（toString 为空）不算可标内容 —— 建了也没法回显
    if (exact.trim() === '') return null

    // Fragment 必须 stringify：kookit createOneNote / renderHighlighters 都做 JSON.parse(item.range)
    const raw = await rendition.getHightlightCoords()
    if (!raw) return null

    const chapterIndex =
      this.renderedChapter ?? normalizeLocation(this.getPosition()).chapterDocIndex

    return normalizeAnchor({
      norm: {
        chapterIndex,
        progression: estimateProgression(range, doc),
        quote: quoteFromRange(range)
      },
      fragment: { engine: TEXT_FRAGMENT_ENGINE, key: JSON.stringify(raw) }
    })
  }

  /**
   * `resolveToView`：导航到锚点（笔记面板点击 / 房间同步回跳）。
   * 本轮精度 = **章级**（`chapterDocIndex`；PDF 下即页码）—— 与"标在哪一章"同标尺，
   * 对"回到那条笔记"够用；`revealNoteId` 给值时再把该条高亮元素滚进视野，达成面板点击的
   * "精确落点"观感（**不依赖 Fragment 解算**，故弱锚点笔记也能看到落点）。
   */
  async resolveAnchor(anchor: TextAnchor, opts?: { revealNoteId?: string }): Promise<boolean> {
    const rendition = this.rendition
    if (!rendition) return false
    const n = normalizeAnchor(anchor)
    await rendition.goToChapterDocIndex(n.norm.chapterIndex)
    if (opts?.revealNoteId) {
      // goToChapterDocIndex 内部异步渲染 → 等本章落定再找元素（找不到就只到章级，不报错）
      await new Promise((r) => window.setTimeout(r, 120))
      const el = rendition
        .getDocument()
        ?.querySelector(`.kookit-note[data-key="${CSS.escape(opts.revealNoteId)}"]`)
      el?.scrollIntoView({ block: 'center' })
    }
    return true
  }

  /**
   * `remeasure`：Fragment 失效后按原文快照找回位置。
   *
   * kookit 搜索返回 `{excerpt, cfi}`，`cfi` 是含 `chapterDocIndex` 的 JSON 串
   * （逆向自 bundle 的 `getSearchResult`：`{text, chapterTitle, chapterDocIndex, chapterHref,
   * count:"search", percentage, keyword}`）—— **没有字符偏移**，所以只能重建到**章级**：
   * 产出一定是**弱锚点**（`fragment = null`）。这是诚实降级而非缺陷：弱锚点仍能回跳，
   * 且用户下次在该处重新划线即可升级为强锚点。
   *
   * 选路：多条命中按 `quoteSimilarity` 取最相似的一条（excerpt 是块 ±100 字窗口，
   * 真正命中的块相似度显著更高）。找不到 → null，由调用方决定保留旧锚点还是标记失效。
   * 代价：搜索遍历全书各章，属用户显式触发的恢复动作（可接受）。
   */
  async remeasureAnchor(anchor: TextAnchor): Promise<TextAnchor | null> {
    const rendition = this.rendition
    const quote = anchor?.norm?.quote?.exact ?? ''
    if (!rendition || quote === '') return null

    const hits = (await rendition.doSearch(quote)) as
      | Array<{ excerpt?: string; cfi?: string }>
      | undefined
    if (!Array.isArray(hits) || hits.length === 0) return null

    let best: { chapterIndex: number; sim: number } | null = null
    for (const hit of hits) {
      const chapterIndex = chapterIndexOfSearchHit(hit?.cfi)
      if (chapterIndex === null) continue
      const sim = quoteSimilarity(quote, hit?.excerpt ?? '')
      if (!best || sim > best.sim) best = { chapterIndex, sim }
    }
    if (!best) return null

    return normalizeAnchor({
      norm: {
        chapterIndex: best.chapterIndex,
        // 搜索不给块内偏移 → 记章首。progression 是 display/粗排序角色（§2.1 三级角色），
        // 这里**不假装精确**：写 0 比编一个数诚实。
        progression: 0,
        quote: anchor.norm.quote
      },
      fragment: null
    })
  }

  /** 清掉书文档里的选区（宿主清不掉另一个文档的选区，见 CONTRACTS §4.1） */
  clearSelection(): void {
    this.rendition?.getDocument()?.getSelection()?.removeAllRanges()
    // 选区没了，UI 那边的色板也该收起 —— 不让调用方自己记得补这一下
    this.emit('selection-changed', null)
  }

  /** 选区观察：事件必须绑在**书文档**上 —— 宿主 window 收不到 iframe 内的事件
   *  （事件被文档边界挡住，同 `iframeBridge` 的根因）。 */
  private attachSelectionWatch(): void {
    const doc = this.rendition?.getDocument() ?? null
    if (doc === this.selectionDoc) return
    this.detachSelectionWatch()
    this.selectionDoc = doc
    if (doc) {
      // 选区手势的收尾事件：鼠标（含双击/三击选中）与键盘（Shift+方向键）
      doc.addEventListener('mouseup', this.onSelectionGesture)
      doc.addEventListener('keyup', this.onSelectionGesture)
      // 右键（v0.3.12）：唯一能拿到"正文内右键"的地方（事件跨不过文档边界）。
      // ⚠ 桌面端**没有** kookit 的 contextmenu 抢占（那两处 preventDefault 都在从未被调用的
      //   触屏路径里，见 KOOKIT.md §5 #15）→ 这个槽位是我们的。
      doc.addEventListener('contextmenu', this.onContextMenu)
    }
  }

  private detachSelectionWatch(): void {
    if (!this.selectionDoc) return
    this.selectionDoc.removeEventListener('mouseup', this.onSelectionGesture)
    this.selectionDoc.removeEventListener('keyup', this.onSelectionGesture)
    this.selectionDoc.removeEventListener('contextmenu', this.onContextMenu)
    this.selectionDoc = null
  }

  private readonly onSelectionGesture = (): void => {
    void this.emitSelectionAnchor()
  }

  /**
   * 正文内右键 → 换算成宿主坐标 + 判定"是否点在已有笔记上"→ 交给 UI 弹菜单。
   *
   * 命中判定走 `event.target.closest('.kookit-note[data-key]')` —— 与我们写进 span 的
   * `data-key`（= 笔记 id）对齐；kookit 自己的 `handleNoteClick` 也是这么找的（KOOKIT §5 #14）。
   */
  private readonly onContextMenu = (e: Event): void => {
    const me = e as MouseEvent
    me.preventDefault()
    const target = me.target as (HTMLElement & { closest?: (s: string) => Element | null }) | null
    const hit = target?.closest?.('.kookit-note[data-key]') ?? null
    const noteId = hit?.getAttribute('data-key') ?? undefined
    // 选区锚点：右键时若仍有选区 → 可用于"新建"；点在笔记上时通常无选区（单击已清空）
    void this.getSelectionAnchor().then((anchor) => {
      this.emit('context-menu', { x: me.clientX, y: me.clientY, anchor, noteId })
    })
  }

  /**
   * kookit `handleNoteClick(event)` 回调：从 `event.target.dataset.key` 取笔记 id（KOOKIT §5 #14）。
   * 坐标**从元素矩形量取**而不是取 `clientX/clientY` —— kookit 有一条调用路径只传 `{ target }`
   * （无鼠标坐标，见 bundle 的捕获阶段代理），量矩形两条路径都成立。
   */
  private readonly onNoteClick = (event?: { target?: unknown }): void => {
    const el = event?.target as (HTMLElement & { dataset?: { key?: string } }) | undefined
    const key = el?.dataset?.key
    if (!key) return
    let x: number | undefined
    let y: number | undefined
    const iframe = this.rendition?.getIframe()
    if (el && iframe && typeof el.getBoundingClientRect === 'function') {
      const r = el.getBoundingClientRect()
      const f = iframe.getBoundingClientRect()
      x = f.left + r.left
      y = f.top + r.bottom
    }
    this.emit('note-clicked', { noteId: key, x, y })
  }

  private async emitSelectionAnchor(): Promise<void> {
    const anchor = await this.getSelectionAnchor()
    if (!anchor) {
      this.emit('selection-changed', null)
      return
    }
    this.emit('selection-changed', { anchor, rect: this.selectionRect() })
  }

  /**
   * 选区矩形 → **宿主视口坐标**（色板摆放用）。
   * 换算只做一次加法，不需要额外补滚动量：`getBoundingClientRect()` 在书文档里本就是相对该
   * iframe 视口的，加上 iframe 自身在宿主里的位置即得宿主视口坐标（宿主的滚动已经体现在
   * iframe 的 rect 里）。
   * 取不到（iframe/选区已消失）→ 全零矩形：UI 退到默认摆放位置，而不是崩。
   */
  private selectionRect(): { x: number; y: number; width: number; height: number } {
    const zero = { x: 0, y: 0, width: 0, height: 0 }
    const iframe = this.rendition?.getIframe()
    const range = this.rendition?.getDocument()?.getSelection()?.getRangeAt(0)
    if (!iframe || !range) return zero
    const r = range.getBoundingClientRect()
    const f = iframe.getBoundingClientRect()
    return { x: f.left + r.left, y: f.top + r.top, width: r.width, height: r.height }
  }

  /**
   * Note v2 → kookit 引擎载荷。**字段名与约定都是 kookit 的，必须照它给**（2026-09-14 逆向核实）：
   * - `range`：**JSON 字符串** —— kookit 内部 `JSON.parse(item.range)`（`createOneNote` 与
   *   `renderHighlighters` 两条路径都如此）。即 `anchor.fragment.key` 原样透传。
   * - `color`：kookit 的 `"<styleType>-#RRGGBB"` 形态（`buildHighlightStyleForType` 按 `-`
   *   切分取 [0]=styleType、[1]=rawColor）。**不是语义色名，也不是裸 hex** —— 传裸 hex 会让
   *   styleType 变成那个 hex、switch 无命中而返回 undefined 样式（静默不显色）。
   * - `key`：笔记 id（kookit 用它写 `data-key` 并在删除时查找）。
   * - `notes`：**字符串**（kookit 以 `item.notes !== ""` 判定"是否带批注"）。
   *   ⚠ v1 曾传数组 `note.notes || []` —— 数组恒 `!== ""` → 恒判为"带批注"，且数组被当正文。
   * - `chapterIndex`：文字类分支忽略，但 **PDF 分支必读**
   *   （`getSubIframe(item.chapterIndex)` + 逐条 `pageIndex !== chapterIndex` 过滤）—— 故一律带上。
   */
  private toKookitNote(note: Note): Record<string, unknown> {
    return {
      key: note.id,
      range: note.anchor.fragment?.key ?? '',
      color: this.resolveNoteColor(note.color),
      notes: note.body ?? '',
      chapterIndex: note.anchor.norm.chapterIndex
    }
  }

  /**
   * 语义色名 → kookit 颜色串。
   * **颜色的唯一来源是宿主 CSS token**（`--note-<name>`，定义在 `styles.css`）：
   * 库内只存语义名（DATA_MODEL §3.2「库内无 hex」），而 kookit 需要具体色值 —— 于是由宿主
   * 解析出当前主题下的实际值再内联给引擎。**不能用 `var(--note-red)` 传进去**：高亮 span 长在
   * 书的 iframe 内部 document 里，宿主 CSS 变量不跨文档继承。
   *
   * 兜底值取 kookit 自身的默认 `#FEF3CD`（`buildHighlightStyleForType` 的 `rawColor` 初值）——
   * 这是"引擎默认"而不是 TuRead 的设计取值，故不构成第二处设计真相来源；token 缺失属配置错误，
   * 记日志让人看见（不做静默 no-op）。
   */
  private resolveNoteColor(name?: NoteColor): string {
    const token = `--note-${name ?? DEFAULT_NOTE_COLOR}`
    const raw =
      typeof window === 'undefined'
        ? ''
        : window.getComputedStyle(document.documentElement).getPropertyValue(token).trim()
    if (!raw) {
      console.warn(`[render] 缺少颜色 token ${token}（styles.css 未定义？）——回退引擎默认色`)
      return 'background-#FEF3CD'
    }
    return `background-${raw}`
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
    // 字段全集与缺省收敛在 buildKookitConfig（kookitLoader，2026-09-12 去重）；这里只解析宿主关注点
    return buildKookitConfig(format, {
      readerMode: options?.readerMode,
      animation: options?.animation,
      convertChinese: options?.convertChinese,
      parserRegex: '',
      isDarkMode: isDark,
      isMobile: false,
      password: options?.password || '',
      isConvertPDF: false,
      // 正文纸色单一来源 = 宿主 --page-bg token（styles.css）；分页模式的折页阴影据此配色
      backgroundColor: options?.backgroundColor || this.readCssVar('--page-bg'),
      isScannedPDF: options?.isScannedPDF,
      ocrEngine: options?.ocrEngine || ''
    })
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
    const loc = this.getPosition()
    // 顺带用权威位置纠正"当前已渲染节"（见 resolveRenderedChapter 的注释）——自愈，不依赖事件载荷
    if (!isZeroLocation(loc)) this.renderedChapter = loc.chapterDocIndex
    this.emit('location-changed', loc)
  }

  /**
   * 求"当前已渲染的那一节"。
   *
   * ⚠ **不能信 `rendered` 事件的载荷**（2026-09-14 逆向 + 探针实测）：kookit 文字类
   * （`GeneralRender`，EPUB/TXT/MD/MOBI/AZW3/FB2/DOCX/HTML 全走它）触发的是
   * `this.trigger("rendered")` —— **不带任何参数**；只有 `PdfRender` 是
   * `this.trigger("rendered", [chapterDocIndex])`。此前按"事件带章号"实现，导致文字类拿到
   * `undefined`：`renderedChapter` 变成 undefined，而 `undefined === null` 为假 →
   * `renderHighlighters` 的章节过滤静默命中 0 条（**高亮永远不出现**，且不报错）。
   *
   * 故一律以**位置**为权威（`getPosition().chapterDocIndex`）—— kookit 多数渲染路径在
   * `trigger("rendered")` 之前已 `yield this.record()`，tempLocation 已就绪。
   * 事件真带了数字（PDF 路径）则优先用它，省一次读取。
   */
  private resolveRenderedChapter(fromEvent?: number): number {
    if (typeof fromEvent === 'number' && Number.isFinite(fromEvent)) return fromEvent
    return this.getPosition().chapterDocIndex
  }
}

/* ————————————— 选区 → 锚点证据（模块级纯函数，便于单点复核）————————————— */

/**
 * 章内进度估计：**按字符位置**（选区起点之前的字符数 / 本章正文字符总数）。
 * 为什么不用像素：改字号/行距/纸宽都会移动像素位置，而字符序不变 —— progression 在 Norm 层
 * 只承担粗排序/粗回跳（§2.1 三级角色里的 display 一侧），不该跟着排版漂移。
 */
function estimateProgression(range: Range, doc: Document): number {
  const body = doc.body
  if (!body) return 0
  const total = (body.textContent ?? '').length
  if (total === 0) return 0
  const pre = doc.createRange()
  pre.selectNodeContents(body)
  try {
    pre.setEnd(range.startContainer, range.startOffset)
  } catch {
    return 0 // 起止不在同一根下（理论上不该发生）→ 放弃估计，不猜一个数
  }
  return Math.min(1, Math.max(0, pre.toString().length / total))
}

/**
 * DOM 选区 → 划线原文快照（exact + 前后文）。
 * 前后文取**所在块**的文本：块是重锚时的天然搜索域（kookit 搜索也按块出结果），
 * 且选区跨块时"前后文"本身没有确定含义 —— 取不到就留空，不硬凑。
 * ⚠ 偏移换算用**未截断**的选区长度，否则长选区（> QUOTE_EXACT_MAX）会让 suffix 起点偏前。
 */
function quoteFromRange(range: Range): AnchorQuote {
  const full = range.toString()
  const exact = clipQuote(full, QUOTE_EXACT_MAX)
  const node = range.commonAncestorContainer
  const block = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  const doc = range.startContainer.ownerDocument
  if (!block || !doc) return { exact, prefix: '', suffix: '' }

  const blockText = block.textContent ?? ''
  const pre = doc.createRange()
  pre.selectNodeContents(block)
  let start: number
  try {
    pre.setEnd(range.startContainer, range.startOffset)
    start = pre.toString().length
  } catch {
    return { exact, prefix: '', suffix: '' }
  }
  return {
    exact,
    prefix: clipQuote(
      blockText.slice(Math.max(0, start - QUOTE_CONTEXT_MAX), start),
      QUOTE_CONTEXT_MAX
    ),
    suffix: clipQuote(
      blockText.slice(start + full.length, start + full.length + QUOTE_CONTEXT_MAX),
      QUOTE_CONTEXT_MAX
    )
  }
}

/**
 * 从 kookit 搜索结果项的 `cfi` 串取 `chapterDocIndex`。
 * 文字类形状已核实（`{text, chapterTitle, chapterDocIndex, …}`）；PDF 的搜索载荷形状**未核实**
 * ——故宽容解析：非 JSON / 无该字段一律 null（当作没命中，而不是抛错或猜）。
 */
function chapterIndexOfSearchHit(cfi: unknown): number | null {
  if (typeof cfi !== 'string' || cfi === '') return null
  try {
    const parsed = JSON.parse(cfi) as { chapterDocIndex?: unknown }
    const idx = Number(parsed?.chapterDocIndex)
    return Number.isFinite(idx) && idx >= 0 ? Math.floor(idx) : null
  } catch {
    return null
  }
}
