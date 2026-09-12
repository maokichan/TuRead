/**
 * 键鼠意图层（领域层，纯函数，零依赖）—— 2026-09-12 用户批准开工。
 *
 * 解决什么：快捷键此前散落在各组件的 window keydown 里（t/p/Esc/Ctrl+F 各自为政），
 * 一键多义、无处总览、无法自定义。意图层的规则（FEATURES.md §10 / TODO 高优项）：
 * - **UI 只发意图**（intent），键盘事件统一映射到意图；
 * - **一键只归属一个意图**（在表里显式解决冲突），一个意图可有多个绑定；
 * - 绑定表是**纯数据**（可序列化）→ 将来用户自定义 = 换一张表，机制不变。
 *
 * 范围（v1）：**window 级**按键（阅读器/全局）。行内键（聚焦行上的 Enter/Space/Delete）
 * 属元素级语义，v2 收编（LibraryFeature 行为已统一，见 FEATURES §10）。
 * 鼠标侧（点击区/滚轮转发）暂不入表——它们是位置语义，不是键位映射。
 */

/** 意图作用域：意图命名约定 `<scope>.<action>`；`app` 级意图在所有功能态可用 */
export type FeatureScope = 'app' | 'library' | 'reader' | 'room' | 'settings'

/** 意图 id：`<scope>.<action>`（如 `reader.nextPage`）；处理函数由各功能组件注册 */
export type IntentId = string

/** 规范化键名：修饰键前缀 + 小写键名（如 `ctrl+f`、`arrowright`、` `） */
export type NormalizedKey = string

/**
 * KeyboardEvent → 规范化键名。只认 Ctrl/Alt 修饰（Windows 主平台；Meta/Shift 暂不入表——
 * 出现真实需求再加，避免表里堆没人用的组合）。修饰键本身按下的瞬间返回 null（不构成意图）。
 */
export function normalizeKey(e: {
  key: string
  ctrlKey: boolean
  altKey: boolean
}): NormalizedKey | null {
  const k = e.key
  if (k === 'Control' || k === 'Alt' || k === 'Shift' || k === 'Meta') return null
  const parts: string[] = []
  if (e.ctrlKey) parts.push('ctrl')
  if (e.altKey) parts.push('alt')
  parts.push(k.length === 1 ? k.toLowerCase() : k.toLowerCase())
  return parts.join('+')
}

/** 绑定表：意图 → 键位列表（有序，展示用取第一个为"主键位"） */
export type KeyBindingTable = Record<IntentId, readonly NormalizedKey[]>

/**
 * 查意图：先查 `<scope>.*`，未命中回退 `app.*`。**一键只归属一个意图**由表本身保证
 * （同一键出现在两个意图里 = 建表错误，resolveIntent 取先声明者并可用 assertBindings 检查）。
 */
export function resolveIntent(
  table: KeyBindingTable,
  scope: FeatureScope,
  key: NormalizedKey
): IntentId | null {
  const scoped = scope + '.'
  const app = 'app.'
  let appHit: IntentId | null = null
  for (const intent of Object.keys(table)) {
    const keys = table[intent]
    if (!keys.includes(key)) continue
    if (intent.startsWith(scoped)) return intent
    if (intent.startsWith(app) && appHit === null) appHit = intent
  }
  return appHit
}

/** 建表自检：一键多意图 = 直接抛错（开发期防御，绑定表是静态数据，运行时开销可忽略） */
export function assertNoConflict(table: KeyBindingTable): void {
  const seen = new Map<NormalizedKey, IntentId>()
  for (const [intent, keys] of Object.entries(table)) {
    for (const key of keys) {
      const prev = seen.get(key)
      if (prev && prev.split('.')[0] === intent.split('.')[0]) {
        throw new Error(`键位冲突：${key} 同时绑定 ${prev} 与 ${intent}`)
      }
      seen.set(key, intent)
    }
  }
}

/**
 * 默认绑定表 v1（2026-09-12）：把**现状行为**原样收拢——本表先立机制，不改任何手感；
 * 用户自定义与"多 Profile"（夜间/双栏预设组）在机制之上再做。
 */
export const DEFAULT_BINDINGS: KeyBindingTable = {
  // —— 阅读器（ReaderFeature 注册处理）——
  'reader.back': ['escape'], // 处理函数内分流：参数面板开着先收面板，否则关阅读器
  'reader.nextPage': ['arrowright', 'pagedown'],
  'reader.prevPage': ['arrowleft', 'pageup'],
  'reader.spacePage': [' '], // 仅分页模式翻页（scroll 模式 Space 归滚动，处理函数内分流）
  'reader.toggleToc': ['t'],
  'reader.toggleControls': ['p'],
  // —— 全局 ——
  'app.focusSearch': ['ctrl+f'] // 处理函数内分流：仅书库态聚焦标题栏搜索
}

// 静态表，模块加载即自检
assertNoConflict(DEFAULT_BINDINGS)
