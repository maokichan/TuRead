import { useEffect, useRef } from 'react'
import type { BookRecord } from '@core/domain/types'
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
 *
 * 位置纪律（2026-09-08 定）：抽屉**只在内容区弹出** —— 由父容器 `relative` 定位为
 * `absolute inset-y-0 right-0`，因此**不覆盖底部状态栏**；被它盖住的内容不显示也不可点。
 * 关闭：Esc / 点击抽屉外的任意位置（document mousedown，不使用全屏遮罩 ——
 * 全屏遮罩会吞掉列表项的第二次点击，导致双击打开失效）。
 *
 * 风格（STYLE.md §5.2 例外③ / §5.5，2026-09-09 定）：
 * - **外壳完全透明**：无边框、无阴影、**无底色** —— 抽屉不再画任何底，
 *   下层书库内容从文字块之间透出来（负片块自身提供可读底）。
 * - **文字即负片**：标题与每个字段各自是一块**反色矩形**（`--negative-bg/--negative-text`，
 *   即页面白 → 块黑字白），左对齐、块宽随内容（`inline-block` + `max-w-full`）。
 * - **动作即文字**：`打开阅读` / `移除` 用 `.text-action`（与书库底部状态栏同一套）。
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
  /**
   * 字段清单（2026-09-09 用户定）：
   * - 移除「当前位置」「指纹」（没必要的信息）；
   * - 保留一个**描述栏占位** —— 显示什么尚未决定（见 TODO.md「抽屉描述栏」）。
   */
  const fields: { label: string; value: string; mono?: boolean; wrap?: boolean }[] = [
    { label: '描述', value: book.metadata.description || '（描述待定）' },
    { label: '文件大小', value: formatSize(book.fingerprint.size) },
    { label: '阅读进度', value: progressText(book) },
    { label: '导入时间', value: formatTime(book.createdAt) },
    { label: '最近阅读', value: formatTime(book.lastReadAt) },
    { label: '文件路径', value: book.filePath, wrap: true }
  ]

  return (
    <aside ref={panelRef} className="absolute inset-y-0 right-0 z-30 flex w-[280px] flex-col">
      <header className="flex flex-none items-start gap-3 pt-4 pb-3">
        <div className="h-[96px] w-16 flex-none overflow-hidden bg-[var(--panel-2)]">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <FittedTitle text={title} maxSize={20} minSize={8} paddingRatio={0.05} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="m-0 inline-block max-w-full bg-[var(--negative-bg)] px-1.5 py-1 font-[var(--font-serif-cn)] text-[14px] leading-snug font-bold break-words text-[var(--negative-text)]">
            {title}
          </h3>
          <span className="mt-1.5 block font-[var(--mono)] text-[10px] text-[var(--muted)]">
            {book.format}
          </span>
        </div>
        <button
          onClick={onClose}
          title="关闭（Esc）"
          className="flex-none text-[13px] text-[var(--muted)] hover:text-[var(--text)]"
        >
          ✕
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <div className="flex flex-col items-start gap-2">
          {fields.map((f) => (
            <span
              key={f.label}
              className="inline-block max-w-full bg-[var(--negative-bg)] px-1.5 py-1 text-[var(--negative-text)]"
            >
              <span className="block font-[system-ui] text-[10px] opacity-60">{f.label}</span>
              <span
                className={`block ${f.mono ? 'font-[var(--mono)] text-[11px]' : 'text-[12.5px]'} ${
                  f.wrap ? 'break-all' : ''
                }`}
              >
                {f.value}
              </span>
            </span>
          ))}
        </div>
      </div>

      <footer className="flex flex-none items-center gap-6 py-4">
        <button onClick={onOpen} className="text-action text-action--primary">
          打开阅读
        </button>
        <button
          onClick={onDelete}
          title="仅从书库移除，不会删除源文件"
          className="text-action text-action--danger"
        >
          移除
        </button>
      </footer>
    </aside>
  )
}
