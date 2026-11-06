/**
 * PDF 几何标注：拖曳捕获（框選/記號筆）与笔迹渲染（笔记 v3 批N2b，自 kookitRenderAdapter 拆出）。
 *
 * **为什么存在**：无文本层的 PDF（扫描版）选不出文字，文字选区路径（N2a）帮不了它们——
 * 几何拖曳是唯一标注入口（决策笔记 notes-v3-data-model「几何页锚」）。
 *
 * **坐标口径**：Fragment 存 **pdf 用户空间点**（`convertToPdfPoint`，缩放无关）——
 * 纸宽改变 = 原地重开（新 scale）后按新 viewport 换算回显，位置不失准；
 * 存 CSS 像素则重开即错位。捕获（屏→点）与渲染（点→屏）都经 pdfjs viewport 换算
 * （`chapterDocList[page].text.getPage()` + `getPdfScale()`，升级敏感面，见 KOOKIT.md §9）。
 *
 * **渲染分工**：框选（rect）与文字选区同形状 `{page, coords}` → 走 kookit `showPDFHighlight`
 * 现成路径；记号笔（stroke）是 polyline，kookit 不解释 → 本模块自绘 SVG 层（`.turead-note-stroke`，
 * 挂 `.noteLayer`——每页模板自带；定位口径与 `showPDFHighlight` 一致：viewport 坐标 +
 * docLayer marginLeft）。层内 polyline 带 `class="kookit-note" data-key`——reveal/命中约定
 * 与文字类划线相同（kookit `clearHighlight` 会清掉它，回显流程每页重建，见适配器）。
 */
import type { KookitPdfViewport, KookitRendition } from '@vendor/kookit.esm'
import type { Note, TextAnchor } from '@core/domain/types'
import { normalizeAnchor } from '@core/domain/anchor'
import { PDF_FRAGMENT_ENGINE, PDF_STROKE_FRAGMENT_ENGINE } from './kookitAnchor'
import { resolveNoteHex } from './kookitNote'

/** 取某页的 pdfjs viewport（坐标换算的唯一入口）。页越界/引擎缺席 → null（调用方放弃）。 */
export async function getPdfViewport(
  rendition: KookitRendition,
  page: number
): Promise<KookitPdfViewport | null> {
  const entry = rendition.chapterDocList?.[page]
  if (!entry) return null
  try {
    const pdfPage = await entry.text.getPage()
    const scale = await rendition.getPdfScale()
    return pdfPage.getViewport({ scale })
  } catch {
    return null
  }
}

/** 语义锚点：几何标注没有文字 quote（excerpt 诚实留空），progression = 页序。 */
export function geomAnchor(page: number, totalPage: number, engine: string, payload: unknown): TextAnchor {
  return normalizeAnchor({
    norm: {
      chapterIndex: page,
      progression: totalPage > 0 ? Math.min(1, Math.max(0, page / totalPage)) : 0,
      quote: { exact: '', prefix: '', suffix: '' }
    },
    fragment: { engine, key: JSON.stringify(payload) }
  })
}

/** 笔迹点列抽稀阈值（canvas 像素）：写库体积与渲染代价的口径。 */
const STROKE_MIN_DIST = 3
/** 拖曳最小跨度（canvas 像素）：小于它的mouseup = 误触单击，不提交也不解除（Esc 才是出口）。 */
const MIN_SPAN = 6

/** docLayer 的居中偏移（showPDFHighlight 定位口径的一部分；取不到记 0） */
function docLayerMarginLeft(subDoc: Document): number {
  const raw = getComputedStyle(subDoc.querySelector('#koodoPDFLayer') ?? subDoc.body).marginLeft
  const v = parseFloat(raw)
  return Number.isFinite(v) ? v : 0
}

/**
 * 一次性拖曳捕获器。`arm` 后在下一次 mousedown→mouseup 完成（或 Esc/`disarm`）。
 * 监听绑在**子页文档**上（换页 = 换文档，适配器在 rendered 后对 armed 状态 `bindDoc` 重绑）。
 * `deps.rendition` / `deps.currentPage` 由适配器注入（捕获器不该知道打开的是哪本书）。
 */
export class PdfGeomCapturer {
  private mode: 'rect' | 'stroke' | null = null
  /** 武装期间绑定的**全部已加载子页**（拖曳可能落在任何可见页上） */
  private docs = new Set<Document>()
  /** 拖曳发生在哪个文档（commit 时经 pageOf 反查页号） */
  private dragDoc: Document | null = null
  private drag: { x0: number; y0: number; points: Array<{ x: number; y: number }> } | null = null
  private preview: Element | null = null

  constructor(
    private deps: {
      rendition: () => KookitRendition | null
      /** 文档 → 页号（拖曳落点的页；找不到 = 放弃） */
      pageOf: (doc: Document) => number | null
      /** 捕获完成（适配器据此发 `geom-captured`，落库归 UI） */
      onCapture: (anchor: TextAnchor, kind: 'rect' | 'stroke') => void
    }
  ) {}

  isArmed(): boolean {
    return this.mode !== null
  }

