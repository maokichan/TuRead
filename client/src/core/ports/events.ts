/**
 * 端口层基础：事件机制（CONTRACTS.md §3，所有服务通用）。
 */
export type Listener = (...args: any[]) => void
export type Unsubscribe = () => void

/** 事件映射约束：每个键都必须是 Listener 函数 */
export interface EventEmitter<Events extends { [K in keyof Events]: Listener }> {
  on<K extends keyof Events>(event: K, listener: Events[K]): Unsubscribe
  off<K extends keyof Events>(event: K, listener: Events[K]): void
}
