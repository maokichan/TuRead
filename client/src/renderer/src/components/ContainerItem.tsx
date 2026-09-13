import { useEffect, useRef, useState } from 'react'
import type { LibraryView } from '@core/domain/types'
import { FittedTitle } from './FittedTitle'

interface ContainerItemProps {
  /** 書箱名（自建模式）或文件夹名（虚拟映射模式） */
  name: string
  view: LibraryView
  /** 書箱 id（右键菜单的定位锚点；文件夹条目无 id 不传） */
  containerId?: string
  /** 选中高亮（资源管理器语义：单击选中） */
  active?: boolean
  /** 行内更名（资源管理器 F2 语义）：Enter/失焦提交，**不用 Esc**（全局键义归意图层） */
  renaming?: boolean
  onOpen: () => void
  /** 交互回调（单击选中 / 键盘 / 右键 / 拖入书 / 更名提交），全部由父层（書箱=一等条目）决定 */
  onSelect?: () => void
  onKeyDown?: (e: React.KeyboardEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
  onRenameCommit?: (name: string) => void
  /** 页面内拖拽目标：书拖到書箱上 = 移动进此書箱 */
  onDropBook?: (bookId: string) => void
}

/**
 * 层级浏览里的書箱/文件夹条目。**地位 = 与书籍同款的一等条目**（2026-09-13 用户纠正）：
 * 外观、选中、右键、拖拽、更名全部对齐书籍卡片/行，唯一区别是"打开 = 进入下一层"，
 * 交互对齐文件资源管理器（单击选中 / 双击进入 / F2 更名 / 右键菜单 / 拖入即移动）。
 */
export function ContainerItem({
  name,
  view,
  containerId,
  active,
  renaming,
  onOpen,
  onSelect,
  onKeyDown,
  onContextMenu,
  onRenameCommit,
  onDropBook
}: ContainerItemProps): React.JSX.Element {
  const [dropHover, setDropHover] = useState(false)
  /** 更名草稿（组件内自持；提交 = Enter 或失焦，空值 = 保留原名） */
  const [draft, setDraft] = useState(name)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (renaming) {
      setDraft(name)
      // 资源管理器语义：进入更名即全选，直接输入覆盖
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [renaming, name])

  const commitRename = (): void => {
    if (renaming) onRenameCommit?.(draft.trim() || name)
  }

  const dragHandlers = onDropBook
    ? {
        onDragOver: (e: React.DragEvent): void => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setDropHover(true)
        },
        onDragLeave: (): void => setDropHover(false),
        onDrop: (e: React.DragEvent): void => {
          e.preventDefault()
          setDropHover(false)
          const id = e.dataTransfer.getData('text/turead-book-id')
          if (id) onDropBook(id)
        }
      }
    : {}

  if (view === 'grid') {
    return (
    <div
      role="button"
      tabIndex={0}
      title={name}
      aria-label={`書箱：${name}`}
      data-container-id={containerId}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
      draggable={!renaming}
      {...dragHandlers}
      className={`group flex cursor-pointer flex-col gap-1.5 ${dropHover ? 'opacity-80' : ''}`}
    >
        <div
          className={`relative aspect-[2/3] w-full overflow-hidden rounded-lg border bg-[var(--panel-2)] transition-colors ${
            active
              ? 'border-[var(--accent-ring)] ring-1 ring-[var(--accent-ring)]'
              : dropHover
                ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                : 'border-[var(--border)] group-hover:border-[var(--accent)]'
          }`}
        >
          <FittedTitle text={name} />
        </div>
        {renaming ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.stopPropagation() // 更名提交不冒泡到条目键盘（防"提交即进入"）
                commitRename()
              }
            }}
            onBlur={commitRename}
            className="h-[34px] w-full rounded-sm border border-[var(--accent)] bg-[var(--bg)] px-1.5 text-[12.5px] leading-[1.35] text-[var(--text)] outline-none"
          />
        ) : (
          <span className="line-clamp-2 h-[34px] text-[12.5px] leading-[1.35] text-[var(--muted)] group-hover:text-[var(--text)]">
            {name}
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      title={name}
      aria-label={`書箱：${name}`}
      data-container-id={containerId}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={onKeyDown}
      onContextMenu={onContextMenu}
      draggable={!renaming}
      {...dragHandlers}
      className={`relative h-16 cursor-pointer overflow-hidden rounded-lg border transition-colors ${
        active
          ? 'border-[var(--accent-ring)] bg-[var(--accent-soft)]'
          : dropHover
            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
            : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--panel)]'
      }`}
    >
      <div className="book-row-cover absolute inset-y-0 left-0 w-2/5 overflow-hidden bg-[var(--panel-2)]">
        <FittedTitle text={name} maxSize={34} minSize={9} paddingRatio={0.03} />
      </div>
      <div className="relative flex h-full items-center pr-3 pl-[30%]">
        {renaming ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.stopPropagation() // 更名提交不冒泡到条目键盘（防"提交即进入"）
                commitRename()
              }
            }}
            onBlur={commitRename}
            className="h-8 w-full rounded-sm border border-[var(--accent)] bg-[var(--bg)] px-2 font-[var(--font-serif-cn)] text-[15px] text-[var(--text)] outline-none"
          />
        ) : (
          <span className="truncate font-[var(--font-serif-cn)] text-[17px] leading-tight font-normal">
            {name}
          </span>
        )}
      </div>
    </div>
  )
}
