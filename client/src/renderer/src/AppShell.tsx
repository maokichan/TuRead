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
import { createContainer, type ServiceContainer } from '@core/container'
import { FEATURES } from './features/registry'
import type { FeatureHost, FeatureId } from './features/types'
import { pushLog } from './features/logStore'
import { TitleBar } from './components/TitleBar'
import { runDevSelfCheck } from './dev/selfCheck'
import { runPdfWidthProbe } from './dev/pdfWidthProbe'

export default function AppShell(): React.JSX.Element {
  const container = useMemo<ServiceContainer>(() => createContainer(window.turead), [])
  const [activeFeature, setActiveFeature] = useState<FeatureId>('library')
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
  const [readerBookId, setReaderBookId] = useState<string | null>(null)
  /** 阅读态下侧边栏是否被手动钉住（STYLE.md §5.8：进入阅读默认退场，贴缘按钮可切换） */
  const [sidebarPinned, setSidebarPinned] = useState(false)

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
            const last = await container.books.getLastRead()
            if (last && !readerBookIdRef.current) {
              selectedBookIdRef.current = last.id
              setSelectedBookId(last.id)
              readerBookIdRef.current = last.id
              setReaderBookId(last.id)
            }
          })()
        }
      },
      openReader: (bookId) => {
        selectedBookIdRef.current = bookId
        readerBookIdRef.current = bookId
        setSelectedBookId(bookId)
        setReaderBookId(bookId)
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
  // TUREAD_DEV_PROBE 指定专项探针（实现见 dev/pdfWidthProbe.ts）时优先走探针
  useEffect(() => {
    if (window.turead.devProbe === 'pdf-width') {
      runPdfWidthProbe(container, host)
      return
    }
    return runDevSelfCheck(container, host)
  }, [container, host])

  // 阅读态侧边栏退场（STYLE.md §5.8）：仅 reader 且未被手动钉住时隐藏
  const sidebarVisible = activeFeature !== 'reader' || sidebarPinned

  /**
   * 阅读态用**覆盖式**侧边栏（不占布局），其他功能态仍**占位**（挤压主面板）。
   *
   * 为什么：占位式一展开，`main` 就少 56px → 阅读器的几何跟着变（纸整体右移 28px；
   * 窗口不够宽时纸还会被压窄；挂载线/目录左缘也跟着右移，且不再等于"侧边栏右缘"）。
   * 用户 2026-09-11 定：**打开左侧菜单不应影响阅读器界面宽度** → 阅读态让侧边栏浮在左侧桌边。
   *
   * ⚠ 为什么只给阅读态（用户 2026-09-11 明确要求写在这里）：
   *   我们**还不知道**书库/房间/设置将来会有什么交互形态需求（例如书库可能正需要"挤压主面板"
   *   来给目录树让位）。目前只有阅读器需要"宽度恒定"这一条，所以只给阅读器开这个口子；
   *   将来若有第二个功能需要，**在这里把条件扩成一个显式的能力标记**（如 descriptor 上的
   *   `floatSidebar: true`），不要在多处散落判断。
   */
  const sidebarOverlays = activeFeature === 'reader'

  // 书库搜索词（标题栏搜索栏的单一真相；StatePill 同款 props 下发）
  const [libraryQuery, setLibraryQuery] = useState('')

  return (
    <div className="relative flex h-screen flex-col">
      <TitleBar
        activeFeature={activeFeature}
        libraryQuery={libraryQuery}
        onLibraryQueryChange={setLibraryQuery}
      />
      <div className="relative flex min-h-0 flex-1">
      {sidebarVisible && (
        /* 宽度走 --sidebar-w（styles.css 单一来源）：目录挂载线/条目容器的左缘要对齐它的右缘，
           两处硬编码会漂（STYLE.md §5.8） */
        <aside
          className={`flex flex-none flex-col items-center border-r border-[var(--border)] bg-[var(--panel)] py-2 ${
            sidebarOverlays ? 'absolute inset-y-0 left-0 z-40' : ''
          }`}
          style={{ width: 'var(--sidebar-w)' }}
        >
          <nav className="flex w-full flex-1 flex-col items-center gap-1.5">
            {FEATURES.filter((f) => !f.pinned).map((f) => (
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
      )}

      {/* 阅读态去掉主面板内边距：阅读页铺开的是**桌**（STYLE.md §5.8），桌必须到屏幕边缘，
          否则四周留一圈 --bg 就成了"嵌入盒子"的边框。阅读态同时禁用主面板自身滚动
          （滚动归正文列）—— 否则会在窗口右缘多出一根滚动条。其余功能组件保持 p-5。 */}
      <main
        className={`relative min-w-0 flex-1 bg-[var(--bg)] ${
          activeFeature === 'reader' ? 'overflow-hidden p-0' : 'overflow-y-auto p-5'
        }`}
      >
        {/* 阅读态贴缘按钮（STYLE.md §5.8）：召回 / 收起图标栏；只在阅读器里出现。
            侧边栏覆盖在左侧（见 sidebarOverlays）→ 它展开时按钮移到侧边栏右缘，不会互相压住。 */}
        {activeFeature === 'reader' && (
          <button
            className={`reader-sidebar-toggle ${sidebarPinned ? 'reader-sidebar-toggle--pinned' : ''}`}
            aria-label="切換側邊欄"
            title="切換側邊欄"
            onClick={() => setSidebarPinned((v) => !v)}
          />
        )}
        {FEATURES.map((f) => {
          const C = f.component
          return (
            <div key={f.id} className={`h-full ${activeFeature === f.id ? '' : 'hidden'}`}>
              <C
                container={container}
                host={host}
                selectedBookId={selectedBookId}
                readerBookId={readerBookId}
                activeFeature={activeFeature}
                libraryQuery={libraryQuery}
                onLibraryQueryChange={setLibraryQuery}
              />
            </div>
          )
        })}
      </main>
      </div>
    </div>
  )
}
