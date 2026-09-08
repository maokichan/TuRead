/**
 * BookLocation 语义标准 —— 定位系统的唯一权威实现（纯函数，零依赖零副作用）。
 * 契约：client/docs/CONTRACTS.md §2.1；字段逆向依据：client/docs/KOOKIT.md §6。
 *
 * 为什么存在：位置不只是笔记需要 —— 房间同步回跳、进度条、lastLocation 恢复、
 * 将来的 TTS/跳转引用/测试断言都要"比较/归一/排序位置"。
 * 规则：【任何组件不得自行比较或解释 BookLocation 字段】，一律走本模块原语 ——
 * "哪个字段是主键、哪个是兜底"只允许这一处定义。
 */

import type { BookFormat, BookLocation } from './types'

/** 字段三级角色（语义，不新增字段）：
 *  - key    主键（格式相关，精确回跳第一依据，见 locationKey）
 *  - hint   重定位兜底（主键因版本/结构差异失效时使用）：text / chapterHref / chapterTitle
 *  - display 仅展示与粗粒度同步，【不得】作为精确锚定依据：percentage / chapterTitle
 */

/**
 * 零位置（未渲染/未导航时 getPosition() 的返回）判定。
 * ⚠ 判据必须含 chapterHref：kookit 的"未渲染"是空对象（chapterHref 为空串），
 *   而**首章首块是有效位置**（chapterDocIndex=0、count=0，但 chapterHref 已就绪）。
 *   早期版本只看数值键 → 把"第一页"误判为零位置，compareLocation 返回 null、
 *   anchorStrength 返回 none（笔记/同步回跳会拒绝回跳到书的开头）。
 */
export function isZeroLocation(loc: BookLocation | null | undefined): boolean {
  if (!loc) return true
  return (
    toNonNegativeInt(loc.chapterDocIndex) === 0 &&
    toNonNegativeInt(loc.count) === 0 &&
    toNonNegativeInt(loc.page) === 0 &&
    !loc.text &&
    !loc.chapterHref
  )
}

/** 位置输入（宽容形态）：允许 kookit 遗留的 string 数值 / null / 缺字段 */
export type LocationInput = Partial<{
  [K in keyof BookLocation]: BookLocation[K] | string | null
}>

/**
 * 归一：容错 kookit 遗留的 string 数值 / 缺字段 / 越界（历史 library.json 数据兼容）。
 * 所有位置进入域层（适配器产出、持久化读回、网络载荷）后应先过这里。
 */
export function normalizeLocation(raw?: LocationInput | null): BookLocation {
  return {
    chapterDocIndex: toNonNegativeInt(raw?.chapterDocIndex),
    chapterHref: raw?.chapterHref ?? '',
    count: toNonNegativeInt(raw?.count),
    page: toNonNegativeInt(raw?.page),
    percentage: clamp01(Number(raw?.percentage) || 0),
    text: raw?.text ?? '',
    chapterTitle: raw?.chapterTitle ?? undefined
  }
}

/**
 * 主键（locationKey）—— 格式相关的"同一位置"判定依据：
 * - PDF：page（kookit 每页一个 section，不依赖 OCR，跨端天然稳定，见 KOOKIT.md §8.1/§8.2）
 * - 文字类（EPUB/MOBI/AZW3/TXT/…）：chapterDocIndex + count（可见滚动块序号）
 * 返回形如 "pdf:p3" / "txt:c5.12" 的规范化键字符串。
 */
export function locationKey(loc: BookLocation, format: BookFormat): string {
  const n = normalizeLocation(loc)
  return format === 'PDF'
    ? `pdf:p${n.page}`
    : `text:c${n.chapterDocIndex}.${n.count}`
}

/** 同一位置判定（主键相等）。跨格式/跨书比较无意义，调用方保证同书同版本。 */
export function sameLocation(a: BookLocation, b: BookLocation, format: BookFormat): boolean {
  return locationKey(a, format) === locationKey(b, format)
}

/**
 * 排序（同书同版本内的先后）：PDF 按 page；文字类按 chapterDocIndex → count。
 * percentage 保留一位小数精度差异大，不参与比较（display 角色）。
 * 返回 null = 不可比（任一为零位置）。
 */
export function compareLocation(
  a: BookLocation,
  b: BookLocation,
  format: BookFormat
): -1 | 0 | 1 | null {
  const na = normalizeLocation(a)
  const nb = normalizeLocation(b)
  if (isZeroLocation(na) || isZeroLocation(nb)) return null
  if (format === 'PDF') return sign(na.page - nb.page)
  const da = na.chapterDocIndex - nb.chapterDocIndex
  if (da !== 0) return sign(da)
  return sign(na.count - nb.count)
}

/**
 * 锚点强度 —— 该位置信息是否足够"精确回跳"（笔记/恢复/同步回跳选路用）：
 * - strong：主键齐备（PDF 有页码；文字类 chapterDocIndex+count 都 >0）
 * - weak  ：只有粗粒度（percentage / 纯 chapterDocIndex）——只能回跳到大概位置
 * - none  ：零位置
 * 精确回显仍以 Note.range（引擎序列化）为准，location 只是它的粗锚点。
 */
export function anchorStrength(loc: BookLocation, format: BookFormat): 'strong' | 'weak' | 'none' {
  const n = normalizeLocation(loc)
  if (isZeroLocation(n)) return 'none'
  if (format === 'PDF') return n.page > 0 ? 'strong' : 'weak'
  return n.chapterDocIndex > 0 && n.count > 0 ? 'strong' : 'weak'
}

/** 日志/调试用的可读形式（ch·块/页 · 百分比 · 文本提示） */
export function describeLocation(loc: BookLocation, format: BookFormat): string {
  const n = normalizeLocation(loc)
  const where =
    format === 'PDF'
      ? `p${n.page}`
      : `c${n.chapterDocIndex}·${n.count}${n.chapterTitle ? `(${n.chapterTitle})` : ''}`
  const hint = n.text ? ` "${n.text.slice(0, 24)}…"` : ''
  return `${where} ${(n.percentage * 100).toFixed(1)}%${hint}`
}

function toNonNegativeInt(v: unknown): number {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
}

function sign(v: number): -1 | 0 | 1 {
  return v < 0 ? -1 : v > 0 ? 1 : 0
}
