/**
 * 阅读会话记录器：
 * 把"阅读态里实际盯着正文的时长"按**会话段**写进 `reading_sessions`（经 appendReadingSession，
 * 时长累加的唯一写入口）。本文件 = 那条写入路径。
 *
 * **口径**：
 * - 累计范围 = 阅读态（阅读器激活且开着书）；
 * - **失焦暂停**：窗口 blur → 结段落笔，focus → 开新段；
 * - **边界落笔**（无心跳）：失焦 / 换书 / 关标签退阅读器 / 退 app（pagehide + beforeunload +
 *   visibilitychange hidden 三重兜底）四处各记一笔；单段超 1h 强制结段（防悬挂）；
 * - **<10s 丢弃**：误开不算；
 * - 落笔 = append-only，幂等安全（StrictMode 双挂载多 flush 一次只是把同一段拆两行，总和不变）。
 *
 * ⚠ **段携带自己的 edition 快照**（`Segment.editionId`）：flush 记**开段时刻**的账。
 * 不能读"当前 ref"——ref 在渲染期先更新、effect 清理后跑，换书/离开阅读器时 flush 会把
 * 旧段记到新书名下或因 enabled 已变被静默丢弃。
 * invoke 的请求在 send 时即入主进程管道，渲染层随后被拆不回滚主进程侧写入 —— 退 app 路径成立。
 *
 * 数据事实：贡献图（按日聚合）只有从这里开始才有形状；迁移旧账只存在于
 * `reading_state.total_read_ms` 投影（Top 榜的数据源），两者口径不同。
 */
import { useEffect, useRef } from 'react'
import type { ServiceContainer } from '@core/container'

/** 最小计入时长（ms）：低于此的段不落库（误开书不算） */
const MIN_SESSION_MS = 10_000
/** 单段强制结段上限（ms）：边界事件长时间不来时，时长仍按小时级落库 */
const MAX_SEGMENT_MS = 3_600_000

/** 一段计费中的会话：edition 在开段时刻定格（flush 记开段时刻的账） */
interface Segment {
  editionId: string
  start: number
}

export function useReadSessionRecorder(
  container: ServiceContainer,
  enabled: boolean,
  editionId: string | null
): void {
  const segRef = useRef<Segment | null>(null)
  const editionRef = useRef(editionId)
  editionRef.current = editionId
  const containerRef = useRef(container)
  containerRef.current = container

  /** 结段落笔：<10s 丢弃 */
  const flush = (): void => {
    const seg = segRef.current
    segRef.current = null
    if (!seg) return
    const endedAt = Date.now()
    const durationMs = endedAt - seg.start
    if (durationMs < MIN_SESSION_MS) return
    void containerRef.current.store.appendReadingSession({
      editionId: seg.editionId,
      startedAt: seg.start,
      endedAt,
      durationMs
    })
  }

  /** 开新段（已在计则不动；单段超上限先结再开） */
  const startSegment = (): void => {
    if (!editionRef.current) return
    const seg = segRef.current
    if (seg && Date.now() - seg.start >= MAX_SEGMENT_MS) flush()
    if (segRef.current === null) segRef.current = { editionId: editionRef.current, start: Date.now() }
  }

  useEffect(() => {
    if (enabled && editionId) {
      // 换书边界：旧段结掉（记旧书的账），新书开新段
      if (segRef.current && segRef.current.editionId !== editionId) flush()
      startSegment()
    } else {
      flush()
    }

    const onBlur = (): void => flush()
    const onFocus = (): void => startSegment()
    const onHidden = (): void => {
      if (document.visibilityState === 'hidden') flush()
      else startSegment()
    }
    // 退 app 的边界（渲染层能收到的最后事件）；invoke 请求即发即达主进程
    const onPageHide = (): void => flush()
    const onBeforeUnload = (): void => flush()
    // 单段超上限的看门狗：边界事件长时间不来也按小时级结段
    const watchdog = window.setInterval(() => {
      const seg = segRef.current
      if (seg && Date.now() - seg.start >= MAX_SEGMENT_MS) {
        flush()
        startSegment()
      }
    }, 60_000)

    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('visibilitychange', onHidden)
      window.clearInterval(watchdog)
      // 卸载路径 = 边界之一（关标签退阅读器；换书由上面的 editionId 分支先结）
      flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, editionId])
}
