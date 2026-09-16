/**
 * TextAnchor 语义标准 —— 定位转换机制的纯函数权威（**选区级**）。
 * 契约：client/docs/CONTRACTS.md §2（同族选区级）；建模与批复：client/docs/DATA_MODEL.md §3.1 / §3.1.1。
 *
 * 为什么存在：笔记/划线要求"标在哪"能被**比较、合并、重锚、跳转**，而各格式的精确编码互不相通。
 * 若各组件自行解释锚串，腐化不可避免（与 `location.ts` 同因）。故收拢为一处权威：
 * - **归一化层（Norm）** 跨格式可比 → 笔记层/存储/同步**只看它**；
 * - **引擎载荷层（Fragment）** 不透明 → 只有适配器生成/解释；
 * - **比较次序：先 Fragment 后 Norm**（§3.1.1 ② 批复：先精确后模糊，
 *   避免文本比较的歧义成本污染精确路径），产出 exact/strong/weak 强弱标注。
 *
 * ⚠ 与 `location.ts` 的分工：那里管**进度级**（读到哪 / 恢复 / 同步载荷 / 进度条），
 *   这里管**选区级**（标在哪 / 划线回显 / 笔记跟随）。两者都叫"位置"但不是同一个物。
 *
 * ⚠ **实现事实（2026-09-14 逆向核实，与文档有出入）**：kookit 文字类笔记载荷**不是 CFI，而是
 *   rangy 字符范围** —— `getHightlightCoords()` = `rangy.getSelection(iframe).saveCharacterRanges(
 *   doc.body)[0]`，且 `createOneNote` / `renderHighlighters` 均做 `JSON.parse(item.range)`。
 *   `DATA_MODEL.md` §3.1 写的"EPUB=CFI"与实现不符；按实现记为 `engine='kookit-rangy'`。
 *   字符偏移是**同 edition 同解析器内**的精确键；跨引擎/跨解析器只能靠 Norm 层重建（`remeasure`）。
 */
import type {
  AnchorFragment,
  AnchorMatch,
  AnchorNorm,
  AnchorQuote,
  TextAnchor
} from './types'

/* ————————————————— 常量（捕获策略）————————————————— */

/** 划线原文快照的最大长度（超出截断）。证据够用即可——整章进库是浪费，
 *  且精确范围本就由 Fragment 承载，quote 只负责"重锚时认得出来"。 */
export const QUOTE_EXACT_MAX = 200

/** 选区前/后文的最大长度（重锚消歧用；太长对相似度判定反而是噪声） */
export const QUOTE_CONTEXT_MAX = 32

/** quote 相似度 ≥ 此值 = "高度相符"（compareAnchor 出 strong 而非 weak）。
 *  取 0.8：rerender 后的行内高亮 span、软连字符等不影响字符总量，
 *  正常同段落重锚的 bigram Dice 远高于此；排版级改动才会掉到 0.8 以下。 */
export const QUOTE_STRONG = 0.8

/* ————————————————— 归一 ————————————————— */

/** 锚点输入（宽容形态）：允许缺层 / 半截对象 / 从库里读回来的宽松 JSON */
export interface AnchorInput {
  norm?: Partial<AnchorNorm> | null
  fragment?: Partial<AnchorFragment> | null
}

export function normalizeQuote(raw?: Partial<AnchorQuote> | null): AnchorQuote {
  return {
    exact: typeof raw?.exact === 'string' ? raw.exact : '',
    prefix: typeof raw?.prefix === 'string' ? raw.prefix : '',
    suffix: typeof raw?.suffix === 'string' ? raw.suffix : ''
  }
}

/**
 * 归一：容错缺层 / 半截对象 / 越界（持久化读回、网络载荷、历史数据兼容）。
 * 所有锚点进入域层后应先过这里 —— 与 `normalizeLocation` 同角色（边界容错）。
 * ⚠ Fragment 只做**形状**校验（engine + key 都是非空串才算存在）：其 `key` 是**不透明**串，
 *   域层不得解读内容，故这里不解析、不规范化它。
 */
