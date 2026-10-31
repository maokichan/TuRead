/**
 * ReaderTabStrip —— 阅读标签条（批1.10）：**打开一本书 = 开一个标签**。
 *
 * 定位：底面全局件（STYLE.md §1.1 词表扩展），住 `--inset-top` 顶条带、后退/前进的邻居，
 * 全功能态可见 —— 标签就是阅读会话的"在场"：切去设置/书库后，标签条仍证明书开着，
 * 点标签即唤回阅读卡（状态继承：书没重开、位置没丢）。
 *
 * 视觉（用户定"大小和质地适中"）：纯文字（P1）—— 活跃标签 = `--panel-2` 底 + `--text`，
 * 非活跃 = `--muted`（hover 升 `--text` + 同款轻底）——选中/hover 语言与窗控、大厅行同源（§3.5），
 * 无边框、无阴影、直角（条带语汇）；层级靠色温与留白，不靠盒子。关闭「×」悬停显形。
 * 单格上限 `--tab-max-w`（styles.css）；超出省略号收尾，标签多时整体收窄（overflow 随顶条带）。
 */

/** 标签条单格：editionId = 标签身份（一本书一个标签）；title 异步补齐（缺省显示省略号） */
export interface ReaderTabItem {
  editionId: string
  title: string
}

export function ReaderTabStrip({
  tabs,
  activeId,
  onActivate,
  onClose
}: {
  tabs: ReaderTabItem[]
  activeId: string | null
  onActivate: (editionId: string) => void
  onClose: (editionId: string) => void
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-1 items-stretch overflow-hidden" role="tablist" aria-label="閱讀標籤">
      {tabs.map((t) => {
        const active = t.editionId === activeId
        return (
          <div key={t.editionId} className="group relative flex min-w-0 items-stretch">
            <button
              role="tab"
              aria-selected={active}
              aria-current={active ? 'true' : undefined}
              title={t.title || undefined}
              onClick={() => onActivate(t.editionId)}
              className={`flex min-w-0 items-center px-3 text-[13px] transition-colors duration-[var(--dur-hover)] ${
                active
                  ? 'bg-[var(--panel-2)] text-[var(--text)]'
                  : 'text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]'
              }`}
            >
              <span className="max-w-[var(--tab-max-w)] truncate">{t.title || '…'}</span>
            </button>
            <button
              aria-label={`關閉 ${t.title || '標籤'}`}
              title="關閉標籤"
              onClick={() => onClose(t.editionId)}
              className="absolute right-0 top-0 flex h-full w-5 items-center justify-center text-[12.5px] text-[var(--muted)] opacity-0 transition-[opacity,color] duration-[var(--dur-hover)] hover:text-[var(--text)] group-hover:opacity-100"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
