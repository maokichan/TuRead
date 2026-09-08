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
import { extToFormat } from '@core/domain/format'
import { isZeroLocation, sameLocation } from '@core/domain/location'
import type { BookLocation } from '@core/domain/types'
import type { CoverSummary } from '@core/usecases/CoverQueue'
import { pushLog } from '../features/logStore'
import type { FeatureHost } from '../features/types'

/** 防重入标记（模块级）：StrictMode 在 dev 会 mount→unmount→remount，
 *  用 useRef 会在 remount 时重置，导致两个并发 openReader 竞争。 */
let autoOpened = false

export function runDevSelfCheck(container: ServiceContainer, host: FeatureHost): void {
  const devBook = window.turead.devBook
  if (!devBook || autoOpened) return
  autoOpened = true

  void (async () => {
    try {
      const buffer = await container.picker.readFile(devBook)
      const { book, reused } = await container.books.importBook(
        buffer,
        devBook.split(/[\\/]/).pop() ?? devBook,
        extToFormat(devBook),
        devBook
      )
      pushLog(reused ? '[dev] 已在书架（指纹命中，复用）' : `[dev] 已导入：${book.metadata.title}`)
      host.openReader(book.id)

      const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
      /**
       * 阅读器可见性保障：功能组件**常驻挂载、非激活 `display:none`** —— 隐藏时所有
       * getBoundingClientRect/scrollHeight 都是 0，"可滚动/iframeH"断言必然假阴性
       * （2026-09-08 观察到偶发；渲染本身正常）。这里等它可见，必要时重试 openReader。
       */
      const ensureReaderVisible = async (): Promise<boolean> => {
        for (let i = 0; i < 24; i++) {
          if (document.getElementById('page-area')?.offsetParent) return true
          if (i > 0 && i % 4 === 0) host.openReader(book.id)
          await wait(250)
        }
        return false
      }
      const visible = await ensureReaderVisible()
      if (!visible) {
        const line = '[dev] 阅读器面板始终不可见（功能组件非激活隐藏？）'
        pushLog(line)
        console.error('[TUREAD-TEST-FAIL]' + line)
        return
      }
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
      // 等宿主容器里的 iframe 高度落地再测量：MobiRender/AZW3 偶发晚于首帧才设高度，
      // 高度为 0 时 `可滚动/iframeH` 会被误判为"渲染可疑"（v0.1.8 观察到，重跑即绿）。
      // 注意这是**测量等待**，不是掩盖问题：真没设高度会走到超时，仍会判可疑。
      const waitIframeSized = async (): Promise<void> => {
        const deadline = performance.now() + 10000
        while (performance.now() < deadline) {
          if (readDocState().iframeH > 0) return
          await wait(200)
        }
      }

      /** 等"翻页生效"出现（位置或宿主滚动变化），而不是"停稳后再量" ——
       *  隐藏窗口的 smooth 滚动会被推迟 ~2s，固定等待+停稳检测分不清"未开始/已结束"。 */
      const waitForTurn = async (
        beforeLoc: BookLocation,
        beforeScrollTop: number
      ): Promise<boolean> => {
        const deadline = performance.now() + 15000
        while (performance.now() < deadline) {
          await wait(250)
          if (
            changed(beforeLoc, container.render.getPosition()) ||
            (stage()?.scrollTop ?? 0) !== beforeScrollTop
          ) {
            return true
          }
        }
        return false
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
        await waitIframeSized()
        const s1 = readDocState()
        innerLen = s1.innerLen
        subInfo =
          `bodyHtml=${s1.htmlLen} img=${s1.imgCount} docOk=${s1.doc ? 'yes' : 'no'} ` +
          `pageAreaSame=${document.getElementById('page-area') === s1.el ? 'yes' : 'no'} stageIframes=${s1.el?.querySelectorAll('iframe').length ?? -1} iframeH=${s1.iframeH} docScrollH=${s1.docScrollH}`
        // 翻页断言从章节 0 起跑：书可能被"上次阅读位置"恢复到接近结尾处，
        // 那种情况下 next() 本就无处可去 —— 不是渲染问题，是测试起点问题。
        await container.render.goToChapter(0)
        await wait(1500)
        await waitScrollSettle()
        // 图片页感知：首章常是纯图片扉页（innerText=0 属正常，2026-09-07 销案结论），
        // 文字为空时向前翻最多 10 章找正文，同时覆盖"翻页位置必须变化"断言
        const scans: string[] = []
        let prev = container.render.getPosition()
        for (let i = 0; i < 10 && innerLen <= 100; i++) {
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
        if (!posChanged) {
          // kookit 坑 §5.10：文字类 smooth 滚动开始即 record → 位置旧值。
          // 这里等"变化出现"（位置或 scrollTop），比"停稳后再量"更可靠（见 waitForTurn）。
          const beforeLoc = container.render.getPosition()
          const beforeTop = stage()?.scrollTop ?? 0
          await container.render.next()
          posChanged = await waitForTurn(beforeLoc, beforeTop)
        }
      }
      // 封面管线自检（v0.1.8）：异步提取 → 解析元数据 → canvas 缩略图 → 落盘 → 回写 coverPath。
      // 平时由 LibraryFeature 在导入后入队；dev 模式跳过自动入队（保证渲染断言确定性），这里显式跑一次。
      const coverLine = await (async (): Promise<string> => {
        try {
          const finished = new Promise<CoverSummary>((resolve) => {
            const off = container.covers.on('done', (s) => {
              off()
              resolve(s)
            })
          })
          container.covers.enqueue([book.id])
          const summary = await Promise.race([finished, wait(45000).then(() => null)])
          const fresh = await container.books.get(book.id)
          if (!fresh?.coverPath) {
            return `封面=无(${summary ? `ok${summary.ok}/fail${summary.failed}` : '超时'})`
          }
          const bytes = await container.store.getCover(book.id)
          return `封面=${fresh.coverPath}(${bytes ? `${Math.round(bytes.byteLength / 1024)}KB` : '读回失败'})`
        } catch (err) {
          return `封面=异常(${(err as Error).message})`
        }
      })()

      // 收尾前再确认一次阅读器可见：已知偶发（面板在测量前被隐藏 → 所有尺寸读成 0 的假阴性）
      await ensureReaderVisible()
      await waitIframeSized()
      const s2 = readDocState()
      // 判定"渲染成功"：有内容（文字**或图片** —— 纯图片页也是有效渲染）且可滚动且翻页生效
      const ok = (innerLen > 0 || s2.imgCount > 0) && s2.scrollH > 0 && posChanged
      // 打包字体（源流明體）是否真的可用（侧边栏符号与文字封面都依赖它）
      const fontLine = document.fonts.check('700 16px "GenRyuMin TW"') ? '字体=ok' : '字体=缺失'

      /**
       * 文字封面填充回归断言（2026-09-08 加）：离屏渲染一个 118×177 的 FittedTitle，
       * 量它的字号与文字块高度。此前的 bug（用 scrollWidth 当宽度上限 → 字号永远停在 minSize）
       * 正是这条断言会抓到的。
       */
      const fittedLine = await (async (): Promise<string> => {
        try {
          const [{ createElement }, { createRoot }, { FittedTitle }] = await Promise.all([
            import('react'),
            import('react-dom/client'),
            import('../components/FittedTitle')
          ])
          const probeHost = document.createElement('div')
          probeHost.style.cssText = 'position:fixed;left:-9999px;top:0;width:118px;height:177px'
          document.body.appendChild(probeHost)
          const root = createRoot(probeHost)
          root.render(createElement(FittedTitle, { text: '年代四部曲' }))
          await wait(900)
          const span = probeHost.querySelector('span')
          const size = span ? parseFloat(getComputedStyle(span).fontSize) : 0
          const used = span ? span.getBoundingClientRect().height : 0
          const ratio = Math.round((used / 177) * 100)
          root.unmount()
          probeHost.remove()
          const verdict = size > 20 && ratio > 55 ? 'ok' : '可疑'
          return `文字封面=${verdict}(字号${size.toFixed(0)}px/填充${ratio}%)`
        } catch (err) {
          return `文字封面=异常(${(err as Error).message})`
        }
      })()

      /**
       * "阅读器记住上次内容"回归断言（v0.1.9）：关闭阅读器后再进入，应自动恢复上次阅读的书。
       * ⚠ 必须走**真实用户路径**（点击侧边栏「阅读」按钮）：此前直接调 `host.navigate`，
       *   掩盖了"侧边栏按钮绕过 host.navigate"的 bug —— 断言测了 API 却没测用户路径（2026-09-08 修正）。
       */
      const restoreLine = await (async (): Promise<string> => {
        try {
          host.closeReader()
          await wait(500)
          const btn = document.querySelector<HTMLButtonElement>('aside button[aria-label="阅读"]')
          if (!btn) return '恢复=失败(找不到侧边栏按钮)'
          btn.click()
          const deadline = Date.now() + 10000
          while (Date.now() < deadline) {
            if (!isZeroLocation(container.render.getPosition())) return '恢复=ok'
            await wait(200)
          }
          return '恢复=失败'
        } catch (err) {
          return `恢复=异常(${(err as Error).message})`
        }
      })()

      const pos1 = container.render.getPosition()
      const ch = container.render.getChapter().length
      const line =
        `[dev] ${ok ? '渲染OK' : '渲染可疑'} 格式=${book.format} 章节数=${ch} ` +
        `正文长度=${innerLen} 可滚动=${s2.scrollH} iframeH=${s2.iframeH} docScrollH=${s2.docScrollH} ${subInfo} ${coverLine} ${fontLine} ${fittedLine} ${restoreLine} 位置=第${pos1.page}页/${pos1.percentage}`
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
