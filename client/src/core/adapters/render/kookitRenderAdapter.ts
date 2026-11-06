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
  BookFormat,
  BookLocation,
  BookMetadata,
  BookRecord,
  Chapter,
  Note,
  ReaderTypography,
  RenderOptions,
  TextAnchor
} from '@core/domain/types'
import { loadKookit, buildNamespace, buildKookitConfig } from './kookitLoader'
import { ensurePdfjs } from './pdfjsSetup'
import { detectTextCharset } from './charset'
import { normalizeAnchor } from '@core/domain/anchor'
import { selectionToAnchor, remeasureBySearch, PDF_STROKE_FRAGMENT_ENGINE } from './kookitAnchor'
import { PdfGeomCapturer, getPdfViewport, renderStrokeLayer } from './kookitGeom'
import { toKookitNote } from './kookitNote'
import { buildReaderCss, readCssVar } from './readerCss'

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
  /** 笔记 id → 所属渲染节号（removeNote 需要章节号，不能拿"当前章节"顶替） */
  private noteChapters = new Map<string, number>()
  /**
   * 当前**已渲染**的节号（由 `rendered` 事件写入）。
   * 高亮回显的过滤依据：kookit 文字类只有一个 iframe（`GeneralRender.getIframe()` =
   * `#page-area` 下第一个 iframe），`renderHighlighters` 是在"当前那一节的 document"上
   * 按**字符偏移**重锚的 —— 喂进别的节的笔记会错位或抛错。null = 尚未渲染过任何节。
   */
  private renderedChapter: number | null = null
  /** 已挂选区监听的**书文档**集合（文字类一个；PDF = 已加载子页，随 rendered 对齐增减） */
  private selectionDocsBound = new Set<Document>()
  private scrollTimer: number | null = null
  /** 当前主题（open 时由 options.theme 写入；applyTheme 热更新；深色 → 注入正文 CSS） */
  private theme: ResolvedTheme | null = null
  /** 布局模式（open 时由 options.readerMode 写入；PDF 页卡边缘只在 scroll 模式注入） */
  private readerMode: RenderOptions['readerMode'] = 'scroll'
  /**
   * 当前排版参数（`applyTypography` 写入）。**跨书保留**（是用户偏好，不是某本书的状态），
   * `close()` 不清它 —— 换书后 renderTo 末尾的注入会用同一份值。
   */
  private typography: ReaderTypography | null = null
  /**
   * 首次定位目标（由 `options.lastLocation` 传入——渲染层不该为拿一个位置去依赖阅读状态表）。
   * `close()` 清空。
   */
  private lastLocation: BookLocation | null = null
  /** 记号笔笔记（`kookit-pdf-stroke` 载荷）——kookit 不解释该形状，回显由自绘 SVG 层承担（`kookitGeom`） */
  private strokeNotesById = new Map<string, Note>()
  /** 几何标注捕获器（框選/記號筆一次性拖曳；PDF 专用） */
  private readonly geom: PdfGeomCapturer

  constructor(readFile: ReadBookFile) {
    super()
    this.readFile = readFile
    this.geom = new PdfGeomCapturer({
      rendition: () => this.rendition,
      pageOf: (doc) => {
        const total = this.rendition?.chapterDocList?.length ?? 0
        for (let i = 0; i < total; i += 1) {
          if (this.rendition?.getSubDocument(i) === doc) return i
        }
        return null
      },
      onCapture: (anchor, kind) => this.emit('geom-captured', { anchor, kind })
    })
  }

  async open(record: BookRecord, options?: RenderOptions): Promise<void> {
    await this.close()
    // 竞态守卫：open 内部要等"读文件 + 解析"（PDF 可达秒级），期间用户可能已切到另一本书
    // （ReaderFeature 会取消旧流程，但适配器状态是共享的）。先发起的那次解析完若直接写
    // this.rendition，就会覆盖后发起的书 —— 用代次令牌让过期的那次直接作废。
    const token = ++this.openToken
    this.theme = options?.theme ?? null
    this.readerMode = options?.readerMode ?? 'scroll'
    this.lastLocation = options?.lastLocation ?? null
    const [Kookit, buffer] = await Promise.all([loadKookit(), this.readFile(record.filePath)])
    if (token !== this.openToken) {
      // 代次守卫命中：这次 open 已被更晚的 open/close 作废。**reject 而非静默 resolve**——
      // 静默返回让调用方无法区分"成功 / 什么都没发生"，也是"重开书偶发空白"难定位的根源。
      // 错误消息带固定前缀 `[render] open superseded`，调用方可识别并按"预期取消"处理。
      throw new Error(`[render] open superseded（已被更新的 open/close 作废）：${record.filePath}`)
    }
    const config = this.toKookitConfig(record.format, options)
    // TXT 的渲染路径要求调用方提供编码（kookit TxtRender `new TextDecoder(config.charset)`，
    // 传 '' 直接 RangeError）；MD 固定按 UTF-8 读，不在此列
    if (record.format === 'TXT') {
      config.charset = detectTextCharset(buffer)
    }
    const rendition = Kookit.BookHelper.getRendition(buffer, config, buildNamespace(Kookit))
    this.record = record
    this.rendition = rendition
    rendition.on('rendered', (chapterDocIndex?: number) => {
      this.renderedChapter = this.resolveRenderedChapter(chapterDocIndex)
      this.attachSelectionWatch()
      // 几何捕获武装中 → 跟随全部已加载子页（新页加载后拖曳也有效）
      if (this.geom.isArmed()) this.geom.bindDocs(this.selectionDocs())
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
    this.geom.disarm()
    this.noteChapters.clear()
    this.strokeNotesById.clear()
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
    this.lastLocation = null
  }

  getOpenBook(): BookRecord | null {
    return this.record
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
    // 临时 rendition 持有 iframe/DOM 资源（close() 路径同样要 removeContent），取完即清，防泄漏
    rendition.removeContent()
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
    // 代次令牌：open 内部等"读文件+解析"期间可能已被下一次 open/close 作废，
    // 但调用方拿到 open 的 resolve 后仍会跑 renderTo —— 对已换成新书的状态执行
    // innerHTML='' + renderTo，会与新书的 renderTo 交错（「重开书偶发空白」的症状形状）。
    // 记住进入时的代次，await 返回后一旦不等即作废：不再做注入/定位/挂监听。
    const token = this.openToken
    const rendition = this.rendition
    this.element = element
    element.innerHTML = ''
    await rendition.renderTo(element)
    if (token !== this.openToken) {
      console.warn('[render] renderTo 作废（代次守卫）：本次打开已被更新的 open/close 取代')
      return
    }
    // PDF scroll 模式：kookit 的 handleIframeHeight（把 iframe 拉到正文高度）只被文字类渲染调用，
    // PDF 的页面容器全在外层 iframe 里（每页一个固定 paddingTop 的 div，懒渲染 canvas），
    // 无人拉高 iframe → 宿主（scroll 模式的滚动发生地，KOOKIT.md §5.10）永远不可滚。
    // 这里按容器总高补齐（与 handleIframeHeight 的 +300 余量同款）。
    if (this.record?.format === 'PDF') {
      const iframe = element.querySelector('iframe')
      const doc = iframe?.contentDocument
      if (iframe && doc?.body) {
        // PDF 滚动模式页卡边缘：页与页之间要有可见边界 —— 给每页
        // 容器描 1px 纸边（颜色取宿主 --page-edge，随主题；换主题本就要重开，不虑失配）。
        // 先注入后量高：边框 2px/页 要计入 iframe 总高。分页模式页本身占满视口，不注入。
        if (this.readerMode === 'scroll') {
          const edge = readCssVar('--page-edge') || '#ccd0d4'
          const style = doc.createElement('style')
          style.id = 'turead-pdf-page-edge'
          style.textContent = `.pdf-container{border:1px solid ${edge};}`
          doc.head.appendChild(style)
        }
        iframe.height = `${doc.body.scrollHeight + 300}px`
      }
    }
    // 首次定位：有历史位置就回到那里，否则渲染初始章节。
    // ⚠ kookit 契约（KOOKIT.md §2/§8）：renderTo 只建 iframe + 布局，【不渲染正文】，
    //   必须再补一次导航调用（goToChapterIndex(0) / goToPosition）才真正渲染章节；
    //   record() 只算位置不渲染，用它会导致正文空白（v0.1.1 遗留根因）。
    //   harness 验证的成功序列是 renderTo → record() → goToChapterIndex(0)，这里保持同序。
    await rendition.record()
    if (this.lastLocation) {
      await rendition.goToPosition(JSON.stringify(this.lastLocation))
    } else {
      await rendition.goToChapterIndex(0)
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

  /** 向已打开的正文注入/更新主题样式（契约 = contracts/ports.md）。未 open 时只记录、renderTo 时生效。 */
  async applyTheme(theme: ResolvedTheme): Promise<void> {
    this.theme = theme
    await this.applyStoredTheme()
  }

  /** 向已打开的正文注入/更新排版参数（契约 = contracts/ports.md）。与 applyTheme 共用一份 CSS。 */
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
    rendition.setStyle(buildReaderCss(this.theme, this.typography))
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
   * 导航方法的未打开守卫：与 renderTo 同口径——**未 open 即抛错**，
   * 调用方（UI/自检/用例）能明确收到"什么都没发生"的失败，而不是把静默 no-op 当成功吞掉。
   * getPosition/getProgress/getChapter 例外：它们是查询，返回零值是文档化语义（contracts/ports.md）。
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
    // 先取引擎再登记章节（requireRendition 抛错时不污染 noteChapters）
    const rendition = this.requireRendition('createNote')
    this.noteChapters.set(note.id, chapterIndex)
    // 记号笔：kookit 不解释 stroke 载荷 → 自绘 SVG 层即时回显（全量重建该页，成本 = 笔迹数）
    if (note.anchor.fragment.engine === PDF_STROKE_FRAGMENT_ENGINE) {
      this.strokeNotesById.set(note.id, note)
      await this.renderStrokes(chapterIndex)
      return
    }
    await rendition.createOneNote(toKookitNote(note), this.onNoteClick)
  }

  async removeNote(noteId: string): Promise<void> {
    const rendition = this.requireRendition('removeNote')
    // 用【笔记自身】所属的渲染节号：kookit removeOneNote(key, chapterDocIndex) 会在该节内查找。
    // ⚠ "当前所在章节"顶不得：跨章节删除会找不到/删错。
    const chapterDocIndex =
      this.noteChapters.get(noteId) ?? normalizeLocation(this.getPosition()).chapterDocIndex
    // 记号笔：自绘层自己删（kookit 的 removeOneNote 找不到它）
    if (this.strokeNotesById.delete(noteId)) {
      await this.renderStrokes(chapterDocIndex)
      this.noteChapters.delete(noteId)
      return
    }
    await rendition.removeOneNote(noteId, chapterDocIndex)
    this.noteChapters.delete(noteId)
  }

  async renderHighlighters(notes: Note[]): Promise<void> {
    const rendition = this.requireRendition('renderHighlighters')
    for (const n of notes) {
      this.noteChapters.set(n.id, n.anchor.norm.chapterIndex)
    }
    // ① 过滤到"当前已渲染的节"：kookit 只对当前 document 按字符偏移重锚，
    //    跨节笔记喂进去会错位或抛错。
    const chapter = this.renderedChapter
    const current = chapter === null
      ? []
      : notes.filter((n) => n.anchor.norm.chapterIndex === chapter)
    // ② 按解释者分派：记号笔（stroke）kookit 不解释 → 自绘层；其余无载荷跳过（合法降级态，只记日志）
    const strokes = current.filter((n) => n.anchor.fragment?.engine === PDF_STROKE_FRAGMENT_ENGINE)
    for (const n of strokes) this.strokeNotesById.set(n.id, n)
    const renderable = current.filter((n) => n.anchor.fragment && n.anchor.fragment.engine !== PDF_STROKE_FRAGMENT_ENGINE)
    const noPayload = current.length - strokes.length - renderable.length
    if (noPayload > 0) {
      console.warn(`[render] renderHighlighters 跳过 ${noPayload} 条无引擎载荷的笔记（章 ${chapter}）`)
    }
    // ③ 传**拷贝**：kookit `renderHighlighters` 内部 `notes.reverse()` 是原地修改入参，
    //    直接传调用方数组会把 store/Feature 持有的顺序改掉。
    if (renderable.length > 0) {
      await rendition.renderHighlighters(
        renderable.map((n) => toKookitNote(n)),
        this.onNoteClick
      )
    }
    // ④ 记号笔层重建（该页全量；kookit 的 clearHighlight 不碰 .turead-note-stroke）
    if (chapter !== null) await this.renderStrokes(chapter)
  }

  /** 重建某页的记号笔 SVG 层（自 `strokeNotesById` 取该页条目；PDF 专用，其他格式 no-op） */
  private async renderStrokes(chapter: number): Promise<void> {
    const rendition = this.rendition
    if (!rendition || this.record?.format !== 'PDF') return
    const subDoc = rendition.getSubDocument(chapter)
    if (!subDoc) return
    const viewport = await getPdfViewport(rendition, chapter)
    if (!viewport) return
    const pageStrokes = [...this.strokeNotesById.values()].filter(
      (n) => n.anchor.norm.chapterIndex === chapter
    )
    renderStrokeLayer(subDoc, pageStrokes, viewport, this.onNoteClick)
  }

  // ————— 几何标注捕获（笔记 v3 批N2b；PDF 专用）—————

  armGeomCapture(mode: 'rect' | 'stroke'): void {
    if (this.record?.format !== 'PDF') return
    this.geom.arm(mode, this.selectionDocs())
  }

  disarmGeomCapture(): void {
    this.geom.disarm()
  }

  // ————— 选区级锚点（定位转换机制的引擎侧原语，本体在 `kookitAnchor.ts`）—————

  /**
   * `fromSelection`：把当前正文选区取成统一锚点。
   * 三层证据一次取齐 —— Fragment（引擎精确载荷）、Norm（章 + 章内进度）、quote（原文快照 + 前后文）。
   * 只读：不改引擎状态、不落库（落库是用例层的事）。
   */
  async getSelectionAnchor(): Promise<TextAnchor | null> {
    const rendition = this.rendition
    if (!rendition) return null
    return selectionToAnchor(rendition, {
      format: this.record?.format,
      renderedChapter: this.renderedChapter,
      positionOf: () => this.getPosition()
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
      // goToChapterDocIndex 内部异步渲染 → 等 rendered 事件再找元素（固定 sleep 在慢机器/
      // 大章节上会不够，精确落点静默失效）。兜底超时防悬挂：同章重导航等场景可能不再发事件。
      await new Promise<void>((resolve) => {
        const off = this.on('rendered', () => {
          clearTimeout(timer)
          off()
          resolve()
        })
        const timer = window.setTimeout(() => {
          off()
          resolve()
        }, 1500)
      })
      // PDF 的高亮元素长在**子页文档**里（外层 querySelector 查不到）——目标章导航完成后
      // renderedChapter = 目标页，逐页查已加载子文档（文字类仍是书文档，同一取口）。
      let el: Element | null = null
      for (const doc of [this.rendition?.getDocument() ?? null, ...this.selectionDocs()]) {
        el = doc?.querySelector(`.kookit-note[data-key="${CSS.escape(opts.revealNoteId)}"]`) ?? null
        if (el) break
      }
      el?.scrollIntoView({ block: 'center' })
    }
    return true
  }

  /**
   * `remeasure`：Fragment 失效后按原文快照找回位置（本体 = `kookitAnchor.remeasureBySearch`）。
   * 产出一定是**弱锚点**（搜索不给字符偏移，只能重建到章级）—— 诚实降级而非缺陷；
   * 多条命中按相似度选路，代价是全书搜索（用户显式触发的恢复动作，可接受）。
   */
  async remeasureAnchor(anchor: TextAnchor): Promise<TextAnchor | null> {
    const rendition = this.rendition
    const quote = anchor?.norm?.quote?.exact ?? ''
    if (!rendition || quote === '') return null
    return remeasureBySearch(rendition, anchor)
  }

  /** 清掉书文档里的选区（宿主清不掉另一个文档的选区）；PDF 逐页清 */
  clearSelection(): void {
    for (const doc of this.selectionDocs()) {
      doc.getSelection()?.removeAllRanges()
    }
    // 选区没了，UI 那边的色板也该收起 —— 不让调用方自己记得补这一下
    this.emit('selection-changed', null)
  }

  /**
   * 选区所在的**目标文档族**：文字类 = 书文档；PDF = **全部已加载子页文档**。
   * ⚠ 为什么是"全部"而不是"当前渲染页"：PDF 滚动模式预渲染会让"最后渲染页"≠"用户正在看的页"，
   * 只绑一页 = 右键/选区在隔壁页上生效、在眼前这页**毫无反应**（真机实锤）。
   * `rendered` 驱动重绑（新页加载后跟上；卸载页的监听随文档一起消亡）。
   */
  private selectionDocs(): Document[] {
    const rendition = this.rendition
    if (!rendition) return []
    if (this.record?.format !== 'PDF') {
      const doc = rendition.getDocument()
      return doc ? [doc] : []
    }
    const docs: Document[] = []
    const total = rendition.chapterDocList?.length ?? 0
    for (let i = 0; i < total; i += 1) {
      const doc = rendition.getSubDocument(i)
      // 空壳子页（未加载）不绑：body 为空的文档是 kookit 尚未填充的占位
      if (doc && doc.body?.innerHTML !== '') docs.push(doc)
    }
    return docs
  }

  /** 有**非塌陷选区**的那个文档（PDF = 逐页找；文字类 = 书文档）。菜单定位/锚点解算用它。 */
  private selectionActiveDoc(): Document | null {
    if (this.record?.format !== 'PDF') return this.rendition?.getDocument() ?? null
    for (const doc of this.selectionDocs()) {
      const sel = doc.getSelection()
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) return doc
    }
    return null
  }

  /** 选区观察：事件必须绑在**选区所在的书文档**上 —— 宿主 window 收不到 iframe 内的事件
   *  （事件被文档边界挡住，同 `iframeBridge` 的根因）；PDF = 全部已加载子页（见 selectionDocs）。 */
  private attachSelectionWatch(): void {
    const docs = this.selectionDocs()
    const fresh = docs.filter((d) => !this.selectionDocsBound.has(d))
    if (fresh.length === 0 && this.selectionDocsBound.size === docs.length) return
    this.detachSelectionWatch()
    for (const doc of docs) {
      this.selectionDocsBound.add(doc)
      // 选区手势的收尾事件：鼠标（含双击/三击选中）与键盘（Shift+方向键）
      doc.addEventListener('mouseup', this.onSelectionGesture)
      doc.addEventListener('keyup', this.onSelectionGesture)
      // 右键：唯一能拿到"正文内右键"的地方（事件跨不过文档边界）。
      // ⚠ 桌面端**没有** kookit 的 contextmenu 抢占（那两处 preventDefault 都在从未被调用的
      //   触屏路径里，见 KOOKIT.md §5 #15）→ 这个槽位是我们的。
      doc.addEventListener('contextmenu', this.onContextMenu)
    }
  }

  private detachSelectionWatch(): void {
    for (const doc of this.selectionDocsBound) {
      doc.removeEventListener('mouseup', this.onSelectionGesture)
      doc.removeEventListener('keyup', this.onSelectionGesture)
      doc.removeEventListener('contextmenu', this.onContextMenu)
    }
    this.selectionDocsBound.clear()
  }

  private readonly onSelectionGesture = (): void => {
    void this.emitSelectionAnchor()
  }

  /**
   * 书文档内的一点 → **宿主视口坐标**（UI 摆放浮层用）。
   *
   * 为什么要**逐层累加**、不能只加一层：文字类的正文 iframe 直接挂在宿主里（一层），
   * 但 **PDF 的每一页是"顶层 iframe 里再嵌的子 iframe"**（`KOOKIT.md` §5）——
   * 只加一层就少算中间那层偏移。故沿 `frameElement` 链一路累加到宿主文档为止。
   *
   * ⚠ `clientX/clientY` 是**事件所属文档**的视口坐标，**不是宿主坐标**——
   *   直接把 `me.clientX` 当宿主坐标发出去，右键菜单就会出现在错误位置。
   */
  private hostOffset(fromDoc: Document | null): { x: number; y: number } {
    let x = 0
    let y = 0
    let cur: Document | null = fromDoc
    while (cur && cur !== document) {
      const frame = cur.defaultView?.frameElement
      if (!frame) break
      const r = frame.getBoundingClientRect()
      x += r.left
      y += r.top
      cur = frame.ownerDocument
    }
    return { x, y }
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
    // 事件所属文档 → 宿主偏移（PDF 子页要多层累加，见 hostOffset）
    const off = this.hostOffset(
      (me.target as Node | null)?.ownerDocument ?? this.rendition?.getDocument() ?? null
    )
    // 选区锚点：右键时若仍有选区 → 可用于"新建"；点在笔记上时通常无选区（单击已清空）。
    // getSelectionAnchor 内部走引擎解算，换章/文档销毁瞬间会抛 → 必须接住，否则
    // unhandled rejection 且右键菜单静默不弹（失败时降级为无锚点菜单，位置仍正确）。
    this.getSelectionAnchor()
      .then((anchor) => {
        this.emit('context-menu', {
          x: off.x + me.clientX,
          y: off.y + me.clientY,
          anchor,
          noteId
        })
      })
      .catch((err) => {
        console.warn('[render] 右键取选区锚点失败，降级为无锚点菜单：', err)
        this.emit('context-menu', {
          x: off.x + me.clientX,
          y: off.y + me.clientY,
          anchor: null,
          noteId
        })
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
    if (el && typeof el.getBoundingClientRect === 'function') {
      const r = el.getBoundingClientRect()
      // 元素所在文档 → 宿主偏移（元素在 PDF 子页里时，链上不止一层）
      const off = this.hostOffset(el.ownerDocument ?? this.rendition?.getDocument() ?? null)
      x = off.x + r.left
      y = off.y + r.bottom
    }
    this.emit('note-clicked', { noteId: key, x, y })
  }

  private async emitSelectionAnchor(): Promise<void> {
    let anchor: TextAnchor | null
    try {
      anchor = await this.getSelectionAnchor()
    } catch (err) {
      // 换章/文档销毁瞬间引擎解算会抛：选区已不存在，按"无选区"上报而非 unhandled rejection
      console.warn('[render] 选区锚点解算失败（按无选区处理）：', err)
      anchor = null
    }
    if (!anchor) {
      this.emit('selection-changed', null)
      return
    }
    this.emit('selection-changed', { anchor, rect: this.selectionRect() })
  }

  /**
   * 选区矩形 → **宿主视口坐标**（浮层摆放用）。
   * `getBoundingClientRect()` 在书文档里本就是相对该 iframe 视口的，加上**逐层**的 iframe
   * 偏移（`hostOffset`，PDF 子页不止一层）即得宿主视口坐标。
   * 取不到（选区已消失）→ 全零矩形：UI 退到默认摆放位置，而不是崩。
   */
  private selectionRect(): { x: number; y: number; width: number; height: number } {
    const zero = { x: 0, y: 0, width: 0, height: 0 }
    const doc = this.selectionActiveDoc()
    const range = doc?.getSelection()?.getRangeAt(0)
    if (!doc || !range) return zero
    const r = range.getBoundingClientRect()
    const off = this.hostOffset(doc)
    return { x: off.x + r.left, y: off.y + r.top, width: r.width, height: r.height }
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
   * 否则短章节会顶着一根接近满高的长条。
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
    // 深色判定优先走 theme：纯色·深 / 羊皮纸·深 = 深色；isDarkMode 为兼容兜底
    const isDark = options?.theme
      ? isDarkResolvedTheme(options.theme)
      : (options?.isDarkMode ?? false)
    // 字段全集与缺省收敛在 buildKookitConfig（kookitLoader）；这里只解析宿主关注点
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
      backgroundColor: options?.backgroundColor || readCssVar('--page-bg'),
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
   * ⚠ **不能信 `rendered` 事件的载荷**：kookit 文字类
   * （`GeneralRender`，EPUB/TXT/MD/MOBI/AZW3/FB2/DOCX/HTML 全走它）触发的是
   * `this.trigger("rendered")` —— **不带任何参数**；只有 `PdfRender` 是
   * `this.trigger("rendered", [chapterDocIndex])`。若按"事件带章号"实现，文字类拿到
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
