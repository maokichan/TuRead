import { useEffect, useRef, useState } from 'react'
import type { LibraryView } from '@core/domain/types'

interface LibraryToolbarProps {
  view: LibraryView
  onViewChange: (v: LibraryView) => void
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
    /* 状态栏（2026-09-09 定）：**所有元素统一左对齐**（不再左右对称分布），
       分割线随内容区宽度铺开（此前 max-w-[720px] 收得太短），`pt-4` 让线上移。 */
    <footer className="flex-none">
      <div className="flex items-center gap-7 border-t border-[var(--border)] pt-4 pb-1 text-[12px]">
        <button
          onClick={toggleView}
          disabled={flashing}
          title="切换显示模式"
          className={`view-switch ${flashing ? 'view-switch-flash' : ''}`}
        >
          {VIEW_LABEL[shown]}
        </button>
        {coverProgress && (
          <span className="text-[var(--muted)]">
            提取封面 {coverProgress.done}/{coverProgress.total}
          </span>
        )}
        {importing ? (
          <>
            <span className="text-[var(--muted)]">
              导入中 {importing.done}/{importing.total}
            </span>
            <button onClick={onCancelImport} className="text-action text-action--danger text-action--lg">
              取消
            </button>
          </>
        ) : (
          <ImportMenu
            onFiles={onImportFiles}
            onFolder={onImportFolder}
            className="text-action text-action--primary text-action--lg"
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
      <button onClick={() => setOpen((v) => !v)} className={className}>
        導入
      </button>
      {open && (
        /* 浮层（STYLE.md §5.2 例外③）保留一层底色；**菜单项本身是文字行**，无边框无分隔线 */
        <div className="absolute right-0 bottom-full z-10 mb-2 flex w-40 flex-col items-start gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2.5 shadow-lg">
          <button
            onClick={() => {
              setOpen(false)
              onFiles()
            }}
            className="block w-full text-left text-[13px] text-[var(--muted)] hover:text-[var(--text)]"
          >
            导入文件…
          </button>
          <button
            onClick={() => {
              setOpen(false)
              onFolder()
            }}
            className="block w-full text-left text-[13px] text-[var(--muted)] hover:text-[var(--text)]"
          >
            导入文件夹…
          </button>
        </div>
      )}
    </div>
  )
}
