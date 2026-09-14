/**
 * 笔记垂挂列表（Stage 4，2026-09-14）—— 挂载线实体的**左挂件另一种内容**。
 *
 * 为什么复用 `.toc-list` 几何：左挂件的坐标由挂载线几何（`--toc-line-top` / `--sidebar-w` /
 * `--toc-line-w` / `--read-width` 夹取）决定，**是一套已经调好的视觉语汇**。笔记面板与目录
 * 是"同一位置、同一形态、不同内容"，另起一套几何必然与目录错位 —— 故直接共用同一容器类，
 * 只换行内容。切换形态 = 顶部两格文字开关（目錄 / 筆記），不做第二块浮层。
 *
 * 视觉依据 `STYLE.md`：文字优先（摘录即标签）、字号走阶梯、遮罩高亮沿用目录同款
 * （`--toc-veil` 按距离）—— 与目录行同一套"退场"口径，不新造视觉。
 */
import type { Note } from '@core/domain/types'

export interface NotesPanelProps {
  /** 当前书的笔记（已按阅读序排好，见 ILibraryStore.listNotes） */
  notes: Note[]
  /** 顶部开关（目錄 / 筆記）—— 由 ReaderRail 生成，两个面板共用同一份 */
  header?: React.ReactNode
  onJump: (note: Note) => void
  onRemove: (note: Note) => void
  onToggle: () => void
}

/** 摘录截断长度：够认出是哪一段即可（完整原文在笔记本体里） */
const EXCERPT_MAX = 24

export function NotesPanel({
  notes,
  header,
  onJump,
  onRemove,
  onToggle
}: NotesPanelProps): React.JSX.Element {
  return (
    <div className="toc-list">
      {header}
      <div className="toc-list__rows">
        {notes.length === 0 && <div className="toc-list__empty">本書還沒有筆記</div>}
        {notes.map((n) => {
          const excerpt = n.anchor.norm.quote.exact || n.body || '（無摘錄）'
          const short = excerpt.length > EXCERPT_MAX ? `${excerpt.slice(0, EXCERPT_MAX)}…` : excerpt
          return (
            <div className="note-row" key={n.id}>
              {/* 色块是**功能信息**（这条是什么色），不是装饰 —— 同 §5.2 例外⑤ 的口径 */}
              <span
                className="note-row__mark"
                style={{ background: `var(--note-${n.color ?? 'yellow'})` }}
                aria-hidden="true"
              />
              <button
                className="note-row__label"
                title={`第 ${n.anchor.norm.chapterIndex + 1} 節 · ${excerpt}`}
                onClick={() => onJump(n)}
              >
                <span className="note-row__text">{short}</span>
                <span className="note-row__where">節 {n.anchor.norm.chapterIndex + 1}</span>
              </button>
              <button className="note-row__remove" title="移除這條筆記" onClick={() => onRemove(n)}>
                移除
              </button>
            </div>
          )
        })}
      </div>
      <div className="toc-list__fold">
        <button className="text-action" onClick={onToggle}>
          折疊
        </button>
      </div>
    </div>
  )
}
