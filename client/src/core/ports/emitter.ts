/**
 * 通用类型化事件发射器（供 usecases / adapters 内部使用）。
 * 领域层零依赖：这是一个自含的纯 TS 工具。
 */
import type { Listener } from './events'

export class TypedEmitter<Events extends { [K in keyof Events]: Listener }> {
  private listeners = new Map<keyof Events, Set<Listener>>()

  on<K extends keyof Events>(event: K, listener: Events[K]): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(listener)
    return () => this.off(event, listener)
  }

  off<K extends keyof Events>(event: K, listener: Events[K]): void {
    this.listeners.get(event)?.delete(listener)
  }

  protected emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const l of [...set]) {
      ;(l as Listener)(...args)
    }
  }

  protected removeAll(): void {
    this.listeners.clear()
  }
}
