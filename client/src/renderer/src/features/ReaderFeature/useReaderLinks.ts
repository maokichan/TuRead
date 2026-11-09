/**
 * 书内链接钩子（Issue #2 修复，2026-11-09）：只消费 `link-external` 一件事——
 * 外部 http(s)/mailto 链接交系统浏览器打开（`window.open` → 主进程
 * `setWindowOpenHandler` → `shell.openExternal`，既有通道，零新 IPC）。
 * 内部链接（脚注/交叉引用）不需要 UI：适配器在书文档上拦下点击并自行跳转
 * （`kookitRenderAdapter.attachLinkWatch`），这里不感知。
 */
import { useEffect } from 'react'
import type { ServiceContainer } from '@core/container'

export function useReaderLinks(container: ServiceContainer): void {
  useEffect(() => {
    return container.render.on('link-external', ({ href }) => {
      window.open(href, '_blank')
    })
  }, [container])
}
