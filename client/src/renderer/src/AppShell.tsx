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
import { useEffect, useMemo, useRef, useState } from 'react'
import { EBOOK_EXTENSIONS, IPC } from '@shared/ipc'
import { createContainer, type ServiceContainer } from '@core/container'
import { resolveThemePreference, type ThemeTone } from '@core/domain/theme'
import { FEATURES } from './features/registry'
import type { FeatureHost, FeatureId, ReaderTarget } from './features/types'
import { pushLog } from './features/logStore'
import { bindRoomSession } from './features/roomSession'
import { loadPlugins } from './plugins/runtime'
import { PlaneHeader, WindowControls } from './components/PlaneHeader'
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
   * 「带目标打开」载荷（v0.4.2，2026-09-16）：笔记管理双击条目时要把"打开后跳到哪条笔记"
   * 带进阅读器。**tick 递增**用来防重复消费（同一个目标只跳一次）。见 `ReaderTarget`。
   */
  const [readerTarget, setReaderTarget] = useState<ReaderTarget | null>(null)
  const readerTargetTick = useRef(0)

  const selectedBookIdRef = useRef<string | null>(null)
  const readerBookIdRef = useRef<string | null>(null)

  const host = useMemo<FeatureHost>(
    () => ({
      /**
       * 切换功能组件。进入阅读器时若还没打开书，自动恢复**上次阅读**的那本
       * （否则每次进阅读器都是空的；口径由 `books.getLastRead()` 给出，shell 只做导航策略）。
       */
      navigate: (id) => {
        setActiveFeature(id)
        if (id === 'reader' && !readerBookIdRef.current) {
          void (async () => {
            // ⚠ 这个异步分支必须自己兜错：它是"重开书偶发空白"排查（TODO P2）登记的
            // 无 catch 候选 —— getLastRead 失败（存储损坏/IPC 异常）会变成静默空白阅读器
            try {
              const last = await container.books.getLastRead()
              if (last && !readerBookIdRef.current) {
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
       * 关闭阅读器 = 返回书库（STYLE.md §5.8 / FEATURES.md §11）。
       * ⚠ 顺带把 activeFeature 切回 library —— 否则停在 reader 会留下空屏
       * （v0.1.12 修；此前只清 readerBookId，关闭后是空白阅读面板）。
       */
      closeReader: () => {
        readerBookIdRef.current = null
        setReaderBookId(null)
        setReaderTarget(null)
        setActiveFeature('library')
      },
      selectBook: (id) => {
        selectedBookIdRef.current = id
        setSelectedBookId(id)
      },
      pushLog
    }),
    [container]
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

  // 切换书库（2026-09-13）：旧库的 bookId 在新库无意义 → 清选中与阅读器状态。
  // 若正在阅读，closeReader 顺带回到书库（LibraryFeature 同步收到广播重载书单）
  useEffect(() => {
    const off = window.turead.subscribe(IPC.storeLibraryChanged, () => {
      selectedBookIdRef.current = null
      setSelectedBookId(null)
      readerBookIdRef.current = null
      setReaderBookId(null)
      setActiveFeature('library')
    })
    return off
  }, [])

  // ── 命令面板（2026-10-24 用户定，Ctrl+Shift+P，FEATURES.md §14）─────────────
  const [paletteOpen, setPaletteOpen] = useState(false)
  // 意图层登记（`app.commandPalette`，组合键在输入框聚焦时也放行 —— 命令面板必须随处可呼出）
  useKeyIntents('app', {
    'app.commandPalette': () => setPaletteOpen((v) => !v)
  })

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
      // 只在阅读态给「退出閱讀器」（其他态它没有对象）
      ...(activeFeature === 'reader'
        ? [{ id: 'reader.close', label: '退出閱讀器', run: () => host.closeReader() }]
        : []),
      { id: 'theme.solid-dark', label: '主題：純色·深', run: () => setTheme('純色·深', 'solid', 'dark') },
      { id: 'theme.solid-light', label: '主題：純色·淺', run: () => setTheme('純色·淺', 'solid', 'light') },
      { id: 'theme.sepia-light', label: '主題：羊皮紙·淺', run: () => setTheme('羊皮紙·淺', 'parchment', 'light') },
      { id: 'theme.sepia-dark', label: '主題：羊皮紙·深', run: () => setTheme('羊皮紙·深', 'parchment', 'dark') }
    ]
  }, [container, host, activeFeature])

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

  // 书库搜索词（标题栏搜索栏的单一真相；StatePill 同款 props 下发）
  const [libraryQuery, setLibraryQuery] = useState('')
  /**
   * 笔记检索词（标题栏搜索栏的**笔记作用域**，2026-09-16）。
   * ⚠ 与书库**各持一份**、互不串扰：TitleBar 的输入框带 `key={activeFeature}`，按功能**重挂**，
   * 所以这里也按功能分表存，切回来还是自己的词。
   */
  const [notesQuery, setNotesQuery] = useState('')

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
    /* chrome 平面化（批1.6）：无全局顶栏 —— 侧边栏全高（恒定框架 + 应用名/拖拽），
       各平面顶缘自带 PlaneHeader（窗控 + 搜索/标题）。窗口拖拽区 = 侧边栏本体 + 各平面顶行。 */
    <div className="relative flex h-screen">
      {dragOver && (
        /* 拖拽提示（pointer-events-none：不挡 drop 事件，drop 在 window 层处理） */
        <div className="pointer-events-none fixed inset-0 z-[var(--z-menu)] flex items-center justify-center bg-[var(--overlay-soft)]">
          <span className="text-[15px] text-[var(--text)]">鬆開以導入到當前書庫</span>
        </div>
      )}
      {/* 恒定框架（批1.5/1.6）：宽度走 --sidebar-w（styles.css 单一来源）；「閱」不入栏——
          阅读不是"地方"而是书上的模式（入口只有书），registry 里的 reader 仅作路由。
          阅读态「書」常亮（DIRECTION.md：下层书库是阅读卡的来处，侧边栏宣示"你在哪"）。
          本体 = 拖拽区（.sidebar-rail），图标键 no-drag。 */}
      <aside
        className="sidebar-rail flex h-full flex-none flex-col items-center border-r border-[var(--border)] bg-[var(--panel)] pb-2"
        style={{ width: 'var(--sidebar-w)' }}
      >
          {/* 应用名（居顶，与右侧平面顶行同高对齐；属于拖拽区） */}
          <div className="flex h-11 w-full flex-none items-center justify-center">
            <span className="tracking-label text-[13px] text-[var(--muted)]">TuRead</span>
          </div>
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

      {/* chrome 平面化后 main 恒定 p-0：平面顶行全出血贴窗顶，内容 padding 由各平面自持。
          阅读态禁用主面板自身滚动（滚动归正文列）—— 否则会在窗口右缘多出一根滚动条。 */}
      <main
        ref={mainRef}
        className={`relative min-w-0 flex-1 bg-[var(--bg)] ${
          activeFeature === 'reader' ? 'overflow-hidden' : 'overflow-y-auto'
        }`}
      >
        {/* 批1.5/1.6（docs/DIRECTION.md）：阅读 = **浮在书库之上的卡片层** ——
            书库在下层保持存活（选择/滚动状态天然继承），阅读层垫 `--overlay-dim`
            挡住下层交互（Esc 是唯一的门）。阅读卡 = 桌色 + radius-panel + 1px 边 +
            面板阴影（深色主题里"边界要读得出来"，浅色同理）；卡顶右角淡显窗控
            （窗口 chrome ≠ 阅读控件，不破零控件承诺），卡顶 28px = 拖拽条。
            进场 = .reader-layer 浮起显影。 */}
        {FEATURES.map((f) => {
          const C = f.component
          if (f.id === 'reader') {
            return (
              <div
                key={f.id}
                className={`absolute inset-0 z-[var(--z-drawer)] bg-[var(--overlay-dim)] p-5 ${
                  activeFeature === 'reader' ? '' : 'hidden'
                }`}
              >
                <div className="reader-layer relative h-full w-full overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--desk-bg)] shadow-[var(--shadow-panel)]">
                  <C
                    container={container}
                    host={host}
                    selectedBookId={selectedBookId}
                    readerBookId={readerBookId}
                    activeFeature={activeFeature}
                    libraryQuery={libraryQuery}
                    onLibraryQueryChange={setLibraryQuery}
                    notesQuery={notesQuery}
                    onNotesQueryChange={setNotesQuery}
                    readerTarget={readerTarget}
                  />
                  {/* 卡顶拖拽条（28px < 挂载线判定带上缘 29px，互不吞噬） */}
                  <div className="card-topbar" aria-hidden="true" />
                  {/* 卡顶右角淡显窗控：静息 0.35 / hover 升满（.card-controls） */}
                  <div className="card-controls">
                    <WindowControls />
                  </div>
                </div>
              </div>
            )
          }
          // 书库在阅读态保持存活（卡片层的下层）；其余功能互斥切换
          const beneath = f.id === 'library' && activeFeature === 'reader'
          return (
            <div key={f.id} className={`h-full ${activeFeature === f.id || beneath ? '' : 'hidden'}`}>
              <C
                container={container}
                host={host}
                selectedBookId={selectedBookId}
                readerBookId={readerBookId}
                activeFeature={activeFeature}
                libraryQuery={libraryQuery}
                onLibraryQueryChange={setLibraryQuery}
                notesQuery={notesQuery}
                onNotesQueryChange={setNotesQuery}
                readerTarget={readerTarget}
              />
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
