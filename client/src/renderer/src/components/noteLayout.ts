/**
 * 笔记流的**装箱 + 窗口化**（`NoteFlow` 的几何内核）—— **纯函数、零 DOM**，故可被 vitest 直接覆盖。
 *
 * 为什么自己装箱、而不是用 CSS grid 的 `span`（2026-09-16 定，实测驱动）：
 * 窗口化的前提是**不渲染就知道第 i 条在哪**。grid 的自动布局把位置算在浏览器里、取不回来；
 * 自己装箱（最短列优先 + 绝对定位）后，`placed[i] = {col, top, height}` 就是已知量，
 * 于是"只渲染视口内那几十条"才成立。实测动机见 `STYLE.md` §5.10：1000 条全量渲染时
 * 一次整片重渲染 **1.6 s**（`refreshMs`），而检索框是逐键触发 → 不可接受。
 *
 * 一个装箱器服务两种视图（不再维护两条路径）：
 * - `packMasonry` —— 瀑布流：**最短列优先**（行优先的视觉流："晚的在前、从左到右"）；
 * - `packGrid`    —— 網格：行优先 + **行内等高**（取该行最高者），即书库网格的等高行语义。
 */

export interface PlacedItem {
  /** 条目在 `items` 里的下标 */
  index: number
  col: number
  top: number
  /** 该条目的高度（px，不含行距） */
  height: number
}

export interface FlowLayout {
  placed: PlacedItem[]
  cols: number
  colW: number
  /** 容器总高（= 最高列高 − 行距；绝对定位下它撑出滚动条几何） */
  totalHeight: number
  /** 每列**按 top 升序**的条目下标 —— 窗口化二分就靠它（同列内 top 单调） */
  byCol: number[][]
}

/** 列间距（与 `styles.css` 的 `.note-flow` 口径一致） */
export const FLOW_COL_GAP = 16
/** 行间距（由装箱器写进 `top`，CSS 不再管） */
export const FLOW_ROW_GAP = 16

/** 列数 = 容器宽能放下几列（列宽固定 `--note-col-w`；列数随窗口自适应） */
export function computeCols(containerW: number, colW: number, colGap = FLOW_COL_GAP): number {
  if (!Number.isFinite(containerW) || containerW <= 0 || colW <= 0) return 1
  return Math.max(1, Math.floor((containerW + colGap) / (colW + colGap)))
}

/** 实际列宽（均分剩余空间，避免右侧留一条缝） */
export function computeColW(containerW: number, cols: number, colGap = FLOW_COL_GAP): number {
  if (cols <= 1) return Math.max(0, containerW)
  return Math.max(0, (containerW - (cols - 1) * colGap) / cols)
}

function finish(
  placed: PlacedItem[],
  cols: number,
  colW: number,
  colHeights: number[],
  rowGap: number
): FlowLayout {
  const byCol: number[][] = Array.from({ length: cols }, () => [])
  // placed 是按 index 顺序 push 的；同列内 top 单调递增（装箱时只会往后长）
  for (const p of placed) byCol[p.col].push(p.index)
  const maxH = colHeights.reduce((a, b) => Math.max(a, b), 0)
  return {
    placed,
    cols,
    colW,
    totalHeight: Math.max(0, maxH - rowGap),
    byCol
  }
}

/** 瀑布流装箱：每条放进**当前最矮**的列（行优先的视觉流） */
export function packMasonry(
  heights: number[],
  cols: number,
  colW: number,
  colGap = FLOW_COL_GAP,
  rowGap = FLOW_ROW_GAP
): FlowLayout {
  const c = Math.max(1, cols)
  const colHeights = new Array<number>(c).fill(0)
  const placed: PlacedItem[] = []
  heights.forEach((h, index) => {
    let target = 0
    for (let j = 1; j < c; j++) {
      // 严格小于才换列：并列时留在靠左的列，视觉更稳（且与"从左上开始"一致）
      if (colHeights[j] < colHeights[target] - 1e-6) target = j
    }
    placed.push({ index, col: target, top: colHeights[target], height: h })
    colHeights[target] += h + rowGap
  })
  return finish(placed, c, colW, colHeights, rowGap)
}

/** 網格装箱：行优先、**行内等高**（该行最高者决定行高）—— 书库网格的等高行语义 */
export function packGrid(
  heights: number[],
  cols: number,
  colW: number,
  colGap = FLOW_COL_GAP,
  rowGap = FLOW_ROW_GAP
): FlowLayout {
  const c = Math.max(1, cols)
  const placed: PlacedItem[] = []
  const colHeights = new Array<number>(c).fill(0)
  let rowTop = 0
  for (let i = 0; i < heights.length; i += c) {
    const row = heights.slice(i, i + c)
    const rowH = row.reduce((a, b) => Math.max(a, b), 0)
    row.forEach((h, k) => {
      placed.push({ index: i + k, col: k, top: rowTop, height: rowH })
      colHeights[k] = rowTop + rowH + rowGap
    })
    rowTop += rowH + rowGap
  }
  void colGap
  return finish(placed, c, colW, colHeights, rowGap)
}

/**
 * 视口内该渲染的下标（含 overscan）。**按列二分**：同列内 `top` 单调递增。
 * 返回升序下标（保持阅读序，便于 key 稳定）。
 */
export function visibleIndices(
  layout: FlowLayout,
  scrollTop: number,
  viewportH: number,
  overscanPx = 600
): number[] {
  const start = scrollTop - overscanPx
  const end = scrollTop + Math.max(0, viewportH) + overscanPx
  const out: number[] = []
  const topOf = (index: number): number => layout.placed[index].top
  const bottomOf = (index: number): number => {
    const p = layout.placed[index]
    return p.top + p.height
  }
  for (const col of layout.byCol) {
    // 第一个"底边越过 start"的条目
    let lo = 0
    let hi = col.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (bottomOf(col[mid]) < start) lo = mid + 1
      else hi = mid
    }
    for (let k = lo; k < col.length; k++) {
      const idx = col[k]
      if (topOf(idx) > end) break
      out.push(idx)
    }
  }
  return out.sort((a, b) => a - b)
}

/** 容器总高（无条目时为 0） */
export function layoutHeight(layout: FlowLayout): number {
  return layout.totalHeight
}
