/**
 * 功能组件：阅读器（ReaderFeature）
 * 职责（编排的用例/端口）：render.*（open/renderTo/翻页/goToChapter）+ store（lastLocation 恢复/保存）。
 * 打开/关闭受 readerBookId 驱动（状态继承：Library「打开阅读」或 RoomFeature 加入后 host.openReader 触发）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { isZeroLocation } from '@core/domain/location'
import type { BookLocation, BookRecord, Chapter, RenderOptions } from '@core/domain/types'
import type { FeatureProps } from '../types'
import { TocPanel, type TocRow } from '../../components/TocPanel'

function flattenChapterTree(list: Chapter[], depth: number, out: TocRow[]): void {
  for (const c of list) {
    out.push({ label: c.label, depth, chapterDocIndex: c.chapterDocIndex })
    if (c.subitems && c.subitems.length > 0) flattenChapterTree(c.subitems, depth + 1, out)
  }
}

export function ReaderFeature({ container, host, readerBookId }: FeatureProps): React.JSX.Element {
  const [book, setBook] = useState<BookRecord | null>(null)
  const [progress, setProgress] = useState<{ totalPage: number; currentPage: number } | null>(null)
  const [toc, setToc] = useState<TocRow[]>([])
  const [opening, setOpening] = useState(false)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const lastSavedAtRef = useRef(0)

  /** 节流持久化阅读位置（本地恢复用；2s 窗口，翻页连发不刷盘） */
  const saveLastLocation = useCallback(
    (loc: BookLocation) => {
      if (!readerBookId) return
      const now = Date.now()
      if (now - lastSavedAtRef.current < 2000) return
      lastSavedAtRef.current = now
      void container.books.updateLastLocation(readerBookId, loc)
    },
    [container, readerBookId]
  )

  /**
   * 关闭/切换书前落一次位置（绕过 2s 节流）。
   * 没有这一步时，最后 2s 内的翻页/滚动会被节流丢掉，下次开书回到更早的位置。
   * ⚠ 位置必须【同步】读取：调用方随后就会 render.close()，异步读到的已是零位置。
   */
  const flushLastLocation = useCallback((): void => {
    if (!readerBookId) return
    const loc = container.render.getPosition()
    if (isZeroLocation(loc)) return
    lastSavedAtRef.current = 0
    void container.books.updateLastLocation(readerBookId, loc)
  }, [container, readerBookId])

  // 位置事件 → 进度 + 持久化（同步数据源，见 RENDER_INTERFACE.md §4）
  useEffect(() => {
    return container.render.on('location-changed', (loc) => {
      setProgress(container.render.getProgress())
      saveLastLocation(loc)
    })
  }, [container, saveLastLocation])

  // 打开/关闭受 readerBookId 驱动（host.openReader / host.closeReader）
  useEffect(() => {
    if (!readerBookId) {
      setBook(null)
      setProgress(null)
      setToc([])
      void container.render.close()
      return
    }
    let cancelled = false
    void (async () => {
      setOpening(true)
      try {
        const latest = await container.books.get(readerBookId)
        if (!latest || cancelled) return
        // 宿主容器从 display:none 切回后需等一帧再测量/渲染
        await new Promise((r) => requestAnimationFrame(() => r(null)))
        // 布局模式来自「设置」功能组件（readerSettings，重开书生效）
        const cfg = await container.store.getSetting<{
          readerMode?: NonNullable<RenderOptions['readerMode']>
        }>('readerSettings', {})
        await container.render.open(latest, {
          readerMode: cfg.readerMode ?? 'scroll',
          animation: 'none'
        })
        if (stageRef.current) await container.render.renderTo(stageRef.current)
        if (cancelled) return
        setBook(latest)
        setProgress(container.render.getProgress())
        // 兜底启发式：kookit 无 toc 的书会用纯数字页码生成 chapterList（如 PDF 每页一项），
        // 全数字 = 假目录，不显示抽屉；存在任一非纯数字标题才视为真目录。
        const rows: TocRow[] = []
        flattenChapterTree(container.render.getChapter(), 0, rows)
        setToc(rows.some((r) => /[^\d]/.test(r.label)) ? rows : [])
        host.pushLog(`已打开：${latest.metadata.title}（目录 ${rows.length} 项）`)
      } catch (err) {
        host.pushLog(`打开失败：${(err as Error).message}`)
      } finally {
        if (!cancelled) setOpening(false)
      }
    })()
    return () => {
      cancelled = true
      // 关书 / 切书 / 卸载：先落位置再让下一次 effect（或 render.close）动渲染状态
      flushLastLocation()
    }
  }, [readerBookId, container, host, flushLastLocation])

  const pageTurn = useCallback(
    async (dir: 'next' | 'prev') => {
      if (!book || opening) return
      if (dir === 'next') await container.render.next()
      else await container.render.prev()
      setProgress(container.render.getProgress())
    },
    [container, book, opening]
  )

  /** 目录跳转：透传到渲染层 goToChapter（chapterDocIndex 标尺） */
  const jumpChapter = useCallback(
    async (row: TocRow) => {
      if (row.chapterDocIndex === undefined || !book || opening) return
      try {
        await container.render.goToChapter(row.chapterDocIndex)
        setProgress(container.render.getProgress())
        host.pushLog(`跳到：${row.label}`)
      } catch (err) {
        host.pushLog(`跳转失败：${(err as Error).message}`)
      }
    },
    [container, book, opening, host]
  )

  return (
    <section className="flex h-full flex-col gap-3">
      <div className="flex flex-none items-center justify-between gap-3">
        <span className="truncate text-[14px] font-semibold">
          {book ? book.metadata.title : '未打开书籍'}
        </span>
        <div className="flex flex-none items-center gap-5">
          <button className="text-action" onClick={() => void pageTurn('prev')} disabled={!book}>
            上一页
          </button>
          <span className="min-w-[90px] text-center text-[12.5px] text-[var(--muted)]">
            {progress ? `${progress.currentPage} / ${progress.totalPage}` : '—'}
          </span>
          <button className="text-action" onClick={() => void pageTurn('next')} disabled={!book}>
            下一页
          </button>
          {book && (
            <button className="text-action text-action--primary" onClick={() => host.closeReader()}>
              关闭
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {book && toc.length > 0 && <TocPanel rows={toc} onJump={(r) => void jumpChapter(r)} />}
        {/* kookit 宿主容器：id 硬编码契约 + 可滚动（见 styles.css .reader-stage）；页面色随主题 */}
        <div
          className="reader-stage min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--page-bg)] text-[var(--page-text)]"
          id="page-area"
          ref={stageRef}
        />
      </div>
    </section>
  )
}
