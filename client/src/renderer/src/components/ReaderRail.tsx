/**
 * ReaderRail —— 阅读器的左缘内嵌目录 + 右欄卡片页。
 *
 * **左段**：目录是**内嵌**在阅读卡内部左缘的**低注意力内嵌件**（TocPanel：
 * 头部处于阅读器半高、压印字、字色按距离显影）；开合只归 `t`（强隐藏）。
 *
 * **右段**：卡片页**不是阅读卡内的浮层** —— 它是阅读卡的**兄弟卡**，
 * 与阅读器界面**平级**、同样**置于底板之上**。
 * 宿主在 AppShell 卡片区（`readerCardBus.getView` 驱动布局：阅读卡收窄、右槽位让出），
 * 本组件经 **portal** 把卡片内容送进槽位（数据/状态仍归 ReaderFeature）：
 * - 页族 = 參數 / 筆記 / 聊天（仅房间）/ 插件格——卡片顶部页签切换（单槽位换内容）；
 * - 召唤 = 右上角「卡」按钮 / `p` / `c` / 命令面板（readerCardBus 登记）；
 * - 动画 = 自右滑入 + 显影（.rail-card 的 @starting-style），收回更快，收完卸载；
 *   槽位宽度同节奏收放（styles.css .reader-card-slot 与 .reader-scrim 的单驱动 --slot-w）。
 *
 * ⚠ **右段开放插件面板格**（契约 = client/plugins/PLUGINS.md）——
 * 渲染权在宿主：插件只注册"一个格"（label + mount），几何/页签/开合/滚动外壳全部在这里给；
 * 页签序 = 參數 → 筆記 → 聊天（仅房间态）→ 插件格（按注册序）。
 * 「問」类 AI 格与「聊天」互斥（hideWhenInRoom），其他插件格不受影响。
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ChatMessage, Note } from '@core/domain/types'
import type { PluginReaderContext } from '@shared/plugin'
import type { TocRow } from './TocPanel'
import { TocPanel } from './TocPanel'
import { NotesPanel } from './NotesPanel'
import { ChatPanel } from './ChatPanel'
import { ReaderControls, type ReaderParams } from './ReaderControls'

/**
 * 右欄卡片页的内容形态：同一槽位，页签切换（筆記/聊天/插件格与參數同归属）。
 */
export type CardPageKind = 'params' | 'notes' | 'chat' | `plugin:${string}`

/** 右欄卡片页的聊天数据（null = 这本书不是经房间进来的 → 没有聊天室这一项） */
export interface RailChatProps {
  roomId: string
  messages: ChatMessage[]
  draft: string
  onDraftChange: (text: string) => void
  onSend: (text: string) => void
  /** 跟随模式（v0.4.9）：开 → 其他成员翻页时本端跟到同一位置（开关在聊天格头部） */
  following: boolean
  onToggleFollow: () => void
}

/** 插件面板格（由插件运行时注册，经 ReaderFeature 传入；结构契约 = PLUGINS.md §3 + v1.1） */export interface RailPluginPanel {
  key: `plugin:${string}`
  label: string
  title?: string
  /** true = 进房间时让位（该格被房间聊天占用；AI 的「問」用，時鐘不设） */
  hideWhenInRoom?: boolean
  mount: (el: HTMLElement, ctx: { signal: AbortSignal; reader?: PluginReaderContext }) => void | (() => void)
}

