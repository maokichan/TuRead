/**
 * AppShell —— 功能组件标准容器。
 * 职责：
 * - 左侧 = 功能组件图标栏（registry 自动发现）；主面板 = 宿主容器。
 * - 持有跨功能共享态（activeFeature / selectedBookId / readerBookId）。
 * - 提供 FeatureHost（navigate / openReader / closeReader / selectBook / pushLog）——
 *   跨功能导航与状态继承的唯一通道（FEATURES.md §5 / features/types.ts）。
 * - 功能组件常驻挂载、非激活 display:none → 状态天然继承（房间会话/阅读位置不因切换丢失）。
 * - 无顶栏 / 无日志栏：连接状态在 RoomFeature，诊断日志在 SettingsFeature。
 * - dev-only：TUREAD_DEV_BOOK 无头自检（走真实交互流 openReader + 全局 DOM 断言）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createContainer, type ServiceContainer } from '@core/container'
import { sameLocation } from '@core/domain/location'
import type { BookLocation } from '@core/domain/types'
import { IPC } from '@shared/ipc'
import { FEATURES } from './features/registry'
import type { FeatureHost, FeatureId } from './features/types'
import { extToFormat } from './features/util'
import { pushLog } from './features/logStore'

/** dev 无头自检的防重入标记（模块级，StrictMode remount 不重置，见 useEffect 注释） */
let devAutoOpened = false

