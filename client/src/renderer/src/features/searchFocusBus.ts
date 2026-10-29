/**
 * 卡片搜索焦点总线（libraryNavBus 同款模块单例，批1.7d）。
 *
 * Ctrl+F（意图 `app.focusSearch`，domain/input.ts）要聚焦"当前激活卡片"的本地搜索框，
 * 但搜索框住在各 Feature 里——AppShell 拿不到兄弟的 ref，props 穿壳不值当。
 * 各 Feature 在自己被激活时 register、失活时注销（恒驻挂载，所以必须跟 activeFeature 走）；
 * AppShell 只管 focus()。
 */
type FocusFn = () => void

let focusFn: FocusFn | null = null

export const searchFocusBus = {
  /** Feature 激活时注册自己搜索框的聚焦函数（重复注册覆盖旧的） */
  register(f: FocusFn | null): void {
    focusFn = f
  },
  /** 聚焦当前激活卡的搜索框（无激活注册时静默——没搜索框的卡无对象） */
  focus(): void {
    focusFn?.()
  }
}
