/**
 * 视图切换闪屏的状态机 —— 书库底部状态栏与笔记管理底部状态栏共用
 * （此前两处逐行复制、常量各写一份，收敛到此）。
 *
 * 动画（`.view-switch-flash`，styles.css）：① 判定区域变深色（旧文字被"吞没"）
 * ② 浅色新文字出现在深色区域上 ③ 区域与文字同时复原。文字在动画 50% 处替换，
 * 让"新文字从深色块里浮出来"。
 *
 * ⚠ 时长走动效 token `--dur-flash`（style/tokens.md）：视图切换是每天数十次的高频动作，
 * 闪屏**不得锁定导航**——**闪屏中再点 = 重新起一轮**（key 重挂重启关键帧）——
 * 状态切换永远不被动画挡住；闪屏极短，重挂的 hover 丢失不可感知。
 */
import { useEffect, useRef, useState } from 'react'

/** 动画总时长（与 styles.css 的 `view-switch-flash` 一致，读同一个 token --dur-flash） */
export const VIEW_SWITCH_MS = 240
/** 文字替换时刻 = 动画 50% */
const VIEW_SWITCH_SWAP_MS = 120

export function useViewSwitchFlash<V extends string>(
  view: V,
  /** 由调用方给"下一个视图值"（两处的循环语义不同：二元切换 / 三态循环等） */
  nextOf: (current: V) => V
): {
  /** 动画播放中（按钮文字此时还在"旧值"，挂在按钮上的 key 用它重启动画） */
  flashing: boolean
  /** 重启计数：挂在动画元素（按钮）的 key 上 —— 每次切换 +1，元素重挂 → 关键帧从头播 */
  flashSeq: number
  /** 按钮上显示的文字（跟随动画节奏，落后于 view 约 120ms） */
  shown: V
  /** 触发一次切换：返回下一个视图值；闪屏中调用 = 立即重开一轮（不等上一轮走完） */
  toggle: () => V
} {
  const [flashing, setFlashing] = useState(false)
  const [flashSeq, setFlashSeq] = useState(0)
  const [shown, setShown] = useState<V>(view)
  const timers = useRef<number[]>([])

  useEffect(() => {
    if (!flashing) setShown(view)
  }, [view, flashing])

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t))
    },
    []
  )

  const toggle = (): V => {
    const next = nextOf(view)
    timers.current.forEach((t) => window.clearTimeout(t))
    setFlashing(true)
    setFlashSeq((s) => s + 1)
    timers.current = [
      window.setTimeout(() => setShown(next), VIEW_SWITCH_SWAP_MS),
      window.setTimeout(() => setFlashing(false), VIEW_SWITCH_MS + 60)
    ]
    return next
  }

  return { flashing, flashSeq, shown, toggle }
}
