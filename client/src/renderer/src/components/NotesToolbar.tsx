/**
 * 笔记管理的**底部状态栏**（纯展示：props in / 回调 out）—— 视觉 = `STYLE.md` §5.10。
 *
 * 五件（左对齐，与书库底部状态栏同一结构：`border-t` + `pt-4` + 22px 文字按钮）：
 * ① **视图切换**（網格 ⇄ 瀑布流）—— `.view-switch` + **三角负片** + 900ms 动画（与书库同款，
 *    三角只给"视图切换"这个功能，§5.1）；② **筛选**（批註 → 劃線 → 全部，**单按钮三态循环**，
 *    默认批註、**不带三角不加动画**）；③ **层级**（批註為主 ⇄ 摘錄為主，两态循环；筛选为「劃線」时
 *    **禁用** —— 没有第二层可排）；④ **作用域**（當前庫 ⇄ 全部庫，两态循环）；⑤ **计数**（筛选后条数）。
 *
 * ⚠ 计数与书库"不显示书目数量"**不同**：这是**筛选器的必要反馈**（"筛出来多少条"），不是装饰统计。
 */
import { useEffect, useRef, useState } from 'react'
import type { NoteFilter, NoteTextFocus, NoteView } from '@core/domain/types'

export interface NotesToolbarProps {
  view: NoteView
  filter: NoteFilter
  textFocus: NoteTextFocus
  scope: 'library' | 'all'
  /** 当前筛选下的条数 */
  count: number
  /** 一次性反馈（如「已複製批註」）；显示在计数位置，约 1.5s 后自动消失 */
  hint?: string | null
  onToggleView: () => void
  onCycleFilter: () => void
  onToggleFocus: () => void
  onToggleScope: () => void
}

const VIEW_LABEL: Record<NoteView, string> = { masonry: '瀑布流', grid: '網格' }
const FILTER_LABEL: Record<NoteFilter, string> = { annotated: '批註', highlight: '劃線', all: '全部' }
const FOCUS_LABEL: Record<NoteTextFocus, string> = { body: '批註為主', excerpt: '摘錄為主' }
const SCOPE_LABEL: Record<'library' | 'all', string> = { library: '當前庫', all: '全部庫' }

/** 与 styles.css 的 `view-switch-flash` 一致（动画期间按钮禁用，防连点） */
const FLASH_MS = 900
const FLASH_SWAP_MS = 450

export function NotesToolbar({
  view,
  filter,
  textFocus,
  scope,
  count,
  hint,
  onToggleView,
  onCycleFilter,
  onToggleFocus,
  onToggleScope
}: NotesToolbarProps): React.JSX.Element {
  const [flashing, setFlashing] = useState(false)
  /** 按钮文字跟随动画节奏（约 42% 处替换，让"新文字从深色块里浮出"） */
  const [shown, setShown] = useState<NoteView>(view)
  const timers = useRef<number[]>([])

  useEffect(() => {
    if (!flashing) setShown(view)
  }, [view, flashing])

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t))
    },
    []
  )

  const toggleView = (): void => {
    if (flashing) return
    const next: NoteView = view === 'masonry' ? 'grid' : 'masonry'
    onToggleView()
    setFlashing(true)
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = [
      window.setTimeout(() => setShown(next), FLASH_SWAP_MS),
      window.setTimeout(() => setFlashing(false), FLASH_MS + 60)
    ]
  }

  /** 层级在「劃線」筛选下没有意义（都是无批注的条目）→ 禁用 */
  const focusDisabled = filter === 'highlight'

  return (
    <footer className="flex-none">
      <div className="flex items-center gap-7 border-t border-[var(--border)] pt-4 pb-1 text-[12px]">
        <button
          onClick={toggleView}
          disabled={flashing}
          title="切换显示模式"
          className={`view-switch ${flashing ? 'view-switch-flash' : ''}`}
        >
          {VIEW_LABEL[shown]}
        </button>
        <button
          onClick={onCycleFilter}
          title="切换筛选：批註 → 劃線 → 全部"
          className="text-action text-action--lg"
        >
          {FILTER_LABEL[filter]}
        </button>
        <button
          onClick={onToggleFocus}
          disabled={focusDisabled}
          title={focusDisabled ? '「劃線」下没有可切换的第二层' : '切换卡片内的文字主次'}
          className="text-action text-action--lg"
        >
          {FOCUS_LABEL[textFocus]}
        </button>
        <button
          onClick={onToggleScope}
          title="切换作用域：當前庫 / 全部庫"
          className="text-action text-action--lg"
        >
          {SCOPE_LABEL[scope]}
        </button>
        <span className="text-[var(--muted)]">{hint ?? `${count} 條`}</span>
      </div>
    </footer>
  )
}
