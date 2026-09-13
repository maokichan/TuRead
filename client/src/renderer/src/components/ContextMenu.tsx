import { useEffect, useRef } from 'react'

interface ContextMenuProps {
  x: number
  y: number
  items: Array<{ label: string; onClick: () => void }>
  onClose: () => void
}

/**
 * 右键菜单（浮层，STYLE.md §5.2 例外③）：定位在光标处，点击项后自动关闭。
 * 关闭路径：外点 / Esc / 滚动 / 点击任意项。定位用 fixed + 光标坐标（不做碰撞翻转，
 * 目前只有短菜单，够用；将来菜单项变多再补边界翻转）。
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent): void => {
      if (!boxRef.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    const onScroll = (): void => onClose()
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [onClose])

  return (
    <div
      ref={boxRef}
      role="menu"
      className="fixed z-50 flex w-44 flex-col items-start gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2.5 shadow-lg"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it) => (
        <button
          key={it.label}
          role="menuitem"
          onClick={() => {
            onClose()
            it.onClick()
          }}
          className="block w-full text-left text-[13px] text-[var(--muted)] hover:text-[var(--text)]"
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}
