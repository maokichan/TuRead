/**
 * PDF 缩放续帧置顶层（纯 DOM 工具，无 React）。
 *
 * resize / 切主题触发 PDF 原地重开时，重开是秒级动作（重新解析 + 逐页重绘）——期间
 * 真实内容处于「旧像素 + 新布局」的错位态，直接裸露会闪断。本工具把**当前可见的各页
 * canvas** 快照进一张盖在正文之上的置顶层（定格旧画面），重开落定后由调用方撤层翻面。
 *
 * 可行性：kookit 的页 iframe 与宿主同源（适配器 loadedPdfPages 同款读法），canvas 位图
 * 可 drawImage 复制。快照失败一律静默放弃（撤层 = 退化为无续帧的裸重开），本功能只会
 * 「更好」不会「更坏」。
 */

const OVERLAY_CLASS = 'pdf-continuity-overlay'
/** 定格画面的最长寿命（ms）：防「重开书偶发空白」旧账把定格变成永久假状态 */
const FAILSAFE_MS = 8000

/** 置顶层是否还挂着 */
export function hasContinuityOverlay(paper: HTMLElement): boolean {
  return paper.querySelector(`:scope > .${OVERLAY_CLASS}`) != null
}

/** 立即撤层（淡出 150ms 后移除节点）；没有则无操作 */
export function dismissContinuityOverlay(paper: HTMLElement): void {
  const overlay = paper.querySelector(`:scope > .${OVERLAY_CLASS}`)
  if (!overlay) return
  const el = overlay as HTMLElement
  if (el.dataset.dismissing === '1') return
  el.dataset.dismissing = '1'
  el.style.transition = 'opacity 150ms ease-out'
  el.style.opacity = '0'
  window.setTimeout(() => el.remove(), 160)
}

/**
 * 定格当前可见画面到置顶层。
 * @param stage 正文列（kookit 渲染宿主，id=page-area）
 * @param paper stage 的父面（桌；置顶层的定位宿主）
 * @returns 是否成功挂上（false = 快照失败已静默放弃，调用方无需重试）
 */
export function mountContinuityOverlay(stage: HTMLElement, paper: HTMLElement): boolean {
  if (hasContinuityOverlay(paper)) return true
  try {
    const stageRect = stage.getBoundingClientRect()
    if (stageRect.width < 8 || stageRect.height < 8) return false
    const dpr = window.devicePixelRatio || 1
    const scrollTop = stage.scrollTop

    // 收集整页位图：宿主 stage → kookit 外层 iframe → 每页子 iframe → 位图 canvas
    // （排除 fabric 批注画布——那是交互层，烘焙口径同样跳过它）。
    // ⚠ 必须取**整张位图**而不是视口裁剪区：观察器触发时新布局已生效，页在视口里可能是
    // 截断态——位图本身完好（裁切只是 CSS 层面），截残片会把缺右边的页定格成永久缺角。
    const outerIframe = stage.querySelector('iframe')
    const outerDoc = outerIframe?.contentDocument
    if (!outerDoc) return false
    const snapshots: { canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number }[] = []
    let oldContentWidth = 0 // 页面的旧渲染宽度（kookit 无 resize 监听 → canvas 内联宽仍是旧值）
    outerDoc.querySelectorAll('iframe[id^="pdf-iframe-"]').forEach((sub) => {
      const subDoc = (sub as HTMLIFrameElement).contentDocument
      if (!subDoc) return
      subDoc.querySelectorAll('canvas:not(.fabric)').forEach((c) => {
        const source = c as HTMLCanvasElement
        if (source.width === 0 || source.height === 0) return
        const display = source.getBoundingClientRect()
        if (display.width < 8) return
        oldContentWidth = Math.max(oldContentWidth, display.width)
        // 旧布局坐标（宽度变化只动 CSS，位图与其文档坐标原样保留）：
        // x = 相对 stage 内容原点（左上对齐）；y = 视口相对位置 + stage 滚动量
        // （stage 滚的就是整份内容，加回滚动量即还原成滚动前的版面构图）
        snapshots.push({
          canvas: makeSnapshot(source, display, dpr),
          x: display.left - stageRect.left,
          y: display.top - stageRect.top + scrollTop,
          w: display.width,
          h: display.height
        })
      })
    })
    if (snapshots.length === 0 || oldContentWidth < 8) return false

    // 缩放贴合：内容平面 = 旧渲染尺寸、**左上对齐 stage 原点**（内容本就是左上锚定），
    // 按「新 stage 宽 / 旧渲染宽」从左上原点缩放——页面铺满新宽度，旧视口构图 1:1 保真。
    // ⚠ 原点不许取顶中：左上锚定的内容绕中心缩放会被推出去（放大 = 滑出左缘消失，
    // 缩小 = 挤向左上角）。
    const scale = stageRect.width / oldContentWidth

    // 置顶层：盖住 stage 区域，桌色打底（遮住底下错位的真实内容），指针穿透
    const overlay = document.createElement('div')
    overlay.className = OVERLAY_CLASS
    overlay.style.cssText =
      'position:absolute;inset:0;z-index:5;pointer-events:none;overflow:hidden;background:var(--desk-bg)'
    const plane = document.createElement('div')
    plane.style.cssText = `position:absolute;left:0;top:0;width:${oldContentWidth}px;height:${stageRect.height}px;transform:scale(${scale});transform-origin:0 0`
    for (const s of snapshots) {
      s.canvas.style.cssText = `position:absolute;left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px`
      plane.appendChild(s.canvas)
    }
    overlay.appendChild(plane)
    paper.appendChild(overlay)
    return true
  } catch {
    // 任何异常（跨域意外/画布污染/布局抖动）都静默放弃：无续帧 ≠ 有错帧
    dismissContinuityOverlay(paper)
    return false
  }
}

/** 单页快照：整张位图按其显示尺寸复制成一张新画布 */
function makeSnapshot(source: HTMLCanvasElement, display: DOMRect, dpr: number): HTMLCanvasElement {
  const snap = document.createElement('canvas')
  snap.width = Math.max(1, Math.round(display.width * dpr))
  snap.height = Math.max(1, Math.round(display.height * dpr))
  const ctx = snap.getContext('2d')
  if (ctx) {
    ctx.scale(dpr, dpr)
    ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, display.width, display.height)
  }
  return snap
}

/** 8s 失败保险：置顶层挂太久（重开卡死/偶发空白）强制撤除，宁闪断不假死 */
export function armOverlayFailsafe(paper: HTMLElement): void {
  window.setTimeout(() => dismissContinuityOverlay(paper), FAILSAFE_MS)
}
