/**
 * ReaderRail —— 阅读器的挂载线 + 右欄卡片页（挂载线退役第一步，批1.13/1.14 用户定）。
 *
 * **左段（暂留）**：横向挂载线的目录挂载区 —— 目录**向下垂挂**（TocPanel）；
 * 目录折叠时，点线（左段）= 展开目录。目录"仍然有保留在阅读器内的必要"（用户定），
 * 其余内容的归属见下。
 *
 * **右段（批1.14 平级化）**：卡片页**不再是阅读卡内的浮层** —— 它是阅读卡的**兄弟卡**，
 * 与阅读器界面**平级**、同样**置于底板之上**（用户定："参数面板和阅读器一样都是置于底板之上的"）。
 * 宿主在 AppShell 卡片区（`readerCardBus.getView` 驱动布局：阅读卡收窄、右槽位让出），
 * 本组件经 **portal** 把卡片内容送进槽位（数据/状态仍归 ReaderFeature）：
 * - 页族 = 參數 / 筆記 / 聊天（仅房间）/ 插件格（v1.13 起）——卡片顶部页签切换（单槽位换内容）；
 * - 召唤 = 线右段（鼠标）/ `p` / `c` / 命令面板（readerCardBus 登记）；
 * - 动画 = 自右滑入 + 显影（.rail-card 的 @starting-style），收回更快，收完卸载；
 *   槽位宽度同节奏收放（styles.css .reader-card-slot），阅读卡随之让位。
 *
 * ⚠ **2026-09-16（用户定，批1.13 修正）**：~~左右两挂件关于线中心镜像~~ —— 右段已转卡片页，
 * 镜像口径退役（左垂挂仍贴卡缘，宽度 = --rail-panel-w）。
 *
 * ⚠ **v1.13：右段开放插件面板格**（契约 = CONTRACTS §9，功能 = FEATURES §13）——
 * 渲染权在宿主：插件只注册"一个格"（label + mount），几何/页签/开合/滚动外壳全部在这里给；
 * 页签序 = 參數 → 筆記 → 聊天（仅房间态）→ 插件格（按注册序）。
 * AI 共读插件落地时「問」与「聊天」互斥（用户已定），其他插件格不受影响。
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ChatMessage, Note } from '@core/domain/types'
import type { PluginReaderContext } from '@shared/plugin'
import type { TocRow } from './TocPanel'
import { paintGlow } from './veil'
import { TocPanel } from './TocPanel'
import { NotesPanel } from './NotesPanel'
import { ChatPanel } from './ChatPanel'
import { ReaderControls, type ReaderParams } from './ReaderControls'

/**
 * 右欄卡片页的内容形态（批1.13；原 RightPanelKind 扩入 `notes` —— 笔记自左垂挂迁入卡片页族，
 * 用户定"笔记，AI，插件，都可以有同样的归属"）：同一槽位，页签切换。
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

/** 插件面板格（由插件运行时注册，经 ReaderFeature 传入；结构契约 = CONTRACTS §9.2 + v1.1） */
export interface RailPluginPanel {
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
  /** 右欄卡片页开合（单槽位；线右段 / `p` / `c` / 命令面板都能拨它） */
  controlsOpen: boolean
  onControlsToggle: () => void
  params: ReaderParams
  onParamsChange: (patch: Partial<ReaderParams>) => void
  notes: Note[]
  onNoteJump: (note: Note) => void
  onNoteRemove: (note: Note) => void
  /** 打开某条的编辑（底部输入栏）—— 卡片页里的编辑入口，见 NotesPanel */
  onNoteEdit: (note: Note) => void
  /** 当前阅读位置（章号）：目录/笔记的"当前条目"都据此滚到正中（2026-09-16 用户定） */
  activeChapter: number
  /** 「看这条笔记」请求（点正文高亮触发）：右欄切到筆記卡并把这条定位到正中（只读，不改内容） */
  focusNote?: { id: string; tick: number } | null
  /** 右欄卡片页当前内容（批1.13）：參數 / 筆記 / 聊天 / `plugin:<key>` */
  rightPanel: CardPageKind
  onRightPanelChange: (kind: CardPageKind) => void
  /** 聊天室数据；null = 这本书没有房间会话 → 卡片页族不出现「聊天」页签 */
  chat: RailChatProps | null
  /** 当前书是否 PDF：参数面板「紙寬」行换用 PDF 专属档位（2026-10-02） */
  isPdf?: boolean
  /** 已启用的插件面板格（v1.13；页签追加在參數/筆記/聊天之后，按注册序） */
  pluginPanels?: RailPluginPanel[]
  /** 阅读上下文句柄（v1.1）：传给插件格的 mount ctx.reader（书未打开时为空） */
  readerContext?: PluginReaderContext
  /** 卡片页的槽位元素（批1.14 平级化：AppShell 卡片区里的兄弟槽，portal 目标；null = 槽未就绪不渲染卡） */
  cardSlot?: HTMLElement | null
}

