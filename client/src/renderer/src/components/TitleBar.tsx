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
import { useKeyIntents } from './useKeyIntents'

interface TitleBarProps {
  activeFeature: string
  libraryQuery: string
  onLibraryQueryChange: (q: string) => void
}

/** 全局搜索的作用域占位（2026-09-12 用户定：书库搜书 / 阅读器搜书内内容 / 房间搜房间与服务器）。
 *  书库过滤已实装（LibraryFeature）；阅读器=IRenderService.search（返回形状 CONTRACTS §7 待定）、
 *  房间=搜房间列表/服务器书目——两者只有占位与回车事件，后端接线见 TODO「全局搜索接线」。 */
const PLACEHOLDERS: Record<string, string> = {
  library: '搜索書庫…（標題 / 路徑）　Ctrl+F',
  reader: '搜索本書內容…　Ctrl+F（未接線）',
  room: '搜索房間 / 服務器書目…　Ctrl+F（未接線）',
  default: '搜索…'
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

  // Ctrl+F 聚焦搜索——走意图层（app.focusSearch，domain/input.ts）；处理函数内分流：仅书库态。
  // Esc 清空留在输入框自身的 onKeyDown（元素级语义，v2 再入表）
  useKeyIntents('app', {
    'app.focusSearch': () => {
      if (activeFeature !== 'library') return
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  })

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
      className="titlebar relative flex h-11 flex-none items-stretch border-b border-[var(--border)] bg-[var(--panel)]"
    >
      {/* 左：应用名（拖拽区的一部分，纯文字不拦截） */}
      <div className="flex select-none items-center pl-3 pr-2">
        <span className="text-[13px] tracking-wide text-[var(--muted)]">TuRead</span>
      </div>

      {/* 中：全局搜索栏（2026-09-12 用户定：搜索按功能域分作用域）。
          **绝对定位到整条标题栏的几何中心**——flex 流里左右两段宽度不等会把"居中"挤歪。 */}
      <div className="pointer-events-none absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center">
        <input
          key={activeFeature}
          ref={inputRef}
          value={activeFeature === 'library' ? libraryQuery : undefined}
          onChange={(e) => onLibraryQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onLibraryQueryChange('')
              inputRef.current?.blur()
            }
          }}
          placeholder={PLACEHOLDERS[activeFeature] ?? PLACEHOLDERS.default}
          aria-label={PLACEHOLDERS[activeFeature] ?? PLACEHOLDERS.default}
          className="titlebar-search h-6 w-[300px] max-w-[40vw] rounded-sm border border-[var(--border)] bg-[var(--bg)] px-2 text-center text-[12.5px] text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:text-left"
        />
      </div>

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
