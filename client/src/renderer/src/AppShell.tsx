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
import { runDevSelfCheck } from './dev/selfCheck'

export default function AppShell(): React.JSX.Element {
  const container = useMemo<ServiceContainer>(() => createContainer(window.turead), [])
  const [activeFeature, setActiveFeature] = useState<FeatureId>('library')
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
  const [readerBookId, setReaderBookId] = useState<string | null>(null)

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
      closeReader: () => {
        readerBookIdRef.current = null
        setReaderBookId(null)
      },
      selectBook: (id) => {
        selectedBookIdRef.current = id
        setSelectedBookId(id)
      },
      pushLog
    }),
    [container]
  )

  // dev-only：TUREAD_DEV_BOOK 指定书时启动即导入并打开（无头验证渲染链路，实现见 dev/selfCheck.ts）
  useEffect(() => runDevSelfCheck(container, host), [container, host])

  return (
    <div className="flex h-screen">
      <aside className="flex w-14 flex-none flex-col items-center border-r border-[var(--border)] bg-[var(--panel)] py-2">
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

      <main className="min-w-0 flex-1 overflow-y-auto bg-[var(--bg)] p-5">
        {FEATURES.map((f) => {
          const C = f.component
          return (
            <div key={f.id} className={`h-full ${activeFeature === f.id ? '' : 'hidden'}`}>
              <C
                container={container}
                host={host}
                selectedBookId={selectedBookId}
                readerBookId={readerBookId}
              />
            </div>
          )
        })}
      </main>
    </div>
  )
}
