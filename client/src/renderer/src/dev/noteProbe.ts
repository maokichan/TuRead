/**
 * dev-only 无头探针：笔记/划线全链路（2026-09-14，阶段 3 验证）。
 *
 * 验什么（这是**唯一**能证明 Fragment 契约真的对的地方 —— 单测碰不到引擎）：
 * ① 选区 → 锚点：在书文档里造合成选区，`getSelectionAnchor()` 应给出
 *    Fragment（kookit 的 rangy 序列化，须是**可 JSON.parse 的字符串**）+ Norm + quote；
 * ② 锚点 → 引擎回显：把锚点包成 Note 交给 `createNote`，书文档里应真的长出
 *    `.kookit-note[data-key=...]` 高亮 span —— 这一步同时验掉三处易错契约：
 *    range 必须 stringify、color 必须是 `"background-#RRGGBB"` 形态、notes 必须是字符串；
 * ③ `removeNote` 后高亮消失；
 * ④ `resolveAnchor` 章级导航落点正确；`revealNoteId` 能找到元素；
 * ⑤ `remeasureAnchor` 按原文找回 → 诚实的**弱锚点**（fragment=null，章级）；
 * ⑥ `selection-changed` 事件在选区手势（mouseup）后广播锚点、清空选区后给 null。
 *
 * ⚠ 样书首章陷阱：`test_docs/高级运动营养学` 的第一章是**纯图片扉页**，没有可选文本
 * （2026-09-13 自检「App 侧 EPUB 正文空」的测量假象就是它）。故本探针**逐章找**有正文的章再选。
 *
 * 触发：`TUREAD_DEV_PROBE=note` + `TUREAD_DEV_BOOK=<epub 绝对路径>`（**独立 userData**）。
 * 归属：开发工具，不是产品代码（同 dev/selfCheck.ts 纪律）。
 */
import type { ServiceContainer } from '@core/container'
import { extToFormat } from '@core/domain/format'
import { anchorStrengthOf } from '@core/domain/anchor'
import type { Note, TextAnchor } from '@core/domain/types'
import type { RenderContextMenuRequest, RenderSelection } from '@core/ports/render'
import type { FeatureHost } from '../features/types'

let autoRan = false

