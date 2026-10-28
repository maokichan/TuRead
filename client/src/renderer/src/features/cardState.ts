/**
 * 阅读卡满幅态（批1.6b，FEATURES §11「满幅态」）—— 渲染层共享态（`roomSession`/`libraryNavBus`
 * 同族：模块级单例 + useSyncExternalStore）。
 *
 * 满幅 = 卡片在窗口内展开：边距归零 + 圆角放平 + 侧边栏退场 + 窗控淡出（AppShell 据此布置）。
 * 不再涉及 OS 级全屏（`win:set-fullscreen` IPC 保留但界面不再入口）。
 * F11（幂等进入）与设置「進入閱讀器時進入滿幅」置 true；Esc 分级回落的第一级置 false；
 * 离开阅读器时由 AppShell 复位。归属阅读态，非阅读态必须为 false。
 */
type Listener = () => void

let fullCard = false
const listeners = new Set<Listener>()

export function isFullCard(): boolean {
  return fullCard
}

export function setFullCard(v: boolean): void {
  if (fullCard === v) return
  fullCard = v
  listeners.forEach((l) => l())
}

export function subscribeFullCard(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
