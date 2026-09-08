import type { BookRecord } from '@core/domain/types'

interface BookCardProps {
  book: BookRecord
  active: boolean
  /** 两击确认删除的 armed 态（LibraryFeature 持有） */
  armed: boolean
  onSelect: () => void
  onDelete: () => void
}

/** 书架条目（LibraryFeature 的书列表项）—— 纯展示 */
export function BookCard({ book, active, armed, onSelect, onDelete }: BookCardProps): React.JSX.Element {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={`group relative mb-1 flex w-full cursor-pointer flex-col gap-0.5 rounded-lg border p-2 pr-8 text-left transition-colors ${
        active
          ? 'border-[var(--accent-ring)] bg-[var(--accent-soft)]'
          : 'border-transparent hover:bg-[var(--panel-2)]'
      }`}
    >
      <span className="truncate text-[13px]">{book.metadata.title}</span>
      <span className="flex items-center gap-2 font-[var(--mono)] text-[10.5px] text-[var(--muted)]">
        <b className="rounded border border-[var(--border)] bg-[var(--badge-bg)] px-1 text-[9.5px] font-bold tracking-[0.4px] text-[var(--accent)]">
          {book.format}
        </b>
        {book.fingerprint.hash.slice(0, 10)}
      </span>
      <button
        className={`absolute top-1.5 right-1.5 grid place-items-center rounded border text-[11px] leading-none transition-colors ${
          armed
            ? 'w-auto border-transparent bg-[var(--err)] px-2 text-[var(--on-accent)] opacity-100'
            : 'h-5 w-5 border-transparent bg-transparent text-[var(--muted)] opacity-0 hover:border-[var(--err-border)] hover:text-[var(--err)] group-hover:opacity-100 group-focus-within:opacity-100'
        }`}
        title={armed ? '再次点击确认删除' : '从书架移除'}
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
      >
        {armed ? '确认' : '✕'}
      </button>
    </div>
  )
}
