import type { BookRecord } from '@core/domain/types'
import { formatSize, progressText } from '../features/format'
import { FittedTitle } from './FittedTitle'

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
 * - 有封面：封面从**左侧填充**、向右**渐隐**（`.book-row-cover` 的 mask），标题叠在其右侧；
 * - 无封面：左栏用**文字封面**（FittedTitle 撑满 + 加粗，**不套 mask** —— 否则标题会被淡出遮罩吃掉）。
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
  const meta = (
    <span className="flex items-center gap-2 font-[var(--mono)] text-[10.5px] text-[var(--muted)]">
      <b className="rounded border border-[var(--border)] bg-[var(--badge-bg)] px-1 text-[9.5px] font-bold tracking-[0.4px] text-[var(--accent)]">
        {book.format}
      </b>
      <span>{formatSize(book.fingerprint.size)}</span>
      <span>{progressText(book)}</span>
    </span>
  )

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
      {coverUrl ? (
        <>
          <div
            className="book-row-cover absolute inset-y-0 left-0 w-2/5 bg-cover bg-center"
            style={{ backgroundImage: `url(${coverUrl})` }}
          />
          <div className="relative flex h-full flex-col justify-center gap-0.5 pr-3 pl-[46%]">
            <span className="truncate text-[13.5px]">{title}</span>
            {meta}
          </div>
        </>
      ) : (
        <div className="relative flex h-full items-center gap-3 px-2">
          <div className="h-full w-[58%] flex-none">
            <FittedTitle text={title} maxSize={34} minSize={10} paddingRatio={0.04} />
          </div>
          <div className="min-w-0 flex-1">{meta}</div>
        </div>
      )}
    </div>
  )
}
