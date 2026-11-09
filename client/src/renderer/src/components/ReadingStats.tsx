/**
 * 阅读时间统计段 —— 筆記列表顶部的「閱讀」段。
 *
 * 形态：
 * - **贡献图** = 最近 26 周 × 7 日的格子（10px 列流，CSS grid），每日阅读分钟数映射到
 *   `--accent` 的透明度阶梯（5 档，不引新色相）；今天描边；空日 = `--panel-2` 静默底。
 *   ⚠ 逐日数据自记录器接入起才有形状——迁移旧账只住在 `reading_state` 投影，
 *   画不进格子（诚实口径）。
 * - **Top 榜** = 阅读时长前 5（`topReadEditions`，含迁移旧账、立刻有数据）；
 *   长题走 Marquee 悬停滚动（与目录条目同款语汇）；时长右对齐 muted。
 * - **无假交互**：格子不点（无按日下钻口径）、榜行不跳书（v1 只读）。
 *
 * **落位**：住**侧栏「筆」功能**（笔记管理）列表顶部——统计 = **全局口径**
 * （跨书、全库：逐日聚合与 Top 榜本就不带书过滤）。
 * 布局两档：`card`（纵排，280px 卡）/ `page`（两栏：图 + 摘要在左、Top 榜在右，全宽页）。
 * 两件分离：`ReadingStatsView` = 纯视图（props 进数据，样张可挂 mock）；
 * `ReadingStatsSection` = 取数段（挂载时一次拉取，不订阅——"进页看一眼"的场景）。
 */
import { useEffect, useState } from 'react'
import type { ReadDayMinutes, TopReadEdition } from '@core/domain/types'
import type { ServiceContainer } from '@core/container'
import { Marquee } from './Marquee'

/** 贡献图覆盖天数：26 周（182 天，列 = 周，恰好整除） */
const GRAPH_DAYS = 182

/** 本地时区 `YYYY-MM-DD`（SQLite 'localtime' 同口径，两边必须一致） */
function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fmtDuration(ms: number): string {
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))} 分鐘`
  const h = Math.floor(ms / 3_600_000)
  const m = Math.round((ms % 3_600_000) / 60_000)
  return m > 0 ? `${h} 小時 ${m} 分` : `${h} 小時`
}

/** 强度档位：0 → 空格；>0 → 按占比 4 档（25/50/75/100） */
function cellColor(minutes: number, max: number): string {
  if (minutes <= 0) return 'var(--panel-2)'
  const ratio = minutes / Math.max(1, max)
  const pct = ratio > 0.66 ? 100 : ratio > 0.33 ? 70 : ratio > 0.1 ? 45 : 25
  return `color-mix(in srgb, var(--accent) ${pct}%, var(--panel-2))`
}

export function ReadingStatsView({
  days,
  top,
  variant = 'card'
}: {
  days: ReadDayMinutes[]
  top: TopReadEdition[]
  /** card = 纵排（280px 卡片页）；page = 两栏（筆功能全宽页：图+摘要在左、榜在右） */
  variant?: 'card' | 'page'
}): React.JSX.Element {
  const byDay = new Map(days.map((d) => [d.day, d.minutes]))
  const cells: Array<{ key: string; minutes: number }> = []
  const today = new Date()
  for (let i = GRAPH_DAYS - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = dayKey(d)
    cells.push({ key, minutes: byDay.get(key) ?? 0 })
  }
  const max = Math.max(...days.map((d) => d.minutes), 1)
  // 摘要：今日 + 本週（都来自逐日数据；"總計"要新端口，v1 不做——不装作有数据）
  const todayMinutes = byDay.get(dayKey(today)) ?? 0
  const weekMinutes = cells.slice(-7).reduce((s, c) => s + c.minutes, 0)
  const hasData = days.length > 0 || top.length > 0

  return (
    <div className={`reading-stats${variant === 'page' ? ' reading-stats--page' : ''}`}>
      {/* 无标题：贡献图 + 数字自解释（功能界面不配说明书） */}
      {!hasData ? (
        <p className="reading-stats__empty">還沒有閱讀記錄</p>
      ) : (
        <>
          <div className="reading-stats__main">
          <div className="reading-stats__graph" role="img" aria-label="最近 26 周每日閱讀時長貢獻圖">
            {cells.map((c) => (
              <span
                key={c.key}
                className="reading-stats__cell"
                data-today={c.key === dayKey(today) || undefined}
                style={{ background: cellColor(c.minutes, max) }}
                title={`${c.key} · ${Math.round(c.minutes)} 分鐘`}
              />
            ))}
          </div>
          <p className="reading-stats__summary">
            今日 {Math.round(todayMinutes)} 分鐘 · 本週 {Math.round(weekMinutes)} 分鐘
          </p>
          </div>
          {top.length > 0 && (
            <div className="reading-stats__top">
              {top.map((t, i) => (
                <div key={t.editionId} className="reading-stats__row">
                  <span className="reading-stats__rank">{i + 1}</span>
                  <span className="reading-stats__book">
                    <Marquee duration={14} pauseOnHover>
                      {t.title}
                    </Marquee>
                  </span>
                  <span className="reading-stats__time">{fmtDuration(t.totalMs)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** 取数段（侧栏「筆」列表顶部用）：挂载时一次拉取，不订阅（"进页看一眼"的场景） */
export function ReadingStatsSection({
  container,
  variant = 'card'
}: {
  container: ServiceContainer
  variant?: 'card' | 'page'
}): React.JSX.Element {
  const [days, setDays] = useState<ReadDayMinutes[]>([])
  const [top, setTop] = useState<TopReadEdition[]>([])
  useEffect(() => {
    let cancelled = false
    void container.store.readMinutesByDay(182).then((r) => {
      if (!cancelled) setDays(r)
    })
    void container.store.topReadEditions(5).then((r) => {
      if (!cancelled) setTop(r)
    })
    return () => {
      cancelled = true
    }
  }, [container])
  return <ReadingStatsView days={days} top={top} variant={variant} />
}
