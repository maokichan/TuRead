/**
 * 笔记流（笔记管理·跨书）—— **網格 / 瀑布流**两态 + **窗口化**（`STYLE.md` §5.10）。
 *
 * 三条设计（都由实测驱动，见 STYLE §5.10 的"窗口化与刷新成本"）：
 * ① **自己装箱 + 绝对定位**（几何在 `noteLayout.ts`，纯函数、有单测）：
 *    位置在 JS 里是已知量 → 才能"不渲染就知道第 i 条在哪" → 窗口化才成立。
 *    实测动机：1000 条全量渲染时一次整片重渲染 **1.6 s**，而检索框是逐键触发 → 不可接受。
 * ② **只渲染视口 ± overscan**；视口外不渲染、也不需要占位 spacer（绝对定位的红利）。
 * ③ **高度先估后测**：未测量的条目用文本长度估算（首屏不留大空白），
 *    瀑布流里挂载后由 `ResizeObserver` 实测纠正；**只在该列之后重排**（不是整片）。
 *    網格不测量（等高行本就用估算值布局，避免"测量值是行高"造成的自反馈）。
 *
 * ⚠ 一个坑记在这：**测量对象必须是卡片自身、不能是"被布局决定的盒子"**。瀑布流里条目盒是
 * 内容驱动的（可测）；網格里它的高度就是行高（测了会自己喂自己）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Note, NoteTextFocus, NoteView } from '@core/domain/types'
import { NoteCard } from './NoteCard'
import {
  computeColW,
  computeCols,
  packGrid,
  packMasonry,
  visibleIndices,
  FLOW_COL_GAP
} from './noteLayout'

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
  /** 滚动容器；缺省 = window（样式样张里就是 window） */
  scrollRef?: React.RefObject<HTMLElement | null>
  /**
   * 是否窗口化（**诊断开关**，默认 true）。关掉 = 全量渲染全部条目 ——
   * 供 `smoke.cjs --scale=N --no-window` 做**有效 A/B**（窗口化到底省了多少）。
   * 产品路径一律默认开。
   */
  windowing?: boolean
}

/** 列宽兜底：正常从 CSS 变量 `--note-col-w` 读（单一来源），读不到才用它 */
const COL_FALLBACK = 240
/** 视口外多渲染的像素（上下各一份）——滚动时不露白，也不至于把整列拉回来 */
const OVERSCAN_PX = 600
/** 首帧还没量到视口高度时，先按这个高度算可见集（避免"第一帧全量渲染"） */
const FIRST_PAINT_VIEWPORT = 1200

/** 首帧估算基准：每行可容纳的汉字数（14px 字号、列宽 240px 时约 16 字） */
const CJK_PER_LINE = 16
const LINE_PX = 22
const EXCERPT_MAX_LINES = 4
const BODY_MAX_LINES = 6

/** 由文本长度估条目高度（**只用于未测量的条目**；瀑布流实测后会覆盖） */
function estimateHeight(note: Note): number {
  const lines = (s: string, max: number): number =>
    s === '' ? 0 : Math.min(max, Math.max(1, Math.ceil(s.length / CJK_PER_LINE)))
  const l1 = lines(note.anchor.norm.quote.exact, EXCERPT_MAX_LINES)
  const l2 = lines(note.body.trim(), BODY_MAX_LINES)
  const blocks = (l1 > 0 ? 1 : 0) + (l2 > 0 ? 1 : 0)
  // 上下内边距 16 + 元行 16 + 每块段距 6 + 文本行
  return 16 + 16 + blocks * 6 + (l1 + l2) * LINE_PX
}

