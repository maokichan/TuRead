/**
 * 笔记域导航总线（libraryNavBus 同款模块单例）——把 NotesFeature 内部的视图历史
 * （列表 ⇄ 详情轴 ⇄ 文档视图）暴露给底面全局件的后退/前进。
 * ChromeControls 按激活域分流（library = libraryNavBus，notes = 本总线）。
 * 底面后退/前进**恒在**（批1.11 用户定），域内有没有历史是各域自己的事。
 */

export interface NotesNavState {
  canBack: boolean
  canForward: boolean
}

type Handler = { back: () => void; forward: () => void }

let handler: Handler | null = null
let state: NotesNavState = { canBack: false, canForward: false }
const subs = new Set<() => void>()

function emit(): void {
  subs.forEach((f) => f())
}

export const notesNavBus = {
  /** NotesFeature 挂载时注册处理器（重复注册覆盖旧的） */
  register(h: Handler, s: NotesNavState): void {
    handler = h
    state = s
    emit()
  },
  /** 历史栈变化时更新可用性（ChromeControls 据此禁用按钮） */
  update(s: NotesNavState): void {
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
  getState(): NotesNavState {
    return state
  },
  subscribe(fn: () => void): () => void {
    subs.add(fn)
    return () => {
      subs.delete(fn)
    }
  }
}
