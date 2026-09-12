/**
 * 自绘标题栏（无边框窗口，2026-09-12 用户定：不再使用系统窗口控制键）。
 *
 * 结构：整条 = 拖拽区（-webkit-app-region: drag，双击最大化由系统处理）；
 * 左 = 应用名（衬线小字）；中 = **书库搜索栏**（只在书库功能内渲染——阅读态零控件、
 * 其他功能无书可搜）；右 = 最小化/最大化(还原)/关闭三个控制键。
 *
 * 主题兼容：颜色全部走 token（无 hex）；控制键 hover = --panel-2，关闭 hover = --err 负片。
 * 桥的使用：`window.turead` 在此直接使用是**文档化的例外**（窗口镶边属于 Shell，
 * 不是功能组件能力；与 dev/selfCheck 的 devBook 同级）。
 */
import { useEffect, useRef, useState } from 'react'
import { IPC } from '@shared/ipc'

interface TitleBarProps {
  activeFeature: string
  libraryQuery: string
  onLibraryQueryChange: (q: string) => void
}

export function TitleBar({ activeFeature, libraryQuery, onLibraryQueryChange }: TitleBarProps): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // 最大化状态跟随（main 在 maximize/unmaximize 时广播）
  useEffect(() => {
    const off = window.turead.subscribe(IPC.winMaximizedChanged, (payload) => {
      setMaximized(payload === true)
    })
    return off
  }, [])

  // Ctrl+F 聚焦书库搜索；Esc 清空并移出焦点
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && (e.key === 'f' || e.key === 'F') && activeFeature === 'library') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        onLibraryQueryChange('')
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeFeature, onLibraryQueryChange])

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
      className={`flex h-full w-11 items-center justify-center text-[var(--muted)] transition-colors hover:bg-[var(--panel-2)] hover:text-[var(--text)] ${
        danger ? 'hover:bg-[var(--err)] hover:text-[var(--negative-text)]' : ''
      }`}
    >
      {glyph}
    </button>
  )

  return (
    <header
      className="titlebar flex h-9 flex-none items-stretch border-b border-[var(--border)] bg-[var(--panel)]"
    >
      {/* 左：应用名（拖拽区的一部分，纯文字不拦截） */}
      <div className="flex select-none items-center pl-3 pr-2">
        <span className="text-[13px] tracking-wide text-[var(--muted)]">TuRead</span>
      </div>

      {/* 中：书库搜索栏（只在书库内出现；其余功能态这条留白给拖拽） */}
      {activeFeature === 'library' && (
        <div className="flex min-w-0 flex-1 items-center justify-center px-4">
          <input
            ref={inputRef}
            value={libraryQuery}
            onChange={(e) => onLibraryQueryChange(e.target.value)}
            placeholder="搜索書庫…（標題 / 路徑）　Ctrl+F"
            aria-label="搜索書庫"
            className="h-6 w-[300px] max-w-full rounded-sm border border-[var(--border)] bg-[var(--bg)] px-2 text-[12.5px] text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
          />
        </div>
      )}

      {/* 右：窗口控制键（拖拽区内的交互元素必须 no-drag，见 styles.css .titlebar 规则） */}
      <div className="ml-auto flex items-stretch">
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
    </header>
  )
}
