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
 * 三行**三等分封面高度**（2026-09-09 用户定）：封面 64×96（2:3 原始比例），
 * 96 ÷ 3 = 32px 一行 —— 三行合起来正好与封面等高，不会出现封面被拉长的畸变。
 */
const ROW = 'flex h-8 items-center'

/**
 * 书库·详情抽屉（纯展示）。
 *
 * 位置纪律：抽屉**只在内容区弹出**（父容器 `relative` → `absolute inset-y-0 right-0`），
 * 不覆盖底部状态栏。关闭：Esc / 点击抽屉外任意位置（不用全屏遮罩 —— 会吞掉列表项第二次点击）；
 * 底部另有一个可见的「关闭」文字按钮。
 *
 * **平面结构（2026-09-09 用户定）**：
 *
 * ```
 * ┌────────┬───────────────────────────────┐
 * │        │ ① 标题条（负片，过长自己滚）    │  ← 三行 = 封面高度三等分（32px×3），
 * │ 封面    │ ② 数据行（格式·大小·时间·路径）  │     左对齐封面右缘、撑满抽屉宽度
 * │ 64×96  │ ③ 指标行（已读 42%｜3 天前｜共 —）│
 * ├────────┴───────────────────────────────┤
 * │ 描述块（满宽负片）                        │
 * └────────────────────────────────────────┘
 * ```
 *
 * - **不给任何容器加标签**（2026-09-09 用户定）：内容自己说明性质 ——
 *   "已读 42%" 不必再写"阅读进度"，"3 天前" 不必再写"上次阅读"。
 * - 三行**单行**：① ② 用 `Marquee`（超出才滚，绝不向下生长）；文件路径并入 ②。
 * - 封面保持 2:3 原始比例（`w-16` + 行高合计 96px），**不再拉伸**。
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
    <aside ref={panelRef} className="absolute inset-y-0 right-0 z-30 flex w-[280px] flex-col px-4">
      {/* 顶部单元：封面（64×96，2:3）+ 三行（各 32px = 封面高度的三等分） */}
      <header className="flex flex-none items-stretch gap-3 pt-4 pb-3">
        <div className="w-16 flex-none overflow-hidden bg-[var(--panel-2)]">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <FittedTitle text={title} />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* ① 标题条（负片） */}
          <div className={`${ROW} bg-[var(--negative-bg)] px-1.5 text-[var(--negative-text)]`}>
            <Marquee
              duration={18}
              className="w-full font-[var(--font-serif-cn)] text-[12.5px] font-bold"
            >
              {title}
            </Marquee>
          </div>

          {/* ② 数据行：格式 · 大小 · 导入时间 · 文件路径 */}
          <div className={`${ROW} text-[var(--muted)]`}>
            <Marquee duration={26} className="w-full text-[12.5px]">
              {dataLine}
            </Marquee>
          </div>

          {/* ③ 指标行：内容自己说明性质，故都不带标签 */}
          <div className="flex gap-1.5">
            <Chip value={progressText(book)} />
            <Chip value={book.lastReadAt ? formatRelative(book.lastReadAt) : '未阅读'} />
            {/* 占位：累计阅读时长，功能待实现（见 TODO.md） */}
            <Chip value="共 —" />
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {/* 描述块：不给标签，内容自述（占位文本待定，见 TODO.md） */}
        <span className="block w-full bg-[var(--negative-bg)] px-1.5 py-1 text-[12.5px] break-all text-[var(--negative-text)]">
          {book.metadata.description || '（描述待定）'}
        </span>
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

/** 指标块（第 ③ 行）：与另两行等高（32px），**不带标签**，宽度随内容 */
function Chip({ value }: { value: string }): React.JSX.Element {
  return (
    <span
      className={`${ROW} min-w-0 bg-[var(--negative-bg)] px-1.5 text-[12.5px] whitespace-nowrap text-[var(--negative-text)]`}
    >
      {value}
    </span>
  )
}
