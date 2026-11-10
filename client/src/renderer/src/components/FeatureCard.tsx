/**
 * FeatureCard —— 卡片层标准表面（批1.7c，docs/DIRECTION.md §2 / STYLE.md §1.1）。
 *
 * 五张功能卡（书库/阅读/笔记/房间/设置）共用一套卡面语法：
 * 桌色面 + `--radius-panel` + 1px 边 + `--shadow-panel`；
 * 进场 = 自下 8px 浮起显影（`.feature-card`，styles.css；display:none → 显示即触发）。
 * scroll = 卡内滚动 + 统一卡内衬（`p-5`，承接原 main 的内边距角色）：内容可能超出
 * 卡高的卡（设置页）用真值；自带内滚的卡（书库/笔记/房间）也给真值保持原排版；
 * 阅读卡给假值——它的几何（挂载线/纸边距）由自己全权管理，卡面零内衬。
 * flat = 无阴影档（用户定：阅读双卡**平压在底板上**，卡下不得有影线；卡面 = **底板本色**
 * （与底板无色差才是「压平」，桌色会比底板深一档、浅色下读作影），圆角与 1px 边保留，
 * 双卡地位平等）。只用于阅读卡（右欄兄弟卡同档，见 styles.css `.rail-card`）。
 * 叠置遮罩（scrim）不住这里——"阅读卡 ⊃ 书库卡"的 `--overlay-dim` 包装在 AppShell 层分支上。
 */
interface FeatureCardProps {
  scroll?: boolean
  /** 无阴影档（阅读双卡平压底板口径，见上） */
  flat?: boolean
  /** 附加类（阅读卡的退场形态，styles.css `.feature-card--exit`） */
  className?: string
  /** 内联样式（进场锚点 = transform-origin，由 shell 换算成卡面百分比写入） */
  style?: React.CSSProperties
  children: React.ReactNode
}

export function FeatureCard({ scroll, flat, className, style, children }: FeatureCardProps): React.JSX.Element {
  return (
    <div
      style={style}
      className={`feature-card h-full w-full ${
        scroll ? 'overflow-y-auto overflow-x-hidden p-5' : 'overflow-hidden'
      } rounded-[var(--radius-panel)] border border-[var(--border)] ${
        flat
          ? 'bg-[var(--bg)]'
          : 'bg-[var(--desk-bg)] shadow-[var(--shadow-panel)]'
      } ${className ?? ''}`}
    >
      {children}
    </div>
  )
}
