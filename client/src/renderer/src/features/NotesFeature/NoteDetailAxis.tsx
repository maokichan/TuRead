/**
 * NoteDetailAxis —— 笔记详情页的**轴视图**（笔记区重构，用户 2026-11-07 定）。
 *
 * 点击列表里的笔记卡片 → 进到这里（**不再直接跳回书里**）。构成：
 * - **左**：本书封面（书的身份由封面携带；轴上不出现章节/书名/任何元信息）；
 * - **轴**：一条垂直轴线；笔记按在书中的位置（章 + 章内进度）落节点，**节点间距只反映
 *   笔记之间的距离关系**（章距 × 系数，同章相邻、远章拉开）；
 * - 节点向右延出横线，线上挂**批注正文**（原生 Markdown 渲染）；**摘录是虚影**——
 *   弱化呈现（"这是书里的话"的证据，不是主角）；纯划线（无正文）整条以虚影上轴；
 * - **点击线上任意一条 → 跳回书的对应位置**（跳转入口从列表搬到这里）。
 *
 * 排列实现：卡片走**普通流**（永不重叠），间距 = 位置差 × 系数（夹最小缝）——
 * 距离保真与不重叠的折中：同章笔记只剩最小缝（"相邻"语义保真），远章按真实差距拉开。
 */
import { useEffect, useRef, useState } from 'react'
import type { Note } from '@core/domain/types'
import type { ILibraryStore } from '@core/ports/store'
import { getCoverUrl } from '../coverCache'
import { renderNoteMarkdown } from '../../components/noteMarkdown'

/** 位置（章 + 章内进度）→ 轴上间距的系数（px / 章）。 */
const AXIS_GAP_PER_CHAPTER = 96
/** 相邻卡片的最小缝（px）：同章笔记挤成"相邻"而不重叠。 */
const AXIS_MIN_GAP = 16

const posOf = (n: Note): number => n.anchor.norm.chapterIndex + (n.anchor.norm.progression ?? 0)

export function NoteDetailAxis({
  store,
  editionId,
  coverPath,
  notes,
  onJump
}: {
  store: ILibraryStore
  editionId: string
  coverPath?: string
  /** 该书的全部笔记（按阅读序；调用方给） */
  notes: Note[]
  /** 点击线上某条 → 跳回书的位置 */
  onJump: (note: Note) => void
}): React.JSX.Element {
  const [cover, setCover] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void getCoverUrl(store, editionId, coverPath).then((url) => {
      if (!cancelled) setCover(url)
    })
    return () => {
      cancelled = true
    }
  }, [store, editionId, coverPath])

  /** 间距序列：卡片在普通流里，margin-top = 位置差 × 系数（夹最小缝）。 */
  const gaps = useRef<number[]>([])
  gaps.current = notes.map((n, i) => {
    if (i === 0) return 24
    return Math.max(AXIS_MIN_GAP, Math.round((posOf(n) - posOf(notes[i - 1])) * AXIS_GAP_PER_CHAPTER))
  })

  return (
    <div className="flex h-full flex-col">
      {/* 无头部：返回走底面全局的后退/前进（笔记域已接入 notesNavBus）；说明文不留——
          内容自解释的界面不需要标题与说明书（STYLE 纪律） */}
      <div className="flex min-h-0 flex-1">
        {/* 封面：书的身份由它携带（轴上不出现任何元信息） */}
        <aside className="w-44 flex-none px-8 pt-8">
          {cover ? (
            <img src={cover} alt="" className="w-full" style={{ aspectRatio: '2 / 3', objectFit: 'cover' }} />
          ) : (
            <div
              className="w-full border border-[var(--border)]"
              style={{ aspectRatio: '2 / 3' }}
              aria-hidden="true"
            />
          )}
        </aside>

        {/* 轴 + 卡片流 */}
        <div className="relative min-h-0 flex-1 overflow-y-auto py-6 pr-10">
          {/* 轴线（居中偏左；只是一条线，不带任何字） */}
          <div className="absolute bottom-4 top-4 w-px bg-[var(--border)]" style={{ left: 28 }} aria-hidden="true" />
          {notes.map((n, i) => {
            const excerpt = n.anchor.norm.quote.exact
            const hasBody = n.body.trim() !== ''
            return (
              <div key={n.id} className="relative" style={{ marginTop: gaps.current[i] }}>
                {/* 节点 + 右延线 */}
                <span
                  className="absolute h-2 w-2 rounded-full bg-[var(--muted)]"
                  style={{ left: 25, top: 12 }}
                  aria-hidden="true"
                />
                <span
                  className="absolute h-px bg-[var(--border)]"
                  style={{ left: 33, width: 24, top: 15 }}
                  aria-hidden="true"
                />
                <button
                  className="ml-14 block max-w-2xl cursor-pointer text-left"
                  onClick={() => onJump(n)}
                  title="回到書中的位置"
                >
                  {/* 摘录 = 虚影（证据，不是主角）；纯划线整条虚影 */}
                  {excerpt !== '' && (
                    <p
                      className={`text-[12.5px] leading-5 text-[var(--muted)] ${hasBody ? 'opacity-60' : 'opacity-45'}`}
                    >{`「${excerpt}」`}</p>
                  )}
                  {/* 批注正文 = 线上的实体（原生 Markdown 渲染） */}
                  {hasBody && (
                    <div className="note-doc mt-1 text-[14px] leading-7 text-[var(--fg)]">
                      {renderNoteMarkdown(n.body)}
                    </div>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
