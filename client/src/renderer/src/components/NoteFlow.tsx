/**
 * 笔记流（笔记管理·跨书）—— **網格 / 瀑布流**两态布局（**没有列表形态**，`STYLE.md` §5.10）。
 *
 * 为什么不用 CSS 现成方案：
 * - `columns` 是**列优先**（先填满第一列再第二列）→ 会把"时间倒序"的视觉流读乱。
 *   笔记流是**行优先**的（晚的在前、从左到右），故用 `grid` + `grid-row-end: span N`。
 * - ⚠ **行距算术**（踩过就懂）：`grid-auto-rows: 8px` 若与 `row-gap: 16px` 同用，
 *   跨 N 行的可用高度 = `N×8 + (N−1)×16`，空隙随内容漂移。所以**行距由跨行数里的余量承担**
 *   （`row-gap: 0`，`N = ceil((h + 16) / 8)`，余量 <8px → 实际行距 16~24px，肉眼均匀）。
 *
 * 高度来源（"条目大小随内容变"）：
 * - **首帧用文本长度估算**（`estimateHeight`）—— 否则第一帧是"一行细条"，量完才跳，会闪；
 * - 随即由 `ResizeObserver` **实测**纠正（量的是**卡片本身**，不是网格项 —— 网格项的高度正是
 *   跨行数算出来的，量它会形成自反馈）。
 * - 上限（摘录 4 行 / 批注 6 行）由 CSS 的 line-clamp 保证，因此高度有界。
 *
 * ⚠ **未做窗口化**：书库的 `useVirtualRange` 假定每行等高，瀑布流不满足（`STYLE.md` §5.10 末段
 * 已登记该冲突与三条候选）。本组件先按全量渲染，待量化后再决定。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Note, NoteTextFocus, NoteView } from '@core/domain/types'
import { NoteCard } from './NoteCard'

export interface NoteFlowItem {
  note: Note
  /** 展示投影（读模型 `NoteListItem.editionTitle`） */
  editionTitle: string
}

export interface NoteFlowProps {
  view: NoteView
  items: NoteFlowItem[]
  selectedId: string | null
  textFocus: NoteTextFocus
  onSelect: (item: NoteFlowItem) => void
  /** 双击 = 跳转（打开他书并落到锚点） */
  onOpen: (item: NoteFlowItem) => void
  onContextMenu: (item: NoteFlowItem, e: React.MouseEvent) => void
}

/** ⚠ 与 `styles.css` 的 `.note-flow--masonry { grid-auto-rows: 8px }` 和
 *  `.note-flow { column-gap: 16px }` **必须一致**（改一处要改两处）。 */
const ROW_UNIT = 8
const FLOW_GAP = 16
/** 首帧估算基准：列宽（= `--note-col-w`）与每行可容纳的汉字数（14px 字号下约 16 字） */
const CJK_PER_LINE = 16
/** 每行文本的估算高度（1.6 行距 × 14px ≈ 22） */
const LINE_PX = 22
/** 摘录 / 批注的行数上限 —— 与 CSS 的 line-clamp 同口径（§5.10） */
const EXCERPT_MAX_LINES = 4
const BODY_MAX_LINES = 6

/** 由文本长度估卡片高度（**只用于首帧**，实测立刻覆盖） */
function estimateHeight(note: Note): number {
  const lines = (s: string, max: number): number =>
    s === '' ? 0 : Math.min(max, Math.max(1, Math.ceil(s.length / CJK_PER_LINE)))
  const l1 = lines(note.anchor.norm.quote.exact, EXCERPT_MAX_LINES)
  const l2 = lines(note.body.trim(), BODY_MAX_LINES)
  const blocks = (l1 > 0 ? 1 : 0) + (l2 > 0 ? 1 : 0)
  // 上下内边距 16 + 元行 16 + 每块段距 6 + 文本行
  return 16 + 16 + blocks * 6 + (l1 + l2) * LINE_PX
}

const toSpan = (height: number): number => Math.max(1, Math.ceil((height + FLOW_GAP) / ROW_UNIT))

export function NoteFlow({
  view,
  items,
  selectedId,
  textFocus,
  onSelect,
  onOpen,
  onContextMenu
}: NoteFlowProps): React.JSX.Element {
  const masonry = view === 'masonry'
  /** 卡片 id → 跨行数（仅瀑布流用；首帧为估算值） */
  const [spans, setSpans] = useState<Record<string, number>>({})
  const roRef = useRef<ResizeObserver | null>(null)
  /** 已观察的**卡片**元素（网格项不是测量对象 —— 量它会自反馈） */
  const elsRef = useRef(new Map<string, HTMLElement>())
  /** 按 id 缓存的 ref 回调：身份稳定，避免每次渲染都解绑/重挂 */
  const refFns = useRef(new Map<string, (el: HTMLElement | null) => void>())

  useEffect(() => {
    if (!masonry) return
    const ro = new ResizeObserver((entries) => {
      setSpans((prev) => {
        let next = prev
        for (const entry of entries) {
          const el = entry.target as HTMLElement
          const id = el.dataset.flowId
          if (!id) continue
          const span = toSpan(el.getBoundingClientRect().height)
          if (prev[id] !== span) {
            if (next === prev) next = { ...prev }
            next[id] = span
          }
        }
        return next
      })
    })
    roRef.current = ro
    elsRef.current.forEach((el) => ro.observe(el)) // 切换视图时元素还在，补观察
    return () => {
      ro.disconnect()
      roRef.current = null
    }
  }, [masonry])

  const getRef = useCallback(
    (id: string, est: number): ((el: HTMLElement | null) => void) => {
      const cached = refFns.current.get(id)
      if (cached) return cached
      const fn = (el: HTMLElement | null): void => {
        const ro = roRef.current
        const prev = elsRef.current.get(id)
        if (prev && prev !== el) {
          ro?.unobserve(prev)
          elsRef.current.delete(id)
        }
        if (el) {
          el.dataset.flowId = id
          elsRef.current.set(id, el)
          ro?.observe(el)
        }
        // 首帧估算（实测会立刻纠正）——放在 ref 回调里，挂载时才写一次
        setSpans((p) => (p[id] === est ? p : { ...p, [id]: est }))
      }
      refFns.current.set(id, fn)
      return fn
    },
    []
  )

  return (
    <div className={`note-flow note-flow--${masonry ? 'masonry' : 'grid'}`}>
      {items.map((item) => {
        const id = item.note.id
        const est = toSpan(estimateHeight(item.note))
        return (
          <div key={id} style={masonry ? { gridRowEnd: `span ${spans[id] ?? est}` } : undefined}>
            {/* 测量层：自然高度（不参与跨行计算），网格项的高度由上面的 span 决定 */}
            <div ref={masonry ? getRef(id, est) : undefined} className={masonry ? '' : 'h-full'}>
              <NoteCard
                note={item.note}
                editionTitle={item.editionTitle}
                selected={selectedId === id}
                textFocus={textFocus}
                onSelect={() => onSelect(item)}
                onOpen={() => onOpen(item)}
                onContextMenu={(e) => onContextMenu(item, e)}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