interface ReaderRailProps {
  tocOpen: boolean
  onTocToggle: () => void
  tocRows: TocRow[]
  onTocJump: (row: TocRow) => void
  /** 右欄卡片页开合（单槽位；「卡」按钮 / `p` / `c` / 命令面板都能拨它） */
  controlsOpen: boolean
  onControlsToggle: () => void
  params: ReaderParams
  onParamsChange: (patch: Partial<ReaderParams>) => void
  notes: Note[]
  onNoteJump: (note: Note) => void
  onNoteRemove: (note: Note) => void
  /** 打开某条的编辑（底部输入栏）—— 卡片页里的编辑入口，见 NotesPanel */
  onNoteEdit: (note: Note) => void
  /** 当前阅读位置（章号）：目录/笔记的"当前条目"都据此滚到正中 */
  activeChapter: number
  /** 「看这条笔记」请求（点正文高亮触发）：右欄切到筆記卡并把这条定位到正中（只读，不改内容） */
  focusNote?: { id: string; tick: number } | null
  /** 右欄卡片页当前内容：參數 / 筆記 / 聊天 / `plugin:<key>` */
  rightPanel: CardPageKind
  onRightPanelChange: (kind: CardPageKind) => void
  /** 聊天室数据；null = 这本书没有房间会话 → 卡片页族不出现「聊天」页签 */
  chat: RailChatProps | null
  /** 当前书是否 PDF：参数面板「紙寬」行换用 PDF 专属档位 */
  isPdf?: boolean
  /** 已启用的插件面板格（页签追加在參數/筆記/聊天之后，按注册序） */
  pluginPanels?: RailPluginPanel[]
  /** 阅读上下文句柄：传给插件格的 mount ctx.reader（书未打开时为空） */
  readerContext?: PluginReaderContext
  /** 卡片页的槽位元素（AppShell 卡片区里的兄弟槽，portal 目标；null = 槽未就绪不渲染卡） */
  cardSlot?: HTMLElement | null
}

/** 卡片页收回的卸载延迟：与 styles.css 的收回时长（`--dur-hover` = 160ms）同步，稍留余量 */
const HANG_EXIT_MS = 180

/**
 * 开合的卸载状态机：`open=false` 时**先播收回**
 * （data-closing → 滑出/收拢，160ms），收完才真正卸载。CSS 管动画，这里只管
 * "什么时候允许卸载"。（左内嵌目录 = 显影淡入；右卡片页 = 从右滑出，同一状态机。）
 */
function useHangingPanel(open: boolean): { mounted: boolean; closing: boolean } {
  const [state, setState] = useState({ mounted: open, closing: false })
  useEffect(() => {
    if (open) {
      setState({ mounted: true, closing: false })
      return
    }
    setState((s) => (s.mounted ? { mounted: true, closing: true } : s))
    const t = window.setTimeout(() => setState({ mounted: false, closing: false }), HANG_EXIT_MS)
    return () => window.clearTimeout(t)
  }, [open])
  return state
}

/** 两格以上文字页签（卡片页顶部：參數/筆記/聊天/插件格共用同一形态与类名） */
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

/**
 * 插件面板的挂载宿主：给插件一个内容区元素，**外壳（几何/滚动）归这里**。
 * 生命周期 = 绑定即挂载、卸载/换格即清理（cleanup + AbortSignal）——
 * 插件的定时器/订阅据此自清，不靠插件自觉。
 */
