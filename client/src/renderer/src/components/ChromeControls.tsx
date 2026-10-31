/**
 * ChromeControls —— chrome 底面全局件（批1.7，docs/DIRECTION.md §2 / STYLE.md §1.1）。
 *
 * 背景融为连续底面后，全局件都悬浮在 --inset-top 顶条带里（z = --z-chrome，
 * 压在卡片之上但让位给一切浮层）：
 * - 左上 = 书库层级后退/前进 + **阅读标签条**（批1.10）：同一个左侧容器，前后退只服务书库
 *   （阅读态隐藏——历史栈不属于阅读），标签条全功能态可见（阅读会话的"在场"，见 ReaderTabStrip）。
 * - 右上 = 窗口控制键：最小化 / 最大化(还原) / 关闭。OS 全屏时保持可见（语义不变，
 *   原自绘标题栏"全屏收起"的布局逻辑随 TitleBar 退役）。
 *
 * 主题兼容：颜色全走 token（无 hex）；控制键 hover = --panel-2，关闭 hover = --err 负片。
 * 桥的使用：`window.turead` 在此直接使用是**文档化的例外**（窗口镶边属于 Shell，
 * 不是功能组件能力）。no-drag 由 styles.css `.chrome-base button` 全局给出，点击不被拖拽区吞掉。
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { IPC } from '@shared/ipc'
import { libraryNavBus } from '../features/libraryNavBus'
import { ReaderTabStrip, type ReaderTabItem } from './ReaderTabStrip'

export function ChromeControls({
  activeFeature,
  readerTabs,
  activeTabId,
  onTabActivate,
  onTabClose
}: {
  activeFeature: string
  readerTabs: ReaderTabItem[]
  activeTabId: string | null
  onTabActivate: (editionId: string) => void
  onTabClose: (editionId: string) => void
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
  const navState = useSyncExternalStore(libraryNavBus.subscribe, libraryNavBus.getState)

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

  return (
    <>
      {/* 左上：后退/前进（书库态）+ 阅读标签条（全态）共一个容器；右缘让位窗控（3 × w-11）。
          空隙处是窗口拖拽区（.chrome-base 默认），按钮经 `.chrome-base button` 豁免。 */}
      <div
        className="absolute top-0 z-[var(--z-chrome)] flex items-stretch overflow-hidden"
        style={{ left: 'var(--sidebar-w)', right: '132px', height: 'var(--inset-top)' }}
      >
        {activeFeature === 'library' && (
          <>
            <button
              aria-label="後退"
              title="後退"
              onClick={() => libraryNavBus.back()}
              disabled={!navState.canBack}
              className="flex w-11 items-center justify-center text-[var(--muted)] transition-colors duration-[var(--dur-hover)] hover:bg-[var(--panel-2)] hover:text-[var(--text)] disabled:opacity-[var(--disabled-opacity)] disabled:hover:bg-transparent disabled:hover:text-[var(--muted)]"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                <path d="M8 1.5L3.5 6L8 10.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
            <button
              aria-label="前進"
              title="前進"
              onClick={() => libraryNavBus.forward()}
              disabled={!navState.canForward}
              className="flex w-11 items-center justify-center text-[var(--muted)] transition-colors duration-[var(--dur-hover)] hover:bg-[var(--panel-2)] hover:text-[var(--text)] disabled:opacity-[var(--disabled-opacity)] disabled:hover:bg-transparent disabled:hover:text-[var(--muted)]"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                <path d="M4 1.5L8.5 6L4 10.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          </>
        )}
        {readerTabs.length > 0 && (
          <ReaderTabStrip
            tabs={readerTabs}
            activeId={activeTabId}
            onActivate={onTabActivate}
            onClose={onTabClose}
          />
        )}
      </div>

      {/* 右上：窗口控制键 */}
      <div
        className="absolute top-0 right-0 z-[var(--z-chrome)] flex items-stretch"
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
