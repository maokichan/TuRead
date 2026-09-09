import { useEffect, useRef } from 'react'
import type { BookRecord } from '@core/domain/types'
import { formatRelative, formatSize, formatTime, progressText } from '../features/format'
import { FittedTitle } from './FittedTitle'
import { Marquee } from './Marquee'

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
 * 关闭：Esc / 点击抽屉外的任意位置（document mousedown，不用全屏遮罩 ——
 * 全屏遮罩会吞掉列表项的第二次点击，导致双击打开失效）。
 *
 * **平面结构（2026-09-09 用户定，这是本组件的主设计）**：
 *
 * ```
 * ┌──────────┬──────────────────────────────────┐
 * │          │ 标题条（负片，过长自己滚）        │  ← 三行
 * │  封面     │ 数据行（格式 · 大小 · 导入时间）   │     左对齐「封面右缘」，
 * │ 64×96    │ 指标条（进度｜最近｜总时长）       │     撑满抽屉宽度
 * ├──────────┴──────────────────────────────────┤
 * │ 描述块（满宽负片）                            │  ← 更多信息：与上方单元相得益彰
 * │ 文件路径块（满宽负片，可换行）                │
 * └─────────────────────────────────────────────┘
 * ```
 *
 * 设计取舍：上方单元用"封面 + 三行文本列"的高度对齐（96px ≈ 三行），
 * 形成一块规整的矩形；下方信息**满宽**、左边距与封面左缘对齐，
 * 与上方形成"窄列 / 满宽"的节奏对比，而不是把两者都做成同一栅格。
 * 标题与数据行都**单行**（`Marquee` 超出才滚），绝不向下生长。
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
  /** 数据行：格式 · 文件大小 · 导入时间 */
  const dataLine = [book.format, formatSize(book.fingerprint.size), formatTime(book.createdAt)]

  return (
    <aside ref={panelRef} className="absolute inset-y-0 right-0 z-30 flex w-[320px] flex-col px-4">
      <button
        onClick={onClose}
        title="关闭（Esc）"
        className="absolute top-3 right-3 text-[13px] text-[var(--muted)] hover:text-[var(--text)]"
      >
        ✕
      </button>

      {/* 顶部单元：封面（左列）+ 三行文本列（左对齐封面右缘，撑满抽屉宽度） */}
      <header className="flex flex-none items-start gap-3 pt-4 pb-3">
        <div className="h-24 w-16 flex-none overflow-hidden bg-[var(--panel-2)]">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <FittedTitle text={title} maxSize={20} minSize={8} paddingRatio={0.05} />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* 行 1 · 标题条（负片）：过长时自己滚，不向下生长 */}
          <Marquee
            duration={18}
            className="bg-[var(--negative-bg)] px-1.5 py-1 font-[var(--font-serif-cn)] text-[14px] font-bold text-[var(--negative-text)]"
          >
            {title}
          </Marquee>

          {/* 行 2 · 数据行：格式 · 大小 · 导入时间（安静的信息条） */}
          <Marquee duration={16} className="text-[11px] text-[var(--muted)]">
            {dataLine.join(' · ')}
          </Marquee>

          {/* 行 3 · 三项指标：三个独立容器，同处一行 */}
          <div className="flex gap-1.5">
            <Metric label="阅读进度" value={progressText(book)} />
            <Metric label="最近阅读" value={formatRelative(book.lastReadAt)} />
            {/* 占位：累计阅读时长，功能待实现（见 TODO.md） */}
            <Metric label="总阅读时间" value="—" />
          </div>
        </div>
      </header>

      {/* 更多信息：满宽负片块，左边距与封面左缘对齐 */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <div className="flex flex-col gap-2">
          <Block label="描述" value={book.metadata.description || '（描述待定）'} />
          <Block label="文件路径" value={book.filePath} />
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

/** 指标块（行 3 的三分之一）：等宽、单行截断，标签小、值大 */
function Metric({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <span className="min-w-0 flex-1 bg-[var(--negative-bg)] px-1 py-1 text-[var(--negative-text)]">
      <span className="block truncate text-[11px] opacity-60">{label}</span>
      <span className="block truncate text-[12.5px]">{value}</span>
    </span>
  )
}

/** 信息块（满宽负片）：标签小、值可换行 */
function Block({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <span className="block w-full bg-[var(--negative-bg)] px-1.5 py-1 text-[var(--negative-text)]">
      <span className="block text-[11px] opacity-60">{label}</span>
      <span className="block text-[12.5px] break-all">{value}</span>
    </span>
  )
}
