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
      // v0.4.0：导入必须给出目标书库（收录关系是库内的）；返回的 `edition` = **内容身份**，
      // 笔记改挂 edition（`Note.editionId`）—— 跨库共享、不随"移除收录"消失。
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
          host.openReader(edition.id)
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
        if (!visible && i > 0 && i % 4 === 0) host.openReader(edition.id)
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
        editionId: edition.id,
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

      /**
       * ⑦ 引擎侧回显（**不依赖重开**）。
       *
       * ⚠ 2026-09-16 调整：这段以前被塞在"重开成功"分支里 —— 而「重开书偶发空白」命中率不低，
       *   一命中就整段被跳过，**判据等于不存在**。分段粒度也是判据的一部分：不需要重开的断言
       *   （引擎回显 / 右键坐标 / 输入框生命周期 / 保存落库 / 笔记面板 / 批注正文 / 点击高亮）
       *   一律不许挂在重开上；重开只留最后那一条"自动回挂"（⑫）。
       */
      await container.render.renderHighlighters([note])
      await wait(400)
      const manual = liveDoc().querySelectorAll(`.kookit-note[data-key="${noteId}"]`).length
      const manualStyle =
        (liveDoc().querySelector(`.kookit-note[data-key="${noteId}"]`) as HTMLElement | null)
          ?.getAttribute('style') ?? ''
      assert(
        manual > 0,
        `引擎侧 renderHighlighters 能回显锚点（span 数=${manual}，style=「${manualStyle}」）`
      )

      // ⑧~⑪ 都在**阅读器活着**时跑（前面刚用过它）—— 旧写法把这段整体挂在"重开成功"上，
      //  于是「重开偶发空白」一命中就全被跳过（见 ⑦ 的说明）。
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
        /**
         * 坐标必须是**宿主视口坐标**（不是书文档里的 clientX/clientY）。
         * ⚠ 这条断言**曾经把 bug 当契约**：旧探针写的是 `ctx.x === 240 && ctx.y === 320`
         *   （= 事件在书文档里的原始坐标），于是"菜单跑到非内容部分"这个真 bug 一路绿灯
         *   （用户 2026-09-16 实测报障）。现在改成两条硬判据：
         *   ① 精确等于"书 iframe 在宿主里的偏移 + 事件坐标"；
         *   ② 语义要求：这个点必须落在**纸**（`#page-area`）里 —— 右键菜单就该出现在正文上。
         */
        const f = iframe()?.getBoundingClientRect()
        const paper = stage()?.getBoundingClientRect()
        assert(
          ctx != null &&
            f != null &&
            Math.abs(ctx.x - (f.left + 240)) <= 1 &&
            Math.abs(ctx.y - (f.top + 320)) <= 1,
          `右键事件带**宿主**坐标（预期 x≈${((f?.left ?? 0) + 240).toFixed(1)} y≈${((f?.top ?? 0) + 320).toFixed(1)}，实际 x=${ctx?.x} y=${ctx?.y}）`
        )
        assert(
          ctx != null && paper != null && ctx.x >= paper.left && ctx.x <= paper.right && ctx.y >= paper.top && ctx.y <= paper.bottom,
          `右键菜单落在纸内（纸 x[${Math.round(paper?.left ?? 0)}..${Math.round(paper?.right ?? 0)}] y[${Math.round(paper?.top ?? 0)}..${Math.round(paper?.bottom ?? 0)}]，实际 x=${ctx?.x} y=${ctx?.y}）`
        )
      } else {
        fact('造选区失败，跳过右键断言')
      }

      /**
       * ⑨b 输入框的生命周期与几何（用户 2026-09-16 报障两条，都是"应当根本不存在"的：
       * ① 选区消失后输入框还留着；② 输入框高度/宽度不对）。
       *
       * 走**真实 UI 路径**：右键 →（菜单里）「加批註」→ 输入框挂载 → 引擎 `clearSelection()`
       * （= 选区真的消失）→ 输入框必须跟着消失。几何判据 = 宽 = 纸宽 × 0.9（两侧各 5% 缝）、
       * 与纸**同轴**（中心一致）、**空态两行 / 上限五行**（自增长）。
       */
      // ⑨b-0 **挂件不许压到纸上**（用户 2026-09-16："当纸宽调到宽的时候…会盖住页面的内容"）——
      //      真机量与样张机检同名判据，两边都要过（挂件宽固定 → 让位的是纸）
      {
        const paperR = stage()?.getBoundingClientRect()
        const tocR = document.querySelector('.toc-list')?.getBoundingClientRect()
        const paramsR = document.querySelector('.reader-controls')?.getBoundingClientRect()
        if (paperR && tocR && paramsR) {
          assert(
            paperR.left >= tocR.right - 1 && paperR.right <= paramsR.left + 1,
            `纸不被两挂件压住（纸 x[${Math.round(paperR.left)}..${Math.round(paperR.right)}]，` +
              `左挂件右缘 ${Math.round(tocR.right)}，右挂件左缘 ${Math.round(paramsR.left)}）`
          )
        } else {
          fact('挂件未挂载（已折叠？）→ 跳过"纸不被压住"断言')
        }
      }
      const composerEl = (): HTMLElement | null => document.querySelector('.note-composer')
      const menuItem = (label: string): HTMLElement | null =>
        (Array.from(document.querySelectorAll<HTMLElement>('.context-menu__item')).find(
          (el) => (el.textContent ?? '').trim() === label
        ) ?? null)
      const forComposer = pickSelectableRange(liveDoc())
      if (forComposer) {
        selectRange(forComposer.range)
        liveDoc().body.dispatchEvent(
          new MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 260 })
        )
        await wait(300)
        const addBtn = menuItem('加批註')
        assert(addBtn !== null, '右键菜单里有「加批註」（真实 UI 路径的入口）')
        addBtn?.click()
        await wait(300)
        const box = composerEl()
        assert(box !== null, '点「加批註」后输入框挂载')
        const paperRect = stage()?.getBoundingClientRect()
        const boxRect = box?.getBoundingClientRect()
        const ta = box?.querySelector('textarea') ?? null
        const lineH = ta ? Number.parseFloat(getComputedStyle(ta).fontSize) * 1.55 : 23.25
        if (boxRect && paperRect) {
          const expectedW = paperRect.width * 0.9
          assert(
            Math.abs(boxRect.width - expectedW) <= 2,
            `输入框宽度 = 纸宽 × 0.9（预期 ${expectedW.toFixed(1)}px，实际 ${boxRect.width.toFixed(1)}px）`
          )
          assert(
            Math.abs(boxRect.left + boxRect.width / 2 - (paperRect.left + paperRect.width / 2)) <= 2,
            `输入框与纸同轴（纸心 ${(paperRect.left + paperRect.width / 2).toFixed(1)}，框心 ${(boxRect.left + boxRect.width / 2).toFixed(1)}）`
          )
          // 空态 = **两行**（用户 2026-09-16："默认输入栏的高度至少是两行"）；
          // 判据用实测行高算，不写死 px
          assert(
            boxRect.height >= 1.7 * lineH && boxRect.height <= 2.9 * lineH,
            `输入栏空态 ≈ 两行（实际 ${boxRect.height.toFixed(1)}px ≈ ${(boxRect.height / lineH).toFixed(1)} 行）`
          )
          // **自增长 + 五行封顶**（用户 2026-09-16："设立一个上限是三行或者五行，当内容多的时候
          // 会自动撑起来"）：灌 8 行文字 → 框长到五行高，且内容溢出转滚动
          if (ta) {
            const nativeSetter = Object.getOwnPropertyDescriptor(
              HTMLTextAreaElement.prototype,
              'value'
            )?.set
            nativeSetter?.call(ta, 'a\nb\nc\nd\ne\nf\ng\nh')
            ta.dispatchEvent(new Event('input', { bubbles: true }))
            await wait(300)
            const grown = boxRect ? (box?.getBoundingClientRect().height ?? 0) : 0
            assert(
              grown >= 4.2 * lineH && grown <= 5.9 * lineH,
              `灌 8 行后封顶在五行（实际 ${grown.toFixed(1)}px ≈ ${(grown / lineH).toFixed(1)} 行）`
            )
            assert(
              ta.scrollHeight > ta.clientHeight,
              `到上限后转滚动而不是继续长高（scrollH ${ta.scrollHeight} > clientH ${ta.clientHeight}）`
            )
            nativeSetter?.call(ta, '')
            ta.dispatchEvent(new Event('input', { bubbles: true }))
            await wait(150)
          }
        }
        // 关键：选区消失 → 输入框必须跟着消失（用户报障的那条）
        container.render.clearSelection()
        await wait(300)
        assert(composerEl() === null, '选区消失后输入框随之消失（生命周期跟选区走）')
      } else {
        fact('造选区失败，跳过输入框断言')
      }

      /**
       * ⑨c 保存路径 + 笔记面板（左挂件「筆記」页签）—— **同样不依赖重开**：
       * 走真实 UI 路径（右键 →「加批註」→ `Enter` 提交）把笔记造出来，于是它既在库里、
       * 也在 ReaderFeature 的 state 里。判据 = 面板行数与库里**同口径**（不写死 1，
       * 免得"库里多一条就假失败"）+ 摘要非空。
       */
      const beforeIds = new Set((await container.store.listNotes(edition.id)).map((n) => n.id))
      const forSave = pickSelectableRange(liveDoc())
      if (forSave) {
        selectRange(forSave.range)
        liveDoc().body.dispatchEvent(
          new MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 300 })
        )
        await wait(300)
        menuItem('加批註')?.click()
        await wait(300)
        const input = document.querySelector<HTMLTextAreaElement>('.note-composer__input')
        assert(input !== null, '再次呼出输入框（保存路径的起点）')
        // 先**真的写点正文**（受控组件要用原生 setter + input 事件喂），这样落库的那条
        // 是"带批注正文"的——下面 ⑨d 的「編輯」才有内容可带出来，⑨c 的「註」标记也才成立
        const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
        setValue?.call(input, '探針批註正文')
        input?.dispatchEvent(new Event('input', { bubbles: true }))
        await wait(150)
        input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await wait(600)
        assert(composerEl() === null, 'Enter 提交后输入框关闭（保存路径）')
        const after = (await container.store.listNotes(edition.id)).length
        assert(after === beforeIds.size + 1, `Enter 提交真的落库（${beforeIds.size} → ${after}）`)
      } else {
        fact('造选区失败，跳过保存路径断言')
      }

      // 笔记面板：行数应与库里一致（左挂件「筆記」页签）
      const stored = (await container.store.listNotes(edition.id)).length
      if (
        !Array.from(document.querySelectorAll<HTMLButtonElement>('.rail-tabs__tab')).some((b) =>
          (b.textContent ?? '').includes('筆記')
        )
      ) {
        // 左挂件收起时页签不在 DOM —— 用挂载线左段把它打开
        document.querySelector<HTMLButtonElement>('.reader-rail__zone--toc')?.click()
        await wait(300)
      }
      Array.from(document.querySelectorAll<HTMLButtonElement>('.rail-tabs__tab'))
        .find((b) => (b.textContent ?? '').includes('筆記'))
        ?.click()
      await wait(300)
      const rows = document.querySelectorAll('.note-row')
      fact(
        `筆記页签现场：页签=${Array.from(document.querySelectorAll('.rail-tabs__tab')).map((b) => (b.textContent ?? '').trim()).join('|') || '（无）'} toc行=${document.querySelectorAll('.toc-row').length} 笔记行=${rows.length} 库中=${stored} 空态=「${document.querySelector('.toc-list__empty')?.textContent ?? ''}」`
      )
      assert(
        stored > 0 && rows.length === stored,
        `筆記頁簽列出本書筆記（行數=${rows.length}，庫中 ${stored} 條）`
      )
      const firstText = rows[0]?.querySelector('.note-row__text')?.textContent ?? ''
      assert(firstText.length > 0, `筆記行顯示原文摘錄（「${firstText}」）`)
      // 「註」符号：带批注正文的那条必须在行里有个**视觉符号**（用户 2026-09-16："需要在视觉上
      // 有一个符号或者方法区分说这个是批注，而不是高亮"）——判据是 `body` 非空，不看 `kind`。
      // ⚠ 与"带正文的条数"比，而不是与总条数比（否则库里一旦有纯划线就假 FAIL）
      const withBody = (await container.store.listNotes(edition.id)).filter((n) => n.body !== '')
        .length
      const kindMarks = document.querySelectorAll('.note-row__kind').length
      assert(
        kindMarks === withBody && withBody > 0,
        `带批注正文的笔记行显示「註」符号（符号数=${kindMarks}，带正文的 ${withBody} 条）`
      )

      // ⑨d 抽屉里的「編輯」（用户 2026-09-16："保留目录的编辑功能，当打开编辑的时候，焦点自动
      // 切换到输入栏"）：点行内「編輯」→ 输入栏挂载 + 带出该条正文 + 焦点在输入区
      const editBtn = document.querySelector<HTMLButtonElement>('.note-row__edit')
      assert(editBtn !== null, '笔记行有「編輯」入口（抽屉里保留编辑功能）')
      editBtn?.click()
      await wait(300)
      const edBox = composerEl()
      const edTa = edBox?.querySelector('textarea') ?? null
      assert(edBox !== null, '点「編輯」后输入栏挂载')
      assert(
        (edTa?.value ?? '').length > 0,
        `输入栏带出该条正文（长度 ${(edTa?.value ?? '').length}）`
      )
      assert(document.activeElement === edTa, '焦点自动落在输入区（打开编辑即焦点）')
      edTa?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await wait(250)
      assert(composerEl() === null, 'Esc 关闭编辑输入栏')
      // 清理：把这条 UI 造出来的笔记从库里删掉（探针要可重复跑；引擎侧的高亮随进程结束）
      const leftover = (await container.store.listNotes(edition.id)).find((n) => !beforeIds.has(n.id))
      if (leftover) await container.store.removeNote(leftover.id)

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

      /**
       * ⑫ 重开书 + 切章回挂 —— **唯一**需要重开的一条（UI 的 `rendered` 重挂是 ReaderFeature
       * 的职责）。⚠ 放最后：这一步要关书重开，而「重开书偶发空白」是已登记的间歇性故障 ——
       * 命中时**只跳过这一条**（记 fact），不再连累前面那些断言。
       */
      const persistedId = crypto.randomUUID()
      await container.store.addNote({ ...note, id: persistedId })
      const reopened = await reopenReader()
      if (!reopened) {
        fact('⚠ 重开书 3 次均未产生新 iframe —— 命中已登记的间歇性「重开书偶发空白」（TODO 旧账）')
        fact('（只跳过 ⑫「重开后自动回挂」这一条）')
      } else {
        await container.render.goToChapter(anchor.norm.chapterIndex)
        await wait(1500)
        const auto = liveDoc().querySelectorAll(`.kookit-note[data-key="${persistedId}"]`).length
        fact(`重开并切回锚点章后自动重挂 span 数=${auto}（章 ${anchor.norm.chapterIndex}）`)
        assert(auto > 0, `UI 生命周期：重开书并切回锚点章后高亮**自动**回挂（span 数=${auto}）`)
      }
      await container.store.removeNote(persistedId)

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