export function normalizeAnchor(raw?: AnchorInput | null): TextAnchor {
  const norm = raw?.norm
  const fragment = raw?.fragment
  const hasFragment =
    typeof fragment?.engine === 'string' &&
    fragment.engine !== '' &&
    typeof fragment.key === 'string' &&
    fragment.key !== ''

  return {
    norm: {
      chapterIndex: toNonNegativeInt(norm?.chapterIndex),
      progression: clamp01(Number(norm?.progression) || 0),
      quote: normalizeQuote(norm?.quote)
    },
    fragment: hasFragment
      ? { engine: fragment.engine as string, key: fragment.key as string }
      : null
  }
}

/* ————————————————— 键与判定 ————————————————— */

/**
 * 规范化键（日志/去重/Map 键用）。有 Fragment 时 = `engine|key`（**权威精确键**）；
 * 无 Fragment 时降级为 Norm 派生粗键（`norm|c{章}@{进度}`）——调用方据前缀即可知精度。
 */
export function anchorKey(anchor: TextAnchor): string {
  const n = normalizeAnchor(anchor)
  return n.fragment
    ? `${n.fragment.engine}|${n.fragment.key}`
    : `norm|c${n.norm.chapterIndex}@${n.norm.progression.toFixed(4)}`
}

/**
 * 同一位置判定 —— **保守口径**：只认 Fragment 相等（引擎载荷精确、O(1) 串比较）。
 * 任一锚点无 Fragment → false（宁可判"不同"，交由 `compareAnchor` 出 strong/weak 粗判，
 * 也不在"看起来一样"上做断言——误合并两条笔记比漏合并严重得多）。
 */
export function sameAnchor(
  a: TextAnchor | null | undefined,
  b: TextAnchor | null | undefined
): boolean {
  const na = a ? normalizeAnchor(a) : null
  const nb = b ? normalizeAnchor(b) : null
  if (!na?.fragment || !nb?.fragment) return false
  return na.fragment.engine === nb.fragment.engine && na.fragment.key === nb.fragment.key
}

/** compareAnchor 的产物：定序 + 强弱标注 */
export interface AnchorComparison {
  /** 同书内先后（-1/0/1）；null = 不可比（缺锚）。
   *  ⚠ `order === 0` 且 `match !== 'exact'` 的含义是「**粗粒度同位，未经验证**」——
   *  调用方不得据此断言两条笔记是同一处。 */
  order: -1 | 0 | 1 | null
  match: AnchorMatch
}

/**
 * 比较两个锚点（§3.1.1 ② 批复的次序：**先 Fragment 后 Norm**）。
 * ① 双方 Fragment 同引擎且相等 → 同一位置，`exact`；
 * ② 否则降级 Norm：按 chapterIndex → progression 定序，再按 quote 相似度标强弱；
 * ③ 不同章 → `unrelated`（定序仍给，跨章排序是有意义的）。
 */
export function compareAnchor(
  a: TextAnchor | null | undefined,
  b: TextAnchor | null | undefined
): AnchorComparison {
  if (!a || !b) return { order: null, match: 'unrelated' }
  const na = normalizeAnchor(a)
  const nb = normalizeAnchor(b)

  // ① Fragment 相等 = 同一位置（权威精确路径，不经过任何文本比较）
  const fa = na.fragment
  const fb = nb.fragment
  if (fa && fb && fa.engine === fb.engine && fa.key === fb.key) {
    return { order: 0, match: 'exact' }
  }

  // ② 降级 Norm 定序
  const order = compareNormOrder(na.norm, nb.norm)

  // ③ 强弱标注：同章才谈得上"回跳到位"
  if (na.norm.chapterIndex !== nb.norm.chapterIndex) {
    return { order, match: 'unrelated' }
  }
  const sim = quoteSimilarity(na.norm.quote.exact, nb.norm.quote.exact)
  return { order, match: sim >= QUOTE_STRONG ? 'strong' : 'weak' }
}

/**
 * 锚点**回跳能力**分级（单锚点的**属性**，不是关系 —— 关系判定走 `compareAnchor`）。
 * 与 `anchorStrength`（进度级）同构，但判据是选区级证据：
 * - `strong`：有 Fragment → 引擎可精确回显（quote 只是备份证据）；
 * - `weak`  ：无 Fragment 但有 quote → 只能靠文本重锚（`remeasure`）回到大概位置；
 * - `none`  ：两者皆无 → 无从回跳。
 */
