/**
 * 底面全局搜索总线（libraryNavBus 同款模块单例；批1.11 搜索上底板，接替卡内 searchFocusBus）。
 *
 * 搜索词仍归各 Feature 自持（过滤/防抖逻辑不动），底面顶条带的输入框只是**UI 面**：
 * Feature 激活时 register 绑定（value/onChange/placeholder）、失活注销（恒驻挂载，必须跟
 * activeFeature 走）；ChromeControls 经 useSyncExternalStore 读当前绑定 —— 无绑定的域
 * （阅读器/房间/设置，后端接线见 TODO「全局搜索接线」）= 输入框禁用 + 域占位文案。
 *
 * 绑定对象每次渲染重新 register（value 在闭包里，不重注册会读到旧词）——
 * emit 通知的只有 ChromeControls 一个订阅者，渲染次数与受控输入持平，无额外开销。
 */
export interface ChromeSearchBinding {
  placeholder: string
  value: string
  onChange: (q: string) => void
}

let binding: ChromeSearchBinding | null = null
const subs = new Set<() => void>()

function emit(): void {
  subs.forEach((f) => f())
}

export const chromeSearchBus = {
  /** Feature 激活时注册自己的搜索绑定（重复注册覆盖旧的）；失活传 null */
  register(b: ChromeSearchBinding | null): void {
    binding = b
    emit()
  },
  getState(): ChromeSearchBinding | null {
    return binding
  },
  subscribe(fn: () => void): () => void {
    subs.add(fn)
    return () => {
      subs.delete(fn)
    }
  }
}
