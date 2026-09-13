/**
 * useKeyIntents —— 键盘意图层的 React 接线（window 级按键 → 意图 → 处理函数）。
 *
 * 用法（功能组件内一行替代手写 keydown）：
 *   useKeyIntents('reader', {
 *     'reader.back': () => controlsOpen ? setControlsOpen(false) : host.closeReader(),
 *     'reader.nextPage': () => void pageTurn('next'),
 *     ...
 *   })
 *
 * 设计：
 * - 绑定表 = `DEFAULT_BINDINGS`（domain/input.ts，纯数据）；处理函数用 **ref 装载**，
 *   组件每次渲染更新引用，监听器本身不重挂（state 闭包永远新鲜，不存在过期闭包）。
 * - 只在表命中的意图上 preventDefault——没绑定的键一律放行（浏览器默认行为不受影响）。
 * - `enabled` 用于按键只在特定子状态生效的场景（如表单聚焦时让位）。
 * - **iframe 桥（2026-09-13）**：kookit 正文渲染在 iframe 里，焦点进书页后按键落在 iframe
 *   document 上，到不了宿主 window——对同源 iframe 文档挂同一套监听（`iframeBridge.ts`）。
 *   按键因此**只看当前界面、不看焦点**（用户定：实现无状态）；输入类目标（表单/搜索框）让位。
 */
import { useEffect, useRef } from 'react'
import {
  DEFAULT_BINDINGS,
  normalizeKey,
  resolveIntent,
  type FeatureScope,
  type IntentId
} from '@core/domain/input'
import { bridgeIframeDocuments } from './iframeBridge'

export type IntentHandlers = Partial<Record<IntentId, () => void>>

export function useKeyIntents(
  scope: FeatureScope,
  handlers: IntentHandlers,
  enabled = true
): void {
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent): void => {
      // 输入类目标让位：表单/搜索框里打字与 Esc 不触发意图（Esc 清空等元素级语义自管）
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const key = normalizeKey(e)
      if (!key) return
      const intent = resolveIntent(DEFAULT_BINDINGS, scope, key)
      if (!intent) return
      const handler = ref.current[intent]
      if (handler) {
        e.preventDefault()
        handler()
      }
    }
    window.addEventListener('keydown', onKey)
    const offBridge = bridgeIframeDocuments((doc) => {
      doc.addEventListener('keydown', onKey)
      return () => doc.removeEventListener('keydown', onKey)
    })
    return () => {
      window.removeEventListener('keydown', onKey)
      offBridge()
    }
  }, [scope, enabled])
}
