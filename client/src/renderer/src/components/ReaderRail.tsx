/**
 * ReaderRail —— 阅读器**挂载线实体**（2026-09-12 用户定，二次纠正后定稿）。
 *
 * 一条**横向挂载线**，从目录段起**延伸整个页面宽度**（跨过正文上方直到右缘）：
 * - 左段 = 目录挂载区：目录**向下垂挂**（TocPanel）；目录折叠时，**点线（左段）= 展开目录**；
 * - 右段 = 阅读参数挂载区：参数面板挂在**右侧线下方**，**折叠 = 向上收回线里**（用户定）；
 *   把手即线本身（右段），面板内无收起按钮（2026-09-12 废除）。
 * 两个挂件互不干扰（左/右分区），又同处一条线（同一实体）。
 * 中段是纯线段（跨过正文上方，无交互）。
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
      {/* 横向挂载线：左段（目录）+ 中段（纯线）+ 右段（参数），三段拼出整页宽的一条线 */}
      <div className="reader-rail">
        <button
          className="reader-rail__zone reader-rail__zone--toc"
          aria-label={tocOpen ? '收起目錄' : '打開目錄'}
          aria-expanded={tocOpen}
          title={tocOpen ? '收起目錄' : '目錄'}
          onClick={onTocToggle}
        />
        <div className="reader-rail__span" aria-hidden="true" />
        <button
          className="reader-rail__zone reader-rail__zone--params"
          aria-label={controlsOpen ? '收起閱讀參數' : '閱讀參數'}
          aria-expanded={controlsOpen}
          title={controlsOpen ? '收起閱讀參數' : '閱讀參數'}
          onClick={onControlsToggle}
        />
      </div>

      {/* 左挂件：目录垂挂列表（挂在线下方） */}
      {tocOpen && tocRows.length > 0 && (
        <TocPanel rows={tocRows} onJump={onTocJump} onToggle={onTocToggle} />
      )}

      {/* 右挂件：参数面板（挂在线下方右侧；折叠 = 向上收回线里） */}
      {controlsOpen && <ReaderControls params={params} onChange={onParamsChange} />}
    </>
  )
}
