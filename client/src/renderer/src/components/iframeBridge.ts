/**
 * iframe 事件桥（2026-09-13）。
 *
 * 解决什么：kookit 正文渲染在 iframe 里，键盘/滚轮事件落在 iframe 自己的 document 上，
 * **永远冒泡不到宿主 window**（事件被文档边界挡住）——鼠标点进书页后 F11/Esc/t/p 失灵的根因。
 * 键鼠交互应当"只看当前界面，不看焦点在哪层文档"（用户定：按键实现无状态）。
 *
 * 做法：对当前文档树下所有**同源** iframe 的 contentDocument 挂同一套监听。
 * iframe 是懒加载的（章节/页按需渲染）→ MutationObserver 追踪新增节点，
 * 未加载完的等 load 事件后 contentDocument 才是真实文档，两路都挂。
 *
 * 注意：跨文档事件不会重复触发——iframe 内的事件只在 iframe 文档上触发一次，
 * 宿主 window 监听收不到，反之亦然，所以桥接不会造成同一按键执行两次。
 */

/** 对所有同源 iframe 文档挂监听；返回总卸载函数（observer + 全部 attach 返回的清理）。 */
export function bridgeIframeDocuments(attach: (doc: Document) => () => void): () => void {
  const detachAll = new Set<() => void>()
  const seen = new Set<Document>()

  const tryAttach = (iframe: HTMLIFrameElement): void => {
    const hook = (): void => {
      const doc = iframe.contentDocument
      if (!doc || seen.has(doc)) return
      seen.add(doc)
      detachAll.add(attach(doc))
    }
    hook() // 已加载完的 iframe 立即挂
    iframe.addEventListener('load', hook) // 未加载完的等真实文档就绪
  }

  const scan = (el: Element): void => {
    for (const f of el.querySelectorAll('iframe')) tryAttach(f)
  }

  scan(document.documentElement)
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n instanceof HTMLIFrameElement) tryAttach(n)
        else if (n instanceof HTMLElement) scan(n)
      }
    }
  })
  mo.observe(document.body, { childList: true, subtree: true })

  return () => {
    mo.disconnect()
    for (const off of detachAll) off()
  }
}
