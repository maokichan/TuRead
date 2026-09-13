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
import { bridgeIframeDocuments } from '../../components/iframeBridge'
import { IPC } from '@shared/ipc'

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
  /** 右侧阅读参数面板。**默认展开**（2026-09-13 用户定，废 v0.1.12 的"默认收起"）：
   *  折叠是临时动作（「折疊」/点挂载线右段/`p`），重开书回到展示态。 */
  const [controlsOpen, setControlsOpen] = useState(true)
  const [params, setParams] = useState<ReaderParams>(DEFAULT_READER_PARAMS)
  /** 布局模式改动 = 重开书（kookit config 只在 open 时消费）；tick 触发打开 effect 重跑 */
  const [reopenTick, setReopenTick] = useState(0)
  /** 沉浸全屏状态（跟随 main 广播的真实状态；切换经 win:* IPC，Shell 镶边级例外，同 TitleBar） */
  const [fullscreen, setFullscreen] = useState(false)
  /** 进入阅读器自动全屏（设置开关，默认关；appearance.readerFullscreen，SettingsFeature 写） */
  const autoFullscreenRef = useRef(false)
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

  /** 改参数：先应用（当场生效）再原子落库（readerSettings；设置页不再写此键，本面板是唯一写者） */
  const changeParams = useCallback(
    (patch: Partial<ReaderParams>) => {
      const prev = paramsRef.current
      const next = { ...prev, ...patch }
      paramsRef.current = next
      setParams(next)
      applyParams(next)
      void container.store.patchSetting('readerSettings', {
        readerWidth: next.readerWidth,
        pagePadX: next.pagePadX,
        fontSize: next.fontSize,
        lineHeight: next.lineHeight,
        paragraphSpacing: next.paragraphSpacing,
        readerMode: next.readerMode
      })
      // 布局模式是 kookit 渲染配置（open 时消费）→ 落库后重开书（STYLE §5.9 #9）
      if (patch.readerMode !== undefined && patch.readerMode !== prev.readerMode) {
        setReaderMode(patch.readerMode)
        void container.store
          .patchSetting('readerSettings', { readerMode: patch.readerMode })
          .then(() => setReopenTick((t) => t + 1))
      }
      // PDF 改纸宽 = 整页重开填充（2026-09-13 用户定：纸宽变了 PDF 应当跟着缩放填充）。
      // kookit PdfRender 用渲染时刻的 clientWidth 定 canvas 像素、无重排入口（PDF 专区原首条），
      // CSS 变量改宽度不会触发重算 —— 原地重开（flushLastLocation 已保位置）是唯一可靠路径。
      if (
        book?.format === 'PDF' &&
        patch.readerWidth !== undefined &&
        patch.readerWidth !== prev.readerWidth
      ) {
        setReopenTick((t) => t + 1)
      }
    },
    [container, applyParams, book]
  )

  // 启动载入阅读参数（缺省 = 不改，尊重书自带排版）
  useEffect(() => {
    void container.store.getSetting<ReaderSettings>('readerSettings', {}).then((cfg) => {
      const loaded: ReaderParams = {
        fontSize: cfg.fontSize ?? DEFAULT_READER_PARAMS.fontSize,
        lineHeight: cfg.lineHeight ?? DEFAULT_READER_PARAMS.lineHeight,
        paragraphSpacing: cfg.paragraphSpacing ?? DEFAULT_READER_PARAMS.paragraphSpacing,
        pagePadX: cfg.pagePadX ?? DEFAULT_READER_PARAMS.pagePadX,
        readerWidth: cfg.readerWidth ?? DEFAULT_READER_PARAMS.readerWidth,
        readerMode: cfg.readerMode ?? DEFAULT_READER_PARAMS.readerMode
      }
      paramsRef.current = loaded
      setParams(loaded)
      setReaderMode(loaded.readerMode)
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
        // 布局模式来自 readerSettings（阅读参数面板是唯一写者，重开书生效）
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
  }, [readerBookId, reopenTick, container, host, flushLastLocation])

  // 沉浸全屏（2026-09-13）：
  // - F11（reader.toggleFullscreen）随时切换；
  // - 设置开关（appearance.readerFullscreen）= 进入阅读器自动全屏，默认关；
  // - **离开阅读器自动还原窗口**（全屏只属于阅读态，不遗留到书库/设置）；
  // - main 在 enter/leave-full-screen 时广播真实状态，这里只订阅跟随。
  useEffect(() => {
    const off = window.turead.subscribe(IPC.winFullScreenChanged, (payload) => {
      setFullscreen(payload === true)
    })
    return off
  }, [])

  useEffect(() => {
    void container.store
      .getSetting<{ readerFullscreen?: boolean }>('appearance', {})
      .then((cfg) => {
        autoFullscreenRef.current = cfg.readerFullscreen === true
      })
  }, [container])

  useEffect(() => {
    if (activeFeature === 'reader' && readerBookId && autoFullscreenRef.current) {
      void window.turead.invoke(IPC.winSetFullScreen, true)
    } else if (activeFeature !== 'reader') {
      void window.turead.invoke(IPC.winSetFullScreen, false)
    }
  }, [activeFeature, readerBookId])

  // 激活到阅读器时热更新主题（设置里改主题后返回阅读器不重开书也生效，STYLE.md §3.4）
  useEffect(() => {
    if (activeFeature !== 'reader') return
    if (!readerBookId) return
    void container.render.applyTheme(currentTheme())
  }, [activeFeature, readerBookId, container])

  const pageTurn = useCallback(
    async (dir: 'next' | 'prev') => {
      if (!book || opening) return
      try {
        if (dir === 'next') await container.render.next()
        else await container.render.prev()
      } catch (err) {
        // 适配器导航方法未打开即抛错（2026-09-13 销案"静默 no-op"）：落到日志里，
        // "重开书偶发空白"这类 rendition 丢失能在这里现形，而不是无声失败
        host.pushLog(`翻页失败：${(err as Error).message}`)
        console.warn('[reader] pageTurn 失败', err)
      }
    },
    [container, book, opening, host]
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
   * 滚轮翻页（分页模式，2026-09-13 用户定：默认键盘、不提供按钮控件，鼠标滚轮可翻页，像 koodo）。
   * 触控板/平滑滚轮一次手势发一串小 delta → 短窗内累积、过阈值翻一页，随后冷却窗防止连翻。
   * scroll 模式不适用（原生滚动）。返回是否已接管（接管方据此 preventDefault）。
   */
  const wheelState = useRef({ accum: 0, lastAt: 0, turnedAt: 0 })
  const turnByWheel = useCallback(
    (deltaY: number): boolean => {
      if (readerMode === 'scroll') return false
      const now = Date.now()
      const st = wheelState.current
      if (now - st.lastAt > 200) st.accum = 0 // 新手势：丢弃上一手势残留
      st.lastAt = now
      st.accum += deltaY
      if (Math.abs(st.accum) >= 80 && now - st.turnedAt > 350) {
        void pageTurn(st.accum > 0 ? 'next' : 'prev')
        st.accum = 0
        st.turnedAt = now
      }
      return true
    },
    [readerMode, pageTurn]
  )

  /**
   * 滚轮（整个阅读器区接管，含左右点击翻页带——那两条带压在纸面上方，挂在纸上会漏）。
   * - scroll 模式：正文列之外是留白，滚轮落在留白上把位移转给正文列（STYLE.md §5.8）；
   *   目录/参数面板内部让位（列表自己滚）。
   * - 分页模式（single/double）：滚轮翻页（2026-09-13 用户定：默认键盘、无按钮控件，像 koodo）。
   *   正文 iframe 内部的滚轮走 iframe 桥（下方 effect），这里只管宿主文档一侧。
   */
  const onReaderWheel = useCallback(
    (e: React.WheelEvent<HTMLElement>): void => {
      if ((e.target as HTMLElement).closest('.toc-list, .reader-controls')) return
      if (readerMode === 'scroll') {
        if ((e.target as HTMLElement).closest('.reader-stage')) return
        const stage = stageRef.current
        if (stage) stage.scrollTop += e.deltaY
        return
      }
      turnByWheel(e.deltaY)
    },
    [readerMode, turnByWheel]
  )

  // 分页模式的滚轮翻页：滚轮事件落在正文 iframe 里不会冒泡到宿主文档（文档边界），
  // 对同源 iframe 文档挂桥接监听（同 useKeyIntents 的按键桥，iframeBridge.ts）。
  // scroll 模式不挂——iframe 内原生滚动自管，拦截反而破坏阅读。
  useEffect(() => {
    if (!book || readerMode === 'scroll') return
    const onWheel = (e: WheelEvent): void => {
      if (turnByWheel(e.deltaY)) e.preventDefault()
    }
    return bridgeIframeDocuments((doc) => {
      doc.addEventListener('wheel', onWheel, { passive: false })
      return () => doc.removeEventListener('wheel', onWheel)
    })
  }, [book, readerMode, turnByWheel])

  // 阅读器键盘（STYLE.md §5.8）——走键鼠意图层（domain/input.ts，2026-09-12 立机制）：
  // 绑定见 DEFAULT_BINDINGS.reader.*；Space 仅分页模式。
  // Esc 分流（2026-09-13 用户纠正）：**不收参数面板**——面板是常伴工具，被 Esc 顺手收掉是错误设计；
  // Esc 只做两件事：全屏先退全屏，否则退出阅读器。面板开合只归挂载线（p 键 / 点线）。
  // ⚠ enabled 守卫必须给：功能组件常驻挂载，不设守卫书库里按 t/p 会误触阅读器意图
  useKeyIntents(
    'reader',
    {
      'reader.back': () => {
        if (fullscreen) {
          void window.turead.invoke(IPC.winSetFullScreen, false)
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
      'reader.toggleControls': () => setControlsOpen((v) => !v),
      'reader.toggleFullscreen': () => {
        void window.turead.invoke(IPC.winSetFullScreen, !fullscreen)
      }
    },
    activeFeature === 'reader' && !!book
  )

  return (
    <section className="relative h-full select-none" onWheel={onReaderWheel}>
      {/* 全屏纸（纸色铺满内容区）；正文列是它的子元素（宿主容器 = 正文列，见 styles.css .reader-stage）。
          滚轮接管在整个 section 上（含左右点击翻页带），见 onReaderWheel 注释 */}
      <div className="reader-paper absolute inset-0">
        {/* 正文列：id 是 kookit 硬编码契约；列宽 = --read-width（设置写入）→ 决定一行多长 */}
        <div className="reader-stage" id="page-area" ref={stageRef} />
      </div>

      {/* 挂载线实体（STYLE.md §5.8，2026-09-12）：目录顶部垂挂 + 阅读参数底部挂载向上展开，
          目录折叠时点线展开——两挂件互不干扰又同处一条线 */}
      {book && (
        <ReaderRail
          tocOpen={tocOpen}
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
