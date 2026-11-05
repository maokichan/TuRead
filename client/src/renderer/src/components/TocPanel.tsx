import { useEffect, useRef } from 'react'
import { activeTocIndex, centerInScrollBox, type TocRow } from './readerFollow'
import { paintGlow } from './veil'
import { Marquee } from './Marquee'

/** 目录行形状定义在 `readerFollow.ts`（纯 `.ts`，测试工程不设 jsx）—— 这里再导出，调用方不必改 */
export type { TocRow }

interface TocPanelProps {
  rows: TocRow[]
  onJump: (row: TocRow) => void
  /** 当前阅读位置（章号 = `BookLocation.chapterDocIndex`）：**当前条目自动滚到容器正中** */
  activeChapter?: number
}

/**
 * 目录（= 阅读卡左缘的**内嵌件**，样张 `docs/prototypes/toc-final-home.html`）。
 *
 * 形态：
 * - **内嵌**在阅读卡内部左缘、挂靠阅读器边缘、**头部处于阅读器半高处**（top: 50%），
 *   条目向下排列，低注意力。
 * - **压印字（拟物）**：条目文字静息近乎隐没（`--toc-press-rest` 档的字色）+ 双向边缘阴影
 *   （`--toc-press-hi/-lo`，压进桌面的 letterpress 质感）——不只是 hover 高亮一种语义。
 * - **显影 = 字色按距离**（遮罩按距离的换装，`.toc-row__fill`）：靠近只会"显影"到全强度，
 *   远端保持静息，绝不比静息更暗；hover = 满强度。因子由 `paintGlow` 写 `--row-near`。
 * - **长题 = 悬停滚动**：静息照旧省略，hover 时该行换装成 `Marquee`
 *   无缝滚动读完全题（侧栏标签胶囊的同款语汇；`pauseOnHover` 必关 —— 该层只在 hover 时存在）。
 * - **无折叠**：目录常驻；`t` = 强隐藏（ReaderFeature 管状态）。
 * - 点击条目**不**收起目录。
 */
export function TocPanel({
  rows,
  onJump,
  activeChapter = 0
}: TocPanelProps): React.JSX.Element {
  const rowsRef = useRef<HTMLDivElement | null>(null)
  /** 根层引用：显影因子的绘制范围（mousemove 也挂在根层） */
  const rootRef = useRef<HTMLDivElement | null>(null)
  /** 上一次的 `rows` 引用：换了书就是"首次落位"（不做平滑动画，直接就在那儿） */
  const lastRowsRef = useRef<TocRow[] | null>(null)

  /**
   * **跟随当前位置**：当前条目滚到滚动容器**正中**。
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
   * 按鼠标位置重画条目**字色显影**因子（`--row-near` ∈ [0,1]，欧氏距离，换算归 styles.css）。
   * 读写分离：先读全部矩形，再统一写变量。`clientX/Y === null` = 鼠标离开 → 清内联值回静息。
   */
  const paint = (clientX: number | null, clientY: number | null): void => {
    paintGlow(rootRef.current, { selector: '.toc-row', glowVar: '--row-near' }, clientX, clientY)
  }

  return (
    <div
      className="toc-list"
      ref={rootRef}
      onMouseMove={(e) => paint(e.clientX, e.clientY)}
      onMouseLeave={() => paint(null, null)}
    >
      <div className="toc-list__rows" ref={rowsRef}>
        {rows.length === 0 && <div className="toc-list__empty">本書沒有目錄索引</div>}
        {rows.map((row, i) => (
          <button
            key={i}
            className="toc-row"
            style={{ '--toc-depth': row.depth } as React.CSSProperties}
            disabled={row.chapterDocIndex === undefined}
            title={row.chapterDocIndex === undefined ? '（無可直達章節）' : '跳轉'}
            onClick={() => onJump(row)}
          >
            <span className="toc-row__label">{row.label}</span>
            <span className="toc-row__fill" aria-hidden="true">
              {row.label}
            </span>
            <span className="toc-row__roll" aria-hidden="true">
              <Marquee duration={14} pauseOnHover={false}>
                {row.label}
              </Marquee>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
