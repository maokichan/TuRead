/**
 * 功能组件：阅读器（ReaderFeature）
 * 职责（编排的用例/端口）：render.*（open/renderTo/翻页/goToChapter/goToPosition/applyTheme）
 * + store（lastLocation 恢复/保存）+ 主题跟随（2 主题 × 2 模式，夜间模式·非 PDF 深色注入）。
 * 打开/关闭受 readerBookId 驱动（状态继承：Library「打开阅读」或 RoomFeature 加入后 host.openReader 触发）。
 *
 * 沉浸态（STYLE.md §5.8 / FEATURES.md §11；2026-09-11 二次修订 v0.4）：
 * - **全屏的是"纸"不是"正文"**：外层全屏纸（--page-bg）+ 内层**居中定宽正文列**（--read-width，
 *   由「设置」写入 documentElement）；列宽 = kookit 排版宽度依据（宿主 clientWidth）→ 决定"一行多长"。
 * - **阅读页上没有任何栏**：书名/页码/翻页/目录/关闭都不常驻、也不做"浮现栏"（浮动出来的栏同样是状态栏）。
 *   退出 = Esc（鼠标路径：贴缘按钮召回侧边栏 → 「書」）；翻页 = 键盘 + 分页模式点击区。
 * - 目录 = **挂载线 + 垂挂列表**（TocPanel；容器全透明）。
 * - 滚轮在两侧留白上也要能滚 → 纸容器把 wheel 转发给正文列。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { isZeroLocation } from '@core/domain/location'
import type { ResolvedTheme } from '@core/domain/theme'
import type {
  BookLocation,
  BookRecord,
  Chapter,
  ReaderSettings,
  RenderOptions
} from '@core/domain/types'
import type { FeatureProps } from '../types'
import type { TocRow } from '../../components/TocPanel'
import { ReaderRail } from '../../components/ReaderRail'
import {
  ReaderControls,
  DEFAULT_READER_PARAMS,
  type ReaderParams
} from '../../components/ReaderControls'
import { useKeyIntents } from '../../components/useKeyIntents'

type ReaderMode = NonNullable<RenderOptions['readerMode']>

function flattenChapterTree(list: Chapter[], depth: number, out: TocRow[]): void {
  for (const c of list) {
    out.push({ label: c.label, depth, chapterDocIndex: c.chapterDocIndex })
    if (c.subitems && c.subitems.length > 0) flattenChapterTree(c.subitems, depth + 1, out)
  }
}

/** 当前 resolved 主题：以宿主 data-theme 为准（SettingsFeature 应用），非法值回退 纯色·深 */
function currentTheme(): ResolvedTheme {
  const v = document.documentElement.getAttribute('data-theme')
  return v === 'light' || v === 'sepia-light' || v === 'sepia-dark' ? v : 'dark'
}

