/**
 * dev-only 无头探针：PDF 笔记全链路（笔记 v3 批N2a/N2b 的真机验证——单测碰不到引擎，
 * 真机手感探针也证不了，但**链路断没断**这里必须说得准）。
 *
 * 验什么（对应真机实锤的"弹窗能出来但标注没有用"）：
 * ① 合成选区 → 派发 contextmenu → `context-menu` 事件的载荷里 anchor **非空**
 *    （anchor 空 = 右键菜单里长不出「標記」组 = 用户看到的"没有用"）；
 * ② 锚点形状：engine = 'kookit-pdf-rect'，key 可 JSON.parse 且带 page/coords；
 * ③ 锚点 → createNote → 子页文档里长出 `.kookit-note[data-key]` 矩形；removeNote 后消失；
 * ④ 几何标注（框選）：armGeomCapture('rect') → 在页面上合成 mousedown/move/up →
 *    `geom-captured` 到达 → UI 落库 → 页面上长出矩形（产品全链：捕获→建笔记→回显）；
 * ⑤ 清理：探针造的笔记全部移除（可重复跑）。
 *
 * 触发：`TUREAD_DEV_PROBE=pdf-note` + `TUREAD_DEV_BOOK=<pdf 绝对路径>`（**独立 userData**）。
 * 归属：开发工具，不是产品代码（同 dev/noteProbe.ts / dev/selfCheck.ts 纪律）。
 */
import type { ServiceContainer } from '@core/container'
import { extToFormat } from '@core/domain/format'
import type { Note } from '@core/domain/types'
import type { FeatureHost } from '../features/types'

let autoRan = false

