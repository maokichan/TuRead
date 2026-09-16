/**
 * 笔记卡片（笔记管理·跨书）—— **纯展示**（props in / 回调 out）。
 *
 * 视觉依据 = `STYLE.md` §5.10（2026-09-16 立案）：
 * - **纯文字块**：无边框、无底色、无阴影、无圆角（书库封面格的 1px 边框是因为"图需要槽"，
 *   文字卡没有图就不该有框架）。样式全在 `styles.css` 的 `.note-card*`，组件只挂类名。
 * - 三段：① 元行 = 标记块 + 「書名 · 節 N」+ 相对时间 ② 摘录（**加「」** —— "这是书里的话"
 *   的唯一标记）③ 批注（`body` 空则整行不出现 → 卡片自然更矮）。
 * - **两档文字主次**（`textFocus`）：差别只有字号 + 颜色（P2 一套字体、中文仅 Bold 切面
 *   → 不做字重对比）。
 * - 上限由 CSS 的 line-clamp 承担（摘录 ≤4 行 / 批注 ≤6 行）。
 *
 * 交互（语义在 `NotesFeature` / `STYLE.md` §5.10）：**单击 = 选中、双击 = 跳转**、
 * 右键 = 挂载线菜单（`跳转` / `複製批註` / `刪除`）。卡片内**不设 hover 动作区**（卡片零 chrome）。
 */
import type { Note, NoteTextFocus } from '@core/domain/types'
import { formatRelative } from '../features/format'

export interface NoteCardProps {
  note: Note
  /** 展示投影（读模型 `NoteListItem.editionTitle`）：跨书列表里"书名"才是有用的标签 */
  editionTitle: string
  selected: boolean
  /** 文字主次档（默认 `body` = 批註為主） */
  textFocus: NoteTextFocus
  onSelect: () => void
  onOpen: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

export function NoteCard({
  note,
  editionTitle,
  selected,
  textFocus,
  onSelect,
  onOpen,
  onContextMenu
}: NoteCardProps): React.JSX.Element {
  const excerpt = note.anchor.norm.quote.exact
  const hasBody = note.body.trim() !== ''
  const where = `${editionTitle} · 節 ${note.anchor.norm.chapterIndex + 1}`
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      data-note-id={note.id}
      title={where}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onOpen()
        } else if (e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={`note-card note-card--${textFocus === 'body' ? 'body-first' : 'excerpt-first'}${
        selected ? ' note-card--selected' : ''
      }`}
    >
      <div className="note-card__meta">
        {/* 色块是**功能信息**（这条是什么色），不是装饰 —— §5.2 例外⑤ */}
        <span
          className="note-card__mark"
          style={{ background: `var(--note-${note.color ?? 'yellow'})` }}
          aria-hidden="true"
        />
        <span className="note-card__where">{where}</span>
        <span className="note-card__when">{formatRelative(note.updatedAt)}</span>
      </div>
      {excerpt !== '' && <p className="note-card__excerpt">{`「${excerpt}」`}</p>}
      {hasBody && <p className="note-card__body">{note.body}</p>}
    </div>
  )
}