export function anchorStrengthOf(
  anchor: TextAnchor | null | undefined
): 'strong' | 'weak' | 'none' {
  if (!anchor) return 'none'
  const n = normalizeAnchor(anchor)
  if (n.fragment) return 'strong'
  if (n.norm.quote.exact !== '') return 'weak'
  return 'none'
}

/**
 * 原文快照相似度 0~1（重锚选路与强弱标注用）。
 * 算法：先归一空白（排版差异不该毁掉相似度），全等 = 1；
 * 短串（<2 字符）用包含判定（bigram 集合为空时 Dice 无意义）；
 * 否则 **bigram Dice 系数** —— 选它的理由：对中文无需分词、对乱序/局部增删不敏感，
 * 且纯 O(n) 无回溯，比 LCS 更适合"重锚时逐候选打分"的调用形态。
 */
export function quoteSimilarity(a: string, b: string): number {
  const x = normalizeQuoteText(a)
  const y = normalizeQuoteText(b)
  if (x === '' || y === '') return 0
  if (x === y) return 1
  if (x.length < 2 || y.length < 2) return x.includes(y) || y.includes(x) ? 1 : 0

  const A = bigrams(x)
  const B = bigrams(y)
  let inter = 0
  let sumA = 0
  let sumB = 0
  for (const [g, c] of A) {
    sumA += c
    const d = B.get(g)
    if (d !== undefined) inter += Math.min(c, d)
  }
  for (const c of B.values()) sumB += c
  return sumA + sumB === 0 ? 0 : (2 * inter) / (sumA + sumB)
}

/** 日志/调试用可读形式（章·进度 · 载荷来源 · 原文片段） */
export function describeAnchor(anchor: TextAnchor | null | undefined): string {
  if (!anchor) return '(无锚点)'
  const n = normalizeAnchor(anchor)
  const at = `c${n.norm.chapterIndex}·${(n.norm.progression * 100).toFixed(1)}%`
  const via = n.fragment ? n.fragment.engine : 'norm-only'
  const quote = n.norm.quote.exact
    ? ` "${n.norm.quote.exact.slice(0, 20)}${n.norm.quote.exact.length > 20 ? '…' : ''}"`
    : ''
  return `${at} [${via}·${anchorStrengthOf(n)}]${quote}`
}

/** 原文快照截断（捕获侧策略；`QUOTE_EXACT_MAX` / `QUOTE_CONTEXT_MAX` 见上） */
export function clipQuote(text: string, max: number): string {
  const t = typeof text === 'string' ? text : ''
  return t.length > max ? t.slice(0, max) : t
}

/* ————————————— 落库映射（notes 表的锚点列，§3.1.1 ① 批复）————————————— */

/**
 * `anchor_hint` 列承载的辅助信息（JSON）。
 * 批复只点名了 prefix/suffix；`engine` 与 `progression` 一并放这里，是**本实现的落点选择**
 * （理由：`anchor_key` 要保持"逐字节即适配器产物"以便原样解码，故不往它里面套 engine 壳；
 *  而 progression 是 Norm 侧字段、excerpt 列又被 quote.exact 占了，hint 是唯一合适的袋子）。
 * 缺 engine（或 engine 不认识）→ 读回时 Fragment 置 null，自动降级 Norm —— 这正是
 * §3.1.1「Fragment 缺失 → 降级 Norm」规则要的行为，不需要额外开关。
 */
export interface AnchorHintPayload {
  engine?: string
  progression?: number
  prefix?: string
  suffix?: string
}

/** notes 表的锚点三列（写入形状） */
export interface AnchorColumns {
  /** → `notes.chapter_index` */
  chapterIndex: number
  /** → `notes.anchor_key`：Fragment 串原样；无 Fragment 时空串 */
  anchorKey: string
  /** → `notes.anchor_hint`：JSON（解析失败时读回侧按空处理） */
  anchorHint: string
}

