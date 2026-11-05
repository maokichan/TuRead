/**
 * 沉浸全屏钩子（自 ReaderFeature 拆出，行为契约不变）：
 * - F11（`reader.enterFullscreen`，意图层）= **进入**全屏（幂等）；退出走 Esc 分流；
 * - 设置开关（appearance.readerFullscreen）= 进入阅读器自动全屏，默认关；
 * - **离开阅读器**：若当时仍在全屏 → 退出全屏并**保持最大化**（不缩回小窗）；
 * - main 在 enter/leave-full-screen 时广播真实状态，这里只订阅跟随。
 */
import { useEffect, useRef, useState } from 'react'
import type { ServiceContainer } from '@core/container'
import type { FeatureId } from '../types'
import { IPC } from '@shared/ipc'

export function useReaderFullscreen(params: {
  container: ServiceContainer
  activeFeature: FeatureId
  readerBookId: string | null
}): { fullscreen: boolean } {
  const { container, activeFeature, readerBookId } = params
  /** 沉浸全屏状态（跟随 main 广播的真实状态；切换经 win:* IPC，Shell 镶边级例外，同 ChromeControls） */
  const [fullscreen, setFullscreen] = useState(false)
  const fullscreenRef = useRef(false)
  /** 进入阅读器自动全屏（设置开关，默认关；appearance.readerFullscreen，SettingsFeature 写） */
  const autoFullscreenRef = useRef(false)

  useEffect(() => {
    const off = window.turead.subscribe(IPC.winFullScreenChanged, (payload) => {
      fullscreenRef.current = payload === true
      setFullscreen(payload === true)
    })
    return off
  }, [])

  useEffect(() => {
    void container.store
      .getSetting<{ readerFullscreen?: boolean }>('appearance', {})
      .then((cfg) => {
        autoFullscreenRef.current = cfg.readerFullscreen === true
      })
  }, [container])

  // 进入阅读器 = 进入全屏（只在"进入"这一跳触发）。⚠ 依赖里没有 `fullscreen`：
  // 若把它放进来，Esc 退全屏的广播会让本 effect 重跑、把用户刚退出的全屏又顶回去。
  useEffect(() => {
    if (activeFeature === 'reader' && readerBookId && autoFullscreenRef.current) {
      void window.turead.invoke(IPC.winSetFullScreen, true)
    }
  }, [activeFeature, readerBookId])

  useEffect(() => {
    if (activeFeature !== 'reader') {
      // 离开阅读器：先退出全屏。⚠ **若离开时正处于沉浸全屏，窗口保持"大"（最大化）而不是回到小窗口**
      // ——用户在阅读器里选了全屏，退出后不该被缩回原来那个小窗。
      // 顺序与竞态都在主进程处理（全屏未落地时挂到 leave-full-screen 上再最大化，见 main 的
      // `win:set-maximized`）。
      const wasFullscreen = fullscreenRef.current
      void window.turead.invoke(IPC.winSetFullScreen, false)
      if (wasFullscreen) void window.turead.invoke(IPC.winSetMaximized, true)
    }
  }, [activeFeature])

  return { fullscreen }
}