  arm(mode: 'rect' | 'stroke', docs: Document[]): void {
    this.disarm()
    this.mode = mode
    this.bindDocs(docs)
  }

  /** 换页/重绑（rendered 驱动）：armed 期间跟随全部已加载子页（空壳子页跳过）。 */
  bindDocs(docs: Document[]): void {
    if (this.mode === null) return
    this.unbind()
    for (const doc of docs) {
      if (doc.body?.innerHTML === '') continue
      this.docs.add(doc)
      // capture 阶段拦截：武装期间的拖曳不再产生文字选区（pdf.js 文本层上尤其会）
      doc.addEventListener('mousedown', this.onDown, true)
      doc.addEventListener('mousemove', this.onMove)
      doc.addEventListener('mouseup', this.onUp)
      doc.body.style.cursor = 'crosshair'
    }
  }

  disarm(): void {
    this.unbind()
    this.mode = null
  }

  private unbind(): void {
    for (const doc of this.docs) {
      doc.removeEventListener('mousedown', this.onDown, true)
      doc.removeEventListener('mousemove', this.onMove)
      doc.removeEventListener('mouseup', this.onUp)
      if (doc.body) doc.body.style.cursor = ''
    }
    this.docs.clear()
    this.removePreview()
    this.dragDoc = null
  }

  /** 拖曳点（subDoc 视口坐标）→ 相对 canvas 的坐标（与 kookit getHightlightCoords 同口径：
   *  当前 scale 下 1 pdf 单位 = scale 像素，故 canvas 相对像素 ≈ viewport 坐标）。 */
  private canvasPoint(doc: Document, e: MouseEvent): { x: number; y: number } | null {
    const canvas = doc.querySelector('canvas')
    const rect = canvas?.getClientRects()[0]
    if (!rect) return null
    return { x: e.clientX - rect.x, y: e.clientY - rect.y }
  }

  private layer(subDoc: Document): HTMLElement | null {
    return subDoc.querySelector('.noteLayer')
  }

  private readonly onDown = (e: Event): void => {
    const me = e as MouseEvent
    const doc = me.target instanceof Document ? me.target : ((me.target as HTMLElement)?.ownerDocument ?? null)
    if (me.button !== 0 || !doc || !this.docs.has(doc)) return
    const start = this.canvasPoint(doc, me)
    if (!start) return
    me.preventDefault()
    me.stopPropagation()
    this.dragDoc = doc
    this.drag = { x0: start.x, y0: start.y, points: [start] }
    this.showPreview(doc)
  }

  private readonly onMove = (e: Event): void => {
    if (!this.drag || !this.dragDoc || this.mode === null) return
    const p = this.canvasPoint(this.dragDoc, e as MouseEvent)
    if (!p) return
    if (this.mode === 'rect') {
      this.updateRectPreview(p)
    } else {
      const last = this.drag.points[this.drag.points.length - 1]
      if (Math.hypot(p.x - last.x, p.y - last.y) >= STROKE_MIN_DIST) {
        this.drag.points.push(p)
        this.updateStrokePreview()
      }
    }
  }

  private readonly onUp = (e: Event): void => {
    if (!this.drag || !this.dragDoc || this.mode === null) return
    e.preventDefault()
    const mode = this.mode
    const drag = this.drag
    this.drag = null
    this.removePreview()
    const last = drag.points[drag.points.length - 1]
    const span =
      mode === 'rect'
        ? Math.max(Math.abs(last.x - drag.x0), Math.abs(last.y - drag.y0))
        : Math.hypot(last.x - drag.x0, last.y - drag.y0)
    if (span < MIN_SPAN) return
    void this.commit(mode, drag)
  }

  /** 屏→pdf 点换算 + 建锚点 + 回调，然后自动解除（一次性）。换算失败 = 放弃本轮。 */
  private async commit(mode: 'rect' | 'stroke', drag: { x0: number; y0: number; points: Array<{ x: number; y: number }> }): Promise<void> {
    const rendition = this.deps.rendition()
    const page = this.dragDoc ? this.deps.pageOf(this.dragDoc) : null
    if (!rendition || page === null) return
    const viewport = await getPdfViewport(rendition, page)
    if (!viewport) return
    const toPoint = (p: { x: number; y: number }): number[] => viewport.convertToPdfPoint(p.x, p.y)
    const totalPage = rendition.chapterDocList?.length ?? 0
    if (mode === 'rect') {
      const last = drag.points[drag.points.length - 1]
      const p1 = toPoint({ x: Math.min(drag.x0, last.x), y: Math.min(drag.y0, last.y) })
      const p2 = toPoint({ x: Math.max(drag.x0, last.x), y: Math.max(drag.y0, last.y) })
      this.deps.onCapture(geomAnchor(page, totalPage, PDF_FRAGMENT_ENGINE, { page, coords: [p1, p2] }), 'rect')
    } else {
      this.deps.onCapture(
        geomAnchor(page, totalPage, PDF_STROKE_FRAGMENT_ENGINE, { page, stroke: drag.points.map(toPoint) }),
        'stroke'
      )
    }
    this.disarm()
  }

