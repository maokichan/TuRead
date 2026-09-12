import type { BookRecord } from '@core/domain/types'
import { FittedTitle } from './FittedTitle'

interface BookTileProps {
  book: BookRecord
  active: boolean
  coverUrl: string | null
  onDetail: () => void
  onOpen: () => void
  onDelete: () => void
}

/**
 * 书库·网格模式的一格（纯展示）。
 * 封面统一按 2:3 显示（瀑布流因此并入网格：缩略图由我方生成，比例可控，见 FEATURES §10）。
 * 无封面 → **文字封面**：标题撑满卡片、加粗，中文走源流明体字栈（`--font-serif-cn`）。
 */
export function BookTile({
  book,
  active,
  coverUrl,
  onDetail,
  onOpen,
  onDelete
}: BookTileProps): React.JSX.Element {
  const title = book.metadata.title || '未命名'
  return (
    <div
      role="button"
      tabIndex={0}
      title={title}
      onClick={onDetail}
      onDoubleClick={onOpen}
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
      className="group flex cursor-pointer flex-col gap-1.5"
    >
      <div
        className={`relative aspect-[2/3] w-full overflow-hidden rounded-lg border bg-[var(--panel-2)] transition-colors ${
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
          单行标题也占两行的位（截断规则 FEATURES §10 待定项不变） */}
      <span className="line-clamp-2 h-[34px] text-[12.5px] leading-[1.35] text-[var(--muted)] group-hover:text-[var(--text)]">
        {title}
      </span>
    </div>
  )
}
