/**
 * dev-only 无头探针：分页模式（single/double）交互行为复现（2026-09-13 用户报障：
 * 单页模式下滚轮翻不了页、目录跳不动）。
 *
 * 手段：真实链路开书 → patchSetting 切 single → closeReader/openReader 重开（与面板同语义）
 * → 在正文 iframe 文档上**派发合成事件**分别驱动三路：
 *   ① 键盘 ArrowRight（走 iframe 事件桥 → pageTurn → rendition.next）
 *   ② 滚轮 WheelEvent（走 iframe 滚轮桥 → turnByWheel → pageTurn）
 *   ③ 目录 goToChapter（container.render.goToChapter，不经 UI）
 * 每路前后读 getPosition()，事实行输出位置是否移动。**不做产品断言**，复现与否看事实行。
 *
 * 触发：`TUREAD_DEV_PROBE=paged-interact` + `TUREAD_DEV_BOOK=<epub 绝对路径>`（独立 userData）。
 * 归属：开发工具，不是产品代码（同 dev/selfCheck.ts 纪律）。
 */
import type { ServiceContainer } from '@core/container'
import { extToFormat } from '@core/domain/format'
import type { BookLocation } from '@core/domain/types'
import type { FeatureHost } from '../features/types'

let autoRan = false

const posKey = (p: BookLocation): string =>
  JSON.stringify([p.chapterDocIndex, p.count, p.page, p.percentage.toFixed(4)])

export function runPagedInteractProbe(container: ServiceContainer, host: FeatureHost): void {
  if (window.turead.devProbe !== 'paged-interact' || autoRan) return
  autoRan = true

  void (async () => {
    const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
    const fact = (line: string): void => console.error(`[probe] ${line}`)
    try {
      const devBook = window.turead.devBook
      if (!devBook) throw new Error('paged-interact 探针需要 TUREAD_DEV_BOOK 指向 EPUB/文字类文件')
      const buffer = await container.picker.readFile(devBook)
      const { book } = await container.books.importBook(
        buffer,
        devBook.split(/[\\/]/).pop() ?? devBook,
        extToFormat(devBook),
        devBook
      )
      host.openReader(book.id)

      const stage = (): HTMLElement | null => document.getElementById('page-area')
      const iframe = (): HTMLIFrameElement | null =>
        stage()?.querySelector('iframe') as HTMLIFrameElement | null

      // 等可见 + 等 iframe
      let visible = false
      for (let i = 0; i < 24 && !visible; i++) {
        visible = Boolean(stage()?.offsetParent)
        if (!visible && i > 0 && i % 4 === 0) host.openReader(book.id)
        await wait(250)
      }
      if (!visible) throw new Error('阅读器面板不可见')
      const deadline = Date.now() + 30000
      while (!iframe() && Date.now() < deadline) await wait(200)
      if (!iframe()) throw new Error('顶层 iframe 未出现')
      await wait(2000)

      // 切到 single 模式（与设置面板同语义：落库 + 重开）
      await container.store.patchSetting('readerSettings', { readerMode: 'single' })
      host.closeReader()
      await wait(600)
      host.openReader(book.id)
      const deadline2 = Date.now() + 30000
      while ((!iframe() || iframe() === null) && Date.now() < deadline2) await wait(200)
      await wait(2500)
      fact(`模式切换单页完成，iframe 数=${stage()?.querySelectorAll('iframe').length ?? 0}`)

      const doc = (): Document | null => iframe()?.contentDocument ?? null
      const pos = (): BookLocation => container.render.getPosition()
      const p0 = pos()
      fact(`起点位置=${posKey(p0)}`)

      // ① 键盘（iframe 事件桥）：ArrowRight
      const kd = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
        cancelable: true
      })
      doc()?.body.dispatchEvent(kd)
      await wait(1200)
      const p1 = pos()
      fact(`键盘ArrowRight：${posKey(p0)} -> ${posKey(p1)} 移动=${posKey(p0) !== posKey(p1)}`)

      // ② 滚轮（iframe 滚轮桥）：deltaY=120
      const we = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })
      doc()?.body.dispatchEvent(we)
      await wait(1200)
      const p2 = pos()
      fact(`滚轮：${posKey(p1)} -> ${posKey(p2)} 移动=${posKey(p1) !== posKey(p2)}`)

      // ③ 目录跳转（不经 UI，直调用例）
      const chapters = container.render.getChapter().flatMap((c) => [c])
      const target = chapters.find((c) => (c.chapterDocIndex ?? 0) > 2)
      if (!target || target.chapterDocIndex === undefined) {
        fact('目录跳转：样书无可跳章节（chapterDocIndex 缺失），跳过')
      } else {
        await container.render.goToChapter(target.chapterDocIndex)
        await wait(1500)
        const p3 = pos()
        fact(
          `目录跳转->${target.label}(docIndex=${target.chapterDocIndex})：${posKey(p2)} -> ${posKey(p3)} ` +
            `落点章=${p3.chapterDocIndex} 预期=${target.chapterDocIndex}`
        )
      }

      // ④ 事实补充：iframe body 横向溢出情况（分页模式依赖 doc.body.scrollLeft）
      const d = doc()
      if (d?.body) {
        fact(
          `iframe body 滚动几何：scrollWidth=${d.body.scrollWidth} clientWidth=${d.body.clientWidth} ` +
            `scrollLeft=${d.body.scrollLeft}`
        )
      }

      console.log('[TUREAD-TEST-OK] paged-interact 探针完成（事实见上方，无产品断言）')
    } catch (err) {
      console.error('[TUREAD-TEST-FAIL]' + (err as Error).message)
    }
  })()
}