function RailPluginMount({ panel, reader }: { panel: RailPluginPanel; reader?: PluginReaderContext }): React.JSX.Element {
  const bodyRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const controller = new AbortController()
    const cleanup = panel.mount(el, { signal: controller.signal, reader })
    return () => {
      controller.abort()
      if (typeof cleanup === 'function') cleanup()
      el.textContent = ''
    }
  }, [panel, reader])
  return (
    <div className="reader-controls">
      <div className="reader-controls__body">
        <div className="plugin-panel__content" ref={bodyRef} />
      </div>
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
  notes,
  onNoteJump,
  onNoteRemove,
  onNoteEdit,
  activeChapter,
  focusNote,
  rightPanel,
  onRightPanelChange,
  chat,
  isPdf,
  pluginPanels = [],
  readerContext,
  cardSlot = null
}: ReaderRailProps): React.JSX.Element {
  /**
   * 右欄卡片页的页签 —— **格数随内容走**：
   * 參數、筆記恒在；聊天只有房间会话里的那本书才有；插件格按注册序追加。
   */
  const rightItems: Array<{ kind: CardPageKind; label: string; title: string }> = [
    { kind: 'params', label: '參數', title: '閱讀參數' },
    { kind: 'notes', label: `筆記${notes.length > 0 ? ` ${notes.length}` : ''}`, title: '筆記' }
  ]
  if (chat) rightItems.push({ kind: 'chat', label: '聊天', title: `房間 ${chat.roomId}` })
  // 插件格：hideWhenInRoom 的（如 AI 的「問」）在房间态让位给聊天（互斥契约）
  const visiblePluginPanels = pluginPanels.filter((p) => !(p.hideWhenInRoom && chat))
  for (const p of visiblePluginPanels) {
    rightItems.push({ kind: p.key, label: p.label, title: p.title ?? p.label })
  }
  const rightTabs = rightItems.length > 1 ? <RailTabs items={rightItems} active={rightPanel} onPick={onRightPanelChange} /> : null

  const showChat = Boolean(chat) && rightPanel === 'chat'
  const activePlugin = visiblePluginPanels.find((p) => p.key === rightPanel)

  // 开合状态机：左内嵌目录与右卡片页各自持"收回中"状态，收回播完才卸载
  const leftHang = useHangingPanel(tocOpen)
  const rightCard = useHangingPanel(controlsOpen)

  return (
    <>
      {/* 阅读侧「卡」按钮：阅读界面右上角，压印字与目录同一语汇，
          单点呼出卡片页（键盘 ` / p / c 仍是加速器）；卡展开时让位给卡侧那颗，避免双按钮 */}
      <button
        className="card-corner"
        aria-label="呼出卡片頁"
        title="呼出卡片頁"
        onClick={onControlsToggle}
        style={controlsOpen ? { visibility: 'hidden' } : undefined}
      >
        卡
      </button>

      {/* 左内嵌目录：目录**内嵌**在阅读卡内部左缘
          （压印字 + 字色按距离显影，几何归 styles.css .toc-list）。无目录索引的书也占位说明
          （"本书没有目录索引"要可见，不静默消失）。
          .rail-hang = 收合包装层（显影淡入，收回播完才卸载） */}
      {leftHang.mounted && (
        <div className="rail-hang" data-closing={leftHang.closing || undefined} aria-hidden={leftHang.closing || undefined}>
          <TocPanel rows={tocRows} onJump={onTocJump} activeChapter={activeChapter} />
        </div>
      )}

      {/* 右欄卡片页：单槽位，页签切内容（參數/筆記/聊天/插件格）。
          卡片经 portal 住进 AppShell 卡片区的**兄弟槽位**（与阅读卡平级、同置底板之上）——
          数据/状态仍归本组件，宿主只是换了个渲染落点。
          ⚠ 插件格的指向失效（插件被禁用/重载后 key 不在了）→ 回落參數（不能空白） */}
      {cardSlot &&
        rightCard.mounted &&
        createPortal(
          <div
            className="rail-card"
            data-closing={rightCard.closing || undefined}
            aria-hidden={rightCard.closing || undefined}
          >
            {/* 卡侧「卡」按钮：页签行之下、右上角，点击缩回 —— 与阅读侧同一颗 */}
            <button
              className="card-corner card-corner--oncard"
              aria-label="收起卡片頁"
              title="收起卡片頁"
              onClick={onControlsToggle}
            >
              卡
            </button>
            {rightTabs}
            {showChat && chat ? (
              <ChatPanel
                messages={chat.messages}
                roomId={chat.roomId}
                onSend={chat.onSend}
                draft={chat.draft}
                onDraftChange={chat.onDraftChange}
                following={chat.following}
                onToggleFollow={chat.onToggleFollow}
              />
            ) : activePlugin ? (
              <RailPluginMount panel={activePlugin} reader={readerContext} />
            ) : rightPanel === 'notes' ? (
              <NotesPanel
                notes={notes}
                onJump={onNoteJump}
                onRemove={onNoteRemove}
                onEdit={onNoteEdit}
                activeChapter={activeChapter}
                focusNote={focusNote}
              />
            ) : (
              <ReaderControls params={params} onChange={onParamsChange} isPdf={isPdf} />
            )}
          </div>,
          cardSlot
        )}
    </>
  )
}