export function runPdfNoteProbe(container: ServiceContainer, host: FeatureHost): void {
  if (window.turead.devProbe !== 'pdf-note' || autoRan) return
  autoRan = true

  void (async () => {
    const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
    let failed = false
    const assert = (cond: boolean, what: string): void => {
      console.error(`[probe] ${cond ? 'PASS' : 'FAIL'} ${what}`)
      if (!cond) failed = true
    }
    try {
      const devBook = window.turead.devBook
      if (!devBook) throw new Error('pdf-note 探针需要 TUREAD_DEV_BOOK 指向 PDF 文件')
      const buffer = await container.picker.readFile(devBook)
      const { currentId: libraryId } = await container.store.listLibraries()
      const { edition } = await container.books.importBook(
        buffer,
        devBook.split(/[\\/]/).pop() ?? devBook,
        extToFormat(devBook),
        devBook,
        libraryId
      )
      if (edition.format !== 'PDF') throw new Error(`探针只针对 PDF，实际 ${edition.format}`)
      host.openReader(edition.id)

      // 等面板可见 + canvas 渲染（口径同 pdf-width 探针）
      let visible = false
      for (let i = 0; i < 24 && !visible; i++) {
        visible = Boolean(document.getElementById('page-area')?.offsetParent)
        if (!visible && i > 0 && i % 4 === 0) host.openReader(edition.id)
        await wait(250)
      }
      if (!visible) throw new Error('阅读器面板不可见')
      const topDoc = (): Document | null =>
        document.getElementById('page-area')?.querySelector('iframe')?.contentDocument ?? null
      const subs = (): HTMLIFrameElement[] =>
        Array.from(topDoc()?.querySelectorAll('iframe') ?? []) as HTMLIFrameElement[]
      const deadline = Date.now() + 30000
      while (Date.now() < deadline && subs().every((f) => (f.contentDocument?.querySelectorAll('canvas').length ?? 0) === 0)) {
        await wait(300)
      }
      await wait(2000)

      // 找一页有**文本层文字**的子页（扫描页没有文本层 → 换下一页；全都没有则跳过选区组）
      const findTextPage = (): { doc: Document; span: Element } | null => {
        for (const f of subs()) {
          const doc = f.contentDocument
          const span = doc?.querySelector('#textLayer span, .textLayer span')
          if (doc && span?.textContent && span.textContent.trim() !== '') return { doc, span }
        }
        return null
      }
      const target = findTextPage()
      assert(target !== null, '找到带文本层的 PDF 页（扫描版全无文本层则此项 FAIL 属实情）')

      const beforeCount = (await container.store.listNotes(edition.id)).length
      const created: Note[] = []
      const snapshotNotes = async (): Promise<Note[]> =>
        (await container.store.listNotes(edition.id)).filter((n) => !created.some((c) => c.id === n.id))

      if (target) {
        const { doc, span } = target
        // ① 合成选区（跨该 span 的部分文本）
        const sel = doc.getSelection()!
        sel.removeAllRanges()
        const range = doc.createRange()
        const textNode = span.firstChild
        if (!textNode) throw new Error('textLayer span 无文本节点')
        range.setStart(textNode, 0)
        range.setEnd(textNode, Math.min(6, (textNode.textContent ?? '').length))
        sel.addRange(range)

        // ② context-menu 事件载荷里的 anchor 必须非空（用户的"标注没有用"就在这一步）
        const rect = span.getBoundingClientRect()
        const menuReq = await new Promise<{ anchor: unknown } | null>((resolve) => {
          const off = container.render.on('context-menu', (req) => {
            off()
            resolve(req)
          })
          span.dispatchEvent(
            new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              clientX: Math.round(rect.left + 4),
              clientY: Math.round(rect.top + 4)
            })
          )
          window.setTimeout(() => {
            off()
            resolve(null)
          }, 3000)
        })
        assert(menuReq !== null, 'context-menu 事件到达（3s 内）')
        const anchor = menuReq?.anchor as { norm?: unknown; fragment?: { engine?: string; key?: string } } | null
        assert(anchor !== null && anchor !== undefined, '右键时选区锚点**非空**（弹窗里长得出「標記」组）')
        if (anchor) {
          assert(anchor.fragment?.engine === 'kookit-pdf-rect', `engine = kookit-pdf-rect（实际 ${String(anchor.fragment?.engine)}）`)
          let shapeOk = false
          try {
            const parsed = JSON.parse(anchor.fragment?.key ?? '') as { page?: unknown; coords?: unknown }
            shapeOk = typeof parsed.page === 'number' && Array.isArray(parsed.coords) && parsed.coords.length > 0
          } catch {
            shapeOk = false
          }
          assert(shapeOk, 'Fragment key = {page, coords} 可解析')
        }

        // ③ 锚点 → createNote → 回显 → 移除
        if (anchor) {
          const note: Note = {
            id: crypto.randomUUID(),
            editionId: edition.id,
            kind: 'highlight',
            anchor: anchor as never,
            color: 'yellow',
            markStyle: 'background',
            body: 'PDF 探针測試',
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
          await container.render.createNote(note)
          created.push(note)
          await wait(600)
          const el = doc.querySelector(`.kookit-note[data-key="${note.id}"]`)
          assert(el !== null, 'createNote 后子页长出高亮矩形（showPDFHighlight 路径）')
          await container.render.removeNote(note.id)
          await wait(400)
          assert(doc.querySelector(`.kookit-note[data-key="${note.id}"]`) === null, 'removeNote 后矩形消失')
        }
        sel.removeAllRanges()
      }

      // ④ 几何标注（框選）：产品全链 = armGeomCapture → 合成拖曳 → UI 收 geom-captured 落库 → 页面回显
      const pageDoc = target?.doc ?? subs()[0]?.contentDocument
      if (pageDoc) {
        let resolveCaptured!: (v: boolean) => void
        const capturedPromise = new Promise<boolean>((resolve) => {
          resolveCaptured = resolve
        })
        const off = container.render.on('geom-captured', () => resolveCaptured(true))
        container.render.armGeomCapture('rect')
        await wait(100)
        const canvas = pageDoc.querySelector('canvas')
        const r = canvas?.getBoundingClientRect()
        if (canvas && r) {
          const opts = (x: number, y: number): MouseEventInit => ({
            bubbles: true,
            cancelable: true,
            clientX: Math.round(r.left + x),
            clientY: Math.round(r.top + y),
            button: 0
          })
          canvas.dispatchEvent(new MouseEvent('mousedown', opts(20, 20)))
          canvas.dispatchEvent(new MouseEvent('mousemove', opts(90, 60)))
          canvas.dispatchEvent(new MouseEvent('mouseup', opts(120, 80)))
        }
        const captured = await Promise.race([
          capturedPromise,
          wait(4000).then(() => false)
        ])
        off()
        assert(captured, '几何框選：geom-captured 到达（合成拖曳 → 适配器捕获）')
        const grown = (await snapshotNotes()).length > 0
        assert(grown, '几何框選：UI 已把捕获落库（geom-captured → createMark 全链）')
        const after = await container.store.listNotes(edition.id)
        const geomNote = after.find((n) => !created.some((c) => c.id === n.id))
        if (geomNote) {
          created.push(geomNote)
          await wait(500)
          const el = pageDoc.querySelector(`.kookit-note[data-key="${geomNote.id}"]`)
          assert(el !== null, '几何框選：页面上长出矩形（kookit showPDFHighlight 回显）')
        }
      }

      // ⑤ 清理（可重复跑）
      for (const n of created) {
        await container.store.removeNote(n.id).catch(() => undefined)
        await container.render.removeNote(n.id).catch(() => undefined)
      }
      const remain = (await container.store.listNotes(edition.id)).length - beforeCount
      assert(remain <= 0, `清理完成（残留 ${remain} 条）`)

      if (!failed) console.log('[TUREAD-TEST-OK] pdf-note 探针全绿')
      else console.log('[TUREAD-TEST-FAIL] pdf-note 探针存在 FAIL 项')
    } catch (err) {
      console.error(`[TUREAD-TEST-FAIL] pdf-note 探针失败：${(err as Error).message}`)
    }
  })()
}
