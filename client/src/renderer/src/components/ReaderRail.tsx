/**
 * ReaderRail —— 阅读器**挂载线实体**（2026-09-12 用户定）。
 *
 * 解决什么：目录（顶部垂挂）与阅读参数（原右侧独立召唤条 + 面板内「收起」）是两套召唤交互，
 * 职能重复。统一为**一条贯穿全页高的挂载线**：
 * - 线本体是一个按钮：**目录折叠时，点线 = 展开目录**（线的点击职能，用户定）；
 * - 顶部挂件 = 目录垂挂列表（TocPanel，形态不变）；
 * - 底部挂件 = 阅读参数把手 + 参数面板，**把手开合、面板向上展开**（面板内无收起按钮，
 *   用户 2026-09-12 定："收起阅读参数"按钮废除）。
 * 两个挂件互不干扰（上/下分区），又同处一条线（同一实体）。
 */
import type { TocRow } from './TocPanel'
import { TocPanel } from './TocPanel'
import { ReaderControls, type ReaderParams } from './ReaderControls'

interface ReaderRailProps {
  tocOpen: boolean
  onTocToggle: () => void
  tocRows: TocRow[]
  onTocJump: (row: TocRow) => void
  controlsOpen: boolean
  onControlsToggle: () => void
  params: ReaderParams
  onParamsChange: (patch: Partial<ReaderParams>) => void
}

export function ReaderRail({
  tocOpen,
  onTocToggle,
  tocRows,
  onTocJump,
  controlsOpen,
  onControlsToggle,
  params,
  onParamsChange
}: ReaderRailProps): React.JSX.Element {
  return (
    <>
      {/* 线本体：全页高，目录折叠时的展开热区。z 在两个挂件之下，不挡条目与面板内交互 */}
      <button
        className="reader-rail"
        aria-label={tocOpen ? '收起目錄' : '打開目錄'}
        aria-expanded={tocOpen}
        title={tocOpen ? '收起目錄' : '目錄'}
        onClick={onTocToggle}
      >
        <span className="reader-rail__line" />
      </button>

      {/* 顶部挂件：目录垂挂列表 */}
      {tocOpen && tocRows.length > 0 && (
        <TocPanel rows={tocRows} onJump={onTocJump} onToggle={onTocToggle} />
      )}

      {/* 底部挂件：参数把手 + 面板（向上展开；把手在面板之下常驻，开合共用） */}
      {controlsOpen && (
        <div className="reader-params">
          <ReaderControls params={params} onChange={onParamsChange} />
        </div>
      )}
      <button
        className={`reader-rail__handle ${controlsOpen ? 'reader-rail__handle--open' : ''}`}
        aria-label={controlsOpen ? '收起閱讀參數' : '閱讀參數'}
        aria-expanded={controlsOpen}
        title={controlsOpen ? '收起閱讀參數' : '閱讀參數'}
        onClick={onControlsToggle}
      >
        參數
      </button>
    </>
  )
}
