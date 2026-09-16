import { useEffect, useRef } from 'react'
import { activeTocIndex, centerInScrollBox, type TocRow } from './readerFollow'

/** 目录行形状定义在 `readerFollow.ts`（纯 `.ts`，测试工程不设 jsx）—— 这里再导出，调用方不必改 */
export type { TocRow }

interface TocPanelProps {
  rows: TocRow[]
  onJump: (row: TocRow) => void
  onToggle: () => void
  /** 顶部插槽（挂载线左挂件的「目錄 / 筆記」开关，由 ReaderRail 生成并与 NotesPanel 共用） */
  header?: React.ReactNode
  /** 当前阅读位置（章号 = `BookLocation.chapterDocIndex`）：**当前条目自动滚到容器正中**（2026-09-16 用户定） */
  activeChapter?: number
}

/** 遮罩衰减半径（px）：鼠标距离条目中心超过它 → 完全盖上 */
const VEIL_FALLOFF = 110

/**
 * 目录垂挂列表（挂载线实体的顶部挂件，线本体在 `ReaderRail`）。
 *
 * 形态（用户 2026-09-11 定，2026-09-12 并入挂载线实体）：
 * - 条目自挂载线**下方逐条向下**垂挂，左端与线对齐；容器全透明 + 顶端一条引导分割线
 *   （滚动被可视地截在线上）。
 * - **高亮不是改文字颜色**，而是条目容器上覆盖一层遮罩（`.toc-row__veil`，桌色）：
 *   其不透明度按**条目到鼠标的距离**调整（近 → 揭开，远 → 盖上），过渡交给 CSS（200ms）。
 * - 点击条目**不**收起目录，只有「折疊」/`t`/点挂载线才收（ReaderFeature 管状态）。
 */
export function TocPanel({
  rows,
  onJump,
  onToggle,
  header,
  activeChapter = 0
}: TocPanelProps): React.JSX.Element {
  const rowsRef = useRef<HTMLDivElement | null>(null)
  /** 上一次的 `rows` 引用：换了书就是"首次落位"（不做平滑动画，直接就在那儿） */
  const lastRowsRef = useRef<TocRow[] | null>(null)

  /**
   * **跟随当前位置**（2026-09-16 用户定）：当前条目滚到滚动容器**正中**。
   * - 判据在 `readerFollow.ts`（纯函数 + 单测），这里只负责落点；
   * - 打开面板/换书 = 首次落位（瞬时）；读着读着跨章 = 平滑跟随（否则每章跳一下，很跳眼）；
   * - 当前条目不存在（分组标题书、空目录）→ 不动，保持原位。
   */
  useEffect(() => {
    const box = rowsRef.current
    if (!box) return
    const idx = activeTocIndex(rows, activeChapter)
    if (idx < 0) return
    const el = box.querySelectorAll<HTMLElement>('.toc-row')[idx]
    if (!el) return
    const first = lastRowsRef.current !== rows
    lastRowsRef.current = rows
    centerInScrollBox(box, el, !first)
  }, [rows, activeChapter])

  /**
   * 按鼠标位置重画遮罩：先**读**全部条目矩形，再**写**各自的 `--toc-veil`
   * （读写分离，避免逐条读写交替触发强制重排）。
   *
   * 语义（用户 2026-09-11 定）：**靠近只会"揭开"，远端保持静息** ——
   * 遮罩不透明度在 `[0, 静息值]` 之间取值：正中 → 0（完全揭开）；够远 → 静息值（**不再更暗**）。
   * 静息值从 CSS 读 `--toc-veil-rest`（样式的单一来源在 styles.css，不在这里写死数字）。
   * `clientY === null` = 鼠标离开列表 → 清掉内联值，全部回到静息。
   */
  const paintVeil = (clientY: number | null): void => {
    const box = rowsRef.current
    if (!box) return
    const items = Array.from(box.querySelectorAll<HTMLElement>('.toc-row'))
    if (clientY === null) {
      for (const el of items) el.style.removeProperty('--toc-veil')
      return
    }
    const rest = Number.parseFloat(getComputedStyle(box).getPropertyValue('--toc-veil-rest')) || 0.74
    const measured = items.map((el) => {
      const r = el.getBoundingClientRect()
      return { el, center: r.top + r.height / 2 }
    })
    for (const { el, center } of measured) {
      const near = Math.max(0, 1 - Math.abs(clientY - center) / VEIL_FALLOFF)
      // near=1（正中）→ 0；near=0（够远）→ rest（保持静息，不加深）
      el.style.setProperty('--toc-veil', (rest * (1 - near)).toFixed(3))
    }
  }

  return (
    <div className="toc-list">
      {header}
      <div
        className="toc-list__rows"
        ref={rowsRef}
        onMouseMove={(e) => paintVeil(e.clientY)}
        onMouseLeave={() => paintVeil(null)}
      >
        {rows.length === 0 && <div className="toc-list__empty">本書沒有目錄索引</div>}
        {rows.map((row, i) => (
          <button
            key={i}
            className="toc-row"
            style={{ paddingLeft: `${row.depth * 16}px` }}
            disabled={row.chapterDocIndex === undefined}
            title={row.chapterDocIndex === undefined ? '（無可直達章節）' : '跳轉'}
            onClick={() => onJump(row)}
          >
            <span className="toc-row__label">{row.label}</span>
            <span className="toc-row__veil" aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="toc-list__fold">
        <button className="text-action" onClick={onToggle}>
          折疊
        </button>
      </div>
    </div>
  )
}
