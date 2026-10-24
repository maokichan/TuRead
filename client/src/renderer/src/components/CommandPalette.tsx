/**
 * 命令面板（2026-10-24 用户定，`Ctrl+Shift+P` 呼出，FEATURES.md §14）——
 * VSCode 式的全局动作入口：**非模态**顶部浮层，输入即筛、↑↓ 选择、Enter 执行、Esc 关闭、外点关闭。
 *
 * 设计口径（STYLE.md）：
 * - 动作区 = 纯色底 `--panel-2` + 1px `--border` + 直角（§5.2 例外⑥：动作区必须自己成一层）；
 * - 行 = 纯文字（P1），选中态 = `--accent` + `--accent-soft` 底（与右键菜单项同一语言）；
 * - **呼出不动画**：键盘起手的工具，动画就是延迟（§2 P5 频率检验）；
 * - 命令 = 纯数据（label + run），检索判据在 `commandFilter.ts`（纯函数 + 单测）。
 *
 * 挂载策略：由 AppShell 条件渲染（`{open && <CommandPalette/>}`）—— 每次呼出都是全新挂载，
 * 查询词不残留（VSCode 同款直觉：呼出即全量列表）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { filterCommands, type PaletteCommand } from './commandFilter'

interface CommandPaletteProps {
  commands: PaletteCommand[]
  onClose: () => void
}

export function CommandPalette({ commands, onClose }: CommandPaletteProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const filtered = useMemo(() => filterCommands(commands, query), [commands, query])

  // 挂载即聚焦（输入即筛）
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 查询变化 → 选中项回到第一条
  useEffect(() => {
    setActive(0)
  }, [query])

  // 键盘选中项滚入视野（不打断列表位置）
  useEffect(() => {
    const el = listRef.current?.querySelectorAll<HTMLElement>('.command-palette__item')[active]
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, filtered.length])

  // 外点关闭（右键菜单同款路径）
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent): void => {
      if (!boxRef.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [onClose])

  const runItem = (cmd: PaletteCommand | undefined): void => {
    if (!cmd) return
    onClose()
    cmd.run()
  }

  const onInputKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runItem(filtered[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div ref={boxRef} className="command-palette" role="dialog" aria-label="命令面板">
      <input
        ref={inputRef}
        className="command-palette__input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onInputKeyDown}
        aria-label="搜尋命令"
      />
      <div className="command-palette__list" ref={listRef} role="listbox">
        {filtered.length === 0 ? (
          <div className="command-palette__empty">沒有符合的指令</div>
        ) : (
          filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              role="option"
              aria-selected={i === active}
              data-active={i === active || undefined}
              className="command-palette__item"
              onMouseEnter={() => setActive(i)}
              onClick={() => runItem(cmd)}
            >
              <span>{cmd.label}</span>
              {cmd.keyLabel && <span className="command-palette__key">{cmd.keyLabel}</span>}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