export function ReaderFeature({
  container,
  host,
  readerBookId,
  activeFeature
}: FeatureProps): React.JSX.Element {
  const [book, setBook] = useState<BookRecord | null>(null)
  const [readerMode, setReaderMode] = useState<ReaderMode>('scroll')
  const [toc, setToc] = useState<TocRow[]>([])
  const [opening, setOpening] = useState(false)
  /** 目录垂挂列表开关（TocPanel）。**默认展示**（用户 2026-09-11 定）：只有当用户主动
   *  「折疊」/`t` 时才临时隐藏；点条目跳转**不**改变它，且不持久化（重开书回到展示态）。 */
  const [tocOpen, setTocOpen] = useState(true)
  /** 右侧阅读参数面板（默认收起：阅读页零控件，STYLE.md §5.8） */
  const [controlsOpen, setControlsOpen] = useState(false)
  const [params, setParams] = useState<ReaderParams>(DEFAULT_READER_PARAMS)
  const paramsRef = useRef<ReaderParams>(DEFAULT_READER_PARAMS)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const lastSavedAtRef = useRef(0)

  /**
   * 应用参数到渲染层。分工（`STYLE.md` §5.9）：
   * - **宿主几何** → CSS 变量挂在 documentElement（与主题同款做法，渲染层不感知设置来源）
   * - **正文排版** → `applyTypography` 注入正文 iframe
   */
  const applyParams = useCallback(
    (p: ReaderParams) => {
      const root = document.documentElement
      root.style.setProperty('--read-width', `${p.readerWidth}px`)
      root.style.setProperty('--page-pad-x', `${p.pagePadX}px`)
      void container.render.applyTypography({
        fontSize: p.fontSize ?? undefined,
        lineHeight: p.lineHeight ?? undefined,
        paragraphSpacing: p.paragraphSpacing ?? undefined
      })
    },
    [container]
  )

  /** 改参数：先应用（当场生效）再原子落库（readerSettings 与 SettingsFeature 共用一个键） */
  const changeParams = useCallback(
    (patch: Partial<ReaderParams>) => {
      const next = { ...paramsRef.current, ...patch }
      paramsRef.current = next
      setParams(next)
      applyParams(next)
      void container.store.patchSetting('readerSettings', {
        readerWidth: next.readerWidth,
        pagePadX: next.pagePadX,
        fontSize: next.fontSize,
        lineHeight: next.lineHeight,
        paragraphSpacing: next.paragraphSpacing
      })
    },
    [container, applyParams]
  )

  // 启动载入阅读参数（缺省 = 不改，尊重书自带排版）
  useEffect(() => {
    void container.store.getSetting<ReaderSettings>('readerSettings', {}).then((cfg) => {
      const loaded: ReaderParams = {
        fontSize: cfg.fontSize ?? DEFAULT_READER_PARAMS.fontSize,
        lineHeight: cfg.lineHeight ?? DEFAULT_READER_PARAMS.lineHeight,
        paragraphSpacing: cfg.paragraphSpacing ?? DEFAULT_READER_PARAMS.paragraphSpacing,
        pagePadX: cfg.pagePadX ?? DEFAULT_READER_PARAMS.pagePadX,
        readerWidth: cfg.readerWidth ?? DEFAULT_READER_PARAMS.readerWidth
      }
      paramsRef.current = loaded
      setParams(loaded)
      applyParams(loaded)
    })
  }, [container, applyParams])

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

  // 位置事件 → 持久化（同步数据源，见 RENDER_INTERFACE.md §4）
  useEffect(() => {
    return container.render.on('location-changed', (loc) => {
      saveLastLocation(loc)
    })
  }, [container, saveLastLocation])

  // 打开/关闭受 readerBookId 驱动（host.openReader / host.closeReader）
  useEffect(() => {
    if (!readerBookId) {
      setBook(null)
      setToc([])
      setTocOpen(true)
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
        const cfg = await container.store.getSetting<ReaderSettings>('readerSettings', {})
        const mode = cfg.readerMode ?? 'scroll'
        setReaderMode(mode)
        await container.render.open(latest, {
          readerMode: mode,
          animation: 'none',
          theme: currentTheme()
        })
        if (stageRef.current) await container.render.renderTo(stageRef.current)
        if (cancelled) return
        setBook(latest)
        // 兜底启发式：kookit 无 toc 的书会用纯数字页码生成 chapterList（如 PDF 每页一项），
        // 全数字 = 假目录，不显示挂载线；存在任一非纯数字标题才视为真目录。
        const rows: TocRow[] = []
        flattenChapterTree(container.render.getChapter(), 0, rows)
        setToc(rows.some((r) => /[^\d]/.test(r.label)) ? rows : [])
        // 换书回到默认展示态（隐藏是"临时"的，不跨书继承）
        setTocOpen(true)
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

  // 激活到阅读器时热更新主题（设置里改主题后返回阅读器不重开书也生效，STYLE.md §3.4）
  useEffect(() => {
    if (activeFeature !== 'reader') return
    if (!readerBookId) return
    void container.render.applyTheme(currentTheme())
  }, [activeFeature, readerBookId, container])

  const pageTurn = useCallback(
    async (dir: 'next' | 'prev') => {
      if (!book || opening) return
      if (dir === 'next') await container.render.next()
      else await container.render.prev()
    },
    [container, book, opening]
  )

  /** 目录跳转：透传到渲染层 goToChapter（chapterDocIndex 标尺）。
   *  ⚠ **不收起目录**（用户 2026-09-11 定：目录默认就是展示的，只有用户主动才隐藏）。 */
  const jumpChapter = useCallback(
    async (row: TocRow) => {
      if (row.chapterDocIndex === undefined || !book || opening) return
      try {
        await container.render.goToChapter(row.chapterDocIndex)
        host.pushLog(`跳到：${row.label}`)
      } catch (err) {
        host.pushLog(`跳转失败：${(err as Error).message}`)
      }
    },
    [container, book, opening, host]
  )

  /**
   * 滚轮转发：正文列之外是留白（全屏纸），滚轮落在留白上时把位移交给正文列 ——
   * 否则鼠标停在两侧就没反应（STYLE.md §5.8）。列内部的滚轮由浏览器原生处理，
   * 这里必须跳过，不然会双倍滚动。
   */
  const onPaperWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>): void => {
      if (readerMode !== 'scroll') return
      if ((e.target as HTMLElement).closest('.reader-stage')) return
      const stage = stageRef.current
      if (stage) stage.scrollTop += e.deltaY
    },
    [readerMode]
  )

  // 阅读器键盘（STYLE.md §5.8）——走键鼠意图层（domain/input.ts，2026-09-12 立机制）：
  // 绑定见 DEFAULT_BINDINGS.reader.*；处理函数内分流保持原有手感（Esc 先收面板、Space 仅分页模式）。
  // ⚠ enabled 守卫必须给：功能组件常驻挂载，不设守卫书库里按 t/p 会误触阅读器意图
  useKeyIntents(
    'reader',
    {
      'reader.back': () => {
        if (controlsOpen) {
          setControlsOpen(false)
          return
        }
        host.closeReader()
      },
      'reader.nextPage': () => void pageTurn('next'),
      'reader.prevPage': () => void pageTurn('prev'),
      'reader.spacePage': () => {
        if (readerMode !== 'scroll') void pageTurn('next')
      },
      'reader.toggleToc': () => setTocOpen((v) => !v),
      'reader.toggleControls': () => setControlsOpen((v) => !v)
    },
    activeFeature === 'reader' && !!book
  )

  return (
    <section className="relative h-full select-none">
      {/* 全屏纸（纸色铺满内容区，退场多余信息）+ 滚轮转发；
          正文列是它的子元素（宿主容器 = 正文列，见 styles.css .reader-stage） */}
      <div className="reader-paper absolute inset-0" onWheel={onPaperWheel}>
        {/* 正文列：id 是 kookit 硬编码契约；列宽 = --read-width（设置写入）→ 决定一行多长 */}
        <div className="reader-stage" id="page-area" ref={stageRef} />
      </div>

      {/* 挂载线实体（STYLE.md §5.8，2026-09-12）：目录顶部垂挂 + 阅读参数底部挂载向上展开，
          目录折叠时点线展开——两挂件互不干扰又同处一条线 */}
      {book && (
        <ReaderRail
          tocOpen={tocOpen && toc.length > 0}
          onTocToggle={() => setTocOpen((v) => !v)}
          tocRows={toc}
          onTocJump={(r) => void jumpChapter(r)}
          controlsOpen={controlsOpen}
          onControlsToggle={() => setControlsOpen((v) => !v)}
          params={params}
          onParamsChange={changeParams}
        />
      )}

      {/* 鼠标左右点击区翻页（z 低于挂载线/目录，不遮它们）。
          ⚠ 只在分页模式（single/double）激活：scroll 模式滚轮优先，点击区会遮住 1/4 边缘的正文选择。 */}
      {book && !opening && readerMode !== 'scroll' && (
        <>
          <button
            className="absolute inset-y-0 left-0 w-1/4"
            aria-label="上一頁（點擊左側）"
            onClick={() => void pageTurn('prev')}
          />
          <button
            className="absolute inset-y-0 right-0 w-1/4"
            aria-label="下一頁（點擊右側）"
            onClick={() => void pageTurn('next')}
          />
        </>
      )}
    </section>
  )
}
