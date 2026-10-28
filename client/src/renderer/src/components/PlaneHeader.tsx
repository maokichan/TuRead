/**
 * 平面顶行（批1.6 chrome 平面化，STATUS 决策表「平面化 chrome」行）。
 *
 * TitleBar（全局顶栏）随卡片模型退役：窗控是**窗口 chrome**，不属于任何功能，
 * 因此住在**活动平面**的顶缘右角——每平面自带这一行（书库/笔记/房间/设置），
 * 阅读态由卡片自带的淡显窗控承担（`.card-controls`）。整行 = 拖拽区，
 * 内部 button/input = no-drag（styles.css `.plane-header`）。
 */
import { useEffect, useState } from 'react'
import { IPC } from '@shared/ipc'

interface PlaneHeaderProps {
  /** 左槽：平面标题 / 搜索框 / 层级导航（调用方给；留空 = 只剩窗控） */
  children?: React.ReactNode
  /** 附加类（各平面微调间距） */
  className?: string
}

/** 窗控三键（最小化/最大化(还原)/关闭）。PlaneHeader 用整高版；阅读卡的淡显版由
 *  `.card-controls` 外壳包同一组件（批1.6）。window.turead 直用 = 文档化例外（窗口 chrome）。 */
export function WindowControls(): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const off = window.turead.subscribe(IPC.winMaximizedChanged, (payload) => {
      setMaximized(payload === true)
    })
    return off
  }, [])

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
    <div className="window-controls flex h-full flex-none items-stretch">
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
  )
}

export function PlaneHeader({ children, className }: PlaneHeaderProps): React.JSX.Element {
  return (
    <div
      className={`plane-header flex h-11 flex-none items-stretch border-b border-[var(--border)] bg-[var(--panel)] ${
        className ?? ''
      }`}
    >
      {/* 左槽：min-w-0 让搜索框等可收缩；pl-3 与侧边栏字标同一留白 */}
      <div className="flex min-w-0 flex-1 items-center gap-2 pl-3">{children}</div>
      <WindowControls />
    </div>
  )
}
