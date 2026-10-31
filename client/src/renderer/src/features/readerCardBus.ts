/**
 * 阅读卡片页总线（libraryNavBus 同款模块单例；批1.13 右欄卡片页，批1.14 平级化）。
 *
 * 卡片页住 ReaderFeature（右欄单槽位：參數/筆記/聊天/插件格），命令面板住 AppShell ——
 * "呼出某张卡"要跨过 Shell，props 穿壳不值当（libraryNavBus 先例）。
 * ReaderFeature 在可用页集变化时 register（页签清单 + 召唤函数）；AppShell 只读清单建命令。
 * 批1.14 平级化（用户定"卡片页和阅读器界面平级，都置于底板之上"）：卡片页的宿主从阅读卡内
 * 挪到 AppShell 卡片区（阅读卡的**兄弟卡**），开合状态经 `setView` 广播 —— AppShell 据此
 * 收窄阅读卡并让出槽位。ReaderFeature 只在状态变化时 setView（effect deps 守住，不成环）。
 */
export interface ReaderCardItem {
  /** 卡片页 kind（`params` / `notes` / `chat` / `plugin:<key>`） */
  kind: string
  /** 页签名（參數/筆記/聊天/時鐘/問…） */
  label: string
}

/** 卡片页的开合视图（AppShell 布局据此反应：收窄阅读卡 + 让出右槽位） */
export interface ReaderCardView {
  open: boolean
  page: string
}

type SummonFn = (kind: string) => void

let items: ReaderCardItem[] = []
let summon: SummonFn | null = null
let view: ReaderCardView = { open: true, page: 'params' }
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
  /** ReaderFeature 开合/切页时广播视图（AppShell 布局反应） */
  setView(next: ReaderCardView): void {
    if (next.open === view.open && next.page === view.page) return
    view = next
    emit()
  },
  getState(): ReaderCardItem[] {
    return items
  },
  getView(): ReaderCardView {
    return view
  },
  subscribe(fn: () => void): () => void {
    subs.add(fn)
    return () => {
      subs.delete(fn)
    }
  }
}
