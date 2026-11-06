/**
 * noteRefCompletion —— 文档编辑器的 @ 补全（笔记 v3 文档层）。
 *
 * 输入 `@词` → 弹出笔记候选（子串过滤：excerpt / body / editionTitle，不分大小写，≤ 8 条）→
 * 选中插入**可解析的引用串** `[[檔案 · 書名#note-<id>|「摘录」]]`——目标与「匯出筆記檔案」的
 * 节标题（`## note-<id>`）对上，預覽渲染成可点引用、Obsidian 里经档案解析可反链；
 * 摘录空 = 顯示名退化为「書名 · 節N」。
 *
 * 分层：**纯逻辑（extractAtWord / filterNoteCandidates / noteRefDisplay / formatNoteRef）
 * 零运行时依赖、node 可测**；对 @codemirror/autocomplete 只 type-import（编译期擦除）。
 * CM 侧胶水 `noteRefCompletion(notes)` 返回 CompletionSource，由调用方（DocumentsPanel）
 * 经 `autocompletion({ override: […] })` 组装——autocompletion 的 import 留在调用侧。
 */
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { safeVaultName } from './notesDocs'

/** 候选 = 补全/格式化需要的最小投影（与 store 的 NoteListItem 解耦，node 测试零依赖） */
export interface NoteRefCandidate {
  /** 笔记 id（uuid；引用串里带 `note-` 前缀） */
  id: string
  editionId: string
  editionTitle: string
  /** 章序（0 起；顯示名兜底「節 N」用） */
  chapterIndex: number
  /** 摘录（anchor.norm.quote.exact 投影） */
  excerpt: string
  /** 批注正文（过滤字段之一） */
  body: string
}

/** `@词`：行尾的 @ 及其后的词字符（词可空 = 刚敲 @）。`$` 锚定 = 只认光标前那一个词。 */
const AT_WORD_RE = /@([\p{L}\p{N}_-]*)$/u

/** 候选上限（短列表；书一多全量弹窗反而难选） */
const MAX_OPTIONS = 8

/** 从光标前文本取「@词」；返回 `@` 的偏移与词（词可空串）。行尾不是 @词 = null。 */
export function extractAtWord(lineBefore: string): { at: number; word: string } | null {
  const m = lineBefore.match(AT_WORD_RE)
  if (!m) return null
  return { at: lineBefore.length - m[0].length, word: m[1] }
}

/** 子串过滤（excerpt / body / editionTitle，不分大小写），≤ 8 条；空词 = 前 8 条全量。 */
export function filterNoteCandidates(
  notes: readonly NoteRefCandidate[],
  word: string
): NoteRefCandidate[] {
  const w = word.toLowerCase()
  const hit =
    w === ''
      ? notes
      : notes.filter(
          (n) =>
            n.editionTitle.toLowerCase().includes(w) ||
            n.excerpt.toLowerCase().includes(w) ||
            n.body.toLowerCase().includes(w)
        )
  return hit.slice(0, MAX_OPTIONS)
}

/** 顯示名：摘录前 12 字包「」；摘录空 = 「書名 · 節N」（章序 0 起，展示 1 起）。 */
export function noteRefDisplay(n: NoteRefCandidate): string {
  const q = n.excerpt.trim()
  return q !== '' ? `「${q.slice(0, 12)}」` : `${n.editionTitle} · 節${n.chapterIndex + 1}`
}

/** 候选 → 引用串（目标 = `檔案 · 書名#note-<id>`；書名过 safeVaultName，与档案文件名同源）。 */
export function formatNoteRef(n: NoteRefCandidate): string {
  const book = safeVaultName(`檔案 · ${n.editionTitle}`).replace(/\.md$/, '')
  return `[[${book}#note-${n.id}|${noteRefDisplay(n)}]]`
}

/**
 * @ 补全源（工厂）：notes 由调用方缓存（listAllNotes 投影）传入。
 * from/to 盖住整个 `@词`——选中即把 `@词` 整段替换为引用串（apply = 插入串，
 * CodeMirror 默认按 from..to 替换）。
 */
export function noteRefCompletion(
  notes: readonly NoteRefCandidate[]
): (context: CompletionContext) => CompletionResult | null {
  return (context) => {
    // matchBefore 只看光标前一行（≤250 字符）；必须 `$` 锚定，否则会咬到更早的 @
    const before = context.matchBefore(/@[\p{L}\p{N}_-]*$/u)
    if (!before) return null
    const options: Completion[] = filterNoteCandidates(notes, before.text.slice(1)).map((n) => ({
      label: noteRefDisplay(n),
      detail: `${n.editionTitle} · 節${n.chapterIndex + 1}`,
      type: 'text',
      apply: formatNoteRef(n)
    }))
    if (options.length === 0) return null
    return { from: before.from, to: before.to, options }
  }
}
