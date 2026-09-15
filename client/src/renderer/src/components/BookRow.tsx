import type { EditionRecord, ReadingState } from '@core/domain/types'
import { formatSize, progressText } from '../features/format'
import { FittedTitle } from './FittedTitle'

interface BookRowProps {
  /** 内容身份（v0.4.0：原 `BookRecord` → `EditionRecord`；阅读状态已拆出，见下） */
  book: EditionRecord
  /** 阅读状态（来自 `LibraryItem.readingState`，读模型已 JOIN 好，避免 N+1） */
  readingState: ReadingState | null
  /** 当前选中（= 详情抽屉显示的书） */
  active: boolean
  coverUrl: string | null
  /** 单击 → 详情；双击 → 打开；Delete → 删除；Enter → 打开；Space → 详情 */
  onDetail: () => void
  onOpen: () => void
  onDelete: () => void
  /** 页面内拖拽（书 → 書箱 移动，2026-09-13 用户定：资源管理器语义） */
  draggable?: boolean
  onDragStartBook?: (e: React.DragEvent) => void
}

/**
 * 书库·列表模式的一行（纯展示）。
 * - 有封面：封面从**左侧填充**、向右**渐隐**（`.book-row-cover` 的 mask），标题叠在其右侧；
 * - 无封面：左栏用**文字封面**（FittedTitle 撑满 + 加粗，**不套 mask** —— 否则标题会被淡出遮罩吃掉）。
 */
export function BookRow({
  book,
  readingState,
  active,
  coverUrl,
  onDetail,
  onOpen,
  onDelete,
  draggable,
  onDragStartBook
}: BookRowProps): React.JSX.Element {
  const title = book.metadata.title || '未命名'
  const meta = (
    <span className="flex items-center gap-2 text-[10.5px] text-[var(--muted)]">
      <b className="text-[10.5px] font-bold tracking-[0.4px] text-[var(--accent)]">{book.format}</b>
      <span>{formatSize(book.fingerprint.size)}</span>
      <span>{progressText(readingState)}</span>
    </span>
  )

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
      className={`relative h-16 cursor-pointer overflow-hidden rounded-lg border transition-colors ${
        active
          ? 'border-[var(--accent-ring)] bg-[var(--accent-soft)]'
          : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--panel)]'
      }`}
    >
      {/*
        封面槽（左侧 2/5）：**封面图与文字封面同等对待** —— 都套 `.book-row-cover` 渐隐，
        都填满槽位（FEATURES §10：文字封面的性质就是封面，按图片处理）。
      */}
      <div className="book-row-cover absolute inset-y-0 left-0 w-2/5 overflow-hidden bg-[var(--panel-2)]">
        {coverUrl ? (
          <div
            className="h-full w-full bg-cover bg-center"
            style={{ backgroundImage: `url(${coverUrl})` }}
          />
        ) : (
          <FittedTitle text={title} maxSize={34} minSize={9} paddingRatio={0.03} />
        )}
      </div>

      {/* 内容层：起始更靠左，自然压住封面右缘（标题 + 详情，两种封面情况完全一致） */}
      <div className="relative flex h-full flex-col justify-center gap-0.5 pr-3 pl-[30%]">
        {/* 列表标题：源流明体、放大、**不加粗**（2026-09-08 定） */}
        <span className="truncate font-[var(--font-serif-cn)] text-[17px] leading-tight font-normal">
          {title}
        </span>
        {meta}
      </div>
    </div>
  )
}
