/**
 * 书库导航总线（logStore 同款模块单例）：把 LibraryFeature 内部的层级后退/前进
 * 能力暴露给标题栏按钮（AppShell 的兄弟组件，props 传递要穿过 Shell 不值当）。
 * LibraryFeature 持有历史栈并 register 处理器 + update 可用性；TitleBar 只读状态并调 back/forward。
 */

export interface LibraryNavState {
  canBack: boolean
  canForward: boolean
}

type Handler = { back: () => void; forward: () => void }

let handler: Handler | null = null
let state: LibraryNavState = { canBack: false, canForward: false }
const subs = new Set<() => void>()

function emit(): void {
  subs.forEach((f) => f())
}

export const libraryNavBus = {
  /** LibraryFeature 挂载时注册处理器（重复注册覆盖旧的） */
  register(h: Handler, s: LibraryNavState): void {
    handler = h
    state = s
    emit()
  },
  /** 历史栈变化时更新可用性（TitleBar 据此禁用按钮） */
  update(s: LibraryNavState): void {
    state = s
    emit()
  },
  unregister(): void {
    handler = null
    state = { canBack: false, canForward: false }
    emit()
  },
  back(): void {
    handler?.back()
  },
  forward(): void {
    handler?.forward()
  },
  getState(): LibraryNavState {
    return state
  },
  subscribe(fn: () => void): () => void {
    subs.add(fn)
    return () => {
      subs.delete(fn)
    }
  }
}
