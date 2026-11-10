/**
 * ChromeControls —— chrome 底面全局件（批1.7，docs/DIRECTION.md §2 / STYLE.md §1.1）。
 *
 * 背景融为连续底面后，全局件都悬浮在 --inset-top 顶条带里（z = --z-chrome，
 * 压在卡片之上但让位给一切浮层）：
 * - 左上 = 书库层级后退/前进 + **全局搜索框**（批1.11 上底板 / 批1.12 定位左簇）共一个容器。
 *   后退/前进**恒在**（批1.11 用户定：全局生命周期——职能按域分流，不随状态消失）：
 *   书库域 = 层级历史（libraryNavBus）；其余域尚无历史机构（阅读跳转历史 / 房间域返回见 TODO）
 *   → 恒禁用。搜索框同理恒在：绑定随激活域走（chromeSearchBus），无绑定的域 = 禁用 + 域占位。
 *   **阅读标签条（批1.10 顶栏形态）已退役（2026-11-03 用户定）**：标签迁入左侧栏（TagRail，
 *   功能组件之下、分界线之下），顶栏恢复仅窗控（TODO「标签条形态重设计」既定落点）。
 * - 右上 = 窗口控制键：最小化 / 最大化(还原) / 关闭。OS 全屏时保持可见（语义不变，
 *   原自绘标题栏"全屏收起"的布局逻辑随 TitleBar 退役）。
 *
 * 主题兼容：颜色全走 token（无 hex）；控制键 hover = --panel-2，关闭 hover = --err 负片。
 * 桥的使用：`window.turead` 在此直接使用是**文档化的例外**（窗口镶边属于 Shell，
 * 不是功能组件能力）。本组件两段条带挂窗口拖拽身份（styles.css `.chrome-topbar`），
 * 按钮/输入经 `.chrome-topbar button/input` 豁免 no-drag。
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { IPC } from '@shared/ipc'
import { libraryNavBus } from '../features/libraryNavBus'
import { notesNavBus } from '../features/notesNavBus'
import { chromeSearchBus } from '../features/chromeSearchBus'

/** 无绑定域的占位文案（承自退役 TitleBar 的作用域表；阅读器/房间接线见 TODO「全局搜索接线」。
    不写"未接线"之类的工程腔——禁用态本身已经说明不可用，占位只说这个域搜什么） */
const SCOPE_PLACEHOLDER: Record<string, string> = {
  reader: '搜索本書…',
  room: '搜索房間…',
  settings: '搜索…'
}

