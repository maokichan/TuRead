/** 目录树扁平化行（ReaderFeature 产出，TocPanel 展示） */
export interface TocRow {
  label: string
  depth: number
  /** 目录项起始渲染节号（缺省 = 无可直达章节，禁用跳转） */
  chapterDocIndex?: number
}

interface TocPanelProps {
  rows: TocRow[]
  onJump: (row: TocRow) => void
}

/** 目录面板（阅读器左侧）—— 纯展示。
 *  STYLE.md §5.1：目录项是**导航文字**，不是按钮 —— 无边框/无底色/无圆角，靠留白分行；
 *  hover 只做色温变化；不可跳转的项降透明度（不是禁用按钮的视觉）。 */
export function TocPanel({ rows, onJump }: TocPanelProps): React.JSX.Element {
  return (
    <aside className="flex w-[220px] flex-none flex-col overflow-y-auto">
      <div className="flex-none border-b border-[var(--border-soft)] pb-1.5 text-[12px] font-semibold tracking-[0.6px] text-[var(--muted)] uppercase">
        目录
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {rows.map((row, i) => (
          <button
            key={i}
            className="block w-full truncate bg-transparent py-1.5 text-left font-[var(--font-serif-cn)] text-[14px] leading-[1.5] text-[var(--muted)] transition-colors hover:text-[var(--text)] disabled:cursor-default disabled:text-[var(--muted)] disabled:opacity-45 disabled:hover:text-[var(--muted)]"
            style={{ paddingLeft: `${8 + row.depth * 14}px` }}
            disabled={row.chapterDocIndex === undefined}
            title={row.chapterDocIndex === undefined ? '（无可直达章节）' : '跳转'}
            onClick={() => onJump(row)}
          >
            {row.label}
          </button>
        ))}
      </div>
    </aside>
  )
}