/** 卡片页收回的卸载延迟：与 styles.css 的收回时长（`--dur-hover` = 160ms）同步，稍留余量 */
const HANG_EXIT_MS = 180

/** 挂载线灯光的目标段（veil.ts paintGlow 的选择器：线段一起呼吸） */
const RAIL_GLOW_SELECTOR = '.reader-rail__zone, .reader-rail__span'

/**
 * 开合的卸载状态机（v1.14 垂挂揭幕沿用）：`open=false` 时**先播收回**
 * （data-closing → 滑出/收拢，160ms），收完才真正卸载。CSS 管动画，这里只管
 * "什么时候允许卸载"。（左垂挂 = clip 揭幕；右卡片页 = 从右滑出，同一状态机。）
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
function RailPluginMount({
  panel,
  onToggle,
  reader
}: {
  panel: RailPluginPanel
  header: React.JSX.Element | null
  onToggle: () => void
  reader?: PluginReaderContext
}): React.JSX.Element {
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
      <div className="reader-controls__fold">
        <button className="text-action" onClick={onToggle}>
          折疊
        </button>
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
   * 右欄卡片页的页签 —— **格数随内容走**（v1.13）：
   * 參數、筆記恒在；聊天只有房间会话里的那本书才有（用户 2026-09-17）；插件格按注册序追加。
   * （批1.13：筆記自左垂挂迁入卡片页族；左栏只剩目录，不再有页签行。）
   */
  const rightItems: Array<{ kind: CardPageKind; label: string; title: string }> = [
    { kind: 'params', label: '參數', title: '閱讀參數' },
    { kind: 'notes', label: `筆記${notes.length > 0 ? ` ${notes.length}` : ''}`, title: '筆記' }
  ]
  if (chat) rightItems.push({ kind: 'chat', label: '聊天', title: `房間 ${chat.roomId}` })
  // 插件格：hideWhenInRoom 的（如 AI 的「問」）在房间态让位给聊天（用户已定的互斥）
  const visiblePluginPanels = pluginPanels.filter((p) => !(p.hideWhenInRoom && chat))
  for (const p of visiblePluginPanels) {
    rightItems.push({ kind: p.key, label: p.label, title: p.title ?? p.label })
  }
  const rightTabs = rightItems.length > 1 ? <RailTabs items={rightItems} active={rightPanel} onPick={onRightPanelChange} /> : null

  const showChat = Boolean(chat) && rightPanel === 'chat'
  const activePlugin = visiblePluginPanels.find((p) => p.key === rightPanel)

  // 开合状态机：左垂挂与右卡片页各自持"收回中"状态，收回播完才卸载
  const leftHang = useHangingPanel(tocOpen)
  const rightCard = useHangingPanel(controlsOpen)

  // 灯的法则（§5.8 v1.14）：光标即光源 —— 挂载线段随光标距离连续呼吸。
  // ReaderFeature 常驻挂载（其他功能态 display:none）→ 矩形为空时跳过；鼠标离开窗口回静息。
  const railRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const paint = (x: number | null, y: number | null): void => {
      paintGlow(railRef.current, { selector: RAIL_GLOW_SELECTOR, glowVar: '--rail-glow' }, x, y)
    }
    const onMove = (e: MouseEvent): void => {
      const rail = railRef.current
      if (!rail || rail.getClientRects().length === 0) return
      paint(e.clientX, e.clientY)
    }
    const onLeave = (): void => paint(null, null)
    window.addEventListener('mousemove', onMove)
    document.documentElement.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  // 挂载线右段（卡片页召唤位）的提示文字 = 当前内容
  const rightZoneTitle = controlsOpen ? '收起右欄卡片' : (activePlugin?.title ?? (rightPanel === 'chat' && chat ? '聊天' : rightPanel === 'notes' ? '筆記' : '閱讀參數'))

  return (
    <>
      {/* 横向挂载线：左段（目录，暂留）+ 中段（纯线）+ 右段（右欄卡片页召唤位）。
          ⚠ 批1.13 起右段不再是"挂件"而是卡片页的召唤位（卡片内收一道沟，不贴线端），
          镜像口径随右段换形退役（对左段仍然成立：贴卡缘、宽度 = --rail-panel-w） */}
      <div className="reader-rail" ref={railRef}>
        <button
          className="reader-rail__zone reader-rail__zone--toc"
          aria-label={tocOpen ? '收起左欄' : '打開左欄'}
          aria-expanded={tocOpen}
          title={tocOpen ? '收起左欄' : '目錄'}
          onClick={onTocToggle}
        />
        <div className="reader-rail__span" aria-hidden="true" />
        <button
          className="reader-rail__zone reader-rail__zone--params"
          aria-label={rightZoneTitle}
          aria-expanded={controlsOpen}
          title={rightZoneTitle}
          onClick={onControlsToggle}
        />
      </div>

      {/* 左挂件（暂留）：目录垂挂。无目录索引的书也垂挂占位说明
          （2026-09-13 用户定："本书没有目录索引"要可见，不静默消失）。
          .rail-hang = 垂挂揭幕包装层（自挂载线向下揭开，收回播完才卸载，v1.14） */}
      {leftHang.mounted && (
        <div className="rail-hang" data-closing={leftHang.closing || undefined} aria-hidden={leftHang.closing || undefined}>
          <TocPanel
            rows={tocRows}
            onJump={onTocJump}
            onToggle={onTocToggle}
            activeChapter={activeChapter}
          />
        </div>
      )}

      {/* 右欄卡片页（批1.13 立，批1.14 平级化）：单槽位，页签切内容（參數/筆記/聊天/插件格）。
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
            {rightTabs}
            {showChat && chat ? (
              <ChatPanel
                messages={chat.messages}
                roomId={chat.roomId}
                onSend={chat.onSend}
                onToggle={onControlsToggle}
                draft={chat.draft}
                onDraftChange={chat.onDraftChange}
                following={chat.following}
                onToggleFollow={chat.onToggleFollow}
              />
            ) : activePlugin ? (
              <RailPluginMount panel={activePlugin} header={null} onToggle={onControlsToggle} reader={readerContext} />
            ) : rightPanel === 'notes' ? (
              <NotesPanel
                notes={notes}
                onJump={onNoteJump}
                onRemove={onNoteRemove}
                onEdit={onNoteEdit}
                onToggle={onControlsToggle}
                activeChapter={activeChapter}
                focusNote={focusNote}
              />
            ) : (
              <ReaderControls
                params={params}
                onChange={onParamsChange}
                onToggle={onControlsToggle}
                isPdf={isPdf}
              />
            )}
          </div>,
          cardSlot
        )}
    </>
  )
}
