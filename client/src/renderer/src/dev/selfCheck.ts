/**
 * dev-only 无头自检（TUREAD_DEV_BOOK）—— 从 AppShell 抽出（v0.1.7）。
 *
 * 为什么独立成文件：AppShell 的职责是"谁在哪个模式"（FEATURES.md §3），此前它内嵌了约 155 行
 * 渲染自检代码（DOM 探测 + 滚动停稳轮询 + PDF canvas 计数），既是 UI 层最大的技术债，
 * 也让"shell 只做组合"这条纪律名存实亡。
 *
 * 归属：**开发工具，不是产品代码**。走真实交互链路（books.importBook → host.openReader →
 * ReaderFeature 渲染），以 `[TUREAD-TEST-OK/FAIL]` 标记结束（main/index.ts 捕获后 app.exit(0/1/2)）。
 * 已知例外：直接用 `window.turead` 桥读文件（与 LibraryFeature 选文件同类，见 FEATURES.md §8）。
 */
import type { ServiceContainer } from '@core/container'
import { sameLocation } from '@core/domain/location'
import type { BookLocation } from '@core/domain/types'
import { IPC } from '@shared/ipc'
import { pushLog } from '../features/logStore'
import type { FeatureHost } from '../features/types'
import { extToFormat } from '../features/util'

/** 防重入标记（模块级）：StrictMode 在 dev 会 mount→unmount→remount，
 *  用 useRef 会在 remount 时重置，导致两个并发 openReader 竞争。 */
let autoOpened = false

export function runDevSelfCheck(container: ServiceContainer, host: FeatureHost): void {
  const devBook = window.turead.devBook
  if (!devBook || autoOpened) return
  autoOpened = true

  void (async () => {
    try {
      const buffer = (await window.turead.invoke(IPC.fsReadFile, devBook)) as ArrayBuffer
      const { book, reused } = await container.books.importBook(
        buffer,
        devBook.split(/[\\/]/).pop() ?? devBook,
        extToFormat(devBook),
        devBook
      )
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
      const readDocState = (): {
        el: HTMLElement | null
        doc: Document | null
        innerLen: number
        htmlLen: number
        imgCount: number
        scrollH: number
        iframeH: number
        docScrollH: number
      } => {
        const el = stage()
        const iframeEl = el?.querySelector('iframe')
        const doc = iframeEl?.contentDocument
        return {
          el,
          doc: doc ?? null,
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
          const subs = doc?.querySelectorAll('iframe[data-pdf-page], iframe[id^="pdf-iframe-"]') ?? []
          return Array.from(subs).reduce(
            (n, f) =>
              n + ((f as HTMLIFrameElement).contentDocument?.querySelectorAll('canvas').length ?? 0),
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
        const subIframes = s.doc?.querySelectorAll('iframe[data-pdf-page], iframe[id^="pdf-iframe-"]') ?? []
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
}
