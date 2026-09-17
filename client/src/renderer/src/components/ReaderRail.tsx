/**
 * ReaderRail —— 阅读器**挂载线实体**（2026-09-12 用户定，二次纠正后定稿）。
 *
 * 一条**横向挂载线**，从目录段起**延伸整个页面宽度**（跨过正文上方直到右缘）：
 * - 左段 = 目录挂载区：目录**向下垂挂**（TocPanel）；目录折叠时，**点线（左段）= 展开目录**；
 * - 右段 = 右挂件挂载区：参数面板挂在**右侧线下方**，**折叠 = 向上收回线里**（用户定）；
 *   把手即线本身（右段），面板内无收起按钮（2026-09-12 废除）。
 * 两个挂件互不干扰（左/右分区），又同处一条线（同一实体）。
 * 中段是纯线段（跨过正文上方，无交互）。
 *
 * ⚠ **2026-09-16（用户定）：左右两挂件关于「挂载线的中心」镜像** —— 线是**固定的一条**
 * （`--sidebar-w` → 窗口右缘），两段**等宽**且**各贴线的一端** → 关于线中心天然互为镜像；
 * 宽度/位置**不得**由 `--read-width` 派生（v1.8 犯过这个错，v1.9 已纠正，见 `styles.css`）。
 *
 * ⚠ **2026-09-17（用户定）：右段变成"两格内容的抽屉"** —— 与左段（目錄 / 筆記）同构：
 * 「閱讀參數 / 聊天」两格共用同一几何、顶部开关切换；**聊天只在"经房间进入的这本书"上存在**
 * （用户原话："沒有通過房間進入一本書就不會有這個項"），没有聊天时右段只有参数一种内容、
 * 不出现页签行（与 v1.10 之前的形态一致）。
 */
import type { ChatMessage, Note } from '@core/domain/types'
import type { TocRow } from './TocPanel'
import { TocPanel } from './TocPanel'
import { NotesPanel } from './NotesPanel'
import { ChatPanel } from './ChatPanel'
import { ReaderControls, type ReaderParams } from './ReaderControls'

/** 左挂件的内容形态（2026-09-14）：同一位置、同一几何，只换内容 */
export type LeftPanelKind = 'toc' | 'notes'
/** 右挂件的内容形态（2026-09-17）：同左挂件 —— 同一几何，只换内容 */
export type RightPanelKind = 'params' | 'chat'

/** 右挂件的聊天数据（null = 这本书不是经房间进来的 → 没有聊天室这一项） */
export interface RailChatProps {
  roomId: string
  messages: ChatMessage[]
  draft: string
  onDraftChange: (text: string) => void
  onSend: (text: string) => void
}

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
  /** 打开某条的编辑（底部输入栏）—— 抽屉里的编辑入口，见 NotesPanel */
  onNoteEdit: (note: Note) => void
  /** 当前阅读位置（章号）：两个挂件的"当前条目"都据此滚到正中（2026-09-16 用户定） */
  activeChapter: number
  /** 「看这条笔记」请求（点正文高亮触发）：左侧切到筆記并把这条定位到正中（只读，不改内容） */
  focusNote?: { id: string; tick: number } | null
  /** 右挂件当前内容（2026-09-17）：参数 / 聊天（同一几何，顶部开关切换） */
  rightPanel: RightPanelKind
  onRightPanelChange: (kind: RightPanelKind) => void
  /** 聊天室数据；null = 这本书没有房间会话 → 右段不出现「聊天」页签 */
  chat: RailChatProps | null
}

/** 两格文字开关（左「目錄 / 筆記」与右「參數 / 聊天」共用同一形态与类名） */
function RailTabs<T extends string>({
  items,
  active,
  onPick
}: {
  items: Array<{ kind: T; label: string; title: string }>
  active: T
  onPick: (kind: T) => void
}): React.JSX.Element {
  return (
    <div className="rail-tabs">
      {items.map((it) => (
        <button
          key={it.kind}
          className={`rail-tabs__tab${active === it.kind ? ' rail-tabs__tab--on' : ''}`}
          onClick={() => onPick(it.kind)}
          title={it.title}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
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
  onNoteEdit,
  activeChapter,
  focusNote,
  rightPanel,
  onRightPanelChange,
  chat
}: ReaderRailProps): React.JSX.Element {
  /**
   * 左挂件顶部的内容开关（目錄 / 筆記）。两格**都是文字**（§5.1），当前格用 `--accent` ——
   * 与全站"当前选中 = 强调色"同一语汇。笔记数并入标签，省一行状态。
   */
  const leftTabs = (
    <RailTabs
      items={[
        { kind: 'toc', label: '目錄', title: '目錄' },
        { kind: 'notes', label: `筆記${notes.length > 0 ? ` ${notes.length}` : ''}`, title: '筆記' }
      ]}
      active={leftPanel}
      onPick={onLeftPanelChange}
    />
  )

  /**
   * 右挂件顶部的内容开关（參數 / 聊天）—— **只有房间会话里的那本书才有第二格**
   * （用户 2026-09-17："沒有通過房間進入一本書就不會有這個項"）。
   */
  const rightTabs = chat ? (
    <RailTabs
      items={[
        { kind: 'params', label: '參數', title: '閱讀參數' },
        { kind: 'chat', label: '聊天', title: `房間 ${chat.roomId}` }
      ]}
      active={rightPanel}
      onPick={onRightPanelChange}
    />
  ) : null

  const showChat = Boolean(chat) && rightPanel === 'chat'

  return (
    <>
      {/* 横向挂载线：左段（目录）+ 中段（纯线）+ 右段（参数/聊天），三段拼出整页宽的一条线。
          ⚠ 两段**等宽**且各贴线的一端 → 关于线中心镜像（线本身 = --sidebar-w → 窗口右缘） */}
      <div className="reader-rail">
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
          aria-label={controlsOpen ? '收起右欄' : showChat ? '聊天' : '閱讀參數'}
          aria-expanded={controlsOpen}
          title={controlsOpen ? '收起右欄' : showChat ? '聊天' : '閱讀參數'}
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
            onEdit={onNoteEdit}
            onToggle={onTocToggle}
            activeChapter={activeChapter}
            focusNote={focusNote}
          />
        ))}

      {/* 右挂件：参数 / 聊天（挂在线下方右侧；折叠 = 向上收回线里，面板底部「折疊」同目录） */}
      {controlsOpen &&
        (showChat && chat ? (
          <ChatPanel
            messages={chat.messages}
            roomId={chat.roomId}
            header={rightTabs}
            onSend={chat.onSend}
            onToggle={onControlsToggle}
            draft={chat.draft}
            onDraftChange={chat.onDraftChange}
          />
        ) : (
          <ReaderControls
            params={params}
            onChange={onParamsChange}
            onToggle={onControlsToggle}
            header={rightTabs}
          />
        ))}
    </>
  )
}
