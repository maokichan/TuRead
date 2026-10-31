/**
 * AppShell —— 功能组件标准容器。
 * 职责：
 * - 左侧 = 功能组件图标栏（registry 自动发现）；主面板 = 宿主容器。
 * - 持有跨功能共享态（activeFeature / selectedBookId / readerBookId）。
 * - 提供 FeatureHost（navigate / openReader / closeReader / selectBook / pushLog）——
 *   跨功能导航与状态继承的唯一通道（FEATURES.md §5 / features/types.ts）。
 * - 功能组件常驻挂载、非激活 display:none → 状态天然继承（房间会话/阅读位置不因切换丢失）。
 * - 无顶栏 / 无日志栏：连接状态在 RoomFeature，诊断日志在 SettingsFeature。
 * - dev 无头自检已移出（见 dev/selfCheck.ts）—— shell 只做组合与共享态。
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { EBOOK_EXTENSIONS, IPC } from '@shared/ipc'
import { createContainer, type ServiceContainer } from '@core/container'
import { resolveThemePreference, type ThemeTone } from '@core/domain/theme'
import { FEATURES } from './features/registry'
import type { FeatureHost, FeatureId, ReaderTarget } from './features/types'
import { pushLog } from './features/logStore'
import { bindRoomSession } from './features/roomSession'
import { readerCardBus } from './features/readerCardBus'
import { loadPlugins } from './plugins/runtime'
import { ChromeControls } from './components/ChromeControls'
import type { ReaderTabItem } from './components/ReaderTabStrip'
import { FeatureCard } from './components/FeatureCard'
import { CommandPalette } from './components/CommandPalette'
import type { PaletteCommand } from './components/commandFilter'
import { playSettle } from './components/motion'
import { applyDataThemeResolved } from './components/themeTransition'
import { useKeyIntents } from './components/useKeyIntents'
import { runDevSelfCheck } from './dev/selfCheck'
import { runPdfWidthProbe } from './dev/pdfWidthProbe'
import { runPagedInteractProbe } from './dev/pagedInteractProbe'
import { runLibraryProbe } from './dev/libraryProbe'
import { runNoteProbe } from './dev/noteProbe'
import { runRoomProbe } from './dev/roomProbe'
import { runRoomPeer } from './dev/roomPeer'

const EBOOK_EXT_SET = new Set<string>(EBOOK_EXTENSIONS)

export default function AppShell(): React.JSX.Element {
  const container = useMemo<ServiceContainer>(() => createContainer(window.turead), [])
  const [activeFeature, setActiveFeature] = useState<FeatureId>('library')
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
  const [readerBookId, setReaderBookId] = useState<string | null>(null)
  /**
   * 阅读标签页（批1.10，用户定）：**打开一本书 = 开一个标签**，阅读器从"串行单本"变复数在场。
   * `readerBookId` = 活跃标签的书（ReaderFeature 契约不变）；标签条住顶栏（ChromeControls）。
   * 书名异步补齐（`books.get`）；一个 edition 一个标签（重复打开 = 激活既有标签）。
   * 会话级状态（不持久化）；切库广播清空。
   */
  const [readerTabs, setReaderTabs] = useState<ReaderTabItem[]>([])
  const readerTabsRef = useRef<ReaderTabItem[]>([])
  /**
   * 「带目标打开」载荷（v0.4.2，2026-09-16）：笔记管理双击条目时要把"打开后跳到哪条笔记"
   * 带进阅读器。**tick 递增**用来防重复消费（同一个目标只跳一次）。见 `ReaderTarget`。
   */
  const [readerTarget, setReaderTarget] = useState<ReaderTarget | null>(null)
  const readerTargetTick = useRef(0)

  const selectedBookIdRef = useRef<string | null>(null)
  const readerBookIdRef = useRef<string | null>(null)

  /** 开/激活一个标签：没有则新建（书名占位，异步补齐），有则只激活 */
  const activateTab = useCallback(
    (editionId: string) => {
      if (!readerTabsRef.current.some((t) => t.editionId === editionId)) {
        const next = [...readerTabsRef.current, { editionId, title: '' }]
        readerTabsRef.current = next
        setReaderTabs(next)
        void container.books
          .get(editionId)
          .then((rec) => {
            if (!rec || !readerTabsRef.current.some((t) => t.editionId === editionId)) return
            const patched = readerTabsRef.current.map((t) =>
              t.editionId === editionId ? { ...t, title: rec.metadata.title } : t
            )
            readerTabsRef.current = patched
            setReaderTabs(patched)
          })
          .catch(() => {
            /* 标签标题拿不到就留省略号——标签本身照常工作（书打不开另有报错链路） */
          })
      }
    },
    [container]
  )

  // ── 阅读卡进出动效（docs/DIRECTION.md §2）：进场 = 暗场浮现；退场反向、更快 ──
  // 进场：scrim 压深一档（.reader-dip，只往深里走 —— 深色主题不反光）+ 阅读卡原比例自下浮起，
  // 暗场随后松开回静息；与打开来源解耦（原「从被点封面长大」随批1.9 退役，git 历史为准）。
  // 退场 = 先播下沉显隐（--dur-veil，出比进快），落定后才真正切状态 —— 状态继承不受动画影响。
  const [readerClosing, setReaderClosing] = useState(false)
  const readerClosingRef = useRef(false)
  const readerExitTimer = useRef<number | null>(null)
  const activeFeatureRef = useRef<FeatureId>('library')
  useEffect(() => {
    activeFeatureRef.current = activeFeature
  }, [activeFeature])

  /** 播阅读卡退场，落定后执行 after；非阅读态 / 已在退场中 → 返回 false（调用方直接切） */
  const beginReaderExit = useCallback((after: () => void): boolean => {
    if (activeFeatureRef.current !== 'reader' || !readerBookIdRef.current || readerClosingRef.current)
      return false
    readerClosingRef.current = true
    setReaderClosing(true)
    if (readerExitTimer.current !== null) window.clearTimeout(readerExitTimer.current)
    // --dur-veil 200ms + 一帧余量
    readerExitTimer.current = window.setTimeout(() => {
      readerClosingRef.current = false
      setReaderClosing(false)
      readerExitTimer.current = null
      after()
    }, 220)
    return true
  }, [])

  const host = useMemo<FeatureHost>(
    () => ({
      /**
       * 切换功能组件。进入阅读器时若还没打开书，自动恢复**上次阅读**的那本
       * （否则每次进阅读器都是空的；口径由 `books.getLastRead()` 给出，shell 只做导航策略）。
       */
      navigate: (id) => {
        if (id !== 'reader' && beginReaderExit(() => setActiveFeature(id))) return
        setActiveFeature(id)
        if (id === 'reader' && !readerBookIdRef.current) {
          void (async () => {
            // ⚠ 这个异步分支必须自己兜错：它是"重开书偶发空白"排查（TODO P2）登记的
            // 无 catch 候选 —— getLastRead 失败（存储损坏/IPC 异常）会变成静默空白阅读器
            try {
              const last = await container.books.getLastRead()
              if (last && !readerBookIdRef.current) {
                activateTab(last.id)
                selectedBookIdRef.current = last.id
                setSelectedBookId(last.id)
                readerBookIdRef.current = last.id
                setReaderBookId(last.id)
              }
            } catch (err) {
              pushLog(`恢复上次阅读失败：${(err as Error).message}`)
              console.warn('[shell] getLastRead 失败', err)
            }
          })()
        }
      },
      openReader: (editionId, target) => {
        // 快速连续开书：取消在途的退场动画（否则落定回调会把刚打开的书关掉）
        if (readerExitTimer.current !== null) {
          window.clearTimeout(readerExitTimer.current)
          readerExitTimer.current = null
          readerClosingRef.current = false
          setReaderClosing(false)
        }
        // 标签页模型（批1.10）：一本书一个标签 —— 已开着 = 激活既有标签（书不重开、位置不丢），
        // 没开过 = 新建标签。激活既有标签时 readerBookId 不变 → ReaderFeature 不重跑 open。
        activateTab(editionId)
        selectedBookIdRef.current = editionId
        readerBookIdRef.current = editionId
        setSelectedBookId(editionId)
        setReaderBookId(editionId)
        // 「带目标打开」（笔记管理跳转）：可选参数，未给时不产生任何额外状态
        readerTargetTick.current += 1
        setReaderTarget(
          target?.revealNoteId
            ? { editionId, revealNoteId: target.revealNoteId, tick: readerTargetTick.current }
            : null
        )
        setActiveFeature('reader')
      },
      /**
       * 关闭当前标签（批1.10 标签页语义；原"关闭阅读器 = 返回书库"收编为最后一档）：
       * 还有别的标签 → 激活邻位标签（优先后一位，再取末位），**留在阅读态**（书卡不播退场，
       * 内容原地换书）；关的是最后一个 → 清空并回书库（书库 = "新标签页"）。
       * ⚠ 顺带把 activeFeature 切回 library —— 否则停在 reader 会留下空屏
       * （v0.1.12 修；此前只清 readerBookId，关闭后是空白阅读面板）。
       */
      closeReader: () => {
        const finish = () => {
          const tabs = readerTabsRef.current
          const idx = tabs.findIndex((t) => t.editionId === readerBookIdRef.current)
          const next = tabs.filter((t) => t.editionId !== readerBookIdRef.current)
          readerTabsRef.current = next
          setReaderTabs(next)
          setReaderTarget(null)
          const fallback = next[Math.min(Math.max(idx, 0), next.length - 1)] ?? null
          if (fallback) {
            selectedBookIdRef.current = fallback.editionId
            readerBookIdRef.current = fallback.editionId
            setSelectedBookId(fallback.editionId)
            setReaderBookId(fallback.editionId)
          } else {
            readerBookIdRef.current = null
            setReaderBookId(null)
            setActiveFeature('library')
          }
        }
        // 退到书库才播卡片退场；标签间切换不动画（原地换书，读者在等的是内容不是过场）
        if (readerTabsRef.current.length <= 1 && beginReaderExit(finish)) return
        finish()
      },
      /** 激活一个既有标签（顶栏标签条）：切活跃书 + 回阅读态。书本来就开着 → 不重跑 open */
      activateReaderTab: (editionId) => {
        activateTab(editionId)
        selectedBookIdRef.current = editionId
        readerBookIdRef.current = editionId
        setSelectedBookId(editionId)
        setReaderBookId(editionId)
        setActiveFeature('reader')
      },
      /**
       * 关闭指定标签（标签条「×」）：关背景标签 = 只摘标签（活跃书不动）；
       * 关的是活跃标签 = 等价 closeReader()（邻位激活 / 最后一个回书库）。
       */
      closeReaderTab: (editionId) => {
        if (editionId === readerBookIdRef.current) {
          host.closeReader()
          return
        }
        const next = readerTabsRef.current.filter((t) => t.editionId !== editionId)
        readerTabsRef.current = next
        setReaderTabs(next)
      },
      selectBook: (id) => {
        selectedBookIdRef.current = id
        setSelectedBookId(id)
      },
      pushLog
    }),
    [container, beginReaderExit, activateTab]
  )

  // dev-only：TUREAD_DEV_BOOK 指定书时启动即导入并打开（无头验证渲染链路，实现见 dev/selfCheck.ts）；
  // TUREAD_DEV_PROBE 指定专项探针（实现见 dev/pdfWidthProbe.ts / dev/pagedInteractProbe.ts）时优先走探针
  useEffect(() => {
    if (window.turead.devProbe === 'pdf-width') {
      runPdfWidthProbe(container, host)
      return
    }
    if (window.turead.devProbe === 'paged-interact') {
      runPagedInteractProbe(container, host)
      return
    }
    if (window.turead.devProbe === 'library') {
      runLibraryProbe(container, host)
      return
    }
    if (window.turead.devProbe === 'note') {
      runNoteProbe(container, host)
      return
    }
    if (window.turead.devProbe === 'room') {
      runRoomProbe(container, host)
      return
    }
    if (window.turead.devProbe === 'room-peer') {
      runRoomPeer(container, host)
      return
    }
    return runDevSelfCheck(container, host)
  }, [container, host])

  // 房间会话共享态的绑定（v0.4.3）：阅读器右抽屉的「聊天」与「房间」功能组件读同一份
  // 消息/成员/连接状态（避免两处各持一份而分叉）。容器只有一个 → 挂载时绑一次。
  useEffect(() => bindRoomSession(container), [container])

  // 官方插件运行时（v1.13，契约 = CONTRACTS §9）：启动加载一次（种子/扫描在主进程已完成）；
  // 设置页切换启停时由 setPluginEnabled 内部重载
  useEffect(() => {
    void loadPlugins(container)
  }, [container])

  // 切换书库（2026-09-13）：旧库的 bookId 在新库无意义 → 清选中、阅读器与**全部标签**。
  // 若正在阅读，closeReader 顺带回到书库（LibraryFeature 同步收到广播重载书单）
  useEffect(() => {
    const off = window.turead.subscribe(IPC.storeLibraryChanged, () => {
      selectedBookIdRef.current = null
      setSelectedBookId(null)
      readerBookIdRef.current = null
      setReaderBookId(null)
      readerTabsRef.current = []
      setReaderTabs([])
      setActiveFeature('library')
    })
    return off
  }, [])

  // ── 命令面板（2026-10-24 用户定，Ctrl+Shift+P，FEATURES.md §14）─────────────
  const [paletteOpen, setPaletteOpen] = useState(false)
  // 底面全局搜索框（批1.11 搜索上底板）：框住 ChromeControls 顶条带，Ctrl+F 由这里聚焦
  const chromeSearchRef = useRef<HTMLInputElement | null>(null)
  // 意图层登记（`app.commandPalette`，组合键在输入框聚焦时也放行 —— 命令面板必须随处可呼出）
  useKeyIntents('app', {
    'app.commandPalette': () => setPaletteOpen((v) => !v),
    // Ctrl+F：聚焦全局搜索框（无绑定的域输入框禁用，focus() 静默无效——诚实语义）
    'app.focusSearch': () => {
      chromeSearchRef.current?.focus()
      chromeSearchRef.current?.select()
    }
  })

  // 右欄卡片页清单（批1.13）：ReaderFeature 经 readerCardBus 登记，命令面板据此给"呼出X"
  const readerCardPages = useSyncExternalStore(readerCardBus.subscribe, readerCardBus.getState)
  // 卡片页开合视图（批1.14 平级化）：AppShell 布局据此让出右槽位、收窄阅读卡
  const readerCardView = useSyncExternalStore(readerCardBus.subscribe, readerCardBus.getView)

  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    /** 主题命令：写偏好（patchSetting 原子合并）→ 应用 data-theme → 阅读中同步注入书 iframe */
    const setTheme = (label: string, tone: ThemeTone, mode: 'dark' | 'light'): void => {
      void (async () => {
        await container.store.patchSetting('appearance', { theme: { tone, mode } })
        const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
        const resolved = resolveThemePreference({ tone, mode }, dark)
        // 唯一入口应用（带全局颜色渐隐，themeTransition.ts）
        applyDataThemeResolved(resolved)
        // 阅读态切主题：正文 iframe 的注入不会因 data-theme 自动跟上（ReaderFeature 只在激活时应用）
        if (readerBookIdRef.current) void container.render.applyTheme(resolved)
        pushLog(`主題已切換：${label}`)
      })()
    }
    return [
      ...FEATURES.map((f) => ({
        id: `nav.${f.id}`,
        label: `前往${f.label}`,
        run: () => host.navigate(f.id)
      })),
      // 只在阅读态给「退出閱讀器」（其他态它没有对象）；多标签时说的是"关当前标签"
      ...(activeFeature === 'reader'
        ? [
            {
              id: 'reader.close',
              label: readerTabs.length > 1 ? '關閉當前標籤' : '退出閱讀器',
              run: () => host.closeReader()
            }
          ]
        : []),
      // 右欄卡片页的召唤命令（批1.13 用户定"标记同步呼出命令面板"）：清单由 ReaderFeature
      // 经 readerCardBus 登记（頁族随内容走：聊天仅房间态、插件格按注册）；仅阅读态给
      ...(activeFeature === 'reader'
        ? readerCardPages.map((p) => ({
            id: `reader.card.${p.kind}`,
            label: `呼出${p.label}`,
            run: () => readerCardBus.summon(p.kind)
          }))
        : []),
      { id: 'theme.solid-dark', label: '主題：純色·深', run: () => setTheme('純色·深', 'solid', 'dark') },
      { id: 'theme.solid-light', label: '主題：純色·淺', run: () => setTheme('純色·淺', 'solid', 'light') },
      { id: 'theme.sepia-light', label: '主題：羊皮紙·淺', run: () => setTheme('羊皮紙·淺', 'parchment', 'light') },
      { id: 'theme.sepia-dark', label: '主題：羊皮紙·深', run: () => setTheme('羊皮紙·深', 'parchment', 'dark') }
    ]
  }, [container, host, activeFeature, readerTabs.length, readerCardPages])

  // 大状态切换的"落定"瞬间（v1.14 §3.3）：内容轻微模糊 → 清晰，把整页跳变糊成一次变换
  const mainRef = useRef<HTMLElement | null>(null)
  const settledFeature = useRef<FeatureId>('library')
  useEffect(() => {
    if (settledFeature.current === activeFeature) return
    settledFeature.current = activeFeature
    playSettle(mainRef.current)
  }, [activeFeature])

  /* 侧边栏恒可见（批1.5，docs/DIRECTION.md）：卡片模型下侧边栏是**恒定框架**——
     阅读态不再覆盖/隐藏，「書」保持点亮（书库是阅读卡的来处，下层活着）。
     原"覆盖式侧边栏 + 贴缘召回 + 手动钉住"随全屏阅读窗方向一起退役（机制完整存于 git 历史）。 */

  // 拖拽导入（2026-09-13 用户定）：外部文件拖进窗口 → 导入**当前书库**（进 ImportQueue，
  // 指纹去重/进度/失败上报全部走既有链路）。非电子书扩展名直接忽略并日志说明。
  // ⚠ Electron 必须全局 preventDefault dragover/drop，否则系统会用窗口导航打开文件。
  const [dragOver, setDragOver] = useState(false)
  const dragDepth = useRef(0)
  useEffect(() => {
    const hasFiles = (e: DragEvent): boolean =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const onDragEnter = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current += 1
      setDragOver(true)
    }
    const onDragOver = (e: DragEvent): void => {
      if (hasFiles(e)) e.preventDefault()
    }
    const onDragLeave = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragOver(false)
    }
    const onDrop = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current = 0
      setDragOver(false)
      const files = Array.from(e.dataTransfer?.files ?? [])
      const paths = files
        .map((f) => window.turead.getPathForFile(f))
        .filter((p) => EBOOK_EXT_SET.has(p.split('.').pop()?.toLowerCase() ?? ''))
      if (paths.length === 0) {
        pushLog('拖入的文件没有可导入的电子书格式')
        return
      }
      void (async () => {
        // v0.4.0：导入必须带目标书库（收录关系是库内的）；映射库不允许导入（只能扫描）
        const { libraries, currentId } = await container.store.listLibraries()
        const cur = libraries.find((l) => l.id === currentId)
        if (cur?.mode === 'mapped') {
          pushLog('映射庫的書只能靠掃描真實文件夾進來（拖入導入只對自建庫有效）')
          return
        }
        container.imports.enqueue(paths, currentId)
        pushLog(`拖入导入：${paths.length} 本（加入「${cur?.name ?? '當前書庫'}」）`)
      })()
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [container])

  return (
    /* chrome 底面（批1.7，docs/DIRECTION.md §2 / STYLE.md §1.1）：背景 = 连续一整面，
       整面是窗口拖拽区（.chrome-base，styles.css）；底面上只住三样东西——
       图标栏（下）、窗控与后退/前进（ChromeControls）、卡片区（.card-region）。 */
    <div className="chrome-base relative h-screen overflow-hidden bg-[var(--bg)]">
      {dragOver && (
        /* 拖拽提示（pointer-events-none：不挡 drop 事件，drop 在 window 层处理） */
        <div className="pointer-events-none fixed inset-0 z-[var(--z-menu)] flex items-center justify-center bg-[var(--overlay-soft)]">
          <span className="text-[15px] text-[var(--text)]">鬆開以導入到當前書庫</span>
        </div>
      )}
      <ChromeControls
        activeFeature={activeFeature}
        searchInputRef={chromeSearchRef}
        readerTabs={readerTabs}
        activeTabId={readerBookId}
        onTabActivate={host.activateReaderTab}
        onTabClose={host.closeReaderTab}
      />
      {/* 恒定框架（批1.5）批1.7 起融进底面：不再自持底色与右边框——图标列直接坐在
          chrome 底面上，区域感交给不可见留白（inset/gutter，STYLE.md §1.1）。
          「閱」不入栏——阅读不是"地方"而是书上的模式（入口只有书），registry 里的 reader 仅作路由。
          阅读态「書」常亮（DIRECTION.md：下层书库是阅读卡的来处，侧边栏宣示"你在哪"）。 */}
      <aside
        className="absolute inset-y-0 left-0 z-[var(--z-chrome)] flex flex-col items-center py-2"
        style={{ width: 'var(--sidebar-w)' }}
      >
          <nav className="flex w-full flex-1 flex-col items-center gap-1.5">
            {FEATURES.filter((f) => !f.pinned && f.id !== 'reader').map((f) => (
              <button
                key={f.id}
                title={f.label}
                aria-label={f.label}
                onClick={() => host.navigate(f.id)}
                className={`feature-nav ${
                  (activeFeature === 'reader' ? 'library' : activeFeature) === f.id
                    ? 'feature-nav--active'
                    : ''
                }`}
              >
                {f.icon}
              </button>
            ))}
          </nav>
          <nav className="flex w-full flex-col items-center gap-1.5">
            {FEATURES.filter((f) => f.pinned).map((f) => (
              <button
                key={f.id}
                title={f.label}
                aria-label={f.label}
                onClick={() => host.navigate(f.id)}
                className={`feature-nav ${activeFeature === f.id ? 'feature-nav--active' : ''}`}
              >
                {f.icon}
              </button>
            ))}
          </nav>
        </aside>

      {/* 卡片区（.card-region，styles.css）：几何 = --inset-* 四值（顶条让位给底面全局件，
          左 = rail + 一道沟，右/下 = 统一沟），是卡片层的唯一落点。
          批1.7c 起 main 只是定位语境：滚动与卡面（含内边距）全部归 FeatureCard，
          阅读态与否不再改变 main 自身。 */}
      <main
        ref={mainRef}
        className="card-region absolute min-w-0"
        style={{
          top: 'var(--inset-top)',
          left: 'calc(var(--sidebar-w) + var(--inset-x))',
          right: 'var(--inset-x)',
          bottom: 'var(--inset-x)'
        }}
      >
        {/* 批1.7c 全界面卡片化（docs/DIRECTION.md §2 / STYLE.md §1.1）：五张功能卡
            全部经 FeatureCard 上卡面（统一桌色面 + 圆角 + 1px 边 + 面板阴影 + 浮起进场）。
            书库在阅读态保持存活（卡片层的下层），阅读层垫 `--overlay-dim` 挡住下层交互
            （scrim 只属于叠置卡——全应用唯一一层叠置就是 阅读卡 ⊃ 书库卡）。
            功能组件**常驻挂载**、非激活 display:none → 状态天然继承。 */}
        {FEATURES.map((f) => {
          const C = f.component
          if (f.id === 'reader') {
            // 右欄卡片页（批1.14 平级化，用户定"卡片页和阅读器界面平级，都置于底板之上"）：
            // scrim 容器改 flex 行 —— 阅读卡与卡片页槽位是**兄弟**，中间一道沟露出底板。
            // 槽位开合 = 宽度 0 ↔ (卡宽 + 沟)（styles.css .reader-card-slot 同节奏过渡），
            // 阅读卡 flex-1 随动收窄；纸宽公式（--page-w 的 100% 是容器相对）自动夹取，切卡不重排正文。
            const cardOpen = activeFeature === 'reader' && readerCardView.open
            return (
              <div
                key={f.id}
                className={`reader-scrim absolute inset-0 z-[var(--z-drawer)] bg-[var(--overlay-dim)] ${
                  activeFeature === 'reader' ? 'flex' : 'hidden'
                } ${readerClosing ? 'reader-scrim--exit pointer-events-none' : ''}`}
              >
                {/* 暗场（批1.9，docs/DIRECTION.md §2）：进场时压深一档再松开，只往深里走。
                    display:none → 显示即重放关键帧；z:-1 = 垫在 scrim 底色之上、阅读卡之下。
                    换方法 = 删掉这一层与关键帧（styles.css .reader-dip），回到普通 crossfade。 */}
                <div className="reader-dip" aria-hidden="true" />
                <div className="h-full min-w-0 flex-1">
                  <FeatureCard className={readerClosing ? 'feature-card--exit' : ''}>
                    <C
                      container={container}
                      host={host}
                      selectedBookId={selectedBookId}
                      readerBookId={readerBookId}
                      activeFeature={activeFeature}
                      readerTarget={readerTarget}
                    />
                  </FeatureCard>
                </div>
                {/* 卡片页槽位（兄弟卡的家）：常驻渲染（ReaderFeature 的 portal 目标要挂载后可查），
                    开合经 data-open 驱动宽度过渡；随本容器 hidden 而隐藏，状态天然继承 */}
                <div
                  className="reader-card-slot"
                  data-open={cardOpen || undefined}
                  aria-hidden={!cardOpen || undefined}
                >
                  <div id="reader-card-slot" className="reader-card-slot__inner" />
                </div>
              </div>
            )
          }
          // 书库在阅读态保持存活（卡片层的下层）；其余功能互斥切换
          const beneath = f.id === 'library' && activeFeature === 'reader'
          return (
            <div key={f.id} className={`h-full ${activeFeature === f.id || beneath ? '' : 'hidden'}`}>
              <FeatureCard scroll>
                <C
                  container={container}
                  host={host}
                  selectedBookId={selectedBookId}
                  readerBookId={readerBookId}
                  activeFeature={activeFeature}
                  readerTarget={readerTarget}
                />
              </FeatureCard>
            </div>
          )
        })}
      </main>
      {paletteOpen && (
        <CommandPalette commands={paletteCommands} onClose={() => setPaletteOpen(false)} />
      )}
    </div>
  )
}
