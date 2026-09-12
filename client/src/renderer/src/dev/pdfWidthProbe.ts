/**
 * dev-only 无头探针：PDF 改纸宽行为复现（TODO「渲染与阅读器」首条，2026-09-12）。
 *
 * 背景：用户实测 PDF 在右侧面板改「纸宽」（--read-width 档位）后表现与预期不符。
 * 读码假设：kookit `PdfRender` 在渲染时用 `doc.body.clientWidth` 算出缩放（getPdfScale），
 * canvas/子 iframe 尺寸落成**固定像素**，且 kookit 全库无 resize 监听 → 改宿主宽度不触发重排/重算。
 * 本探针把现象量化成数字，**不做产品断言**（完成即 OK，"复现与否"看事实行里的 `复现=` 字段）。
 *
 * 触发：`TUREAD_DEV_PROBE=pdf-width` + `TUREAD_DEV_BOOK=<pdf 绝对路径>`（务必独立 userData）。
 * 手段：真实链路开书 → 等渲染完成 → 依次 760(默认)→920→620→760 就地改 documentElement 的
 * `--read-width`（与 ReaderFeature.applyParams 同一机制，绕开 UI 是刻意的：先隔离"参数没送达"，
 * 只看渲染层对宽度变化的响应）→ 每档测量 宿主/顶层iframe/子iframe/canvas 宽与水平溢出。
 * 归属：开发工具，不是产品代码（同 dev/selfCheck.ts 的纪律）。
 */
import type { ServiceContainer } from '@core/container'
import { extToFormat } from '@core/domain/format'
import type { FeatureHost } from '../features/types'

/** 防重入（同 selfCheck：StrictMode dev 会 mount→unmount→remount） */
let autoRan = false

export function runPdfWidthProbe(container: ServiceContainer, host: FeatureHost): void {
  if (window.turead.devProbe !== 'pdf-width' || autoRan) return
  autoRan = true

  void (async () => {
    const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
    try {
      const devBook = window.turead.devBook
      if (!devBook) throw new Error('pdf-width 探针需要 TUREAD_DEV_BOOK 指向 PDF 文件')
      const buffer = await container.picker.readFile(devBook)
      const { book } = await container.books.importBook(
        buffer,
        devBook.split(/[\\/]/).pop() ?? devBook,
        extToFormat(devBook),
        devBook
      )
      if (book.format !== 'PDF') throw new Error(`探针只针对 PDF，实际 ${book.format}`)
      host.openReader(book.id)

      // 等阅读器面板可见（功能组件非激活 display:none 时一切尺寸读成 0，同 selfCheck 的坑）
      let visible = false
      for (let i = 0; i < 24 && !visible; i++) {
        visible = Boolean(document.getElementById('page-area')?.offsetParent)
        if (!visible && i > 0 && i % 4 === 0) host.openReader(book.id)
        await wait(250)
      }
      if (!visible) throw new Error('阅读器面板不可见')

      // 等渲染：每页子 iframe + canvas 出现（PDF 顶层 iframe 只有壳）
      const topDoc = (): Document | null =>
        document.getElementById('page-area')?.querySelector('iframe')?.contentDocument ?? null
      const subs = (): HTMLIFrameElement[] =>
        Array.from(
          topDoc()?.querySelectorAll('iframe[data-pdf-page], iframe[id^="pdf-iframe-"]') ?? []
        ) as HTMLIFrameElement[]
      const canvasCount = (): number =>
        subs().reduce(
          (n, f) => n + (f.contentDocument?.querySelectorAll('canvas').length ?? 0),
          0
        )
      const deadline = Date.now() + 30000
      while (Date.now() < deadline && !(subs().length > 0 && canvasCount() > 0)) await wait(300)
      if (canvasCount() === 0) throw new Error('PDF 渲染未出现 canvas（30s）')
      await wait(2000)

      /** 一档纸宽下的事实快照（数字为主，判断在数字后面做） */
      const measure = (): string => {
        const stage = document.getElementById('page-area')
        const top = stage?.querySelector('iframe') as HTMLIFrameElement | null
        const firstSub = subs()[0]
        const firstCanvas = firstSub?.contentDocument?.querySelector('canvas')
        const subDoc = firstSub?.contentDocument
        const attrs = firstCanvas
          ? `${firstCanvas.getAttribute('width') ?? '?'}x${firstCanvas.getAttribute('height') ?? '?'}`
          : '?'
        return (
          `宿主=${stage?.clientWidth ?? -1} 顶层iframe=${Math.round(top?.getBoundingClientRect().width ?? -1)} ` +
          `子iframe=${Math.round(firstSub?.getBoundingClientRect().width ?? -1)} ` +
          `canvas=${Math.round(firstCanvas?.getBoundingClientRect().width ?? -1)}(attr ${attrs}) ` +
          `子doc.scrollW=${subDoc?.body?.scrollWidth ?? -1}/clientW=${subDoc?.body?.clientWidth ?? -1} ` +
          `顶层doc.scrollW=${topDoc()?.body?.scrollWidth ?? -1} ` +
          `水平溢出=${stage ? stage.scrollWidth - stage.clientWidth : -1}`
        )
      }

      const snap = (): { stageW: number; canvasW: number } => {
        const stage = document.getElementById('page-area')
        const firstCanvas = subs()[0]?.contentDocument?.querySelector('canvas')
        return {
          stageW: stage?.clientWidth ?? -1,
          canvasW: Math.round(firstCanvas?.getBoundingClientRect().width ?? -1)
        }
      }

      const setWidth = async (px: number): Promise<{ stageW: number; canvasW: number }> => {
        document.documentElement.style.setProperty('--read-width', `${px}px`)
        await wait(1500)
        console.error(`[probe] 纸宽${px}: ${measure()}`)
        return snap()
      }

      const base = await setWidth(760)
      const wide = await setWidth(920)
      const narrow = await setWidth(620)
      await setWidth(760) // 还原默认档（独立 userData，仅为输出对称）

      // 判定（探针口径，非产品断言）：宿主列宽随档位变化，而 PDF 内容（canvas）宽度不动 = 不重排；
      // 窄档下 canvas 宽过宿主列 = 内容被裁/出横向滚动。
      const stageMoved =
        Math.abs(wide.stageW - base.stageW) >= 80 && Math.abs(narrow.stageW - base.stageW) >= 80
      const canvasStatic =
        Math.abs(wide.canvasW - base.canvasW) <= Math.max(4, base.canvasW * 0.02) &&
        Math.abs(narrow.canvasW - base.canvasW) <= Math.max(4, base.canvasW * 0.02)
      const narrowCropped = narrow.canvasW > narrow.stageW
      console.log(
        `[TUREAD-TEST-OK] 纸宽复现=${stageMoved && canvasStatic ? '是' : '否'}` +
          `(宿主随档位变=${stageMoved} canvas不重排=${canvasStatic}) ` +
          `窄档裁切=${narrowCropped ? '是(canvas宽于宿主列)' : '否'} ` +
          `基准canvas=${base.canvasW} 宽档canvas=${wide.canvasW} 窄档canvas=${narrow.canvasW}`
      )
    } catch (err) {
      console.error(`[TUREAD-TEST-FAIL] pdf-width 探针失败：${(err as Error).message}`)
    }
  })()
}