export function ChromeControls({
  activeFeature,
  searchInputRef
}: {
  activeFeature: string
  searchInputRef: React.RefObject<HTMLInputElement | null>
}): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)

  // 最大化状态跟随（main 在 maximize/unmaximize 时广播）
  useEffect(() => {
    const off = window.turead.subscribe(IPC.winMaximizedChanged, (payload) => {
      setMaximized(payload === true)
    })
    return off
  }, [])

  // 书库层级后退/前进（2026-09-13 用户定，资源管理器逻辑）：状态（可否后退/前进）用外部 store 订阅
  const libNav = useSyncExternalStore(libraryNavBus.subscribe, libraryNavBus.getState)
  const notesNav = useSyncExternalStore(notesNavBus.subscribe, notesNavBus.getState)
  // 后退/前进按激活域分流（书库 = 层级历史；笔记 = 视图历史[详情轴/文档]；
  // 其余域暂无历史机构 → 按钮禁用——总线不能漏到非激活域，否则是在暗处导航）
  const navState = activeFeature === 'notes' ? notesNav : activeFeature === 'library' ? libNav : null
  const navBus = activeFeature === 'notes' ? notesNavBus : libraryNavBus
  // 全局搜索绑定（批1.11）：激活域有注册 = 可输入；否则禁用 + 域占位
  const searchBinding = useSyncExternalStore(chromeSearchBus.subscribe, chromeSearchBus.getState)

  const control = (
    label: string,
    onClick: () => void,
    glyph: React.JSX.Element,
    danger = false
  ): React.JSX.Element => (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-full w-11 items-center justify-center text-[var(--muted)] transition-colors duration-[var(--dur-hover)] hover:bg-[var(--panel-2)] hover:text-[var(--text)] ${
        danger ? 'hover:bg-[var(--err)] hover:text-[var(--negative-text)]' : ''
      }`}
    >
      {glyph}
    </button>
  )

  const navButton = (
    label: '後退' | '前進',
    onClick: () => void,
    can: boolean,
    glyph: React.JSX.Element
  ): React.JSX.Element => (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={!can}
      className="flex w-11 items-center justify-center text-[var(--muted)] transition-colors duration-[var(--dur-hover)] hover:bg-[var(--panel-2)] hover:text-[var(--text)] disabled:opacity-[var(--disabled-opacity)] disabled:hover:bg-transparent disabled:hover:text-[var(--muted)]"
    >
      {glyph}
    </button>
  )

  return (
    <>
      {/* 左上：后退/前进（恒在，职能按域分流）+ 全局搜索框（批1.12 定位：**左簇固定**，
          紧跟导航键）。原右邻的阅读标签条已退役迁入侧栏（TagRail）；右缘让位窗控（3 × w-11）。
          本条带 = 窗口拖拽区（chrome-topbar，逻辑顶条带独占拖拽身份——底板不拖、右键不弹
          原生系统菜单，用户定）；按钮/输入 no-drag 豁免。 */}
      <div
        className="chrome-topbar absolute top-0 z-[var(--z-chrome)] flex items-stretch overflow-hidden"
        style={{ left: 'var(--sidebar-w)', right: '132px', height: 'var(--inset-top)' }}
      >
        {navButton(
          '後退',
          () => navBus.back(),
          navState !== null && navState.canBack,
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M8 1.5L3.5 6L8 10.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        )}
        {navButton(
          '前進',
          () => navBus.forward(),
          navState !== null && navState.canForward,
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M4 1.5L8.5 6L4 10.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        )}
        {/* 全局搜索框（批1.11 搜索回底板；批1.12 移左簇）：恒在；激活域的绑定经 chromeSearchBus 注入。
            视觉承自退役 TitleBar 的搜索栏（h-7 / --radius-control / 1px 边 / 居中占位）。 */}
        <div className="flex flex-none items-center px-1.5">
          <input
            ref={searchInputRef}
            value={searchBinding?.value ?? ''}
            onChange={(e) => searchBinding?.onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                searchBinding?.onChange('')
                searchInputRef.current?.blur()
              }
            }}
            placeholder={searchBinding?.placeholder ?? SCOPE_PLACEHOLDER[activeFeature] ?? '搜索…'}
            aria-label="全局搜索"
            disabled={!searchBinding}
            className="h-7 w-[240px] rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg)] px-2.5 text-center text-[13px] text-[var(--text)] outline-none transition-colors duration-[var(--dur-hover)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:text-left disabled:opacity-[var(--disabled-opacity)]"
          />
        </div>
      </div>

      {/* 右上：窗口控制键（同属逻辑顶条带，挂拖拽身份；按钮本身 no-drag） */}
      <div
        className="chrome-topbar absolute top-0 right-0 z-[var(--z-chrome)] flex items-stretch"
        style={{ height: 'var(--inset-top)' }}
      >
        {control(
          '最小化',
          () => void window.turead.invoke(IPC.winMinimize),
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
          </svg>
        )}
        {control(
          maximized ? '還原' : '最大化',
          () => void window.turead.invoke(IPC.winMaximizeToggle),
          maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path d="M2.5 2.5V0.5h7v7h-2" fill="none" stroke="currentColor" strokeWidth="1" />
              <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          )
        )}
        {control(
          '關閉',
          () => void window.turead.invoke(IPC.winClose),
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
          </svg>,
          true
        )}
      </div>
    </>
  )
}
