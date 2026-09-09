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

/** 三行等高（2026-09-09 用户定）：高度由竖排标签驱动（4 字 × 12.5px ≈ 50px） */
const ROW = 'flex h-[52px] items-center'

/**
 * 书库·详情抽屉（纯展示）。
 *
 * 位置纪律：抽屉**只在内容区弹出**（父容器 `relative` → `absolute inset-y-0 right-0`），
 * 不覆盖底部状态栏。关闭：Esc / 点击抽屉外任意位置（不用全屏遮罩 —— 会吞掉列表项第二次点击）。
 * 关闭按钮放在底部（交互上 Esc/点外已足够，这里只是可见的兜底）。
 *
 * **平面结构（2026-09-09 用户定）**：
 *
 * ```
 * ┌────────┬───────────────────────────────────┐
 * │        │ ① 标题条（负片，过长自己滚）        │  ← 三行**等高**、字号**一致**，
 * │  封面   │ ② 数据行（格式·大小·导入时间·路径）  │     左对齐封面右缘、撑满抽屉宽度
 * │        │ ③ 指标行（进度｜上次阅读｜总时长）   │
 * ├────────┴───────────────────────────────────┤
 * │ 描述块（满宽负片）                            │
 * └────────────────────────────────────────────┘
 * ```
 *
 * - 三行**单行**：① ② 用 `Marquee`（超出才滚，绝不向下生长）。
 * - ③ 行**宽度不同**：进度块不带标签（"已读 42%" 自明）；
 *   「上次阅读 / 总阅读时间」的标签**竖排在块左侧**（`writing-mode: vertical-rl`）——
 *   这样标签不会把行撑成两行，三行才能真正等高、字号一致。
 * - 文件路径并入 ② 数据行（不再单独成栏）。
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
  /** 数据行：格式 · 文件大小 · 导入时间 · 文件路径（长信息都进滚动行） */
  const dataLine = [
    book.format,
    formatSize(book.fingerprint.size),
    formatTime(book.createdAt),
    book.filePath
  ].join('   ·   ')

  return (
    <aside ref={panelRef} className="absolute inset-y-0 right-0 z-30 flex w-[320px] flex-col px-4">
      {/* 顶部单元：封面（拉伸到三行总高）+ 三行文本列 */}
      <header className="flex flex-none items-stretch gap-3 pt-4 pb-3">
        <div className="w-[72px] flex-none overflow-hidden bg-[var(--panel-2)]">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <FittedTitle text={title} />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* ① 标题条（负片） */}
          <div className={`${ROW} bg-[var(--negative-bg)] px-1.5 text-[var(--negative-text)]`}>
            <Marquee duration={18} className="w-full font-[var(--font-serif-cn)] text-[12.5px] font-bold">
              {title}
            </Marquee>
          </div>

          {/* ② 数据行：格式 · 大小 · 导入时间 · 文件路径 */}
          <div className={`${ROW} text-[var(--muted)]`}>
            <Marquee duration={26} className="w-full text-[12.5px]">
              {dataLine}
            </Marquee>
          </div>

          {/* ③ 指标行：宽度按内容分配（进度无标签 / 后两项竖排标签） */}
          <div className="flex gap-1.5">
            <Metric value={progressText(book)} />
            <Metric label="上次阅读" value={book.lastReadAt ? formatRelative(book.lastReadAt) : '未阅读'} />
            {/* 占位：累计阅读时长，功能待实现（见 TODO.md） */}
            <Metric label="总阅读时间" value="共 —" />
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <Block label="描述" value={book.metadata.description || '（描述待定）'} />
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
        <button onClick={onClose} title="关闭（Esc）" className="text-action">
          关闭
        </button>
      </footer>
    </aside>
  )
}

/**
 * 指标块（第 ③ 行）：高度与另两行一致。
 * `label` 竖排在块左侧（`writing-mode: vertical-rl`，字形正立）——
 * 若改成"标签在值上方"会变成两行高，破坏三行等高（2026-09-09 用户定）。
 */
function Metric({ label, value }: { label?: string; value: string }): React.JSX.Element {
  return (
    <span className={`${ROW} min-w-0 gap-1.5 bg-[var(--negative-bg)] px-1.5 text-[var(--negative-text)]`}>
      {label && <span className="vertical-label text-[12.5px] opacity-60">{label}</span>}
      <span className="min-w-0 truncate text-[12.5px]">{value}</span>
    </span>
  )
}

/** 信息块（满宽负片） */
function Block({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <span className="block w-full bg-[var(--negative-bg)] px-1.5 py-1 text-[var(--negative-text)]">
      <span className="block text-[11px] opacity-60">{label}</span>
      <span className="block text-[12.5px] break-all">{value}</span>
    </span>
  )
}
