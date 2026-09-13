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
  /** 打开書庫管理弹窗（2026-09-13 用户立项：Obsidian 仓库管理页风格，见 LibraryManagerDialog） */
  onOpenManager: () => void
  /** 当前层级面包屑（2026-09-13 用户定：书架右下角显示"当前层级"，相对各模式根；
   *  末段 = 当前层不可点，其余可点回跳；把书/書箱拖到面包屑段 = 移动到该层
   *  （containerId=null 的根段 = 移出書箱回根层）） */
  crumbs: Array<{
    label: string
    onGo: () => void
    onDropBook?: (bookId: string) => void
    onDropContainer?: (containerId: string) => void
  }>
}

/** 视图名（繁体，配源流明体字栈）：按钮显示的是**当前**视图 */
const VIEW_LABEL: Record<LibraryView, string> = { list: '列表', grid: '網格' }

/** 动画总时长（与 styles.css 的 `view-switch-flash` 一致）：动画期间按钮禁用 */
const VIEW_SWITCH_MS = 900
/** 文字替换时刻 = 动画 50%（"新文字从深色块里浮出"） */
const VIEW_SWITCH_SWAP_MS = 450

/**
 * 书库底部状态栏（纯展示）：**左** = 视图切换（单个文字按钮），**右** = 导入 + 書庫（文字按钮）。
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
  coverProgress,
  onOpenManager,
  crumbs
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
        <button onClick={onOpenManager} className="text-action text-action--lg" title="切换 / 新建 / 更名書庫">
          書庫
        </button>
        {/* 当前层级（右下角，2026-09-13 用户定）：根 = 库名；自建模式路径名 = 書箱名，虚拟映射 = 文件夹名。
            面包屑也是拖放目标：书/書箱拖到某段 = 移动到该层（资源管理器语义，拖入段高亮提示）。
            **根固定、子节点向右增生**（2026-09-13 用户定）：容器取固定宽度再 ml-auto 推到右侧，
            内容从左缘（固定）向右生长——路径变深时根的位置不动，不再整体左移。
            过长的截断/滚动策略暂不做（用户定：先不管）。 */}
        <div className="ml-auto flex w-[420px] flex-none items-center gap-1.5 overflow-hidden text-[12px] text-[var(--muted)]">
          {crumbs.map((c, i) => (
            <Crumb key={`${c.label}-${i}`} crumb={c} index={i} last={i === crumbs.length - 1} />
          ))}
        </div>
      </div>
    </footer>
  )
}

/** 面包屑段：可回跳（非末段）+ 拖放目标（书/書箱拖入 = 移动到该层；拖入时高亮提示可放）。
 *  分隔线挂在**段前且 i>0**——根段（i=0）前不许有分隔符，否则根会随路径变深被推右（违背"根固定"） */
function Crumb({
  crumb,
  index,
  last
}: {
  crumb: LibraryToolbarProps['crumbs'][number]
  index: number
  last: boolean
}): React.JSX.Element {
  const [dropHover, setDropHover] = useState(false)
  const dropProps =
    crumb.onDropBook || crumb.onDropContainer
      ? {
          onDragOver: (e: React.DragEvent): void => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setDropHover(true)
          },
          onDragLeave: (): void => setDropHover(false),
          onDrop: (e: React.DragEvent): void => {
            e.preventDefault()
            setDropHover(false)
            const bookId = e.dataTransfer.getData('text/turead-book-id')
            if (bookId) {
              crumb.onDropBook?.(bookId)
              return
            }
            const containerId = e.dataTransfer.getData('text/turead-container-id')
            if (containerId) crumb.onDropContainer?.(containerId)
          }
        }
      : {}
  const highlight = dropHover ? ' rounded-sm bg-[var(--negative-bg)] px-1 text-[var(--negative-text)]' : ''
  return (
    <span className={`flex min-w-0 items-center gap-1.5${highlight}`} {...dropProps}>
      {index > 0 && <span className="opacity-50">/</span>}
      {last ? (
        <span className="max-w-[220px] truncate" title={crumb.label}>
          {crumb.label}
        </span>
      ) : (
        <button onClick={crumb.onGo} className="max-w-[160px] truncate hover:text-[var(--text)]" title={crumb.label}>
          {crumb.label}
        </button>
      )}
    </span>
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
        /* 浮层（STYLE.md §5.2 例外③）保留一层底色；**左缘与「導入」按钮左缘对齐**
           （原来右对齐，菜单整体偏到按钮左侧，看起来"没对齐"—— 2026-09-09 修）。
           菜单项本身是文字行，无边框无分隔线。 */
        <div className="absolute bottom-full left-0 z-10 mb-2 flex w-40 flex-col items-start gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2.5 shadow-lg">
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
