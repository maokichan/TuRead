import { useEffect, useRef, useState } from 'react'

/** 菜单项：onClick = 叶子动作；children = 子菜单（悬停展开，忽略 onClick）；
 *  swatch = 该项前的一个方形色块（读作"这条是什么色"，非装饰 —— STYLE.md §5.2 例外⑤ 口径）。 */
export interface ContextMenuItem {
  label: string
  onClick?: () => void
  children?: ContextMenuItem[]
  /** CSS 颜色/token（如 `var(--note-red)`）；给值才画色块 */
  swatch?: string
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

/**
 * 右键菜单 —— **挂载线形态**（2026-09-14 用户定，全站统一）。
 *
 * 形态（用户原话："摒弃圆角的设计，通过弹出挂载线，并向下生长出来各种功能"）：
 * 右键处在光标位置弹出**一条横向 1px 挂载线**，功能项自线**下方逐条向下生长** ——
 * 与阅读器挂载线实体（`ReaderRail` + 目录垂挂）是同一套视觉语汇，故**不用圆角、不用阴影、
 * 不用卡片底**（`STYLE.md` §3.4：内容与背景靠颜色区分）。
 *
 * 语义**不**统一（用户定）：各域右键语义不同（书库 = 文件管理动作；阅读器 = 标记/批注），
 * 本组件只负责**形态**，项由调用方给。
 * 支持一层子菜单（「移動到」/「標記」等）：悬停父项向右展开。
 * 关闭路径：外点 / Esc / 滚动 / 点击任意项。
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

  // 线宽跟随内容（`w-max`），并做一次视口夹取：挂载线右端不越界
  const lineW = 176
  const left = Math.min(Math.max(8, x), Math.max(8, window.innerWidth - lineW - 8))
  const top = Math.max(8, y)

  return (
    <div
      ref={boxRef}
      className="context-menu fixed z-50 flex flex-col items-start"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 挂载线本体：功能项自它向下生长（与阅读器挂载线同语汇） */}
      <div className="context-menu__rail" aria-hidden="true" />
      <div className="context-menu__items" role="menu">
        {items.map((it, i) => (
          <MenuItem key={i} item={it} onClose={onClose} />
        ))}
      </div>
    </div>
  )
}

function MenuItem({ item, onClose }: { item: ContextMenuItem; onClose: () => void }): React.JSX.Element {
  const [subOpen, setSubOpen] = useState(false)
  if (item.children && item.children.length > 0) {
    return (
      <div
        className="relative w-full"
        onMouseEnter={() => setSubOpen(true)}
        onMouseLeave={() => setSubOpen(false)}
      >
        <button role="menuitem" className="context-menu__item">
          {item.swatch && (
            <span className="context-menu__swatch" style={{ background: item.swatch }} aria-hidden="true" />
          )}
          <span className="context-menu__label">{item.label} ▸</span>
        </button>
        {subOpen && (
          <div className="context-menu__sub" role="menu">
            {item.children.map((child, i) => (
              <MenuItem key={i} item={child} onClose={onClose} />
            ))}
          </div>
        )}
      </div>
    )
  }
  return (
    <button
      role="menuitem"
      onClick={() => {
        onClose()
        item.onClick?.()
      }}
      className="context-menu__item"
    >
      {item.swatch && (
        <span className="context-menu__swatch" style={{ background: item.swatch }} aria-hidden="true" />
      )}
      <span className="context-menu__label">{item.label}</span>
    </button>
  )
}
