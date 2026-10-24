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
 *
 * ⚠ **v1.13：右段开放插件面板格**（契约 = CONTRACTS §9，功能 = FEATURES §13）——
 * 渲染权在宿主：插件只注册"一个格"（label + mount），几何/页签/开合/滚动外壳全部在这里给
 * （复用 `.reader-controls` 同一几何 token）；页签序 = 參數 → 聊天（仅房间态）→ 插件格（按注册序）。
 * AI 共读插件落地时「問」与「聊天」互斥（用户已定），其他插件格不受影响。
 */
import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, Note } from '@core/domain/types'
import type { PluginReaderContext } from '@shared/plugin'
import type { TocRow } from './TocPanel'
import { paintGlow } from './veil'
import { TocPanel } from './TocPanel'
import { NotesPanel } from './NotesPanel'
import { ChatPanel } from './ChatPanel'
import { ReaderControls, type ReaderParams } from './ReaderControls'

/** 左挂件的内容形态（2026-09-14）：同一位置、同一几何，只换内容 */
export type LeftPanelKind = 'toc' | 'notes'
/** 右挂件的内容形态（2026-09-17；v1.13 起含插件格）：同一几何，只换内容 */
export type RightPanelKind = 'params' | 'chat' | `plugin:${string}`

/** 右挂件的聊天数据（null = 这本书不是经房间进来的 → 没有聊天室这一项） */
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
  /** 右挂件当前内容（2026-09-17；v1.13 起可为插件格）：参数 / 聊天 / `plugin:<key>` */
  rightPanel: RightPanelKind
  onRightPanelChange: (kind: RightPanelKind) => void
  /** 聊天室数据；null = 这本书没有房间会话 → 右段不出现「聊天」页签 */
  chat: RailChatProps | null
  /** 当前书是否 PDF：参数面板「紙寬」行换用 PDF 专属档位（2026-10-02） */
  isPdf?: boolean
  /** 已启用的插件面板格（v1.13；页签追加在參數/聊天之后，按注册序） */
  pluginPanels?: RailPluginPanel[]
  /** 阅读上下文句柄（v1.1）：传给插件格的 mount ctx.reader（书未打开时为空） */
  readerContext?: PluginReaderContext
}

/** 垂挂揭幕的卸载延迟：与 styles.css 的收回时长（`--dur-hover` = 160ms）同步，稍留余量 */
const HANG_EXIT_MS = 180

/** 挂载线灯光的目标段（veil.ts paintGlow 的选择器：三段一起呼吸） */
const RAIL_GLOW_SELECTOR = '.reader-rail__zone, .reader-rail__span'

/**
 * 垂挂揭幕的开合状态机（v1.14，STYLE.md §5.8）：`open=false` 时**先播收回**
 * （data-closing → clip 向上收回线里，160ms），收完才真正卸载 —— 抽屉的进出都是
 * "从线上长出来 / 缩回线里"。CSS（.rail-hang 的 transition + @starting-style）管动画，
 * 这里只管"什么时候允许卸载"。
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

/**
 * 插件面板的挂载宿主：给插件一个内容区元素，**外壳（几何/滚动）归这里**。
 * 生命周期 = 绑定即挂载、卸载/换格即清理（cleanup + AbortSignal）——
 * 插件的定时器/订阅据此自清，不靠插件自觉。
 */
function RailPluginMount({
  panel,
  header,
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
      {header}
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
  chat,
  isPdf,
  pluginPanels = [],
  readerContext
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
   * 右挂件顶部的内容开关 —— **格数随内容走**（v1.13）：
   * 參數恒在；聊天只有房间会话里的那本书才有（用户 2026-09-17）；插件格按注册序追加。
   * 只有一种内容时不渲染页签行（与 v1.10 之前的形态一致）。
   */
  const rightItems: Array<{ kind: RightPanelKind; label: string; title: string }> = [
    { kind: 'params', label: '參數', title: '閱讀參數' }
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

  // 垂挂揭幕（v1.14）：左右抽屉各自持"收回中"状态，收回播完才卸载
  const leftHang = useHangingPanel(tocOpen)
  const rightHang = useHangingPanel(controlsOpen)

  // 灯的法则（§5.8 v1.14）：光标即光源 —— 挂载线三段随光标距离连续呼吸。
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

  // 挂载线右段把手的提示文字 = 当前内容（与左段同口径）
  const rightZoneTitle = controlsOpen ? '收起右欄' : showChat ? '聊天' : (activePlugin?.title ?? '閱讀參數')

  return (
    <>
      {/* 横向挂载线：左段（目录）+ 中段（纯线）+ 右段（参数/聊天/插件格），三段拼出整页宽的一条线。
          ⚠ 两段**等宽**且各贴线的一端 → 关于线中心镜像（线本身 = --sidebar-w → 窗口右缘） */}
      <div className="reader-rail" ref={railRef}>
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
          aria-label={rightZoneTitle}
          aria-expanded={controlsOpen}
          title={rightZoneTitle}
          onClick={onControlsToggle}
        />
      </div>

      {/* 左挂件：目录 / 笔记（同一几何，顶部开关切换）。无目录索引的书也垂挂占位说明
          （2026-09-13 用户定："本书没有目录索引"要可见，不静默消失）。
          .rail-hang = 垂挂揭幕包装层（自挂载线向下揭开，收回播完才卸载，v1.14） */}
      {leftHang.mounted && (
        <div className="rail-hang" data-closing={leftHang.closing || undefined} aria-hidden={leftHang.closing || undefined}>
          {leftPanel === 'toc' ? (
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
          )}
        </div>
      )}

      {/* 右挂件：參數 / 聊天 / 插件格（挂在线下方右侧；折叠 = 向上收回线里，面板底部「折疊」同目录）。
          ⚠ 插件格的指向失效（插件被禁用/重载后 key 不在了）→ 回落參數（不能空白） */}
      {rightHang.mounted && (
        <div className="rail-hang" data-closing={rightHang.closing || undefined} aria-hidden={rightHang.closing || undefined}>
          {showChat && chat ? (
            <ChatPanel
              messages={chat.messages}
              roomId={chat.roomId}
              header={rightTabs}
              onSend={chat.onSend}
              onToggle={onControlsToggle}
              draft={chat.draft}
              onDraftChange={chat.onDraftChange}
              following={chat.following}
              onToggleFollow={chat.onToggleFollow}
            />
          ) : activePlugin ? (
            <RailPluginMount panel={activePlugin} header={rightTabs} onToggle={onControlsToggle} reader={readerContext} />
          ) : (
            <ReaderControls
              params={params}
              onChange={onParamsChange}
              onToggle={onControlsToggle}
              header={rightTabs}
              isPdf={isPdf}
            />
          )}
        </div>
      )}
    </>
  )
}
