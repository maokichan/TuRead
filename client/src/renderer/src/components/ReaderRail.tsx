/**
 * ReaderRail —— 阅读器**挂载线实体**（2026-09-12 用户定，二次纠正后定稿）。
 *
 * 一条**横向挂载线**，从目录段起**延伸整个页面宽度**（跨过正文上方直到右缘）：
 * - 左段 = 目录挂载区：目录**向下垂挂**（TocPanel）；目录折叠时，**点线（左段）= 展开目录**；
 * - 右段 = 阅读参数挂载区：参数面板挂在**右侧线下方**，**折叠 = 向上收回线里**（用户定）；
 *   把手即线本身（右段），面板内无收起按钮（2026-09-12 废除）。
 * 两个挂件互不干扰（左/右分区），又同处一条线（同一实体）。
 * 中段是纯线段（跨过正文上方，无交互）。
 *
 * ⚠ **2026-09-16（用户定）：左右两挂件以页面中线镜像** —— 同宽、同高、离中线等距；
 * 线段与面板同宽同侧（算式唯一一份在 `styles.css` 的 `.reader-rail` 一节）。
 * 线段现在从 `--sidebar-w` 处开始（`__lead` 占位不留线），而不是让整个容器从那里起算 ——
 * 这样 `50%` 才是**页面中线**（不是"中线减去侧边栏"）。
 */
import type { Note } from '@core/domain/types'
import type { TocRow } from './TocPanel'
import { TocPanel } from './TocPanel'
import { NotesPanel } from './NotesPanel'
import { ReaderControls, type ReaderParams } from './ReaderControls'

/** 左挂件的内容形态（2026-09-14）：同一位置、同一几何，只换内容 */
export type LeftPanelKind = 'toc' | 'notes'

interface ReaderRailProps {
  tocOpen: boolean
  onTocToggle: () => void
  tocRows: TocRow[]
  onTocJump: (row: TocRow) => void
  controlsOpen: boolean
  onControlsToggle: () => void
  params: ReaderParams
  onParamsChange: (patch: Partial<ReaderParams>) => void
  leftPanel: LeftPanelKind
  onLeftPanelChange: (kind: LeftPanelKind) => void
  notes: Note[]
  onNoteJump: (note: Note) => void
  onNoteRemove: (note: Note) => void
  /** 当前阅读位置（章号）：两个挂件的"当前条目"都据此滚到正中（2026-09-16 用户定） */
  activeChapter: number
}

export function ReaderRail({
  tocOpen,
  onTocToggle,
  tocRows,
  onTocJump,
  controlsOpen,
  onControlsToggle,
  params,
  onParamsChange,
  leftPanel,
  onLeftPanelChange,
  notes,
  onNoteJump,
  onNoteRemove,
  activeChapter
}: ReaderRailProps): React.JSX.Element {
  /**
   * 左挂件顶部的内容开关（目錄 / 筆記）。两格**都是文字**（§5.1），当前格用 `--accent` ——
   * 与全站"当前选中 = 强调色"同一语汇。笔记数并入标签，省一行状态。
   */
  const leftTabs = (
    <div className="left-tabs">
      <button
        className={`left-tabs__tab${leftPanel === 'toc' ? ' left-tabs__tab--on' : ''}`}
        onClick={() => onLeftPanelChange('toc')}
        title="目錄"
      >
        目錄
      </button>
      <button
        className={`left-tabs__tab${leftPanel === 'notes' ? ' left-tabs__tab--on' : ''}`}
        onClick={() => onLeftPanelChange('notes')}
        title="筆記"
      >
        筆記{notes.length > 0 ? ` ${notes.length}` : ''}
      </button>
    </div>
  )

  return (
    <>
      {/* 横向挂载线：引导段（占位不留线，线不贴窗口左缘）+ 左段（目录）+ 中段（纯线）+ 右段（参数），
          拼出整页宽的一条线。⚠ 左/右段与各自挂件**同宽同侧**（镜像几何，见 styles.css 的算式） */}
      <div className="reader-rail">
        <div className="reader-rail__lead" aria-hidden="true" />
        <button
          className="reader-rail__zone reader-rail__zone--toc"
          aria-label={tocOpen ? '收起左欄' : '打開左欄'}
          aria-expanded={tocOpen}
          title={tocOpen ? '收起左欄' : leftPanel === 'toc' ? '目錄' : '筆記'}
          onClick={onTocToggle}
        />
        <div className="reader-rail__span" aria-hidden="true" />
        <button
          className="reader-rail__zone reader-rail__zone--params"
          aria-label={controlsOpen ? '收起閱讀參數' : '閱讀參數'}
          aria-expanded={controlsOpen}
          title={controlsOpen ? '收起閱讀參數' : '閱讀參數'}
          onClick={onControlsToggle}
        />
      </div>

      {/* 左挂件：目录 / 笔记（同一几何，顶部开关切换）。无目录索引的书也垂挂占位说明
          （2026-09-13 用户定："本书没有目录索引"要可见，不静默消失） */}
      {tocOpen &&
        (leftPanel === 'toc' ? (
          <TocPanel
            rows={tocRows}
            onJump={onTocJump}
            onToggle={onTocToggle}
            header={leftTabs}
            activeChapter={activeChapter}
          />
        ) : (
          <NotesPanel
            notes={notes}
            header={leftTabs}
            onJump={onNoteJump}
            onRemove={onNoteRemove}
            onToggle={onTocToggle}
            activeChapter={activeChapter}
          />
        ))}

      {/* 右挂件：参数面板（挂在线下方右侧；折叠 = 向上收回线里，面板底部「折疊」同目录） */}
      {controlsOpen && (
        <ReaderControls params={params} onChange={onParamsChange} onToggle={onControlsToggle} />
      )}
    </>
  )
}
