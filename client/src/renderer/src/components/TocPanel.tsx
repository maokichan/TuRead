import { useRef } from 'react'

/** 目录树扁平化行（ReaderFeature 产出，TocPanel 展示） */
export interface TocRow {
  label: string
  depth: number
  /** 目录项起始渲染节号（缺省 = 无可直达章节，禁用跳转） */
  chapterDocIndex?: number
}

interface TocPanelProps {
  /** 展开与否；false = 只剩**挂载线**。默认由 ReaderFeature 置为展开（用户 2026-09-11 定） */
  open: boolean
  rows: TocRow[]
  onJump: (row: TocRow) => void
  onToggle: () => void
}

/** 遮罩衰减半径（px）：鼠标距离条目中心超过它 → 完全盖上 */
const VEIL_FALLOFF = 110

/**
 * 目录 = **挂载线 + 垂挂列表**（STYLE.md §5.8）。
 *
 * 形态（用户 2026-09-11 定）：
 * - 那根细线是**挂载线**（目录的挂载点）。位置：左缘对齐**侧边栏展开时的右缘**（`--sidebar-w`），
 *   宽度受左侧留白夹取 → 默认不侵入正文列（见 styles.css `.toc-mount` / `.toc-list`）。
 * - 展开后条目**自线下方逐条向下**垂挂，左端与线左端对齐；条目容器**完全透明**；
 *   末尾「折疊」按钮与容器**中间对齐**。
 * - **高亮不是改文字颜色**，而是条目容器上覆盖一层遮罩（`.toc-row__veil`，桌色）：
 *   其不透明度按**条目到鼠标的距离**调整（近 → 揭开，远 → 盖上），过渡交给 CSS（200ms）。
 *   因此条目给足文字强度、明暗全部由遮罩承担，动效才有"随时间过渡"的观感。
 * - 目录**默认展示**；点击条目**不**收起目录，只有「折疊」/`t` 才临时隐藏（ReaderFeature 管状态）。
 */
export function TocPanel({ open, rows, onJump, onToggle }: TocPanelProps): React.JSX.Element {
  const rowsRef = useRef<HTMLDivElement | null>(null)

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
    <>
      <button
        className="toc-mount"
        aria-label={open ? '收起目錄' : '打開目錄'}
        aria-expanded={open}
        title={open ? '收起目錄' : '目錄'}
        onClick={onToggle}
      >
        <span className="toc-mount__line" />
      </button>

      {open && (
        <div className="toc-list">
          <div
            className="toc-list__rows"
            ref={rowsRef}
            onMouseMove={(e) => paintVeil(e.clientY)}
            onMouseLeave={() => paintVeil(null)}
          >
            {rows.map((row, i) => (
              <button
                key={i}
                className="toc-row"
                style={{ paddingLeft: `${row.depth * 14}px` }}
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
      )}
    </>
  )
}