export function NoteFlow({
  view,
  items,
  selectedId,
  textFocus,
  onSelect,
  onOpen,
  onContextMenu,
  scrollRef,
  windowing = true
}: NoteFlowProps): React.JSX.Element {
  const flowRef = useRef<HTMLDivElement | null>(null)
  const [box, setBox] = useState({ width: 0, viewportH: 0, scrollTop: 0 })
  /** 流自身在**滚动坐标**里的原点（见下方 read() —— 流不一定在滚动容器顶部） */
  const originRef = useRef(0)
  const [colW, setColW] = useState(COL_FALLBACK)
  /** 实测高度（id → px）；估算值不进这里，缺项即估算 */
  const measured = useRef(new Map<string, number>())
  /** 实测更新后重算布局（只在真的变了才 +1，防自反馈循环） */
  const [measuredTick, setMeasuredTick] = useState(0)

  // 列宽：读 CSS 变量（单一来源在 styles.css）
  useEffect(() => {
    const el = flowRef.current
    if (!el) return
    const px = parseFloat(getComputedStyle(el).getPropertyValue('--note-col-w'))
    if (Number.isFinite(px) && px > 0) setColW(px)
  }, [])

  // 尺寸 + 滚动订阅（滚动用 rAF 节流；ResizeObserver 覆盖容器宽与视口高变化）
  useEffect(() => {
    const scroller = scrollRef?.current ?? null
    let raf = 0
    const read = (): void => {
      const el = flowRef.current
      const scrollTop = scroller ? scroller.scrollTop : window.scrollY
      const viewportH = scroller ? scroller.clientHeight : window.innerHeight
      const width = el?.clientWidth ?? 0
      /**
       * ⚠ **流不一定在滚动容器顶部**（2026-09-16 被样张抓到：笔记流在页面中段时，
       * 窗口化把 `scrollTop` 当成流内坐标 → 判定"整屏都在流外面" → **一张卡都不渲染**）。
       * 故要量出流在**滚动坐标**里的原点，再把窗口换算成流内坐标。
       */
      if (el) {
        const r = el.getBoundingClientRect()
        originRef.current = scroller
          ? r.top - scroller.getBoundingClientRect().top + scrollTop
          : r.top + window.scrollY
      }
      setBox((prev) =>
        prev.width === width &&
        prev.viewportH === viewportH &&
        Math.abs(prev.scrollTop - scrollTop) < 0.5
          ? prev
          : { width, viewportH, scrollTop }
      )
    }
    const onScroll = (): void => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        read()
      })
    }
    read()
    const target: HTMLElement | Window = scroller ?? window
    target.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(read)
    if (flowRef.current) ro.observe(flowRef.current)
    if (scroller) ro.observe(scroller)
    return () => {
      target.removeEventListener('scroll', onScroll)
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [scrollRef])

  // 瀑布流：实测卡片高度（網格不测 —— 那里条目高度就是行高，测了会自反馈）
  const roRef = useRef<ResizeObserver | null>(null)
  const elsRef = useRef(new Map<string, HTMLElement>())
  const refFns = useRef(new Map<string, (el: HTMLElement | null) => void>())
  useEffect(() => {
    if (view !== 'masonry') return
    const ro = new ResizeObserver((entries) => {
      let changed = false
      for (const entry of entries) {
        const el = entry.target as HTMLElement
        const id = el.dataset.noteId
        if (!id) continue
        const h = el.getBoundingClientRect().height
        if (h <= 0) continue
        const prev = measured.current.get(id)
        /**
         * ⚠ **量化 + 死区**（2026-09-16 实测修的：这不只是省事，是防"测量反馈级联"）：
         * 切文字主次档会让字号 14↔13px → 每张卡片高度变几像素 → 位置全挪 → 可见集变 →
         * 挂载新卡 → 又测 → 又挪 …… 实测把一次"重渲染"从几十 ms 拉成 **1.7 s**。
         * 规则：**首次测量必写**（精度取 8px 量化）；之后只在变化 ≥16px 时才动布局
         * —— 排版档级的小变化不再引起重排，卡片自己也吸收这点差异。
         */
        const quantized = Math.ceil(h / 8) * 8
        if (prev === undefined || Math.abs(prev - h) >= 16) {
          measured.current.set(id, prev === undefined ? quantized : Math.ceil(h / 8) * 8)
          changed = true
        }
      }
      if (changed) setMeasuredTick((t) => t + 1)
    })
    roRef.current = ro
    elsRef.current.forEach((el) => ro.observe(el))
    return () => {
      ro.disconnect()
      roRef.current = null
    }
  }, [view])

  const getRef = useCallback((id: string): ((el: HTMLElement | null) => void) => {
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
        el.dataset.noteId = id
        elsRef.current.set(id, el)
        ro?.observe(el)
      }
    }
    refFns.current.set(id, fn)
    return fn
  }, [])

  const cols = computeCols(box.width, colW)
  const colWidth = computeColW(box.width, cols)
  const layout = useMemo(() => {
    const heights = items.map((it) => measured.current.get(it.note.id) ?? estimateHeight(it.note))
    return view === 'masonry'
      ? packMasonry(heights, cols, colWidth)
      : packGrid(heights, cols, colWidth)
    // measuredTick 参与依赖：实测高度更新后必须重算（否则位置仍是估算值）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, view, cols, colWidth, measuredTick])

  const visible = useMemo(() => {
    if (!windowing) return layout.placed.map((p) => p.index)
    // 窗口换算成**流内坐标**（减去流原点）；首帧还没量到视口高时按 FIRST_PAINT_VIEWPORT 估
    return visibleIndices(
      layout,
      box.scrollTop - originRef.current,
      box.viewportH > 0 ? box.viewportH : FIRST_PAINT_VIEWPORT,
      OVERSCAN_PX
    )
  }, [layout, box.scrollTop, box.viewportH, windowing])

  return (
    <div
      ref={flowRef}
      className={`note-flow note-flow--${view === 'masonry' ? 'masonry' : 'grid'}`}
      style={{ height: layout.totalHeight }}
    >
      {visible.map((index) => {
        const item = items[index]
        const p = layout.placed[index]
        if (!item || !p) return null
        return (
          <div
            key={item.note.id}
            className="note-flow__item"
            // 瀑布流：条目盒由内容撑高 → 可测；網格：高度 = 行高（等高行），故不测
            ref={view === 'masonry' ? getRef(item.note.id) : undefined}
            style={{
              top: p.top,
              left: p.col * (colWidth + FLOW_COL_GAP),
              width: colWidth,
              height: view === 'grid' ? p.height : undefined
            }}
          >
            <NoteCard
              note={item.note}
              editionTitle={item.editionTitle}
              selected={selectedId === item.note.id}
              textFocus={textFocus}
              onSelect={() => onSelect(item)}
              onOpen={() => onOpen(item)}
              onContextMenu={(e) => onContextMenu(item, e)}
            />
          </div>
        )
      })}
    </div>
  )
}
