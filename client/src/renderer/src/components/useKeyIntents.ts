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
 */
import { useEffect, useRef } from 'react'
import {
  DEFAULT_BINDINGS,
  normalizeKey,
  resolveIntent,
  type FeatureScope,
  type IntentId
} from '@core/domain/input'

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
    return () => window.removeEventListener('keydown', onKey)
  }, [scope, enabled])
}
