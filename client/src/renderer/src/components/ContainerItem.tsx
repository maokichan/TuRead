import type { LibraryView } from '@core/domain/types'
import { FittedTitle } from './FittedTitle'

interface ContainerItemProps {
  /** 書箱名（自建模式）或文件夹名（虚拟映射模式） */
  name: string
  view: LibraryView
  onOpen: () => void
}

/**
 * 层级浏览里的"文件夹"条目（2026-09-13 用户定：書箱/文件夹与其他书籍**外观相似**、
 * 可点击打开=进入下一层级）。视觉完全复用书籍的既有语汇：网格 = 2:3 卡 + 文字封面
 * （FittedTitle，与无封面书同款）；列表 = h-16 行 + 左侧文字封面槽 + 源流明体名。
 * 单击即进入（资源管理器语义，不同于书的"单击详情/双击打开"）。
 */
export function ContainerItem({ name, view, onOpen }: ContainerItemProps): React.JSX.Element {
  if (view === 'grid') {
    return (
      <div
        role="button"
        tabIndex={0}
        title={name}
        aria-label={`打開文件夾：${name}`}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen()
          }
        }}
        className="group flex cursor-pointer flex-col gap-1.5"
      >
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel-2)] transition-colors group-hover:border-[var(--accent)]">
          <FittedTitle text={name} />
        </div>
        <span className="line-clamp-2 h-[34px] text-[12.5px] leading-[1.35] text-[var(--muted)] group-hover:text-[var(--text)]">
          {name}
        </span>
      </div>
    )
  }
  return (
    <div
      role="button"
      tabIndex={0}
      title={name}
      aria-label={`打開文件夾：${name}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className="relative h-16 cursor-pointer overflow-hidden rounded-lg border border-transparent transition-colors hover:border-[var(--border)] hover:bg-[var(--panel)]"
    >
      <div className="book-row-cover absolute inset-y-0 left-0 w-2/5 overflow-hidden bg-[var(--panel-2)]">
        <FittedTitle text={name} maxSize={34} minSize={9} paddingRatio={0.03} />
      </div>
      <div className="relative flex h-full items-center pr-3 pl-[30%]">
        <span className="truncate font-[var(--font-serif-cn)] text-[17px] leading-tight font-normal">
          {name}
        </span>
      </div>
    </div>
  )
}