/** 锚点 → notes 表列（`quote.exact` **不进** hint：它落 `excerpt` 列，见 §3.1.1 ①） */
export function anchorToColumns(anchor: TextAnchor): AnchorColumns {
  const n = normalizeAnchor(anchor)
  const hint: AnchorHintPayload = { progression: n.norm.progression }
  if (n.fragment) hint.engine = n.fragment.engine
  if (n.norm.quote.prefix !== '') hint.prefix = n.norm.quote.prefix
  if (n.norm.quote.suffix !== '') hint.suffix = n.norm.quote.suffix

  return {
    chapterIndex: n.norm.chapterIndex,
    anchorKey: n.fragment ? n.fragment.key : '',
    anchorHint: JSON.stringify(hint)
  }
}

/** notes 表的锚点列（读取形状；`excerpt` 是 quote.exact 的投影，读回时必须一起给） */
export interface AnchorColumnInput {
  chapterIndex?: number | string | null
  anchorKey?: string | null
  anchorHint?: string | null
  excerpt?: string | null
}

/**
 * notes 表列 → 锚点（`anchorToColumns` 的逆）。
 * 宽容：hint 非法 JSON / 缺 engine / 缺 key 一律降级（Fragment=null），而不是抛错——
 * 库里的一条坏笔记不该让整本书的笔记列表打不开。
 */
export function columnsToAnchor(cols: AnchorColumnInput): TextAnchor {
  let hint: AnchorHintPayload = {}
  if (typeof cols.anchorHint === 'string' && cols.anchorHint !== '') {
    try {
      const parsed = JSON.parse(cols.anchorHint) as unknown
      if (parsed && typeof parsed === 'object') hint = parsed as AnchorHintPayload
    } catch {
      hint = {}
    }
  }

  const key = typeof cols.anchorKey === 'string' ? cols.anchorKey : ''
  const engine = typeof hint.engine === 'string' ? hint.engine : ''

  return normalizeAnchor({
    norm: {
      chapterIndex: toNonNegativeInt(cols.chapterIndex),
      progression: hint.progression,
      quote: {
        exact: typeof cols.excerpt === 'string' ? cols.excerpt : '',
        prefix: typeof hint.prefix === 'string' ? hint.prefix : '',
        suffix: typeof hint.suffix === 'string' ? hint.suffix : ''
      }
    },
    fragment: key !== '' && engine !== '' ? { engine, key } : null
  })
}

/* ————————————————— 阅读序（笔记列表的排序权威）————————————————— */

/**
 * 笔记**阅读序**比较：章 → 章内进度 → 创建时间 → id（稳定兜底）。
 *
 * 为什么是领域规则而不留在存储层：用户 2026-09-16 定的口径是"**笔记按照先后顺序排序，
 * 而不是按照时间顺序排序**" —— "先后"是**书里的位置**，这是笔记的语义，不是 SQL 的细节。
 * 谁是权威必须只有一处：存储层读列表、渲染层新建插入都用它，否则"库里是对的、界面上是乱的"
 * （2026-09-16 的实际症状：新建的笔记被追加到列表末尾 → 看上去按时间排）。
 *
 * ⚠ 用锚点的 **Norm 层**（跨格式可比）而非 Fragment（不透明串、无可比性，§3.1.1）；
 * 末位 `createdAt`/`id` 只为"同一进度上的两条"给出确定性次序，不代表"按时间排序"。
 */
export function compareNoteOrder(
  a: { anchor: TextAnchor; createdAt: number; id: string },
  b: { anchor: TextAnchor; createdAt: number; id: string }
): number {
  const byNorm = compareNormOrder(a.anchor.norm, b.anchor.norm)
  if (byNorm !== 0) return byNorm
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/* ————————————————— 内部 ————————————————— */

function compareNormOrder(a: AnchorNorm, b: AnchorNorm): -1 | 0 | 1 {
  if (a.chapterIndex !== b.chapterIndex) return a.chapterIndex < b.chapterIndex ? -1 : 1
  if (a.progression !== b.progression) return a.progression < b.progression ? -1 : 1
  return 0
}

/** 空白归一：折叠成单空格（CJK 重排/换行差异不该惩罚相似度；不做全删以免拉丁文word粘连） */
function normalizeQuoteText(s: string): string {
  return typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : ''
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>()
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2)
    m.set(g, (m.get(g) ?? 0) + 1)
  }
  return m
}

function toNonNegativeInt(v: unknown): number {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
}
