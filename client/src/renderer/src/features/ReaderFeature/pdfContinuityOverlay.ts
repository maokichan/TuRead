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

    // 收集可见页 canvas：宿主 stage → kookit 外层 iframe → 每页子 iframe → 位图 canvas
    // （排除 fabric 批注画布——那是交互层，烘焙口径同样跳过它）
    const outerIframe = stage.querySelector('iframe')
    const outerDoc = outerIframe?.contentDocument
    if (!outerDoc) return false
    const snapshots: HTMLCanvasElement[] = []
    let oldContentWidth = 0 // 页面的旧渲染宽度（kookit 无 resize 监听 → canvas 内联宽仍是旧值）
    const subIframes = outerDoc.querySelectorAll('iframe[id^="pdf-iframe-"]')
    subIframes.forEach((sub) => {
      const subDoc = (sub as HTMLIFrameElement).contentDocument
      if (!subDoc) return
      subDoc.querySelectorAll('canvas').forEach((c) => {
        if ((c as HTMLCanvasElement).classList.contains('fabric')) return
        const source = c as HTMLCanvasElement
        if (source.width === 0 || source.height === 0) return
        const display = source.getBoundingClientRect()
        oldContentWidth = Math.max(oldContentWidth, display.width)
        // 与 stage 视口求交：只定格看得见的部分
        const left = Math.max(display.left, stageRect.left)
        const top = Math.max(display.top, stageRect.top)
        const right = Math.min(display.right, stageRect.right)
        const bottom = Math.min(display.bottom, stageRect.bottom)
        if (right - left < 4 || bottom - top < 4) return
        snapshots.push(makeSnapshot(source, display, left, top, right, bottom, dpr))
        // 记录几何（dataset 供摆放：相对 stage 左上角的 CSS 像素位置与裁后尺寸）
        const snap = snapshots[snapshots.length - 1]
        snap.dataset.x = String(left - stageRect.left)
        snap.dataset.y = String(top - stageRect.top)
        snap.dataset.w = String(right - left)
        snap.dataset.h = String(bottom - top)
      })
    })
    if (snapshots.length === 0 || oldContentWidth < 8) return false

    // 缩放贴合：旧内容按「新 stage 宽 / 旧渲染宽」绕 stage 顶中缩放——定格帧里的页面
    // 恰好铺满新宽度并居中（视觉上 = 现在的画面被连续缩放到位）
    const scale = stageRect.width / oldContentWidth

    // 置顶层：盖住 stage 区域，桌色打底（遮住底下错位的真实内容），指针穿透
    const overlay = document.createElement('div')
    overlay.className = OVERLAY_CLASS
    overlay.style.cssText =
      'position:absolute;inset:0;z-index:5;pointer-events:none;overflow:hidden;background:var(--desk-bg)'
    // 内平面 = 快照时的 stage 尺寸，缩放原点取顶中（水平居中缩放，垂直自顶随动）
    const plane = document.createElement('div')
    plane.style.cssText = `position:absolute;left:0;top:0;width:${stageRect.width}px;height:${stageRect.height}px;transform:scale(${scale});transform-origin:${stageRect.width / 2}px 0`
    for (const snap of snapshots) {
      snap.style.cssText = `position:absolute;left:${snap.dataset.x}px;top:${snap.dataset.y}px;width:${snap.dataset.w}px;height:${snap.dataset.h}px`
      plane.appendChild(snap)
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

/** 单页快照：把源 canvas 的可见裁剪区按物理像素复制成一张新画布 */
function makeSnapshot(
  source: HTMLCanvasElement,
  display: DOMRect,
  clipLeft: number,
  clipTop: number,
  clipRight: number,
  clipBottom: number,
  dpr: number
): HTMLCanvasElement {
  const w = clipRight - clipLeft
  const h = clipBottom - clipTop
  const snap = document.createElement('canvas')
  snap.width = Math.max(1, Math.round(w * dpr))
  snap.height = Math.max(1, Math.round(h * dpr))
  const ctx = snap.getContext('2d')
  if (ctx) {
    ctx.scale(dpr, dpr)
    const srcScale = source.width / Math.max(display.width, 1) // 位图 px / CSS px
    ctx.drawImage(
      source,
      (clipLeft - display.left) * srcScale,
      (clipTop - display.top) * srcScale,
      w * srcScale,
      h * srcScale,
      0,
      0,
      w,
      h
    )
  }
  return snap
}

/** 8s 失败保险：置顶层挂太久（重开卡死/偶发空白）强制撤除，宁闪断不假死 */
export function armOverlayFailsafe(paper: HTMLElement): void {
  window.setTimeout(() => dismissContinuityOverlay(paper), FAILSAFE_MS)
}
