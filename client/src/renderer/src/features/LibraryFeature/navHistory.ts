/**
 * 书库导航历史（资源管理器语义）：历史栈 + 后退/前进 + 层级导航动作。
 * 自 LibraryFeature 拆出（洗源码批），行为契约不变：
 * - 历史条目 = 位置（containerId/folder，与 navRef 同形状）+ 到该位置的**整条面包屑**
 *   （后退/前进要一起还原）；新导航截断"前进"分支后入栈（从历史中间跳新位置，前进作废）。
 * - `commitNav` = 原地重载不入栈（移动/导入等"位置没变、内容变了"的重载）。
 * - 后退/前进的两个入口：ChromeControls 底面按钮（经 `libraryNavBus`，跨兄弟组件，
 *   ChromeControls 用 `useSyncExternalStore` 订阅可用性）与鼠标侧键（XButton1/2，
 *   仅书库功能态接管并 preventDefault 压掉 Chromium 默认的历史导航）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { BookContainer } from '@core/domain/types'
import { libraryNavBus } from '../libraryNavBus'
import type { FeatureId } from '../types'

/** 面包屑段：显示名 + 位置（containerId 与 folder 互斥） */
export type TrailEntry = { label: string; containerId: string | null; folder: string | null }

/** 导航历史条目：位置 + 到该位置的整条面包屑（后退/前进要一起还原） */
export type NavEntry = { containerId: string | null; folder: string | null; trail: TrailEntry[] }

export function useLibraryNavHistory(params: {
  /** 当前位置（所有权在 Feature：加载器按 ref 取值；历史栈读写它） */
  navRef: MutableRefObject<{ containerId: string | null; folder: string | null }>
  setNavKey: Dispatch<SetStateAction<number>>
  setTrail: Dispatch<SetStateAction<TrailEntry[]>>
  activeFeature: FeatureId
}): {
  /** 原地重载（不入栈） */
  commitNav: (next: { containerId: string | null; folder: string | null }) => void
  enterContainer: (c: BookContainer) => void
  enterFolder: (name: string, path: string) => void
  /** 面包屑回跳：depth = trail 下标（-1 = 根层）；也是一次导航（进历史栈，可前进回来） */
  goToLevel: (depth: number) => void
  /** 切库时整体归零（历史栈 + 可用性态） */
  resetHistory: () => void
} {
  const { navRef, setNavKey, setTrail, activeFeature } = params
  const histRef = useRef<{ stack: NavEntry[]; idx: number }>({
    stack: [{ containerId: null, folder: null, trail: [] }],
    idx: 0
  })
  const [navPos, setNavPos] = useState({ idx: 0, len: 1 })

  const commitNav = useCallback(
    (next: { containerId: string | null; folder: string | null }) => {
      navRef.current = next
      setNavKey((k) => k + 1)
    },
    [navRef, setNavKey]
  )

  /** 应用历史条目（后退/前进走这里）：位置 + 面包屑一起还原并触发重载；不进历史栈 */
  const applyEntry = useCallback(
    (entry: NavEntry): void => {
      navRef.current = { containerId: entry.containerId, folder: entry.folder }
      setTrail(entry.trail)
      setNavKey((k) => k + 1)
    },
    [navRef, setTrail, setNavKey]
  )

  /** 新导航 = 截断"前进"分支后入栈（从历史中间跳新位置，前进作废——资源管理器语义） */
  const pushEntry = useCallback(
    (entry: NavEntry): void => {
      const h = histRef.current
      h.stack = h.stack.slice(0, h.idx + 1)
      h.stack.push(entry)
      h.idx = h.stack.length - 1
      setNavPos({ idx: h.idx, len: h.stack.length })
      applyEntry(entry)
    },
    [applyEntry]
  )

  /** 后退 / 前进（标题栏按钮与鼠标侧键共用；标题栏经 libraryNavBus 到达这里） */
  const goBack = useCallback((): void => {
    const h = histRef.current
    if (h.idx <= 0) return
    h.idx -= 1
    setNavPos({ idx: h.idx, len: h.stack.length })
    applyEntry(h.stack[h.idx])
  }, [applyEntry])

  const goForward = useCallback((): void => {
    const h = histRef.current
    if (h.idx >= h.stack.length - 1) return
    h.idx += 1
    setNavPos({ idx: h.idx, len: h.stack.length })
    applyEntry(h.stack[h.idx])
  }, [applyEntry])

  const canBack = navPos.idx > 0
  const canForward = navPos.idx < navPos.len - 1

  // 后退/前进全局件（ChromeControls，AppShell 兄弟组件，props 不值当穿 Shell → 模块总线）
  useEffect(() => {
    libraryNavBus.register(
      { back: () => goBack(), forward: () => goForward() },
      { canBack, canForward }
    )
    return () => libraryNavBus.unregister()
  }, [goBack, goForward, canBack, canForward])

  // 鼠标侧键（资源管理器语义）：XButton1 = 后退 / XButton2 = 前进，仅书库功能态接管。
  // preventDefault 压掉 Chromium 侧键默认的"历史导航"（渲染层历史为空，防意外行为）。
  useEffect(() => {
    if (activeFeature !== 'library') return
    const onMouseDown = (e: MouseEvent): void => {
      if (e.button === 3) {
        e.preventDefault()
        goBack()
      } else if (e.button === 4) {
        e.preventDefault()
        goForward()
      }
    }
    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [activeFeature, goBack, goForward])

  const enterContainer = useCallback(
    (c: BookContainer): void => {
      pushEntry({
        containerId: c.id,
        folder: null,
        trail: [
          ...histRef.current.stack[histRef.current.idx].trail,
          { label: c.name, containerId: c.id, folder: null }
        ]
      })
    },
    [pushEntry]
  )

  const enterFolder = useCallback(
    (name: string, path: string): void => {
      pushEntry({
        containerId: null,
        folder: path,
        trail: [
          ...histRef.current.stack[histRef.current.idx].trail,
          { label: name, containerId: null, folder: path }
        ]
      })
    },
    [pushEntry]
  )

  const goToLevel = useCallback(
    (depth: number): void => {
      const cur = histRef.current.stack[histRef.current.idx]
      const t = depth < 0 ? [] : cur.trail.slice(0, depth + 1)
      const last = t[t.length - 1]
      pushEntry({
        containerId: last?.containerId ?? null,
        folder: last?.folder ?? null,
        trail: t
      })
    },
    [pushEntry]
  )

  const resetHistory = useCallback((): void => {
    histRef.current = { stack: [{ containerId: null, folder: null, trail: [] }], idx: 0 }
    setNavPos({ idx: 0, len: 1 })
  }, [])

  return { commitNav, enterContainer, enterFolder, goToLevel, resetHistory }
}
