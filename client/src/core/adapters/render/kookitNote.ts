/**
 * Note v2 → kookit 引擎载荷（自 kookitRenderAdapter 拆出）。
 * **字段名与约定都是 kookit 的，必须照它给**（逆向核实，见 KOOKIT.md）：
 * - `range`：**JSON 字符串** —— kookit 内部 `JSON.parse(item.range)`（`createOneNote` 与
 *   `renderHighlighters` 两条路径都如此）。即 `anchor.fragment.key` 原样透传。
 * - `color`：kookit 的 `"<styleType>-#RRGGBB"` 形态（`buildHighlightStyleForType` 按 `-`
 *   切分取 [0]=styleType、[1]=rawColor）。**不是语义色名，也不是裸 hex** —— 传裸 hex 会让
 *   styleType 变成那个 hex、switch 无命中而返回 undefined 样式（静默不显色）。
 * - `key`：笔记 id（kookit 用它写 `data-key` 并在删除时查找）。
 * - `notes`：**字符串**（kookit 以 `item.notes !== ""` 判定"是否带批注"）。
 *   ⚠ 传数组会恒判为"带批注"，且数组被当正文 —— 必须是字符串。
 * - `chapterIndex`：文字类分支忽略，但 **PDF 分支必读**
 *   （`getSubIframe(item.chapterIndex)` + 逐条 `pageIndex !== chapterIndex` 过滤）—— 故一律带上。
 */
import type { Note, NoteColor } from '@core/domain/types'

/** 笔记色缺省：`Note.color` 未给时（书签/墨迹无色的语义回退）用哪一支 token */
const DEFAULT_NOTE_COLOR: NoteColor = 'yellow'

export function toKookitNote(note: Note): Record<string, unknown> {
  return {
    key: note.id,
    range: note.anchor.fragment?.key ?? '',
    color: resolveNoteColor(note.color),
    notes: note.body ?? '',
    chapterIndex: note.anchor.norm.chapterIndex
  }
}

/**
 * 语义色名 → kookit 颜色串。
 * **颜色的唯一来源是宿主 CSS token**（`--note-<name>`，定义在 `styles.css`）：
 * 库内只存语义名（DATA_MODEL「库内无 hex」），而 kookit 需要具体色值 —— 于是由宿主
 * 解析出当前主题下的实际值再内联给引擎。**不能用 `var(--note-red)` 传进去**：高亮 span 长在
 * 书的 iframe 内部 document 里，宿主 CSS 变量不跨文档继承。
 *
 * 兜底值取 kookit 自身的默认 `#FEF3CD`（`buildHighlightStyleForType` 的 `rawColor` 初值）——
 * 这是"引擎默认"而不是 TuRead 的设计取值，故不构成第二处设计真相来源；token 缺失属配置错误，
 * 记日志让人看见（不做静默 no-op）。
 */
/** 语义色名 → 具体 hex（宿主 CSS token 的现值；kookit 需要字面色值——CSS 变量不跨文档继承）。
 *  兜底 = kookit 默认 `#FEF3CD`（引擎默认而非 TuRead 设计取值，不构成第二处真相来源）。 */
export function resolveNoteHex(name?: NoteColor): string {
  const token = `--note-${name ?? DEFAULT_NOTE_COLOR}`
  const raw =
    typeof window === 'undefined'
      ? ''
      : window.getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  if (!raw) {
    console.warn(`[render] 缺少颜色 token ${token}（styles.css 未定义？）——回退引擎默认色`)
    return '#FEF3CD'
  }
  return raw
}

function resolveNoteColor(name?: NoteColor): string {
  return `background-${resolveNoteHex(name)}`
}
