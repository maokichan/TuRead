import type { EditionRecord } from '@core/domain/types'
import { FittedTitle } from './FittedTitle'

interface BookTileProps {
  /** 内容身份（v0.4.0：原 `BookRecord` → `EditionRecord`） */
  book: EditionRecord
  active: boolean
  coverUrl: string | null
  /** 聚焦舞台在场：本卡即"空缺提示槽"——原位留空 + 浅提示，点击直接打开阅读 */
  vacant?: boolean
  onDetail: () => void
  onOpen: () => void
  onDelete: () => void
  /** 页面内拖拽（书 → 書箱 移动：资源管理器语义） */
  draggable?: boolean
  onDragStartBook?: (e: React.DragEvent) => void
}

/**
 * 书库·网格模式的一格（纯展示）。
 * 封面统一按 2:3 显示（瀑布流因此并入网格：缩略图由我方生成，比例可控，见 features/library.md）。
 * 无封面 → **文字封面**：标题撑满卡片、加粗，中文走源流明体字栈（`--font-serif-cn`）。
 */
export function BookTile({
  book,
  active,
  coverUrl,
  vacant,
  onDetail,
  onOpen,
  onDelete,
  draggable,
  onDragStartBook
}: BookTileProps): React.JSX.Element {
  const title = book.metadata.title || '未命名'
  if (vacant) {
    /* 空缺提示槽：聚焦舞台在场时原位留空（不剩底色），
       只给很浅的"再次點擊打開"；点击 = 直接进阅读。z 取提示层（--z-menu），
       盖过景深幕（--z-drawer），槽位几何与原卡一致（回飞落点 = 现场重测的它） */
    return (
      <div
        role="button"
        tabIndex={0}
        data-book-id={book.id}
        title={`打開《${title}》`}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onOpen()
          }
        }}
        className="relative z-[var(--z-menu)] flex cursor-pointer flex-col gap-1.5"
      >
        <div data-book-cover className="relative flex aspect-[2/3] w-full items-center justify-center rounded-[var(--radius-item)] border border-[var(--muted)]">
          <span className="text-[12.5px] text-[var(--muted)] opacity-45 transition-opacity duration-[var(--dur-hover)] hover:opacity-80">
            再次點擊打開
          </span>
        </div>
        <span className="h-[34px]" />
      </div>
    )
  }
  return (
    <div
      role="button"
      tabIndex={0}
      title={title}
      data-book-id={book.id}
      onClick={onDetail}
      onDoubleClick={onOpen}
      onDragStart={onDragStartBook}
      draggable={draggable}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onOpen()
        } else if (e.key === ' ') {
          e.preventDefault()
          onDetail()
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          onDelete()
        }
      }}
      className="group flex cursor-pointer flex-col gap-1.5 transition-colors duration-[var(--dur-hover)] hover:bg-[var(--state-hover)]"
    >
      <div
        data-book-cover
        className={`relative aspect-[2/3] w-full overflow-hidden rounded-[var(--radius-item)] border bg-[var(--panel-2)] transition-colors duration-[var(--dur-hover)] ${
          active
            ? 'border-[var(--accent-ring)] ring-1 ring-[var(--accent-ring)]'
            : 'border-[var(--border)] group-hover:border-[var(--accent)]'
        }`}
      >
        {coverUrl ? (
          <img src={coverUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <FittedTitle text={title} />
        )}
      </div>
      {/* 标题区**定高**（两行）：窗口化渲染（useVirtualRange）需要可计算的行高，
          单行标题也占两行的位（截断规则待定项见 TODO） */}
      <span className="line-clamp-2 h-[34px] text-[12.5px] leading-[1.35] text-[var(--muted)] group-hover:text-[var(--text)]">
        {title}
      </span>
    </div>
  )
}
