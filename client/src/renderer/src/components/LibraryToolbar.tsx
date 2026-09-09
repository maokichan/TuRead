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

/** 视图名（繁体，配源流明体字栈）：按钮显示的是**当前**视图 */
const VIEW_LABEL: Record<LibraryView, string> = { list: '列表', grid: '網格' }

/** 动画总时长（与 styles.css 的 `view-switch-flash` 一致）：动画期间按钮禁用 */
const VIEW_SWITCH_MS = 900
/** 文字替换时刻 = 动画 50%（"新文字从深色块里浮出"） */
const VIEW_SWITCH_SWAP_MS = 450

/**
 * 书库底部状态栏（纯展示）：**左** = 视图切换（单个文字按钮），**右** = 导入（文字按钮）。
 *
 * 视图切换是**一个**按钮：显示当前视图名，点击后在动画播放过程中切到另一种视图、
 * 文字也换成另一种（"列表" ↔ "網格"）。动画（`.view-switch-flash`）：
 * ① 判定区域变深色（旧文字被吞没）② 浅色新文字出现在深色区域上 ③ 区域与文字同时复原。
 * 因此文字在动画约 42% 处才替换（260ms），让"新文字从深色块里浮出来"。
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
  const [flashing, setFlashing] = useState(false)
  /** 按钮上显示的文字（跟随动画节奏，落后于 view 约 260ms） */
  const [shown, setShown] = useState<LibraryView>(view)
  const timers = useRef<number[]>([])

  useEffect(() => {
    if (!flashing) setShown(view)
  }, [view, flashing])

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t))
    },
    []
  )

  const toggleView = (): void => {
    if (flashing) return // 动画期间不可点（按钮已 disabled，这里再挡一次）
    const next: LibraryView = view === 'list' ? 'grid' : 'list'
    onViewChange(next)
    setFlashing(true)
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = [
      window.setTimeout(() => setShown(next), VIEW_SWITCH_SWAP_MS),
      window.setTimeout(() => setFlashing(false), VIEW_SWITCH_MS + 60)
    ]
  }

  return (
    <footer className="flex flex-none items-center justify-between gap-3 border-t border-[var(--border)] pt-1.5 text-[12px]">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleView}
          disabled={flashing}
          title="切换显示模式"
          className={`view-switch ${flashing ? 'view-switch-flash' : ''}`}
        >
          {VIEW_LABEL[shown]}
        </button>
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
            <button onClick={onCancelImport} className="text-action text-action--danger">
              取消
            </button>
          </>
        ) : (
          <ImportMenu
            onFiles={onImportFiles}
            onFolder={onImportFolder}
            className="text-action text-action--primary"
          />
        )}
      </div>
    </footer>
  )
}

/** 导入菜单：文字按钮 + 小菜单（Windows 下文件与目录不能同框选择 → 两个入口） */
function ImportMenu({
  onFiles,
  onFolder,
  className
}: {
  onFiles: () => void
  onFolder: () => void
  className: string
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
        className={`${className} text-[var(--text)] hover:text-[var(--accent)]`}
      >
        導入
      </button>
      {open && (
        <div className="absolute right-0 bottom-full z-10 mb-1.5 w-40 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)] shadow-lg">
          <button
            onClick={() => {
              setOpen(false)
              onFiles()
            }}
            className="block w-full px-3 py-2 text-left text-[12.5px] text-[var(--text)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
          >
            导入文件…
          </button>
          <button
            onClick={() => {
              setOpen(false)
              onFolder()
            }}
            className="block w-full border-t border-[var(--border-soft)] px-3 py-2 text-left text-[12.5px] text-[var(--text)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
          >
            导入文件夹…
          </button>
        </div>
      )}
    </div>
  )
}