export function runNoteProbe(container: ServiceContainer, host: FeatureHost): void {
  if (window.turead.devProbe !== 'note' || autoRan) return
  autoRan = true

  void (async () => {
    const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
    let failed = false
    const assert = (cond: boolean, what: string): void => {
      console.error(`[probe] ${cond ? 'PASS' : 'FAIL'} ${what}`)
      if (!cond) failed = true
    }
    const fact = (line: string): void => console.error(`[probe] 事实：${line}`)

    try {
      const devBook = window.turead.devBook
      if (!devBook) throw new Error('note 探针需要 TUREAD_DEV_BOOK 指向文字类电子书（EPUB/TXT/MD）')
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
        (stage()?.querySelector('iframe') as HTMLIFrameElement | null) ?? null
      /** 每次都重读：换章可能换文档，缓存 Document 会在导航后失效 */
      const liveDoc = (): Document => {
        const dd = iframe()?.contentDocument ?? null
        if (!dd?.body) throw new Error('正文 iframe 未就绪（或已消失）')
        return dd
      }

      /**
       * 关书再开书，并确认**真的重开成功**（出现了"不是旧节点"的新 iframe）。
       *
       * ⚠ 为什么要这么绕：`TODO.md` 登记的间歇性「重开书偶发空白」（实测 ~1/3 次）就是
       * "closeReader → openReader 之后 iframe 数 0、rendition 为 null"，且**无任何报错**。
       * 加上"关书是异步的"，朴素的"等 iframe 出现"会立刻命中**旧**节点而误判成功。
       * 故这里：① 先等旧 iframe 真消失；② 再等新 iframe（引用不同）；③ 失败重试（间歇性）。
       * 返回 false = 连试 3 次都没起来（该 bug 命中），调用方跳过需要阅读器活着的断言。
       */
      const reopenReader = async (): Promise<boolean> => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const before = iframe()
          if (before) {
            host.closeReader()
            const dl0 = Date.now() + 8000
            while (iframe() !== null && Date.now() < dl0) await wait(100)
          }
          host.openReader(book.id)
          const dl = Date.now() + 15000
          while (Date.now() < dl) {
            const cur = iframe()
            if (cur && cur !== before && cur.contentDocument?.body) {
              await wait(1200)
              return true
            }
            await wait(200)
          }
          fact(`重开尝试 ${attempt + 1} 未产生新 iframe，重试`)
        }
        return false
      }

      // 等阅读器可见 + 正文 iframe 就绪（与 paged-interact 探针同款等待策略）
      let visible = false
      for (let i = 0; i < 24 && !visible; i++) {
        visible = Boolean(stage()?.offsetParent)
        if (!visible && i > 0 && i % 4 === 0) host.openReader(book.id)
        await wait(250)
      }
      if (!visible) throw new Error('阅读器面板不可见')
      const deadline = Date.now() + 30000
      while (!iframe()?.contentDocument?.body && Date.now() < deadline) await wait(200)
      liveDoc()
      await wait(1500)

      // ————— 观察 selection-changed 事件 —————
      const selectionEvents: Array<RenderSelection | null> = []
      const off = container.render.on('selection-changed', (s) => selectionEvents.push(s))

      // ————— 逐章找一个有足够正文的章，再造合成选区 —————
      let picked = pickSelectableRange(liveDoc())
      if (!picked) {
        const idxs = container.render
          .getChapter()
          .map((c) => c.chapterDocIndex)
          .filter((i): i is number => typeof i === 'number')
          .slice(0, 12)
        for (const idx of idxs) {
          await container.render.goToChapter(idx)
          await wait(1200)
          picked = pickSelectableRange(liveDoc())
          if (picked) {
            fact(`首章无可选正文（纯图片扉页？），已跳到章 ${idx} 找到正文`)
            break
          }
        }
      }
      if (!picked) throw new Error('全书都找不到可选的正文段落（样书太短？）')

      const selectRange = (range: Range): void => {
        const doc = liveDoc()
        const sel = doc.getSelection()
        if (!sel) throw new Error('书文档不支持 getSelection')
        sel.removeAllRanges()
        sel.addRange(range)
      }
      selectRange(picked.range)
      fact(`选中 ${picked.length} 字：「${picked.text.slice(0, 30)}」`)

      // ⓪ 选区配色（2026-09-14 用户点名）：`::selection` 必须出现在**注入书文档的样式**里，
      //    且已解析成具体色值 —— 宿主 CSS 跨不过文档边界，只能在注入的那份里定。
      //    否则用户选中正文看到的仍是浏览器默认蓝。
      const injectedStyles = Array.from(liveDoc().head.querySelectorAll('style')).map(
        (s) => s.textContent ?? ''
      )
      const selRule = injectedStyles
        .join('\n')
        .match(/::selection\{[^}]*\}/)?.[0]
      assert(selRule !== undefined, '书文档注入样式含 ::selection 规则（否则选中仍是系统蓝）')
      assert(
        /background:\s*(rgba?\(|#|oklch\()/i.test(selRule ?? ''),
        `::selection 已解析成具体色值（实际「${selRule ?? '（无）'}」）`
      )

      // ① 选区 → 锚点
      const anchor = await container.render.getSelectionAnchor()
      assert(anchor !== null, 'getSelectionAnchor() 取到锚点（选区有效）')
      if (!anchor) throw new Error('未取到锚点，后续断言无法进行')
      assert(anchor.fragment !== null, '锚点带引擎载荷 Fragment（文字类应有 rangy 载荷）')
      assert(
        anchor.fragment?.engine === 'kookit-rangy',
        `Fragment.engine = kookit-rangy（实际 ${String(anchor.fragment?.engine)}）`
      )
      let fragmentParses = false
      try {
        const parsed: unknown = JSON.parse(anchor.fragment?.key ?? '')
        fragmentParses = parsed !== null && typeof parsed === 'object'
      } catch {
        fragmentParses = false
      }
      assert(fragmentParses, 'Fragment.key 是合法 JSON（createOneNote 会 JSON.parse 它）')
      assert(
        anchor.norm.quote.exact.length > 0,
        `quote.exact 非空（实际 ${anchor.norm.quote.exact.length} 字）`
      )
      assert(
        picked.text.includes(anchor.norm.quote.exact.slice(0, 12)),
        'quote.exact 与所选文本一致'
      )
      assert(
        anchor.norm.quote.prefix.length > 0 || anchor.norm.quote.suffix.length > 0,
        'quote 带前后文（重锚消歧用）'
      )
      assert(
        anchorStrengthOf(anchor) === 'strong',
        `anchorStrengthOf = strong（实际 ${anchorStrengthOf(anchor)}）`
      )
      fact(
        `锚点 = 章${anchor.norm.chapterIndex} 进度${anchor.norm.progression.toFixed(3)} ` +
          `前文「${anchor.norm.quote.prefix}」后文「${anchor.norm.quote.suffix}」`
      )

      // ② 锚点 → 引擎回显（createNote）
      const noteId = crypto.randomUUID()
      const note: Note = {
        id: noteId,
        bookId: book.id,
        kind: 'highlight',
        anchor,
        color: 'yellow',
        body: '', // 空串 = 不带批注（kookit 以 item.notes !== "" 判定）
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      await container.render.createNote(note)
      await wait(300)
      const spans = liveDoc().querySelectorAll(`.kookit-note[data-key="${noteId}"]`)
      assert(spans.length > 0, `createNote 后书文档里长出高亮 span（实际 ${spans.length} 个）`)
      const inlineStyle = (spans[0] as HTMLElement | undefined)?.getAttribute('style') ?? ''
      assert(
        inlineStyle.includes('background'),
        `高亮带 background 样式（证明 color 传的是 kookit 要的 "background-#hex" 形态；实际「${inlineStyle}」）`
      )

      // ③ 章级导航 + 元素揭示
      const resolved = await container.render.resolveAnchor(anchor, { revealNoteId: noteId })
      assert(resolved, 'resolveAnchor 返回成功')
      await wait(500)
      const posAfter = container.render.getPosition()
      assert(
        posAfter.chapterDocIndex === anchor.norm.chapterIndex,
        `resolveAnchor 落点章 = 锚点章（预期 ${anchor.norm.chapterIndex}，实际 ${posAfter.chapterDocIndex}）`
      )

      // ④ remeasure：按原文找回 → 弱锚点（kookit 搜索不给字符偏移，只能到章级）
      const re = await container.render.remeasureAnchor(anchor)
      if (re === null) {
        fact('remeasureAnchor 未命中（该书该段落可能跨块，kookit 搜索按块匹配）')
      } else {
        assert(re.fragment === null, 'remeasure 产出弱锚点（fragment=null，诚实降级）')
        assert(
          anchorStrengthOf(re) === 'weak',
          `remeasure 锚点强度 = weak（实际 ${anchorStrengthOf(re)}）`
        )
        assert(
          re.norm.chapterIndex === anchor.norm.chapterIndex,
          `remeasure 找回的章 = 原章（预期 ${anchor.norm.chapterIndex}，实际 ${re.norm.chapterIndex}）`
        )
      }

      // ⑤ 删除 → 高亮消失
      await container.render.removeNote(noteId)
      await wait(200)
      assert(
        liveDoc().querySelectorAll(`.kookit-note[data-key="${noteId}"]`).length === 0,
        'removeNote 后高亮 span 消失'
      )

      // ⑥ selection-changed 事件：再造选区 + 派发 mouseup（模拟真实手势收尾）
      selectionEvents.length = 0
      const again = pickSelectableRange(liveDoc())
      if (again) {
        selectRange(again.range)
        liveDoc().body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
        await wait(300)
        const last = selectionEvents[selectionEvents.length - 1]
        assert(
          selectionEvents.length > 0 && last != null && last.anchor.fragment !== null,
          `mouseup 后广播 selection-changed 且带锚点（实际收到 ${selectionEvents.length} 次）`
        )
        // rect 必须已换算成**宿主视口坐标**（色板据此摆放）；零矩形 = 跨 iframe 换算失效
        assert(
          last != null && (last.rect.width > 0 || last.rect.height > 0),
          `selection-changed 带非零宿主坐标矩形（w=${last?.rect.width ?? 0} h=${last?.rect.height ?? 0}）`
        )
        if (last) {
          fact(
            `选区矩形（宿主视口）= x${Math.round(last.rect.x)} y${Math.round(last.rect.y)} ` +
              `w${Math.round(last.rect.width)} h${Math.round(last.rect.height)}`
          )
        }
      } else {
        fact('第二次造选区失败，跳过 selection-changed 带锚点断言')
      }
      // 清空选区 → 事件应给 null（UI 据此收起色板）
      const lastDoc = liveDoc()
      lastDoc.getSelection()?.removeAllRanges()
      lastDoc.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
      await wait(300)
      assert(
        selectionEvents[selectionEvents.length - 1] === null,
        '清空选区后广播 selection-changed=null（UI 收起色板）'
      )
      off()

      // ⑦ 生命周期（阶段 4）：**重开书 + 切章回挂** —— 这是 UI（ReaderFeature）负责的那一半。
      //    先落库一条 > 关书重开 > 切到锚点所在章 > 高亮应当自己回来。
      //    分两段判定以便**定位职责**：先看自动路径（UI 的 `rendered` 重挂），再手工补一次
      //    （引擎能力）—— 二者分离才能说清"是引擎不行还是 UI 没挂上"。
      const persistedId = crypto.randomUUID()
      const persisted: Note = { ...note, id: persistedId }
      await container.store.addNote(persisted)
      const reopened = await reopenReader()
      if (!reopened) {
        // 走到这里 = 重开反复没产生新 iframe → 命中 TODO 登记的间歇性「重开书偶发空白」
        fact('⚠ 重开书 3 次均未产生新 iframe —— 命中已登记的间歇性「重开书偶发空白」（TODO 旧账）')
        fact('（本轮跳过 ⑦ 生命周期与 ⑧ 笔记面板断言 —— 它们需要一次成功的重开）')
      } else {
        // 重开走的是 lastLocation 恢复，落点未必是锚点所在章 → 显式切过去（同时也是"切章"用例）
        await container.render.goToChapter(anchor.norm.chapterIndex)
        await wait(1500)
        const auto = liveDoc().querySelectorAll(`.kookit-note[data-key="${persistedId}"]`).length
        fact(`切章后自动重挂 span 数=${auto}（章 ${anchor.norm.chapterIndex}）`)

        // 手工补挂：隔离"引擎能力"与"UI 生命周期"两件事
        await container.render.renderHighlighters([persisted])
        await wait(400)
        const manual = liveDoc().querySelectorAll(`.kookit-note[data-key="${persistedId}"]`).length
        fact(`手工 renderHighlighters 后 span 数=${manual}`)
        const style =
          (liveDoc().querySelector(`.kookit-note[data-key="${persistedId}"]`) as HTMLElement | null)
            ?.getAttribute('style') ?? ''
        assert(
          manual > 0,
          `引擎侧 renderHighlighters 能回显弱/强锚点（span 数=${manual}，style=「${style}」）`
        )
        assert(
          auto > 0,
          `UI 生命周期：重开书并切回锚点章后高亮**自动**回挂（span 数=${auto}）`
        )

        // ⑧ 笔记面板（左挂件「筆記」页签）：应列出本书笔记，且行数与库中一致
        const tab = Array.from(
          document.querySelectorAll<HTMLButtonElement>('.left-tabs__tab')
        ).find((b) => (b.textContent ?? '').includes('筆記'))
        if (!tab) {
          // 左挂件默认收起时页签不在 DOM —— 用挂载线左段把它打开再找
          document.querySelector<HTMLButtonElement>('.reader-rail__zone--toc')?.click()
          await wait(300)
        }
        const tab2 = Array.from(
          document.querySelectorAll<HTMLButtonElement>('.left-tabs__tab')
        ).find((b) => (b.textContent ?? '').includes('筆記'))
        tab2?.click()
        await wait(300)
        const rows = document.querySelectorAll('.note-row')
        assert(
          rows.length === 1,
          `筆記頁簽列出本書筆記（行數=${rows.length}，庫中 1 條）`
        )
        const firstText = rows[0]?.querySelector('.note-row__text')?.textContent ?? ''
        assert(
          firstText.length > 0,
          `筆記行顯示原文摘錄（「${firstText}」）`
        )
      }
      // 清理：库里删掉这条持久化笔记（探针可重复跑）
      await container.store.removeNote(persistedId)

      // ⑨-⑪ 需要阅读器活着（前面可能命中"重开偶发空白"）→ 先确保可用，否则跳过而非误报 FAIL
      let readerOk = Boolean(iframe()?.contentDocument?.body)
      if (!readerOk) readerOk = await reopenReader()
      if (!readerOk) {
        fact('⚠ 阅读器不可用（重开偶发空白）→ 跳过 ⑨⑩⑪（右键 / 批注正文 / 点击高亮）断言')
      } else {
      // ⑨ 右键入口（v0.3.12，用户定的主入口）：正文内 contextmenu → 适配器换算坐标 + 带锚点广播
      const ctxEvents: RenderContextMenuRequest[] = []
      const offCtx = container.render.on('context-menu', (r) => ctxEvents.push(r))
      const forCtx = pickSelectableRange(liveDoc())
      if (forCtx) {
        selectRange(forCtx.range)
        liveDoc().body.dispatchEvent(
          new MouseEvent('contextmenu', { bubbles: true, clientX: 240, clientY: 320 })
        )
        await wait(300)
        const ctx = ctxEvents[ctxEvents.length - 1]
        assert(ctxEvents.length > 0, `正文内右键广播 context-menu（实际 ${ctxEvents.length} 次）`)
        assert(
          ctx != null && ctx.anchor !== null,
          '右键事件带选区锚点（菜单据此决定"新建"是否可用）'
        )
        assert(
          ctx != null && ctx.x === 240 && ctx.y === 320,
          `右键事件带宿主坐标（x=${ctx?.x} y=${ctx?.y}）`
        )
      } else {
        fact('造选区失败，跳过右键断言')
      }

      // ⑩ 批注正文真的到达引擎：`isNote = item.notes !== ""` 会另外长出批注图标
      const annId = crypto.randomUUID()
      const ann: Note = { ...note, id: annId, kind: 'note', body: '這是一條批註正文' }
      await container.render.createNote(ann)
      await wait(400)
      const icons = liveDoc().querySelectorAll(`.kookit-note-icon[data-key="${annId}"]`)
      assert(
        icons.length > 0,
        `带批注正文的高亮长出批注图标（证明 body 以**字符串**传给了引擎；图标数=${icons.length}）`
      )

      // ⑪ 点击高亮 → note-clicked（编辑批注的另一入口）
      // ⚠ kookit 的点击是 **doc.body 上的委托监听**（capture），且要求**先有 mousedown**：
      //   `|click.clientX - downX| <= 5 && |click.clientY - downY| <= 5` 才认（防拖选误触）。
      //   故合成事件必须成对且坐标一致，否则 kookit 直接 return（**静默**，不报错）。
      const clicked: string[] = []
      const offClick = container.render.on('note-clicked', (p) => clicked.push(p.noteId))
      const span = liveDoc().querySelector(`.kookit-note[data-key="${annId}"]`)
      fact(`委托监听已挂=${String((liveDoc().body as unknown as Record<string, unknown>).__kookitDelegated)}`)
      if (span) {
        span.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 50, clientY: 60 }))
        span.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 50, clientY: 60 }))
        await wait(200)
        assert(clicked.includes(annId), `点击高亮广播 note-clicked（实际 [${clicked.join(',')}]）`)
        // 右键点在高亮上 → 命中判定应给出 noteId（供"编辑批注/移除"）
        ctxEvents.length = 0
        span.dispatchEvent(
          new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 })
        )
        await wait(300)
        assert(
          ctxEvents[ctxEvents.length - 1]?.noteId === annId,
          `右键点在高亮上带 noteId（实际 ${String(ctxEvents[ctxEvents.length - 1]?.noteId)}）`
        )
      } else {
        fact('未找到批注高亮 span，跳过 note-clicked 断言')
      }
      offClick()
      offCtx()
      await container.render.removeNote(annId)
      }

      if (failed) throw new Error('存在 FAIL 断言')
      console.log('[TUREAD-TEST-OK][note] 笔记/划线链路全通（选区→锚点→引擎回显→导航→重锚→删除）')
      host.pushLog('note 探针通过：选区→锚点→高亮回显→导航→重锚')
    } catch (err) {
      console.log(`[TUREAD-TEST-FAIL][note] ${(err as Error).message}`)
    }
  })()
}

/**
 * 在书文档里挑一段适合做选区的文本：取文本最长的那个文本节点，选中其中一段。
 * 为什么挑最长的：短节点（页码、分隔符、图片说明）选出来的 quote 不足以验相似度与前后文。
 * 为什么从第一个非空白处起、且避开首尾若干字符：让 prefix/suffix 都真的取到内容。
 */
function pickSelectableRange(doc: Document): { range: Range; text: string; length: number } | null {
  if (!doc.body) return null
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  let best: Text | null = null
  let bestLen = 0
  let node: Node | null = walker.nextNode()
  while (node) {
    const t = node as Text
    const len = (t.data ?? '').trim().length
    if (len > bestLen) {
      bestLen = len
      best = t
    }
    node = walker.nextNode()
  }
  const target: Text | null = best
  if (!target) return null
  const raw = target.data
  const head = raw.search(/\S/)
  if (head < 0) return null
  // 从非空白起点后挪几个字符，末位也留几个字符 → prefix/suffix 都有内容
  const from = head + 3
  const to = Math.min(raw.length - 3, from + 40)
  if (to - from < 8) return null
  const range = doc.createRange()
  range.setStart(target, from)
  range.setEnd(target, to)
  return { range, text: range.toString(), length: to - from }
}
