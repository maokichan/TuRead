/**
 * 主题切换过渡（批1 地基；STYLE.md §3.3）—— data-theme 切换的唯一应用入口。
 *
 * 此前 data-theme 一换全局瞬跳（唯一的"伪平滑"来自恰好自带 transition 的散点元素）。
 * 现在：切换瞬间给 <html> 挂 `.theme-fade`（全部元素的颜色属性获得 --dur-view 过渡，
 * 见 styles.css），340ms 后摘除 —— 平时零成本。reduced-motion 下直接落值不表演。
 * ⚠ `.theme-fade` 的 transition shorthand 会暂时压掉各元素自有过渡（320ms 窗口）——
 * 主题切换本就是大状态跳变，可接受（styles.css 该规则旁有同款说明）。
 */
let fadeTimer: number | undefined

export function applyDataThemeResolved(resolved: string): void {
  const root = document.documentElement
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.setAttribute('data-theme', resolved)
    return
  }
  root.classList.add('theme-fade')
  root.setAttribute('data-theme', resolved)
  window.clearTimeout(fadeTimer)
  fadeTimer = window.setTimeout(() => root.classList.remove('theme-fade'), 340)
}
