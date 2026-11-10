/**
 * 开书/关书与位置持久化钩子（自 ReaderFeature 拆出，行为契约不变）。
 * 打开/关闭受 readerBookId 驱动（host.openReader / host.closeReader）；布局模式改动经
 * `reopenTick` 重跑本钩子的打开 effect（kookit config 只在 open 时消费）。
 * ⚠ 开书流程的关键时序：等一帧再测量（display:none 切回）→ 读布局档 → **先按本书格式切纸宽
 * 再 open/renderTo**（kookit PDF 按渲染时刻容器宽定 canvas 像素，晚一帧就按旧宽画）→
 * 代次守卫（作废的流程不得再 renderTo）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { isZeroLocation } from '@core/domain/location'
import type { ResolvedTheme } from '@core/domain/theme'
import type { BookLocation, BookRecord, Chapter, ReaderSettings, RenderOptions } from '@core/domain/types'
import type { RenderContextMenuRequest } from '@core/ports/render'
import type { ServiceContainer } from '@core/container'
import type { FeatureHost } from '../types'
import type { TocRow } from '../../components/TocPanel'
import type { ReaderParams } from '../../components/ReaderControls'
import type { CardPageKind } from '../../components/ReaderRail'
import type { ReaderComposer } from './useReaderNotes'

export type ReaderMode = NonNullable<RenderOptions['readerMode']>

function flattenChapterTree(list: Chapter[], depth: number, out: TocRow[]): void {
  for (const c of list) {
    out.push({ label: c.label, depth, chapterDocIndex: c.chapterDocIndex })
    if (c.subitems && c.subitems.length > 0) flattenChapterTree(c.subitems, depth + 1, out)
  }
}

/** 当前 resolved 主题：以宿主 data-theme 为准（SettingsFeature 应用），非法值回退 纯色·深 */
export function currentTheme(): ResolvedTheme {
  const v = document.documentElement.getAttribute('data-theme')
  return v === 'light' || v === 'sepia-light' || v === 'sepia-dark' ? v : 'dark'
}

