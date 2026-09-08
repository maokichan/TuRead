import { useEffect, useRef, useState } from 'react'
import type { LibraryView } from '@core/domain/types'

interface LibraryToolbarProps {
  view: LibraryView
  onViewChange: (v: LibraryView) => void
  bookCount: number
  onImportFiles: () => void
  onImportFolder: () => void
  /** 批量导入进度（null = 空闲）；可取消 */
  importing: { done: number; total: number } | null
  onCancelImport: () => void
  /** 后台封面提取进度（null = 空闲） */
  coverProgress: { done: number; total: number } | null
}

const VIEWS: { value: LibraryView; label: string }[] = [
  { value: 'list', label: '列表' },
  { value: 'grid', label: '网格' }
]

/**
 * 书库底部状态栏（纯展示）：**左** = 视图切换，**右** = 导入。
 * 依据：client/docs/FEATURES.md §10。
 */
export function LibraryToolbar({
  view,
  onViewChange,
  bookCount,
  onImportFiles,
  onImportFolder,
  importing,
  onCancelImport,
  coverProgress
}: LibraryToolbarProps): React.JSX.Element {
  return (
    <footer className="flex flex-none items-center justify-between gap-3 border-t border-[var(--border)] pt-2 text-[12px]">
      <div className="flex items-center gap-2.5">
        <div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              onClick={() => onViewChange(v.value)}
              className={`px-2.5 py-1 transition-colors ${
                view === v.value
                  ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                  : 'bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--accent)]'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <span className="text-[var(--muted)]">{bookCount} 本</span>
        {coverProgress && (
          <span className="text-[var(--muted)]">
            提取封面 {coverProgress.done}/{coverProgress.total}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {importing ? (
          <>
            <span className="text-[var(--muted)]">
              导入中 {importing.done}/{importing.total}
            </span>
            <button
              onClick={onCancelImport}
              className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1 text-[var(--muted)] hover:border-[var(--err-border)] hover:text-[var(--err)]"
            >
              取消
            </button>
          </>
        ) : (
          <ImportMenu onFiles={onImportFiles} onFolder={onImportFolder} />
        )}
      </div>
    </footer>
  )
}

/** 导入菜单：Windows 下文件与目录不能同框选择 → 两个入口（见 FEATURES §10） */
function ImportMenu({
  onFiles,
  onFolder
}: {
  onFiles: () => void
  onFolder: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent): void => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-[var(--border)] bg-[var(--accent-soft)] px-3 py-1 text-[var(--accent)] hover:bg-[var(--accent-strong)]"
      >
        ＋ 导入
      </button>
      {open && (
        <div className="absolute right-0 bottom-full z-10 mb-1.5 w-36 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)] shadow-lg">
          <button
            onClick={() => {
              setOpen(false)
              onFiles()
            }}
            className="block w-full px-3 py-2 text-left text-[var(--text)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
          >
            导入文件…
          </button>
          <button
            onClick={() => {
              setOpen(false)
              onFolder()
            }}
            className="block w-full border-t border-[var(--border-soft)] px-3 py-2 text-left text-[var(--text)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
          >
            导入文件夹…
          </button>
        </div>
      )}
    </div>
  )
}
