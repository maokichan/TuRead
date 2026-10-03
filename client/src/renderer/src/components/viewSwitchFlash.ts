/**
 * 视图切换 900ms 动画的状态机 —— 书库底部状态栏与笔记管理底部状态栏共用
 * （此前两处逐行复制、常量各写一份，收敛到此）。
 *
 * 动画（`.view-switch-flash`，styles.css）：
 * ① 判定区域变深色（旧文字被吞没）② 浅色新文字出现在深色区域上 ③ 区域与文字同时复原。
 * 文字在动画 50% 处替换，让"新文字从深色块里浮出来"。
 */
import { useEffect, useRef, useState } from 'react'

/** 动画总时长（与 styles.css 的 `view-switch-flash` 一致）：动画期间按钮禁用 */
export const VIEW_SWITCH_MS = 900
/** 文字替换时刻 = 动画 50% */
const VIEW_SWITCH_SWAP_MS = 450

export function useViewSwitchFlash<V extends string>(
  view: V,
  /** 由调用方给"下一个视图值"（两处的循环语义不同：二元切换 / 三态循环等） */
  nextOf: (current: V) => V
): {
  /** 动画播放中（按钮此时 disabled） */
  flashing: boolean
  /** 按钮上显示的文字（跟随动画节奏，落后于 view 约 450ms） */
  shown: V
  /** 触发一次切换：返回下一个视图值；动画中调用是 no-op（按钮已 disabled，这里再挡一次） */
  toggle: () => V
} {
  const [flashing, setFlashing] = useState(false)
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
    if (flashing) return next
    setFlashing(true)
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = [
      window.setTimeout(() => setShown(next), VIEW_SWITCH_SWAP_MS),
      window.setTimeout(() => setFlashing(false), VIEW_SWITCH_MS + 60)
    ]
    return next
  }

  return { flashing, shown, toggle }
}
