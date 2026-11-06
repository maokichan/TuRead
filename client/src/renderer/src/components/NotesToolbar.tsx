/**
 * 笔记管理的**底部状态栏**（纯展示：props in / 回调 out）—— 视觉 = style/components-notes.md。
 *
 * 三件（左对齐，与书库底部状态栏同一结构：`border-t` + `pt-4` + 22px 文字按钮）：
 * ① **内容主次**（批註為主 ⇄ 摘錄為主，两态循环）—— `.view-switch` + **三角负片** + 闪屏动画
 *    （视图切换动画搬家至此：網格退役后，"两态循环 + 负片三角"的语汇由主次切换继承；
 *    主次切换 = **主方完整、副方截断**的信息取舍，不是字号强调）；② **筛选**（批註 → 劃線 → 全部，
 *    单按钮三态循环，默认批註、不带三角不加动画）；③ **计数**。
 * 另有「文檔」切换（文档视图归筆记区）与「彙編」导出。
 * 作用域切换已退役（用户定：按库分类不是笔记区的工作，库状态只在书库页；列表恒全部笔记）。
 *
 * 排序恒按**最近更新**倒序（不设切换——按书的组织归详情轴与舞台入口，列表只做时间流）。
 */
import type { NoteFilter, NoteTextFocus } from '@core/domain/types'
import { useViewSwitchFlash } from './viewSwitchFlash'

export interface NotesToolbarProps {
  filter: NoteFilter
  textFocus: NoteTextFocus
  /** 当前筛选下的条数 */
  count: number
  /** 匯出彙編（笔记 v3 文档层）：当前筛选结果 → vault 的 .md（wikilink 引用） */
  onExportCompilation: () => void
  /** 文档视图开关（文档 = 笔记生产的内容，归筆记区管） */
  docsOpen: boolean
  onToggleDocs: () => void
  /** 一次性反馈（如「已複製批註」）；显示在计数位置，约 1.5s 后自动消失 */
  hint?: string | null
  onCycleFilter: () => void
  onToggleFocus: () => void
}

const FILTER_LABEL: Record<NoteFilter, string> = { annotated: '批註', highlight: '劃線', all: '全部' }
const FOCUS_LABEL: Record<NoteTextFocus, string> = { body: '批註為主', excerpt: '摘錄為主' }

export function NotesToolbar({
  filter,
  textFocus,
  count,
  hint,
  onCycleFilter,
  onToggleFocus,
  onExportCompilation,
  docsOpen,
  onToggleDocs
}: NotesToolbarProps): React.JSX.Element {
  /** 闪屏动画从"视图切换"搬来（用户定：摘录主次切换也用它）；闪屏中再点 = 重开一轮 */
  const { flashing, flashSeq, shown, toggle } = useViewSwitchFlash<NoteTextFocus>(
    textFocus,
    (f) => (f === 'body' ? 'excerpt' : 'body')
  )

  const toggleFocus = (): void => {
    toggle()
    onToggleFocus()
  }

  /** 主次在「劃線」筛选下没有意义（都是无批注的条目）→ 禁用 */
  const focusDisabled = filter === 'highlight'

  return (
    <footer className="flex-none">
      <div className="flex items-center gap-7 border-t border-[var(--border)] pt-4 pb-1 text-[12.5px]">
        <button
          onClick={onCycleFilter}
          title="切换筛选：批註 → 劃線 → 全部"
          className="text-action text-action--lg"
        >
          {FILTER_LABEL[filter]}
        </button>
        <button onClick={onToggleDocs} title="文檔 = 消费笔记所生产的内容（vault 的 .md 文件）" className={`text-action text-action--lg${docsOpen ? ' text-[var(--fg)]' : ''}`}>
          {docsOpen ? '返回筆記' : '文檔'}
        </button>
        {/* 闪屏中再点 = 重开一轮（key 重挂重启关键帧）—— 状态切换永远不被动画挡住 */}
        <button
          key={flashSeq}
          onClick={toggleFocus}
          disabled={focusDisabled}
          title={focusDisabled ? '「劃線」下没有可切换的主次' : '切换卡片内的文字主次（主方完整，副方截断）'}
          className={`view-switch ${flashing ? 'view-switch-flash' : ''}`}
        >
          {FOCUS_LABEL[shown]}
        </button>
        <span className="text-[var(--muted)]">{hint ?? `${count} 條`}</span>
      </div>
    </footer>
  )
}
