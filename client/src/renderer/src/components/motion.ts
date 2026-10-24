/**
 * 大状态切换的"落定"瞬间（v1.14，STYLE.md §3.3）：内容轻微模糊 → 清晰 ——
 * 让两个状态的跳变被糊成**一次变换**，而不是两个页面在换位（emil: blur 遮丑；
 * blur 只在这一瞬出现，永不常驻，也绝不进滚动路径）。WAAPI = 程序化 CSS 动画；
 * reduced-motion 下跳过（§2 P5）。
 */
export function playSettle(el: HTMLElement | null): void {
  if (!el) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  el.animate(
    [
      { filter: 'blur(3px)', opacity: 0.55 },
      { filter: 'blur(0px)', opacity: 1 }
    ],
    { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
  )
}
