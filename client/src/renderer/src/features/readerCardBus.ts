/**
 * 阅读卡片页总线（libraryNavBus 同款模块单例；批1.13 右欄卡片页）。
 *
 * 卡片页住 ReaderFeature（右欄单槽位：參數/筆記/聊天/插件格），命令面板住 AppShell ——
 * "呼出某张卡"要跨过 Shell，props 穿壳不值当（libraryNavBus 先例）。
 * ReaderFeature 在可用页集变化时 register（页签清单 + 召唤函数）；AppShell 只读清单建命令。
 * 生命周期跟激活态走（ReaderFeature 常驻挂载，非激活时它的卡不可呼出 → 由 AppShell 按
 * activeFeature 决定要不要把这些命令放进面板，总线本身不管激活）。
 */
export interface ReaderCardItem {
  /** 卡片页 kind（`params` / `notes` / `chat` / `plugin:<key>`） */
  kind: string
  /** 页签名（參數/筆記/聊天/時鐘/問…） */
  label: string
}

type SummonFn = (kind: string) => void

let items: ReaderCardItem[] = []
let summon: SummonFn | null = null
const subs = new Set<() => void>()

function emit(): void {
  subs.forEach((f) => f())
}

export const readerCardBus = {
  /** ReaderFeature 注册可用卡片页清单 + 召唤函数（重复注册覆盖旧的）；失活传空清单 */
  register(nextItems: ReaderCardItem[], fn: SummonFn): void {
    items = nextItems
    summon = fn
    emit()
  },
  unregister(): void {
    items = []
    summon = null
    emit()
  },
  /** 呼出一张卡片页（未注册时静默 —— 非阅读态命令面板不会给出这些命令） */
  summon(kind: string): void {
    summon?.(kind)
  },
  getState(): ReaderCardItem[] {
    return items
  },
  subscribe(fn: () => void): () => void {
    subs.add(fn)
    return () => {
      subs.delete(fn)
    }
  }
}
