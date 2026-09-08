import { useEffect, useRef } from 'react'
import type { BookRecord } from '@core/domain/types'
import { describeLocation } from '@core/domain/location'
import { formatSize, formatTime, progressText } from '../features/format'
import { FittedTitle } from './FittedTitle'

interface BookDetailPanelProps {
  book: BookRecord
  coverUrl: string | null
  onClose: () => void
  onOpen: () => void
  /** 触发删除流程（确认弹窗在 LibraryFeature 统一处理） */
  onDelete: () => void
}

/**
 * 书库·详情抽屉（纯展示）。
 * 位置纪律（2026-09-08 定）：抽屉**只在内容区弹出** —— 由父容器 `relative` 定位为
 * `absolute inset-y-0 right-0`，因此**不覆盖底部状态栏**；被它盖住的内容不显示也不可点
 * （抽屉不透明 + 下方是内容区自身）。
 * 关闭：Esc / 点击抽屉外的任意位置（document mousedown，不使用全屏遮罩 ——
 * 全屏遮罩会吞掉列表项的第二次点击，导致双击打开失效）。
 */
export function BookDetailPanel({
  book,
  coverUrl,
  onClose,
  onOpen,
  onDelete
}: BookDetailPanelProps): React.JSX.Element {
  const panelRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    const onDown = (e: MouseEvent): void => {
      if (!panelRef.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  const title = book.metadata.title || '未命名'
  return (
    <aside
      ref={panelRef}
      className="absolute inset-y-0 right-0 z-30 flex w-[340px] flex-col border-l border-[var(--border)] bg-[var(--panel)] shadow-2xl"
    >
      <header className="flex flex-none items-start gap-3 border-b border-[var(--border-soft)] p-4">
        <div className="h-[96px] w-16 flex-none overflow-hidden rounded border border-[var(--border)] bg-[var(--panel-2)]">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <FittedTitle text={title} maxSize={20} minSize={8} paddingRatio={0.05} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-[14px] leading-snug break-words">{title}</h3>
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
            value={book.lastLocation ? describeLocation(book.lastLocation, book.format) : '—'}
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
          onClick={onDelete}
          title="仅从书库移除，不会删除源文件"
          className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[13px] text-[var(--muted)] hover:border-[var(--err-border)] hover:text-[var(--err)]"
        >
          移除
        </button>
      </footer>
    </aside>
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