  // ————— 预览（拖曳中的即时反馈；定位口径与回显一致：canvas 像素 ≈ viewport 坐标）—————

  private showPreview(doc: Document): void {
    const layer = this.layer(doc)
    if (!layer) return
    if (this.mode === 'rect') {
      const el = doc.createElement('div')
      el.setAttribute('class', 'turead-geom-preview')
      layer.appendChild(el)
      this.preview = el
    } else {
      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('class', 'turead-geom-preview')
      svg.setAttribute('style', this.svgStyle(doc))
      const line = doc.createElementNS('http://www.w3.org/2000/svg', 'polyline')
      line.setAttribute('fill', 'none')
      line.setAttribute('stroke', 'currentColor')
      line.setAttribute('stroke-linecap', 'round')
      line.setAttribute('stroke-linejoin', 'round')
      svg.appendChild(line)
      layer.appendChild(svg)
      this.preview = svg
    }
  }

  private svgStyle(doc: Document): string {
    // 预览不预知 viewport 尺寸：inset 撑满层 + viewBox 免了（层内像素即视口像素的等比近似）
    return 'position:absolute;left:' + docLayerMarginLeft(doc) + 'px;top:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:2;'
  }

  private updateRectPreview(p: { x: number; y: number }): void {
    if (!this.preview || !this.dragDoc || !this.drag) return
    const ml = docLayerMarginLeft(this.dragDoc)
    this.preview.setAttribute(
      'style',
      `position:absolute;border:1px dashed currentColor;pointer-events:none;z-index:2;` +
        `left:${Math.min(this.drag.x0, p.x) + ml}px;top:${Math.min(this.drag.y0, p.y)}px;` +
        `width:${Math.abs(p.x - this.drag.x0)}px;height:${Math.abs(p.y - this.drag.y0)}px;`
    )
  }

  private updateStrokePreview(): void {
    if (!this.preview || !this.drag) return
    const line = this.preview.querySelector('polyline')
    line?.setAttribute('points', this.drag.points.map((q) => `${q.x},${q.y}`).join(' '))
  }

  private removePreview(): void {
    this.preview?.parentNode?.removeChild(this.preview)
    this.preview = null
  }
}

// ————— 记号笔回显（自绘 SVG 层）—————

/** 单条记号笔的渲染样式（色取宿主 token 现值；线宽随页面尺寸等比）。 */
function strokeAttrs(polyline: Element, hex: string, viewport: KookitPdfViewport): void {
  polyline.setAttribute('fill', 'none')
  polyline.setAttribute('stroke', hex)
  polyline.setAttribute('stroke-width', String(Math.max(2, viewport.width / 300)))
  polyline.setAttribute('stroke-opacity', '0.35')
  polyline.setAttribute('stroke-linecap', 'round')
  polyline.setAttribute('stroke-linejoin', 'round')
}

/**
 * 重建某页的记号笔 SVG 层（全量重建：换页/重开/增删都走这里，成本 = 该页笔迹数）。
 * `notes` = 该页的 stroke 载荷笔记；rect 类不进来（kookit 自己画）。
 */
export function renderStrokeLayer(
  subDoc: Document,
  notes: Note[],
  viewport: KookitPdfViewport,
  onNoteClick: (event?: { target?: unknown }) => void
): void {
  subDoc.querySelector('svg.turead-note-stroke')?.remove()
  if (notes.length === 0) return
  const layer = subDoc.querySelector('.noteLayer')
  if (!layer) return

  const svg = subDoc.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'turead-note-stroke')
  svg.setAttribute('viewBox', `0 0 ${viewport.width} ${viewport.height}`)
  svg.setAttribute(
    'style',
    `position:absolute;left:${docLayerMarginLeft(subDoc)}px;top:0;` +
      `width:${viewport.width}px;height:${viewport.height}px;` +
      `overflow:visible;pointer-events:none;z-index:1;`
  )
  for (const note of notes) {
    let stroke: unknown
    try {
      const parsed = JSON.parse(note.anchor.fragment?.key ?? '') as { page?: unknown; stroke?: unknown }
      if (!Array.isArray(parsed.stroke)) continue
      stroke = parsed.stroke
    } catch {
      continue
    }
    const polyline = subDoc.createElementNS('http://www.w3.org/2000/svg', 'polyline')
    const points = (stroke as number[][])
      .map((p) => {
        const v = viewport.convertToViewportPoint(p[0], p[1])
        return `${v[0]},${v[1]}`
      })
      .join(' ')
    polyline.setAttribute('points', points)
    strokeAttrs(polyline, resolveNoteHex('background', note.color), viewport)
    polyline.setAttribute('class', 'kookit-note')
    polyline.setAttribute('data-key', note.id)
    // 命中：只让笔迹线本身接事件（svg 整面 pointer-events:none）
    ;(polyline as unknown as HTMLElement).style.pointerEvents = 'stroke'
    ;(polyline as unknown as HTMLElement).style.cursor = 'pointer'
    polyline.addEventListener('click', () => onNoteClick({ target: polyline }))
    svg.appendChild(polyline)
  }
  layer.appendChild(svg)
}
