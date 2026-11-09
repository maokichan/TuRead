/**
 * dev-only 无头探针：书内链接点击回归（Issue #2「epub 脚注跳转白屏」，2026-11-09 修复）。
 *
 * 病根回顾：正文 iframe 沙箱内 kookit 的链接处理是死代码（KOOKIT.md §5 #15），无人拦截的
 * 点击落到浏览器默认行为——iframe 被导航到「宿主相对路径解析出的 URL」→ 正文文档被销毁
 * （白屏）。修复 = 适配器在书文档 capture 拦截 + 自持跳转语义（attachLinkWatch/activateLink）。
 *
 * 手段：真实链路开书 → 在正文 iframe 文档上派发**配对 mousedown/click 合成事件**（坐标一致，
 * 过拖选守卫；与真实点击同一拦截路径）→ 逐项断言：
 *   ① 同文件锚点 `#n2`：文档身份不变（未被导航）、章节不变；
 *   ② 跨文件脚注 `notes.xhtml#n1`：文档身份不变、iframe 仍停 about:blank、
 *      章节 = 目标章、正文含脚注内容；
 *   ③ 外部链接：`link-external` 事件发出（window.open 打桩，不真开浏览器）、文档身份不变。
 *
 * 样书要求：含 `a[href="#锚点"]`、`a[href="notes.xhtml#锚点"]`（跨文件脚注）两形态
 * （构造器 = `client/test_docs/build-footnote-repro.mjs`，产物在 test_docs/，gitignored）。
 * 触发：`TUREAD_DEV_PROBE=link` + `TUREAD_DEV_BOOK=<该 epub 绝对路径>`（独立 userData）。
 * 归属：开发工具，不是产品代码（同 dev/selfCheck.ts 纪律）。
 */
import type { ServiceContainer } from '@core/container'
import { extToFormat } from '@core/domain/format'
import type { FeatureHost } from '../features/types'

let autoRan = false

/** 配对派发 mousedown+click（同坐标，过适配器的拖选守卫；与真实"点"同路径） */
function clickAt(doc: Document, el: Element): void {
  const opts: MouseEventInit = { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }
  el.dispatchEvent(new MouseEvent('mousedown', opts))
  el.dispatchEvent(new MouseEvent('click', opts))
}

export function runLinkProbe(container: ServiceContainer, host: FeatureHost): void {
  if (window.turead.devProbe !== 'link' || autoRan) return
  autoRan = true

  void (async () => {
    const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
    const expect = (cond: boolean, msg: string): void => {
      if (!cond) throw new Error('断言失败：' + msg)
    }
    try {
      const devBook = window.turead.devBook
      if (!devBook) throw new Error('link 探针需要 TUREAD_DEV_BOOK 指向脚注样书 epub')
      const buffer = await container.picker.readFile(devBook)
      const { currentId: libraryId } = await container.store.listLibraries()
      const { edition } = await container.books.importBook(
        buffer,
        devBook.split(/[\\/]/).pop() ?? devBook,
        extToFormat(devBook),
        devBook,
        libraryId
      )
      host.openReader(edition.id)

      const stage = (): HTMLElement | null => document.getElementById('page-area')
      const iframe = (): HTMLIFrameElement | null =>
        stage()?.querySelector('iframe') as HTMLIFrameElement | null
      let visible = false
      for (let i = 0; i < 24 && !visible; i++) {
        visible = Boolean(stage()?.offsetParent)
        if (!visible && i > 0 && i % 4 === 0) host.openReader(edition.id)
        await wait(250)
      }
      if (!visible) throw new Error('阅读器面板不可见')
      const deadline = Date.now() + 30000
      while (!iframe() && Date.now() < deadline) await wait(200)
      if (!iframe()) throw new Error('顶层 iframe 未出现')
      await wait(2000)

      const docA = iframe()?.contentDocument
      if (!docA?.body) throw new Error('书文档不可访问')
      const anchor = docA.querySelector('a[href="#n2"]')
      const foot = docA.querySelector('a[href*="notes.xhtml"]')
      if (!anchor || !foot) throw new Error('样书缺脚注链接形态（同文件 #n2 / 跨文件 notes.xhtml）')
      const chapter0 = container.render.getPosition().chapterDocIndex

      // ① 同文件锚点：原地滚动，文档身份与章节都不变
      clickAt(docA, anchor)
      await wait(800)
      const docAfter1 = iframe()?.contentDocument
      expect(docAfter1 === docA, '同文件锚点点击后文档被换（导航发生）')
      expect(
        docAfter1?.defaultView?.location.href === 'about:blank',
        '同文件锚点点击后 iframe 离开了 about:blank'
      )
      expect(
        container.render.getPosition().chapterDocIndex === chapter0,
        '同文件锚点点击后章节变了'
      )

      // ② 跨文件脚注：跳到目标章定锚，全程不导航
      clickAt(docA, foot)
      await wait(2000)
      const docB = iframe()?.contentDocument
      expect(docB === docA, '跨文件脚注点击后文档被换（白屏病根仍在）')
      expect(
        docB?.defaultView?.location.href === 'about:blank',
        '跨文件脚注点击后 iframe 离开了 about:blank'
      )
      const notesIdx = container.render
        .getChapter()
        .find((c) => (c.href ?? '').includes('notes.xhtml'))?.chapterDocIndex
      expect(notesIdx !== undefined, '目录里找不到 notes.xhtml 章节')
      expect(
        container.render.getPosition().chapterDocIndex === notesIdx,
        `脚注跳转未落到目标章（got=${container.render.getPosition().chapterDocIndex} want=${notesIdx}）`
      )
      expect(
        (docB?.body.innerText ?? '').includes('脚注一'),
        '跳转后正文不含脚注目标内容'
      )

      // ③ 外部链接：事件通道发出，window.open 打桩（不真开浏览器）
      let opened: string | null = null
      const origOpen = window.open
      window.open = ((url?: string | URL) => {
        opened = url ? String(url) : ''
        return null
      }) as typeof window.open
      const ext = docB!.createElement('a')
      ext.setAttribute('href', 'https://turead-probe.invalid/open')
      docB!.body.appendChild(ext)
      try {
        clickAt(docB!, ext)
        await wait(400)
      } finally {
        window.open = origOpen
        ext.remove()
      }
      expect(opened === 'https://turead-probe.invalid/open', '外部链接未走 link-external → window.open')
      expect(iframe()?.contentDocument === docA, '外部链接点击后文档被换')

      console.log('[TUREAD-TEST-OK] link 探针全过：同文件锚点 / 跨文件脚注 / 外链三分支均不导航 iframe')
    } catch (err) {
      console.error('[TUREAD-TEST-FAIL]' + (err as Error).message)
    }
  })()
}
