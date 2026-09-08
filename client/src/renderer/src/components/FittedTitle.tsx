/**
 * FittedTitle —— 把标题按可用空间**撑满**的排版组件（纯展示：props in，内部只做测量）。
 *
 * 为什么需要：无封面时用标题充当"封面"（FEATURES §10），而"填满、留白最少、字重加粗"
 * 是平面设计里用字体制造冲击的传统手法 —— 靠 CSS 固定字号做不到（标题长度差异极大），
 * 所以这里二分搜索**不溢出的最大字号**，再把剩余垂直空间分给行距，最后用
 * `requestAnimationFrame` / `ResizeObserver` / `document.fonts.ready` 三重重新拟合。
 */
import { useLayoutEffect, useRef, useState } from 'react'

interface FittedTitleProps {
  text: string
  /** 字号上限（容器很大时也不至于变成巨无霸） */
  maxSize?: number
  minSize?: number
  /** 四周留白比例（0.06 = 6%） */
  paddingRatio?: number
  /** 行距铺满上限：剩余垂直空间分给行距时不得超过此值（防止行距大得离谱） */
  maxLeading?: number
  className?: string
}

/** 基础行距（字形紧凑，便于字号做大） */
const BASE_LEADING = 1.02

export function FittedTitle({
  text,
  maxSize = 120,
  minSize = 10,
  paddingRatio = 0.06,
  maxLeading = 2.4,
  className = ''
}: FittedTitleProps): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const textRef = useRef<HTMLSpanElement | null>(null)
  const [fit, setFit] = useState({ fontSize: minSize, lineHeight: BASE_LEADING })

  useLayoutEffect(() => {
    const box = boxRef.current
    const el = textRef.current
    if (!box || !el) return

    const measure = (): void => {
      const availH = box.clientHeight * (1 - paddingRatio * 2)
      if (box.clientWidth <= 1 || availH <= 1) return

      /*
       * 只按**高度**拟合，宽度不做判断。
       * 文字被容器宽度约束并自动换行（`.title-cover` 带 `overflow-wrap: anywhere`，任何长串都能断行），
       * 因此"放得下"只取决于高度。
       *
       * ⚠ 曾经的写法把 `el.scrollWidth <= 可用宽度` 当条件 —— 块级 flex 子项的 `scrollWidth`
       *   是**盒子宽度**（被 flex 容器拉满 = 容器宽），不是文字固有宽度；而可用宽度 = 容器宽 × 0.88，
       *   于是**所有字号都被判为溢出**，`best` 永远停在 minSize（10px）：
       *   这就是"文字封面填不满"的根因（2026-09-08 修）。
       */
      let lo = minSize
      let hi = maxSize
      let best = minSize
      el.style.lineHeight = String(BASE_LEADING)
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2
        el.style.fontSize = `${mid}px`
        if (el.scrollHeight <= availH) {
          best = mid
          lo = mid
        } else {
          hi = mid
        }
      }

      // 二次填充：字号定下后，若还剩较多垂直空间且不止一行，把余量分给行距，
      // 让文字块铺满封面（平面设计里"字面撑满"的常用手法）。
      el.style.fontSize = `${best}px`
      el.style.lineHeight = String(BASE_LEADING)
      const lines = Math.max(1, Math.round(el.scrollHeight / (best * BASE_LEADING)))
      let leading = BASE_LEADING
      if (lines > 1) {
        const target = (availH * 0.99) / lines / best
        leading = Math.min(maxLeading, Math.max(BASE_LEADING, target))
      }
      el.style.lineHeight = String(leading)
      setFit({ fontSize: best, lineHeight: leading })
    }

    measure()
    // 布局稳定后再拟合一次（首次 useLayoutEffect 时网格可能刚插入，尺寸未最终确定）
    const raf = requestAnimationFrame(measure)
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    // 打包字体（源流明體）加载完成后字形度量会变 —— 首测用的是回退字体，必须重新拟合
    let cancelled = false
    void document.fonts?.ready.then(() => {
      if (!cancelled) measure()
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [text, maxSize, minSize, paddingRatio, maxLeading])

  return (
    <div ref={boxRef} className={`relative h-full w-full overflow-hidden ${className}`}>
      <div className="flex h-full w-full items-center justify-center">
        <span
          ref={textRef}
          style={fit}
          className="title-cover block max-w-full text-center font-bold tracking-[0.01em]"
        >
          {text}
        </span>
      </div>
    </div>
  )
}