export default function AppShell(): React.JSX.Element {
  const container = useMemo<ServiceContainer>(() => createContainer(window.turead), [])
  const [activeFeature, setActiveFeature] = useState<FeatureId>('library')
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
  const [readerBookId, setReaderBookId] = useState<string | null>(null)

  const selectedBookIdRef = useRef<string | null>(null)

  const host = useMemo<FeatureHost>(
    () => ({
      navigate: (id) => setActiveFeature(id),
      openReader: (bookId) => {
        selectedBookIdRef.current = bookId
        setSelectedBookId(bookId)
        setReaderBookId(bookId)
        setActiveFeature('reader')
      },
      closeReader: () => setReaderBookId(null),
      selectBook: (id) => {
        selectedBookIdRef.current = id
        setSelectedBookId(id)
      },
      pushLog
    }),
    []
  )

  // dev-only：TUREAD_DEV_BOOK 指定书时启动即导入并打开（无头验证渲染链路）。
  // 用模块级变量而非 useRef —— StrictMode 在 dev 会 mount→unmount→remount，
  // useRef 在 remount 时重置，导致两个并发 openReader 竞争。
  useEffect(() => {
    const devBook = window.turead.devBook
    if (!devBook || devAutoOpened) return
    devAutoOpened = true
    void (async () => {
      try {
        const buffer = (await window.turead.invoke(IPC.fsReadFile, devBook)) as ArrayBuffer
        const beforeIds = new Set((await container.books.list()).map((b) => b.id))
        const book = await container.books.importBook(
          buffer,
          devBook.split(/[\\/]/).pop() ?? devBook,
          extToFormat(devBook),
          devBook
        )
        const reused = beforeIds.has(book.id)
        pushLog(reused ? '[dev] 已在书架（指纹命中，复用）' : `[dev] 已导入：${book.metadata.title}`)
        host.openReader(book.id)

        const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
        // 等 ReaderFeature 打开流程完成（轮询宿主容器内 iframe 出现，跨组件解耦）
        const deadline = Date.now() + 30000
        while (
          !document.getElementById('page-area')?.querySelector('iframe') &&
          Date.now() < deadline
        ) {
          await wait(200)
        }
        await wait(2500)
        // 读取当前渲染状态（iframe 内 doc 的正文/图片/宿主滚动）
        const stage = (): HTMLElement | null => document.getElementById('page-area')
        const readDocState = () => {
          const el = stage()
          const doc = el?.querySelector('iframe')?.contentDocument
          const iframeEl = el?.querySelector('iframe')
          return {
            el,
            doc,
            innerLen: doc?.body?.innerText?.length ?? -1,
            htmlLen: doc?.body?.innerHTML?.length ?? -1,
            imgCount: doc?.body?.querySelectorAll('img').length ?? 0,
            scrollH: el?.scrollHeight ?? -1,
            iframeH: iframeEl?.getBoundingClientRect().height ?? -1,
            docScrollH: doc?.body?.scrollHeight ?? -1
          }
        }
        const changed = (p1: BookLocation, p2: BookLocation): boolean =>
          !sameLocation(p1, p2, book.format)
        // 等宿主滚动停稳再取位置（next() 是 smooth 滚动 + record 算旧位置；
        // 无头隐藏窗口下 Chromium 还会推迟 smooth scroll 动画 ~2s，固定短等待会取到旧值）
        const waitScrollSettle = async (): Promise<void> => {
          const el = stage()
          if (!el) return
          let prev = el.scrollTop
          let stable = 0
          const start = performance.now()
          while (stable < 3 && performance.now() - start < 12000) {
            await wait(150)
            if (el.scrollTop === prev) stable++
            else {
              stable = 0
              prev = el.scrollTop
            }
          }
        }
        // PDF：渲染产物是嵌套 iframe（每页一个 pdf-iframe-N）+ 内部 canvas，顶层 iframe 无 innerText
        let innerLen = -1
        let subInfo = ''
        let posChanged = false
        if (book.format === 'PDF') {
          const countCanvases = (): number => {
            const el = document.getElementById('page-area')
            const doc = el?.querySelector('iframe')?.contentDocument
            const subs =
              doc?.querySelectorAll('iframe[data-pdf-page], iframe[id^="pdf-iframe-"]') ?? []
            return Array.from(subs).reduce(
              (n, f) =>
                n +
                ((f as HTMLIFrameElement).contentDocument?.querySelectorAll('canvas').length ?? 0),
              0
            )
          }
          // PDF 页面 canvas 异步渲染（大文件冷启动较慢；封面等空页无 canvas 属正常）→
          // 聚合所有页面 iframe 的 canvas 数并轮询其出现
          let canvasCount = 0
          const canvasDeadline = Date.now() + 25000
          while (Date.now() < canvasDeadline) {
            canvasCount = countCanvases()
            if (canvasCount > 0) break
            await wait(300)
          }
          const s = readDocState()
          const subIframes =
            s.doc?.querySelectorAll('iframe[data-pdf-page], iframe[id^="pdf-iframe-"]') ?? []
          const firstSub = subIframes[0] as HTMLIFrameElement | undefined
          innerLen = canvasCount
          subInfo = `子iframe=${subIframes.length} canvas=${canvasCount} subHtml=${firstSub?.contentDocument?.body?.innerHTML?.length ?? -1} visible=${s.el?.offsetParent != null}`
          const p1 = container.render.getPosition()
          const st1 = s.el?.scrollTop ?? 0
          await container.render.next()
          await wait(3000)
          await waitScrollSettle()
          const st2 = s.el?.scrollTop ?? 0
          posChanged = changed(p1, container.render.getPosition()) || st1 !== st2
        } else {
          const s1 = readDocState()
          innerLen = s1.innerLen
          subInfo =
            `bodyHtml=${s1.htmlLen} img=${s1.imgCount} docOk=${s1.doc ? 'yes' : 'no'} ` +
            `pageAreaSame=${document.getElementById('page-area') === s1.el ? 'yes' : 'no'} stageIframes=${s1.el?.querySelectorAll('iframe').length ?? -1} iframeH=${s1.iframeH} docScrollH=${s1.docScrollH}`
          // 图片页感知：首章常是纯图片扉页（innerText=0 属正常，2026-09-07 销案结论），
          // 文字为空时向前翻最多 4 章找正文，同时覆盖"翻页位置必须变化"断言
          const scans: string[] = []
          let prev = container.render.getPosition()
          for (let i = 0; i < 4 && innerLen <= 100; i++) {
            await container.render.next()
            await wait(3000)
            await waitScrollSettle()
            const loc = container.render.getPosition()
            posChanged = posChanged || changed(loc, prev)
            prev = loc
            const s = readDocState()
            innerLen = Math.max(innerLen, s.innerLen)
            scans.push(`翻${i + 1}:章${loc.chapterDocIndex}/文${s.innerLen}/图${s.imgCount}`)
          }
          if (scans.length > 0) subInfo += ` 扫描[${scans.join(' ')}]`
          if (!posChanged && innerLen > 100) {
            // kookit 坑 §5.10：文字类 smooth 滚动开始即 record → 位置旧值，停稳后 count 不刷新。
            // 与 harness §8 同语义：scrollTop 变化也算翻页生效（宿主滚动了即证明 next() 工作）。
            const p1 = container.render.getPosition()
            const el = stage()
            const st1 = el?.scrollTop ?? 0
            await container.render.next()
            await wait(3000)
            await waitScrollSettle()
            const st2 = el?.scrollTop ?? 0
            posChanged = changed(p1, container.render.getPosition()) || st1 !== st2
          }
        }
        const s2 = readDocState()
        const ok = innerLen > 0 && s2.scrollH > 0 && posChanged
        const pos1 = container.render.getPosition()
        const ch = container.render.getChapter().length
        const line =
          `[dev] ${ok ? '渲染OK' : '渲染可疑'} 格式=${book.format} 章节数=${ch} ` +
          `正文长度=${innerLen} 可滚动=${s2.scrollH} iframeH=${s2.iframeH} docScrollH=${s2.docScrollH} ${subInfo} 位置=第${pos1.page}页/${pos1.percentage}`
        pushLog(line)
        console.log(ok ? '[TUREAD-TEST-OK]' + line : '[TUREAD-TEST-FAIL]' + line)
      } catch (err) {
        const e = err as Error
        const line = `[dev] 渲染失败：${e.message}`
        pushLog(line)
        console.error('[TUREAD-TEST-FAIL]' + line)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex h-screen">
      <aside className="flex w-14 flex-none flex-col items-center border-r border-[var(--border)] bg-[var(--panel)] py-2">
        <nav className="flex w-full flex-1 flex-col items-center gap-1.5">
          {FEATURES.filter((f) => !f.pinned).map((f) => (
            <button
              key={f.id}
              title={f.label}
              aria-label={f.label}
              onClick={() => setActiveFeature(f.id)}
              className={`feature-icon grid h-10 w-10 place-items-center rounded-xl text-[19px] transition-colors ${
                activeFeature === f.id
                  ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent-ring)] text-[var(--accent)]'
                  : 'text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]'
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
              onClick={() => setActiveFeature(f.id)}
              className={`feature-icon grid h-10 w-10 place-items-center rounded-xl text-[19px] transition-colors ${
                activeFeature === f.id
                  ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent-ring)] text-[var(--accent)]'
                  : 'text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]'
              }`}
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
