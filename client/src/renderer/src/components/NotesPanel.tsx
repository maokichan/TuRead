/**
 * 笔记列表（与目录同位置的左缘内嵌件）。
 *
 * 为什么复用 `.toc-list` 容器类：与目录是"同一位置、同一形态、不同内容"——卡片页平填几何
 * 由 `.rail-card .toc-list` 统一收口，另起一套几何必然与目录错位 —— 故直接共用同一容器类，只换行内容。
 *
 * 视觉依据 `style/components-notes.md`：文字优先（摘录即标签）、字号走阶梯、遮罩高亮沿用目录同款
 * （`--toc-veil` 按距离）—— 与目录行同一套"退场"口径，不新造视觉。
 */
import { useEffect, useRef } from 'react'
import type { Note } from '@core/domain/types'
import { centerInScrollBox, activeNoteIndex } from './readerFollow'

export interface NotesPanelProps {
  /** 当前书的笔记（**必须是阅读序**：章 → 章内进度 → 创建时间，见 `domain/anchor.ts` 的 `compareNoteOrder`） */
  notes: Note[]
  onJump: (note: Note) => void
  onRemove: (note: Note) => void
  /** 打开这条的**编辑**（底部输入栏；编辑入口必须保留） */
  onEdit: (note: Note) => void
  /** 当前阅读位置（章号）：**当前条目自动滚到容器正中**（与目录同一判据） */
  activeChapter?: number
  /**
   * 「看这条笔记」请求（点正文高亮 → 这里定位到它）：
   * 有它时**优先**定位到这一条（只读，不改内容）；`tick` 变化即视为一次新请求。
   */
  focusNote?: { id: string; tick: number } | null
}

/** 摘录截断长度：够认出是哪一段即可（完整原文在笔记本体里） */
const EXCERPT_MAX = 24

export function NotesPanel({
  notes,
  onJump,
  onRemove,
  onEdit,
  activeChapter = 0,
  focusNote = null
}: NotesPanelProps): React.JSX.Element {
  const rowsRef = useRef<HTMLDivElement | null>(null)
  /** 笔记列表换了（换书 / 新建 / 删除）→ 视为首次落位（瞬时定位，不做平滑动画） */
  const lastNotesRef = useRef<Note[] | null>(null)
  /** 已处理过的「看这条」请求 tick（同一条再点一次时 tick 会变） */
  const lastFocusTickRef = useRef(0)

  /**
   * 落点（判据与目录同源：`readerFollow.ts`；章级粒度与退化路径见该文件注释）：
   * ① 有**新的**「看这条」请求 → 定位到它（瞬时，明确意图）；
   * ② 否则跟随当前阅读位置（跨章平滑、换书瞬时）。
   */
  useEffect(() => {
    const box = rowsRef.current
    if (!box) return
    const requested = focusNote && focusNote.tick !== lastFocusTickRef.current ? focusNote : null
    const idx = requested
      ? notes.findIndex((n) => n.id === requested.id)
      : activeNoteIndex(notes, activeChapter)
    if (idx < 0) return
    const el = box.querySelectorAll<HTMLElement>('.note-row')[idx]
    if (!el) return
    const listChanged = lastNotesRef.current !== notes
    lastNotesRef.current = notes
    if (requested) lastFocusTickRef.current = requested.tick
    centerInScrollBox(box, el, !requested && !listChanged)
  }, [notes, activeChapter, focusNote])

  return (
    <div className="toc-list">
      <div className="toc-list__rows" ref={rowsRef}>
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
                <span className="note-row__where">
                  節 {n.anchor.norm.chapterIndex + 1}
                  {/* 「註」= 这条**带批注正文**（判据是 `body`，不是 `kind`）——
                      批注要在视觉上与高亮区分 */}
                  {n.body !== '' && (
                    <span className="note-row__kind" title="帶批註正文">
                      　註
                    </span>
                  )}
                </span>
              </button>
              <button className="note-row__edit" title="編輯這條批註" onClick={() => onEdit(n)}>
                編輯
              </button>
              <button className="note-row__remove" title="移除這條筆記" onClick={() => onRemove(n)}>
                移除
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
