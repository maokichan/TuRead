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

/** 目录面板（阅读器左侧）—— 纯展示 */
export function TocPanel({ rows, onJump }: TocPanelProps): React.JSX.Element {
  return (
    <aside className="flex w-[220px] flex-none flex-col overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--panel)]">
      <div className="flex-none border-b border-[var(--border-soft)] px-3 pt-2.5 pb-1.5 text-xs font-semibold tracking-[0.6px] text-[var(--muted)] uppercase">
        目录
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {rows.map((row, i) => (
          <button
            key={i}
            className="block w-full truncate rounded-md px-2 py-1 text-left text-[12.5px] leading-[1.45] text-[var(--text)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:opacity-70 disabled:hover:bg-transparent disabled:hover:text-[var(--muted)]"
            style={{ paddingLeft: `${10 + row.depth * 14}px` }}
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
