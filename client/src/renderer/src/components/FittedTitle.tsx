/**
 * FittedTitle —— 把标题按可用空间**撑满**的排版组件（纯展示：props in，内部只做测量）。
 *
 * 为什么需要：无封面时用标题充当"封面"（FEATURES §10），而"填满、留白最少、字重加粗"
 * 是平面设计里用字体制造冲击的传统手法 —— 靠 CSS 固定字号做不到（标题长度差异极大），
 * 所以这里二分搜索**不溢出容器的最大字号**，再用 ResizeObserver 跟随容器变化重算。
 */
import { useLayoutEffect, useRef, useState } from 'react'

interface FittedTitleProps {
  text: string
  /** 字号上限（容器很大时也不至于变成巨无霸） */
  maxSize?: number
  minSize?: number
  /** 四周留白比例（0.06 = 6%） */
  paddingRatio?: number
  className?: string
}

export function FittedTitle({
  text,
  maxSize = 120,
  minSize = 10,
  paddingRatio = 0.06,
  className = ''
}: FittedTitleProps): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const textRef = useRef<HTMLSpanElement | null>(null)
  const [size, setSize] = useState(minSize)

  useLayoutEffect(() => {
    const box = boxRef.current
    const el = textRef.current
    if (!box || !el) return

    const fit = (): void => {
      const maxW = box.clientWidth * (1 - paddingRatio * 2)
      const maxH = box.clientHeight * (1 - paddingRatio * 2)
      if (maxW <= 1 || maxH <= 1) return
      let lo = minSize
      let hi = maxSize
      let best = minSize
      for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) / 2
        el.style.fontSize = `${mid}px`
        if (el.scrollHeight <= maxH && el.scrollWidth <= maxW) {
          best = mid
          lo = mid
        } else {
          hi = mid
        }
      }
      el.style.fontSize = `${best}px` // 循环最后一次试探的值可能溢出，这里落回最优解
      setSize(best)
    }

    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(box)
    return () => observer.disconnect()
  }, [text, maxSize, minSize, paddingRatio])

  return (
    <div ref={boxRef} className={`relative h-full w-full overflow-hidden ${className}`}>
      <div className="flex h-full w-full items-center justify-center">
        <span
          ref={textRef}
          style={{ fontSize: size }}
          className="title-cover block max-w-full text-center font-bold leading-[1.02] tracking-[0.01em]"
        >
          {text}
        </span>
      </div>
    </div>
  )
}
