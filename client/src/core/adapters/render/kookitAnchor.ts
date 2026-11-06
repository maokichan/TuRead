/**
 * kookit 选区 → 锚点的引擎侧原语（模块级纯函数，自 kookitRenderAdapter 拆出便于单点复核）。
 * 三层证据一次取齐 —— Fragment（引擎精确载荷 = kookit 自己的 rangy 序列化）、
 * Norm（章 + 章内进度）、quote（划线原文快照 + 前后文，供 remeasure）。
 * 数据形状与失败模式（弱锚点降级、跨节过滤、搜索不给块内偏移）的契约随函数迁移，语义不变。
 */
import type { AnchorQuote, BookLocation, TextAnchor } from '@core/domain/types'
import type { KookitRendition } from '@vendor/kookit.esm'
import {
  QUOTE_CONTEXT_MAX,
  QUOTE_EXACT_MAX,
  clipQuote,
  normalizeAnchor,
  quoteSimilarity
} from '@core/domain/anchor'
import { normalizeLocation } from '@core/domain/location'

/** 文字类的引擎载荷标识（锚点 `Fragment.engine`）。
 *  kookit 文字类笔记载荷是 **rangy 序列化字符范围**，不是 CFI
 *  （`getHightlightCoords()` = `rangy.getSelection(iframe).saveCharacterRanges(doc.body)[0]`）。
 *  换渲染内核时新增取值，旧值由适配器按名分派（见 `anchor.ts` 的 Fragment 设计）。 */
export const TEXT_FRAGMENT_ENGINE = 'kookit-rangy'

/** PDF 的引擎载荷标识（笔记 v3 几何锚第一批 = **文字选区**；拉框/记号笔属第二批）。
 *  载荷 = kookit `getHightlightCoords` 的 PDF 形状 `{page, coords(pdf 点), readerMode}`，
 *  渲染/删除/回显走 `PdfRender` 的 `showPDFHighlight` 路径（引擎自足，适配器零解释）。 */
export const PDF_FRAGMENT_ENGINE = 'kookit-pdf-rect'

/** PDF 记号笔（自由 polyline）的引擎载荷标识——kookit 不解释这个形状，
 *  渲染/删除/回显由适配器自绘 SVG 层承担（`kookitGeom.renderStrokeLayer`）。
 *  载荷 = `{page, stroke: pdf 点[][]}`。 */
export const PDF_STROKE_FRAGMENT_ENGINE = 'kookit-pdf-stroke'

/**
 * 章内进度估计：**按字符位置**（选区起点之前的字符数 / 本章正文字符总数）。
 * 为什么不用像素：改字号/行距/纸宽都会移动像素位置，而字符序不变 —— progression 在 Norm 层
 * 只承担粗排序/粗回跳（`domain/location.ts` 三级角色里的 display 一侧），不该跟着排版漂移。
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

/**
 * `fromSelection`：把当前正文选区取成统一锚点（适配器 `getSelectionAnchor` 的本体）。
 * 只读：不改引擎状态、不落库（落库是用例层的事）。
 * `deps.format` = 当前书格式；`deps.renderedChapter` = 当前已渲染节号（锚点章号的优先来源）；
 * `deps.positionOf` = 权威位置。
 */
export async function selectionToAnchor(
  rendition: KookitRendition,
  deps: { format?: string; renderedChapter: number | null; positionOf: () => BookLocation }
): Promise<TextAnchor | null> {
  // ————— PDF：选区住在**子页 iframe** 里（每页一个 section，chapterDocIndex = 页码）—————
  // 载荷 = kookit 自己的 `{page, coords(pdf 点), readerMode}`（`getHightlightCoords` 的 PdfRender
  // 实现产出，`showPDFHighlight`/`renderHighlighters`/`createOneNote` 的 PDF 分支都消费同一形状
  // ——引擎路径现成，这里只是补上"生产者"）。quote 取子页选区的文字快照（pdf.js 文本层给真文字；
  // 无文本层的扫描版选不出文字 → 自然落 null，诚实不可标）。
  if (deps.format === 'PDF') {
    // 页号 = **逐页找有选区的那页**，不信 renderedChapter——PDF 滚动模式预渲染会让
    // "最后渲染页"≠"用户正在看的页"（真机实锤：右键在眼前这页毫无反应的根因）。
    // ⚠ 子页发现走 **DOM 直查**（顶层文档下 `iframe[id^="pdf-iframe-"]`）——
    // `getSubDocument(i)` 对缺失页会顺手创建 iframe（kookit 副作用，禁用）。
    let page: number | null = null
    let subDoc: Document | null = null
    const top = rendition.getDocument()
    for (const f of Array.from(top?.querySelectorAll('iframe[id^="pdf-iframe-"]') ?? [])) {
      const d = (f as HTMLIFrameElement).contentDocument
      const sel = d?.getSelection()
      if (d && sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        const n = Number((f.getAttribute('id') ?? '').slice('pdf-iframe-'.length))
        if (!Number.isFinite(n)) continue
        page = n
        subDoc = d
        break
      }
    }
    if (page === null || !subDoc) return null
    const range = subDoc.getSelection()!.getRangeAt(0)
    const exact = range.toString()
    // 纯空白选区（toString 为空）不算可标内容 —— 建了也没法回显与重锚
    if (exact.trim() === '') return null

    const raw = await rendition.getHightlightCoords(page)
    if (!raw) return null

    const prog = rendition.getProgress()
    const totalPage = typeof prog?.totalPage === 'number' ? prog.totalPage : 0
    return normalizeAnchor({
      norm: {
        chapterIndex: page,
        // PDF 的章内进度按**页序**（页码/总页数）；像素会随缩放漂移，页序不随
        progression: totalPage > 0 ? Math.min(1, Math.max(0, page / totalPage)) : 0,
        quote: quoteFromRange(range)
      },
      fragment: { engine: PDF_FRAGMENT_ENGINE, key: JSON.stringify(raw) }
    })
  }

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

  const chapterIndex = deps.renderedChapter ?? normalizeLocation(deps.positionOf()).chapterDocIndex

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
 * `remeasure`：Fragment 失效后按原文快照找回位置（适配器 `remeasureAnchor` 的本体）。
 *
 * kookit 搜索返回 `{excerpt, cfi}`，`cfi` 是含 `chapterDocIndex` 的 JSON 串
 * （逆向自 bundle 的 `getSearchResult`）—— **没有字符偏移**，所以只能重建到**章级**：
 * 产出一定是**弱锚点**（`fragment = null`）。这是诚实降级而非缺陷：弱锚点仍能回跳，
 * 且用户下次在该处重新划线即可升级为强锚点。
 *
 * 选路：多条命中按 `quoteSimilarity` 取最相似的一条（excerpt 是块 ±100 字窗口，
 * 真正命中的块相似度显著更高）。找不到 → null，由调用方决定保留旧锚点还是标记失效。
 * 代价：搜索遍历全书各章，属用户显式触发的恢复动作（可接受）。
 */
export async function remeasureBySearch(
  rendition: KookitRendition,
  anchor: TextAnchor
): Promise<TextAnchor | null> {
  const quote = anchor?.norm?.quote?.exact ?? ''
  if (quote === '') return null

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
      // 搜索不给块内偏移 → 记章首。progression 是 display/粗排序角色（domain/location.ts 三级角色），
      // 这里**不假装精确**：写 0 比编一个数诚实。
      progression: 0,
      quote: anchor.norm.quote
    },
    fragment: null
  })
}
