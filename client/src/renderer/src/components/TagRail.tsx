/**
 * TagRail —— 侧栏阅读标签区（标签条形态重设计，2026-11-03 用户定）：
 * 标签从顶栏迁入左侧栏，住功能组件之下、一道短分界线之下（线上 = 功能图标、线下 = 开着的书，
 * 2026-10-31 已裁方向）。顶栏形态随本组件退役（ChromeControls 恢复仅窗控）。
 *
 * 形态 = 第三条路「**窄格 + 按需揭示**」：与 .feature-nav 同款几何（40×40 格，--sidebar-w
 * 56px 承重墙不动——原「窄 = 封面块 vs 宽 = 动墙」的两难就此消解），格内只显示书名**首字**
 * （`tagGlyph`：跳过空白/标点/符号取第一个文字字符——用户定「不显示符号」；英文先不特殊处理）。
 * 悬停时**揭示全题**：首字格淡出、带衬底胶囊的全题自格左缘展开并微微左滑（--ease-out），
 * 越过格界显示在卡片层之上（提层机制见 styles.css .sidebar-rail:has）。胶囊宽随标题自适应、
 * 上限 `--tag-flyout-max-w`；到顶仍显示不完的（如同套上下册——前缀相同，截断就分不出）
 * **在胶囊内滚动**（Marquee 无缝循环，2026-11-03 用户定；pauseOnHover 必须关——胶囊只在
 * 格子 hover 时可见，光标恒在其上，悬停暂停 = 永远不滚）。
 *
 * 用户 2026-11-03 定的三条配套：
 * ① 溢出的全题由**衬底胶囊**托住（--panel-2 底 + 1px --border 边随揭示渐显——裸字叠在
 *   封面/文字上会糊成一片）；胶囊是「托着字的一片影」，不是盒子：直角（条带语汇）、无阴影。
 * ② 关闭键不占格子，**交右键菜单**（关闭标签/关闭其他——与聚焦舞台「操作键交右键」同构）。
 * ③ 选中态**不用负片**（负片留给功能导航——标签是"开着的书"不是"功能位置"）：
 *   首字升 --text + --panel-2 满格轻底，与退役顶栏的选中语言同源。
 *
 * 可访问性：原生 title 去掉（揭示即提示，叠加 tooltip 冗余）；role=tab + 内部全题文本供读屏。
 * 位置（2026-11-03 用户定）：住最后一个功能（筆記）之下、「設」钉底之上，上方短分界线。
 * 已知边界：.tag-rail **不设滚动**（overflow-y:auto 会把横向也强制收敛，胶囊越过格界即触发
 * 水平滚动条——2026-11-03 用户报后去除）；标签极多时格子会溢出窗口底，「更多」折叠态登记 TODO。
 */

/** 标签身份（承自退役顶栏 ReaderTabStrip）：editionId = 标签身份（一本书一个标签）；title 异步补齐 */
export interface ReaderTabItem {
  editionId: string
  title: string
}

/** 首字跳符号：空白/标点/符号都不算「字」（书名号、引号、#、序号点等），数字算文字 */
const GLYPH_SKIP = /[\s\p{P}\p{S}]/u

/** 标签格的静态首字：跳过前导符号取第一个文字字符；空标题/全符号 = 省略号占位 */
export function tagGlyph(title: string): string {
  for (const ch of title) {
    if (!GLYPH_SKIP.test(ch)) return ch
  }
  return '…'
}

import { Marquee } from './Marquee'

export interface TagRailProps {
  tabs: ReaderTabItem[]
  activeId: string | null
  onActivate: (editionId: string) => void
  /** 右键 = 关闭菜单（坐标 + 标签身份；菜单项由宿主组装——关闭/关闭其他要动宿主的标签态） */
  onMenu: (x: number, y: number, editionId: string) => void
}

export function TagRail({ tabs, activeId, onActivate, onMenu }: TagRailProps): React.JSX.Element {
  return (
    <div className="tag-rail" role="tablist" aria-label="閱讀標籤">
      {tabs.map((t) => {
        const active = t.editionId === activeId
        return (
          <button
            key={t.editionId}
            type="button"
            role="tab"
            aria-selected={active}
            aria-current={active ? 'true' : undefined}
            onClick={() => onActivate(t.editionId)}
            onContextMenu={(e) => {
              e.preventDefault()
              onMenu(e.clientX, e.clientY, t.editionId)
            }}
            className={`tag-cell ${active ? 'tag-cell--active' : ''}`}
          >
            {/* 静态首字（grid 居中，与 .feature-nav 同机制）；揭示时交叉淡出 */}
            <span className="tag-cell__glyph" aria-hidden="true">
              {tagGlyph(t.title)}
            </span>
            {/* 揭示层：全题 + 衬底胶囊，越过格界（styles.css .tag-cell__flyout）；
                到上限仍显示不完 → 胶囊内无缝滚动（Marquee 量宽，溢出才滚） */}
            <span className="tag-cell__flyout">
              <Marquee duration={12} pauseOnHover={false}>
                {t.title || '…'}
              </Marquee>
            </span>
          </button>
        )
      })}
    </div>
  )
}
