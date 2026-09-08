import type { BookRecord } from '@core/domain/types'

interface BookTileProps {
  book: BookRecord
  active: boolean
  coverUrl: string | null
  onDetail: () => void
  onOpen: () => void
  onDelete: () => void
}

/** 判断标题是否含 CJK 字符（决定"文字封面"用不用明体字栈） */
const HAS_CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

/**
 * 书库·网格模式的一格（纯展示）。
 * 封面统一按 2:3 显示（瀑布流因此并入网格：缩略图由我方生成，比例可控，见 FEATURES §10）。
 * 无封面 → **文字封面**：完整标题铺满卡片，中文用源流明体字栈（`--font-serif-cn`）。
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
  const cjk = HAS_CJK.test(title)
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
          <div
            className={`title-cover flex h-full w-full items-center justify-center p-3 text-center leading-snug text-[var(--text)] ${
              cjk ? 'text-[17px] tracking-[0.06em]' : 'text-[13px] tracking-normal'
            }`}
          >
            {title}
          </div>
        )}
      </div>
      <span className="line-clamp-2 text-[12.5px] leading-[1.35] text-[var(--muted)] group-hover:text-[var(--text)]">
        {title}
      </span>
    </div>
  )
}
