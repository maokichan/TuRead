/**
 * useVirtualRange —— 书库窗口化渲染的范围计算（2026-09-12）。
 *
 * 为什么：书库一次全量渲染几百个条目（每个含封面图/FittedTitle/hover 层）会卡顿——
 * 数据量一大，挂载/布局/绘制的成本全在"一次性渲染"上（用户 2026-09-12 定：不要一次渲染）。
 * 本 hook 只算"该渲染哪一段"：监听滚动容器的 scroll 与尺寸，返回可视区 ± 缓冲的
 * 切片下标与上下占位高度；**不引第三方依赖**，列表（perRow=1）与网格（perRow=列数）通用。
 *
 * 用法：容器 = 唯一的滚动元素；切片渲染时用 paddingTop/padBottom 撑出总高度，
 * 使滚动条几何与全量渲染一致（边界处有 <1 个 gap 的几何误差，肉眼不可见）。
 */
import { useCallback, useLayoutEffect, useState, type RefObject } from 'react'

export interface VirtualRange {
  /** 可视切片 [sliceStart, sliceStop) —— 对 books 的 Array.slice 直接可用 */
  sliceStart: number
  sliceStop: number
  /** 顶部/底部占位（px），渲染容器的 paddingTop / paddingBottom */
  padTop: number
  padBottom: number
  /** 滚动容器实测宽度（网格用它算列数；未测得时为 0） */
  width: number
  /** 挂到滚动容器上的 onScroll */
  onScroll: () => void
}

export function useVirtualRange(
  containerRef: RefObject<HTMLElement | null>,
  opts: {
    itemCount: number
    /** 每行的高度步进（px）：行高/格高 + 行距；必须 > 0 */
    stride: number
    /** 每行条目数：列表 = 1（默认），网格 = 列数 */
    perRow?: number
    /** 视口外额外渲染的行数（上下各一份，滚动时不露白） */
    overscan?: number
    /** 变化时把滚动归零（如切视图/书库重载） */
    resetKey?: string
  }
): VirtualRange {
  const { itemCount, stride, perRow = 1, overscan = 4, resetKey = '' } = opts
  const safeStride = Math.max(1, stride)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })

  // useLayoutEffect：首帧就量到尺寸，避免网格先按 1 列渲染再跳变
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = (): void => setViewport({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef])

  // resetKey 变化（切视图/书库重载）→ 滚动归零
  useLayoutEffect(() => {
    const el = containerRef.current
    if (el) el.scrollTop = 0
    setScrollTop(0)
  }, [resetKey, containerRef])

  const onScroll = useCallback(() => {
    const el = containerRef.current
    if (el) setScrollTop(el.scrollTop)
  }, [containerRef])

  const totalRows = Math.ceil(itemCount / perRow)
  const startRow = Math.max(0, Math.floor(scrollTop / safeStride) - overscan)
  const visibleRows = Math.ceil(viewport.h / safeStride) + overscan * 2
  const endRow = Math.min(totalRows, startRow + visibleRows)

  return {
    sliceStart: startRow * perRow,
    sliceStop: endRow * perRow,
    padTop: startRow * safeStride,
    padBottom: Math.max(0, totalRows - endRow) * safeStride,
    width: viewport.w,
    onScroll
  }
}
