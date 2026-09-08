import type { BookRecord } from '@core/domain/types'
import { formatSize, progressText } from '../features/format'

interface BookRowProps {
  book: BookRecord
  /** 当前选中（= 详情抽屉显示的书） */
  active: boolean
  coverUrl: string | null
  /** 单击 → 详情；双击 → 打开；Delete → 删除；Enter → 打开；Space → 详情 */
  onDetail: () => void
  onOpen: () => void
  onDelete: () => void
}

/**
 * 书库·列表模式的一行（纯展示）。
 * 视觉：封面从**左侧填充**、向右**渐隐**（`.book-row-cover` 的 mask），文字叠在其上。
 */
export function BookRow({
  book,
  active,
  coverUrl,
  onDetail,
  onOpen,
  onDelete
}: BookRowProps): React.JSX.Element {
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
      className={`relative h-16 cursor-pointer overflow-hidden rounded-lg border transition-colors ${
        active
          ? 'border-[var(--accent-ring)] bg-[var(--accent-soft)]'
          : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--panel)]'
      }`}
    >
      <div
        className="book-row-cover absolute inset-y-0 left-0 flex w-2/5 items-center justify-center overflow-hidden bg-[var(--panel-2)] bg-cover bg-center"
        style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
      >
        {!coverUrl && <span className="title-cover text-[22px] text-[var(--muted)]">{title[0]}</span>}
      </div>

      <div className="relative flex h-full flex-col justify-center gap-0.5 pl-[46%] pr-3">
        <span className="truncate text-[13.5px]">{title}</span>
        <span className="flex items-center gap-2 font-[var(--mono)] text-[10.5px] text-[var(--muted)]">
          <b className="rounded border border-[var(--border)] bg-[var(--badge-bg)] px-1 text-[9.5px] font-bold tracking-[0.4px] text-[var(--accent)]">
            {book.format}
          </b>
          <span>{formatSize(book.fingerprint.size)}</span>
          <span>{progressText(book)}</span>
        </span>
      </div>
    </div>
  )
}
