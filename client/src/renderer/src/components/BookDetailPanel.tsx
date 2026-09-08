import { useEffect, useState } from 'react'
import type { BookRecord } from '@core/domain/types'
import { describeLocation } from '@core/domain/location'
import { formatSize, formatTime, progressText } from '../features/format'

interface BookDetailPanelProps {
  book: BookRecord
  coverUrl: string | null
  onClose: () => void
  onOpen: () => void
  onDelete: () => void
}

/**
 * 书库·详情抽屉（纯展示）：右侧滑出，点空白 / Esc 关闭。
 * 内容 = 本地可得的事实（标题/格式/大小/指纹/路径/时间/位置）+ 底部操作区。
 * ⚠ 操作清单（删除/重命名/重新定位…）尚未定稿（FEATURES §10 待定项 3）—— 当前只放"打开 + 删除"。
 */
export function BookDetailPanel({
  book,
  coverUrl,
  onClose,
  onOpen,
  onDelete
}: BookDetailPanelProps): React.JSX.Element {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // 换书时重置删除确认态
  useEffect(() => setArmed(false), [book.id])

  const title = book.metadata.title || '未命名'
  return (
    <>
      {/* 点空白关闭（透明遮罩，不遮挡视觉） */}
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-30 flex w-[340px] flex-col border-l border-[var(--border)] bg-[var(--panel)] shadow-2xl">
        <header className="flex flex-none items-start gap-3 border-b border-[var(--border-soft)] p-4">
          <div className="h-[96px] w-16 flex-none overflow-hidden rounded border border-[var(--border)] bg-[var(--panel-2)]">
            {coverUrl ? (
              <img src={coverUrl} alt="" className="h-full w-full object-cover" draggable={false} />
            ) : (
              <div className="title-cover flex h-full w-full items-center justify-center p-1 text-center text-[12px] leading-tight text-[var(--muted)]">
                {title}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="m-0 break-words text-[14px] leading-snug">{title}</h3>
            <span className="mt-1 inline-block rounded border border-[var(--border)] bg-[var(--badge-bg)] px-1 font-[var(--mono)] text-[10px] text-[var(--accent)]">
              {book.format}
            </span>
          </div>
          <button
            onClick={onClose}
            title="关闭（Esc）"
            className="flex-none rounded border border-transparent px-1.5 text-[var(--muted)] hover:border-[var(--border)] hover:text-[var(--text)]"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <dl className="m-0 flex flex-col gap-2 text-[12px]">
            <Row label="文件大小" value={formatSize(book.fingerprint.size)} />
            <Row label="阅读进度" value={progressText(book)} />
            <Row
              label="当前位置"
              value={
                book.lastLocation
                  ? describeLocation(book.lastLocation, book.format)
                  : '—'
              }
            />
            <Row label="导入时间" value={formatTime(book.createdAt)} />
            <Row label="最近阅读" value={formatTime(book.lastReadAt)} />
            <Row label="指纹" value={book.fingerprint.hash} mono wrap />
            <Row label="文件路径" value={book.filePath} mono wrap />
          </dl>
        </div>

        <footer className="flex flex-none items-center gap-2 border-t border-[var(--border-soft)] p-4">
          <button
            onClick={onOpen}
            className="flex-1 rounded-lg border border-transparent bg-[var(--accent)] px-3 py-2 text-[13px] text-[var(--on-accent)] hover:brightness-110"
          >
            打开阅读
          </button>
          <button
            onClick={() => {
              if (armed) onDelete()
              else setArmed(true)
            }}
            className={`rounded-lg border px-3 py-2 text-[13px] ${
              armed
                ? 'border-transparent bg-[var(--err)] text-[var(--on-accent)]'
                : 'border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)] hover:border-[var(--err-border)] hover:text-[var(--err)]'
            }`}
          >
            {armed ? '确认删除' : '删除'}
          </button>
        </footer>
      </aside>
    </>
  )
}

function Row({
  label,
  value,
  mono,
  wrap
}: {
  label: string
  value: string
  mono?: boolean
  wrap?: boolean
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] text-[var(--muted)]">{label}</dt>
      <dd
        className={`m-0 text-[var(--text)] ${mono ? 'font-[var(--mono)] text-[11px]' : ''} ${
          wrap ? 'break-all' : 'truncate'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}