export function useReaderOpening(params: {
  container: ServiceContainer
  host: FeatureHost
  readerBookId: string | null
  /** 布局模式改动 = 重开书（tick 触发打开 effect 重跑）；state 所有权在 Feature */
  reopenTick: number
  applyParams: (p: ReaderParams, isPdf: boolean) => void
  paramsRef: MutableRefObject<ReaderParams>
  /** 关书/换书的瞬时态复位（浮层与卡片页态属于上一本书、上一次交互） */
  setBook: Dispatch<SetStateAction<BookRecord | null>>
  setTocOpen: Dispatch<SetStateAction<boolean>>
  setComposer: Dispatch<SetStateAction<ReaderComposer>>
  setMenu: Dispatch<SetStateAction<RenderContextMenuRequest | null>>
  setRightPanel: Dispatch<SetStateAction<CardPageKind>>
  setChatDraft: Dispatch<SetStateAction<string>>
  /** 正文列挂载点（kookit 渲染目标；id `page-area` 是 kookit 硬编码契约） */
  stageRef: MutableRefObject<HTMLDivElement | null>
}): {
  toc: TocRow[]
  opening: boolean
  readerMode: ReaderMode
  setReaderMode: Dispatch<SetStateAction<ReaderMode>>
  /** 当前阅读位置（章号）：目录/笔记列表据此把"当前条目"滚到正中 */
  currentChapter: number
  /** 本次打开所用的主题快照（open 时刻指认；PDF 环境同步据此判烘焙失配） */
  openedThemeRef: MutableRefObject<ResolvedTheme | null>
} {
  const {
    container,
    host,
    readerBookId,
    reopenTick,
    applyParams,
    paramsRef,
    setBook,
    setTocOpen,
    setComposer,
    setMenu,
    setRightPanel,
    setChatDraft,
    stageRef
  } = params
  const [toc, setToc] = useState<TocRow[]>([])
  const [opening, setOpening] = useState(false)
  const [readerMode, setReaderMode] = useState<ReaderMode>('scroll')
  const lastSavedAtRef = useRef(0)
  /**
   * 本次打开所用的主题（open 时刻快照）。PDF 的深色烘焙按它执行——环境主题一旦与它
   * 不一致（切主题/换设置后返回阅读器），UI 层据此自动触发原地重开（usePdfLayoutSync）。
   */
  const openedThemeRef = useRef<ResolvedTheme | null>(null)
  /**
   * 当前阅读位置（章号，= `BookLocation.chapterDocIndex`）。只在**换了章**时 setState，
   * 滚动过程中的重复事件不重渲染。
   */
  const [currentChapter, setCurrentChapter] = useState(0)

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

  // 位置事件 → 持久化（同步数据源，见 RENDER_INTERFACE.md §4）；
  // currentChapter：目录 / 笔记列表要知道"读到第几章"才能把当前条目放到中间
  useEffect(() => {
    return container.render.on('location-changed', (loc) => {
      saveLastLocation(loc)
      if (isZeroLocation(loc)) return
      setCurrentChapter((prev) => (prev === loc.chapterDocIndex ? prev : loc.chapterDocIndex))
    })
  }, [container, saveLastLocation])

  // 打开/关闭受 readerBookId 驱动（host.openReader / host.closeReader）
  useEffect(() => {
    // 换书 / 关书：两个瞬时浮层都不该留着（它们属于上一本书、上一次交互）
    setComposer(null)
    setMenu(null)
    // 右挂件回「參數」并清掉聊天草稿（聊天属于上一本书的房间会话；页签本身随会话消失）
    setRightPanel('params')
    setChatDraft('')
    if (!readerBookId) {
      setBook(null)
      setToc([])
      setTocOpen(true)
      openedThemeRef.current = null
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
        // 布局模式来自 readerSettings（阅读参数面板是唯一写者，重开书生效）
        const cfg = await container.store.getSetting<ReaderSettings>('readerSettings', {})
        const mode = cfg.readerMode ?? 'scroll'
        setReaderMode(mode)
        // 阅读状态住 `ReadingState`，**首次定位的目标位置必须显式传入**
        // （适配器不读 `record.lastLocation` —— 见 RenderOptions.lastLocation）
        const state = await container.books.getReadingState(latest.id)
        // 纸宽按**本书格式**切换（PDF 专属档）——必须在 open/renderTo 之前：
        // kookit PDF 按渲染时刻的容器宽定 canvas 像素，晚切一帧这页就按旧宽度画了
        applyParams(paramsRef.current, latest.format === 'PDF')
        const openedTheme = currentTheme()
        openedThemeRef.current = openedTheme
        await container.render.open(latest, {
          readerMode: mode,
          animation: 'none',
          theme: openedTheme,
          ...(state?.lastLocation ? { lastLocation: state.lastLocation } : {})
        })
        // open 期间用户可能已换书/关书（代次守卫）：作废的流程不得再对 stage 执行
        // renderTo（与接管者的渲染交错，正是「重开书偶发空白」的症状形状之一）
        if (cancelled) return
        if (stageRef.current) await container.render.renderTo(stageRef.current)
        if (cancelled) return
        setBook(latest)
        // 跟随判据的**初始值**：以打开后的权威位置为准（不能沿用上一本书的章号 ——
        // 否则新书的目录会在第一次翻页前停在"上一本读到的那一章"所对应的条目上）
        setCurrentChapter(container.render.getPosition().chapterDocIndex)
        // 兜底启发式：kookit 无 toc 的书会用纯数字页码生成 chapterList（如 PDF 每页一项），
        // 全数字 = 假目录，不显示；存在任一非纯数字标题才视为真目录。
        const rows: TocRow[] = []
        flattenChapterTree(container.render.getChapter(), 0, rows)
        setToc(rows.some((r) => /[^\d]/.test(r.label)) ? rows : [])
        // 换书回到默认展示态（隐藏是"临时"的，不跨书继承）
        setTocOpen(true)
        host.pushLog(`已打开：${latest.metadata.title}（目录 ${rows.length} 项）`)
      } catch (err) {
        // 换书/关书时旧 open 被代次守卫作废 = 预期取消，不是失败（适配器口径见 kookitRenderAdapter.open）
        if (!(err as Error).message.includes('[render] open superseded')) {
          host.pushLog(`打开失败：${(err as Error).message}`)
        }
      } finally {
        if (!cancelled) setOpening(false)
      }
    })()
    return () => {
      cancelled = true
      // 关书 / 切书 / 卸载：先落位置再让下一次 effect（或 render.close）动渲染状态
      flushLastLocation()
    }
  }, [readerBookId, reopenTick, container, host, flushLastLocation, applyParams, paramsRef, setBook, setTocOpen, setComposer, setMenu, setRightPanel, setChatDraft, stageRef])

  return { toc, opening, readerMode, setReaderMode, currentChapter, openedThemeRef }
}
