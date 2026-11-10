/**
 * PDF 环境同步钩子：窗口宽度变化 / 主题切换 → **缩放续帧置顶 + 防抖原地重开**（仅 PDF）。
 *
 * 成因：kookit PDF 按渲染时刻的容器宽把每页画成固定像素位图，且烘焙只按开书时的主题
 * 执行——运行时窗口 resize 与切主题对 PDF 都不生效（文字类分别走 CSS 重排与 setStyle
 * 注入，均已工作）。本钩子把两类事件汇入**同一个防抖调度器**：
 * - 事件发生 → 先把当前可见画面快照置顶（pdfContinuityOverlay，视觉连续不闪断）；
 * - 350ms 防抖到点 → 走既有 reopenTick 通路原地重开（按新宽度 / 新主题重新填充）；
 * - 重开落定（opening 真→假）→ 撤置顶层翻面；期间用户滚动 → 立即撤层（宁裸露不假死）；
 *   另有 8s 失败保险强制撤层（防「重开书偶发空白」把定格变成永久假状态）。
 *
 * 串行化：防抖合并 + 适配器 openToken 代次令牌（旧 open 自动作废）= 两事件撞车时
 * 天然"最后一次生效"，无竞态正确性问题；重开进行中再触发则挂起 pending、落定后
 * 若条件仍不满足（只有主题可能仍不满足——重开必然已按当前宽度渲染）再补一次。
 */
import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import type { ResolvedTheme } from '@core/domain/theme'
import { currentTheme } from './useReaderOpening'
import {
  armOverlayFailsafe,
  dismissContinuityOverlay,
  hasContinuityOverlay,
  mountContinuityOverlay
} from './pdfContinuityOverlay'

const REOPEN_DEBOUNCE_MS = 350
/** 宽度变化阈值：滤掉亚像素/DPR 抖动 */
const WIDTH_THRESHOLD_PX = 2

export function usePdfLayoutSync(params: {
  /** 正文列（kookit 渲染宿主）——宽度观察与置顶层的定位基准 */
  stageRef: MutableRefObject<HTMLDivElement | null>
  /** 仅 PDF 且阅读器激活时启用（文字类重排/注题均已工作，不进本钩子） */
  enabled: boolean
  /** 打开进行中（useReaderOpening 的 opening state） */
  opening: boolean
  /** 本次打开所烘焙的主题快照（useReaderOpening 在 open 时刻指认） */
  openedThemeRef: MutableRefObject<ResolvedTheme | null>
  /** 触发原地重开（= bump reopenTick） */
  requestReopen: () => void
}): void {
  const { stageRef, enabled, opening, openedThemeRef, requestReopen } = params
  /** 最近一次"已渲染落定"的 stage 宽度（重开完成或首次启用时种子化） */
  const lastWidthRef = useRef<number | null>(null)
  const timerRef = useRef<number | null>(null)
  const pendingRef = useRef(false)
  /** opening 的 ref 镜像：防抖到点/观察器回调里读实时值（不重挂观察器） */
  const openingRef = useRef(opening)
  openingRef.current = opening

  // —— 共享防抖调度器：resize 与主题合流；重开进行中触发 = 挂起 pending，落定后补 ——
  const scheduleRef = useRef<() => void>(() => {})
  scheduleRef.current = () => {
    pendingRef.current = true
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      if (openingRef.current) return // 打开进行中：保持 pending，落定后按条件补发
      pendingRef.current = false
      requestReopen()
    }, REOPEN_DEBOUNCE_MS)
  }
  const schedule = useCallbackConst(() => scheduleRef.current())

  // —— 观察器（仅在启用时挂载）——
  useEffect(() => {
    if (!enabled) return
    const stage = stageRef.current
    const paper = stage?.parentElement
    if (!stage || !paper) return
    lastWidthRef.current = stage.clientWidth

    const requestIfWidthDrifted = (): void => {
      const w = stage.clientWidth
      if (lastWidthRef.current != null && Math.abs(w - lastWidthRef.current) <= WIDTH_THRESHOLD_PX) return
      lastWidthRef.current = w
      if (!hasContinuityOverlay(paper)) {
        // 先定格（快照失败会静默不挂层——退化为无续帧的裸重开）
        if (mountContinuityOverlay(stage, paper)) armOverlayFailsafe(paper)
      }
      schedule()
    }

    const ro = new ResizeObserver(() => requestIfWidthDrifted())
    ro.observe(stage)

    // 主题切换：data-theme 是宿主唯一主题入口（设置页/命令面板/系统跟随都经它）
    const mo = new MutationObserver(() => {
      const baked = openedThemeRef.current
      if (baked == null || baked === currentTheme()) return
      if (!hasContinuityOverlay(paper)) {
        // 定格旧主题画面：重开落定的瞬间一次翻面到新主题
        if (mountContinuityOverlay(stage, paper)) armOverlayFailsafe(paper)
      }
      schedule()
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    // 置顶层存在期间用户滚动 → 立即撤层（定格帧不跟滚动；重开仍按计划进行）
    const onScroll = (): void => dismissContinuityOverlay(paper)
    stage.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      ro.disconnect()
      mo.disconnect()
      stage.removeEventListener('scroll', onScroll)
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
      timerRef.current = null
      pendingRef.current = false
      dismissContinuityOverlay(paper)
    }
  }, [enabled, stageRef, openedThemeRef, schedule])

  // —— 重开落定（opening 真→假）：撤层翻面 + 记账 + 补发检查 ——
  useEffect(() => {
    if (opening) return
    const stage = stageRef.current
    const paper = stage?.parentElement
    if (paper) dismissContinuityOverlay(paper)
    lastWidthRef.current = stage?.clientWidth ?? lastWidthRef.current
    // 重开必然已按当前宽度渲染 → 宽度条件必满足；只有主题可能仍不满足
    // （本次重开由 resize 触发、期间又切了主题）→ 补发一次（不防抖，落定后立即）
    if (pendingRef.current) {
      const baked = openedThemeRef.current
      if (baked != null && baked !== currentTheme()) {
        pendingRef.current = false
        requestReopen()
      } else {
        pendingRef.current = false
      }
    }
  }, [opening, stageRef, openedThemeRef, requestReopen])
}

/** 常等回调（把 schedule 包成稳定引用，观察器 effect 依赖干净） */
function useCallbackConst(fn: () => void): () => void {
  const ref = useRef(fn)
  ref.current = fn
  return useRef(() => ref.current()).current
}
