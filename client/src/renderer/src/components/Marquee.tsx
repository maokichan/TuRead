/**
 * 单行滚动（marquee）—— **内容超出容器才滚动**，不超出则完全静止。
 *
 * 为什么需要：抽屉的标题与信息行必须**单行**（过长时自己滚，而不是换行向下生长）。
 * 与纯 CSS 跑马灯的区别：先量宽度再决定是否动画，避免短文本无意义地来回跑。
 * 无缝原理：超出时渲染**两份**内容，各自带 `padding-right`，轨道位移 -50% 正好一份。
 * `prefers-reduced-motion` 下不滚动（见 styles.css）。
 */
import { useLayoutEffect, useRef, useState } from 'react'

interface MarqueeProps {
  children: React.ReactNode
  /** 一轮时长（秒）；内容越长越该慢 */
  duration?: number
  className?: string
  /** 悬停暂停（默认开） */
  pauseOnHover?: boolean
}

export function Marquee({
  children,
  duration = 16,
  className = '',
  pauseOnHover = true
}: MarqueeProps): React.JSX.Element {
  const boxRef = useRef<HTMLSpanElement | null>(null)
  const innerRef = useRef<HTMLSpanElement | null>(null)
  const [overflow, setOverflow] = useState(false)

  useLayoutEffect(() => {
    const box = boxRef.current
    const inner = innerRef.current
    if (!box || !inner) return
    const measure = (): void => setOverflow(inner.scrollWidth > box.clientWidth + 1)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    ro.observe(inner)
    // 打包字体加载完成后字形度量会变 → 重新量一次
    let cancelled = false
    void document.fonts?.ready.then(() => {
      if (!cancelled) measure()
    })
    return () => {
      cancelled = true
      ro.disconnect()
    }
  }, [children])

  return (
    <span
      ref={boxRef}
      className={`block overflow-hidden ${pauseOnHover ? 'marquee' : ''} ${className}`}
    >
      <span
        ref={innerRef}
        className={`flex w-max whitespace-nowrap ${overflow ? 'marquee-track' : ''}`}
        style={overflow ? { animationDuration: `${duration}s` } : undefined}
      >
        <span className="pr-4">{children}</span>
        {overflow && (
          <span className="pr-4" aria-hidden="true">
            {children}
          </span>
        )}
      </span>
    </span>
  )
}
