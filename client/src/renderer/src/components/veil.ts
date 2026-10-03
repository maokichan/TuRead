/**
 * 遮罩按距离 —— 目录 / 阅读参数 / 聊天室三个挂件共用的同一机制（此前三处逐行复制，收敛到此）。
 *
 * 语义（用户 2026-09-11 定）：**靠近只会"揭开"，远端保持静息** ——
 * 遮罩不透明度在 `[0, 静息值]` 之间取值：正中 → 0（完全揭开）；够远 → 静息值（**不再更暗**）。
 * 静息值从 CSS 读（样式的单一来源在 styles.css，不在这里写死数字）。
 * `clientY === null` = 鼠标离开列表 → 清掉内联值，全部回到静息。
 */

/** 遮罩衰减半径（px）：鼠标距离条目中心超过它 → 完全盖上 */
export const VEIL_FALLOFF = 110

/** 静息值兜底：CSS 变量缺失时回落（与历史实现一致的 0.74） */
const VEIL_REST_FALLBACK = 0.74

export interface VeilOptions {
  /** 条目选择器（如 `.toc-row` / `.reader-controls__field` / `.chat-row`） */
  selector: string
  /** 要写的遮罩变量名（如 `--toc-veil` / `--reader-veil`） */
  veilVar: string
  /** 静息值变量名，按序取第一个有值的（如 `['--reader-veil-rest', '--toc-veil-rest']`） */
  restVars: string[]
}

export function paintVeil(
  box: HTMLElement | null,
  { selector, veilVar, restVars }: VeilOptions,
  clientY: number | null
): void {
  if (!box) return
  const items = Array.from(box.querySelectorAll<HTMLElement>(selector))
  if (clientY === null) {
    for (const el of items) el.style.removeProperty(veilVar)
    return
  }
  // 先读全部矩形、再统一写变量（读写分离，避免逐条读写交替触发强制重排）
  const measured = items.map((el) => {
    const r = el.getBoundingClientRect()
    return { el, center: r.top + r.height / 2 }
  })
  let rest = 0
  for (const name of restVars) {
    rest = Number.parseFloat(getComputedStyle(box).getPropertyValue(name))
    if (!Number.isNaN(rest) && rest !== 0) break
  }
  if (Number.isNaN(rest) || rest === 0) rest = VEIL_REST_FALLBACK
  for (const { el, center } of measured) {
    const near = Math.max(0, 1 - Math.abs(clientY - center) / VEIL_FALLOFF)
    // near=1（正中）→ 0；near=0（够远）→ rest（保持静息，不加深）
    el.style.setProperty(veilVar, (rest * (1 - near)).toFixed(3))
  }
}
