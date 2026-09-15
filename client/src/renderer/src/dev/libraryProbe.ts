/**
 * dev-only 无头探针：多书库切换链路（2026-09-13 用户立项「書庫」入口的断言级验证）。
 *
 * 链路：迁移后的默认库（devBook 已导入）→ 新建库（自动切换）→ 断言新库收录为空
 * → 在新库导入同一文件 → 断言指纹命中复用（同一 edition 被两个库收录）→ 切回默认库
 * → 断言收录恢复且 devBook 仍在 → 断言库注册表（v0.4.0：注册表进 .db，不再是引导文件）。
 *
 * ⚠ v0.4.0（2026-09-15「书的身份」）：旧模型里"书单" = 某个 .db 的 books 行；现在是
 * **edition（内容）← holding（收录）← library（组织模式）** 三层（DATA_MODEL §1/§2）。
 * 故"某个库有几本书"一律问 `holdings` —— `books.listAll()` 已是**全局**视角，
 * 表达不了单库书单；层级取书改 `listItemsAtLevel({ libraryId, … })`。
 *
 * 触发：`TUREAD_DEV_PROBE=library` + `TUREAD_DEV_BOOK=<任意书>`（独立 userData，别污染真实库）。
 * 归属：开发工具，不是产品代码（同 dev/selfCheck.ts 纪律）。
 */
import type { ServiceContainer } from '@core/container'
import { extToFormat } from '@core/domain/format'
import { anchorStrengthOf } from '@core/domain/anchor'
import type { Note } from '@core/domain/types'
import type { FeatureHost } from '../features/types'

let autoRan = false

export function runLibraryProbe(container: ServiceContainer, host: FeatureHost): void {
  if (window.turead.devProbe !== 'library' || autoRan) return
  autoRan = true

  void (async () => {
    const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
    const ok = (msg: string): void => console.log(`[TUREAD-TEST-OK][library] ${msg}`)
    let failed = false
    const assert = (cond: boolean, what: string): void => {
      console.error(`[probe] ${cond ? 'PASS' : 'FAIL'} ${what}`)
      if (!cond) failed = true
    }
    /**
     * 某库的收录数（v0.4.0 的"书单"口径）：`books.listAll()` 是**全部被收录的 edition**（跨库去重），
     * 不能回答"这个库里有几本"；`listItemsAtLevel` 只给一层。故整库计数走 `holdings`。
     */
    const holdingCount = async (libraryId: string): Promise<number> =>
      (await container.store.listHoldings(libraryId)).length
    try {
      const devBook = window.turead.devBook
      if (!devBook) throw new Error('library 探针需要 TUREAD_DEV_BOOK 指向任意电子书')

      // ① 默认库：先导入 devBook（含库注册表读取，验证默认库可用）
      const base = await container.store.listLibraries()
      assert(base.libraries.length === 1, `初始只有默认库（${base.libraries.length} 个）`)
      const buffer = await container.picker.readFile(devBook)
      const first = await container.books.importBook(
        buffer,
        devBook.split(/[\\/]/).pop() ?? devBook,
        extToFormat(devBook),
        devBook,
        base.currentId
      )
      const before = await holdingCount(base.currentId)
      assert(before > 0, `默认库收录非空（实际 ${before}，迁移链路验证）`)

      // ② 新建库（端口契约：创建即切换；v0.4.0 单对象入参、mode 必选）→ 收录应为空
      const created = await container.store.createLibrary({ mode: 'curated' })
      await wait(300)
      const afterCreate = await container.store.listLibraries()
      assert(afterCreate.currentId === created.id, `新建后当前库 = 新库（${created.name}）`)
      assert(created.mode === 'curated', `新库 mode = curated（自建库；实际 ${created.mode}）`)
      const newLibBooks = await holdingCount(created.id)
      assert(newLibBooks === 0, `新库收录为空（实际 ${newLibBooks}）`)

      // ③ 跨库共享（v0.4.0 的核心变化）：同一文件在另一个库再导入 → **指纹命中复用同一 edition**，
      //    只新增一条收录（旧模型会在第二个库里各存一份 book 行）
      const buffer2 = await container.picker.readFile(devBook)
      const again = await container.books.importBook(
        buffer2,
        devBook.split(/[\\/]/).pop() ?? devBook,
        extToFormat(devBook),
        devBook,
        created.id
      )
      assert(again.reused, '同书导入新库时指纹命中（reused=true，内容不重复入库）')
      assert(
        again.edition.id === first.edition.id,
        '两个库指向同一 edition（跨库共享的根 = 指纹）'
      )
      const newLibCount = await holdingCount(created.id)
      assert(newLibCount === 1, `新库收录 1 条（实际 ${newLibCount}）`)

      // ③b 更名（显示名，路径不变；不切库）
      await container.store.renameLibrary(created.id, '測試改名')
      const renamed = await container.store.listLibraries()
      assert(
        renamed.libraries.find((l) => l.id === created.id)?.name === '測試改名',
        '新库可更名'
      )

      // ③c 書箱 CRUD + 层级取书（自建模式核心链路；v0.4.0：箱树在库内 → 一律带 libraryId）
      const c1 = await container.store.createContainer({
        libraryId: created.id,
        parentId: null,
        name: '測試書箱'
      })
      const subs = await container.store.listContainers(created.id, null)
      assert(subs.length === 1 && subs[0].name === '測試書箱', '根层可新建書箱')
      const rootItems = await container.store.listItemsAtLevel({
        libraryId: created.id,
        containerId: null
      })
      assert(rootItems.length === 1, `根层取书=未入箱的书（实际 ${rootItems.length}）`)
      // 读模型形状（v0.4.0）：一行 = 内容身份 + 收录关系 + 阅读状态（一次 JOIN 出来，避免 UI N+1）
      assert(
        rootItems[0].holding.libraryId === created.id &&
          rootItems[0].holding.editionId === rootItems[0].edition.id &&
          rootItems[0].readingState === null,
        '取书返回读模型 {edition, holding, readingState}（从未读过 = null）'
      )
      const rootEditionId = rootItems[0].edition.id
      // 移动语义：书入箱后根层为空、箱内有一本；移出后还原（移动收录 = edition + 库 + 目标箱）
      await container.store.moveHolding(rootEditionId, created.id, c1.id)
      assert(
        (await container.store.listItemsAtLevel({ libraryId: created.id, containerId: null }))
          .length === 0,
        '书入箱后根层为空'
      )
      assert(
        (await container.store.listItemsAtLevel({ libraryId: created.id, containerId: c1.id }))
          .length === 1,
        '箱内取书=1'
      )
      await container.store.moveHolding(rootEditionId, created.id, null)
      assert(
        (await container.store.listItemsAtLevel({ libraryId: created.id, containerId: null }))
          .length === 1,
        '移回根层后还原'
      )
      // ⚠ 2026-09-15 自查出的坑，这里钉住：**重入 addHolding(containerId=null) 不得把书搬出書箱**。
      // 扫描/导入都会用 `containerId = null` 调 addHolding（"落在库根层"），而 null 的真实语义是
      // "**未指定归属**"而非"移到根层" —— 若存储层直接覆盖 container_id，用户把书拖进書箱后
      // **再扫一次就被悄悄搬回根层**（组织被扫描吃掉）。故 `addHolding` 的冲突分支用
      // `COALESCE(excluded.container_id, holdings.container_id)`；要真移回根层只能走显式 `moveHolding`。
      await container.store.moveHolding(rootEditionId, created.id, c1.id)
      const held = await container.store.getHolding(created.id, rootEditionId)
      if (held) {
        await container.store.addHolding({ ...held, containerId: null })
      }
      assert(
        (await container.store.getHolding(created.id, rootEditionId))?.containerId === c1.id,
        '重入 addHolding(null) 不夺走書箱归属（扫描不吃用户组织）'
      )
      await container.store.moveHolding(rootEditionId, created.id, null)
      await container.store.renameContainer(c1.id, '改名書箱')
      assert(
        (await container.store.listContainers(created.id, null))[0]?.name === '改名書箱',
        '書箱可更名'
      )
      await container.store.removeContainer(c1.id)
      assert((await container.store.listContainers(created.id, null)).length === 0, '空書箱可移除')

      // ③c+ 書箱移动（moveContainer）：拖箱入箱的后端语义——入箱 / 防成环 / 移回根层
      const pa = await container.store.createContainer({
        libraryId: created.id,
        parentId: null,
        name: '移動父箱'
      })
      const child = await container.store.createContainer({
        libraryId: created.id,
        parentId: pa.id,
        name: '子箱'
      })
      const other = await container.store.createContainer({
        libraryId: created.id,
        parentId: null,
        name: '旁箱'
      })
      await container.store.moveContainer(other.id, child.id)
      const childSubs = await container.store.listContainers(created.id, child.id)
      assert(childSubs.length === 1 && childSubs[0].id === other.id, '書箱可移入另一个書箱')
      let cycleRejected = false
      try {
        await container.store.moveContainer(pa.id, child.id) // pa 是 child 的祖先
      } catch {
        cycleRejected = true
      }
      assert(cycleRejected, '移进自己的后代被拒绝（防成环）')
      await container.store.moveContainer(other.id, null)
      assert(
        (await container.store.listContainers(created.id, null)).find((c) => c.id === other.id) !=
          null,
        '書箱可移回根层'
      )
      await container.store.removeContainer(child.id)
      await container.store.removeContainer(pa.id)
      await container.store.removeContainer(other.id)
      assert((await container.store.listContainers(created.id, null)).length === 0, '移动断言清理干净')

      // ③d 映射库建库：mode/rootPath 必须持久化（初始扫描导入是弹窗层职责，不在此探针）
      //     ⚠ v0.4.0：`LibraryEntry.dbPath` 已随"一库一 .db"作废 → 断言改为 mode/rootPath
      //     （映射库的标识由 mode='mapped' + 跟踪的唯一真实文件夹共同表达）
      const srcDir = devBook.replace(/[\\/][^\\/]+$/, '')
      await container.store.createLibrary({ name: '映射庫', mode: 'mapped', rootPath: srcDir })
      const withMapped = await container.store.listLibraries()
      const mappedEntry = withMapped.libraries.find((l) => l.mode === 'mapped')
      assert(mappedEntry?.rootPath === srcDir, '映射库的 mode/rootPath 持久化')

      // ④ 切回默认库：收录恢复（顺带验证"关过的库能重开"——切库会 close/init 往返）
      await container.store.switchLibrary(base.currentId)
      await wait(300)
      const backCount = await holdingCount(base.currentId)
      assert(backCount === before, `切回默认库后收录恢复（${backCount}/${before}）`)

      // ⑤ 库注册表语义（v0.4.0：注册表进 .db，引导文件只剩 {version, dbPath, 窗口状态}；
      //     这里只验 IPC 面的条目数，落盘位置由 main 保证）
      const final = await container.store.listLibraries()
      assert(final.libraries.length === 3, `库注册表三个条目（实际 ${final.libraries.length}）`)

      // ⑥ 笔记/划线全链路（2026-09-14 阶段 2）：渲染层 → IPC → 主进程 → SQLite → 读回。
      //    重点验**锚点落库往返**（Fragment 逐字节 + excerpt/prefix 投影不脱节）与**重锚一致性**，
      //    这两处错了表现为"高亮跳到别处"，肉眼极难定位，故钉在探针里。
      //    ⚠ v0.4.0：笔记挂 **edition**（`Note.editionId`），不再挂"某库里的书"——
      //    故这里从**收录**取 editionId（收录关系是库内的，内容身份是全局的）。
      const noteHolding = (await container.store.listHoldings(base.currentId))[0]
      if (!noteHolding) throw new Error('默认库没有收录，笔记链路断言无法进行')
      const noteEditionId = noteHolding.editionId
      const mkNote = (
        chapter: number,
        progression: number,
        exact: string,
        frag: string | null
      ): Note => ({
        id: crypto.randomUUID(),
        editionId: noteEditionId,
        kind: 'highlight',
        anchor: {
          norm: {
            chapterIndex: chapter,
            progression,
            quote: { exact, prefix: '前文', suffix: '後文' }
          },
          fragment: frag ? { engine: 'kookit-rangy', key: frag } : null
        },
        color: 'yellow',
        body: '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
      const n1 = mkNote(0, 0.1, '第一章的划线原文', '{"start":1,"end":9}')
      const n2 = mkNote(2, 0.5, '第三章的划线原文', '{"start":20,"end":30}')
      const nWeak = mkNote(1, 0.9, '弱锚点原文（无引擎载荷）', null)
      await container.store.addNote(n1)
      await container.store.addNote(n2)
      await container.store.addNote(nWeak)
      const allNotes = await container.store.listNotes(noteEditionId)
      assert(allNotes.length === 3, `笔记落库 3 条（实际 ${allNotes.length}）`)
      assert(
        allNotes.map((n) => n.anchor.norm.chapterIndex).join(',') === '0,1,2',
        `listNotes 按阅读序（章序）返回：${allNotes.map((n) => n.anchor.norm.chapterIndex).join(',')}`
      )
      const onlyCh0 = await container.store.listNotes(noteEditionId, 0)
      assert(
        onlyCh0.length === 1 && onlyCh0[0].id === n1.id,
        `按章过滤只取该节（实际 ${onlyCh0.length}）`
      )
      const r1 = allNotes.find((n) => n.id === n1.id)!
      assert(anchorStrengthOf(r1.anchor) === 'strong', 'Fragment 往返后仍是强锚点')
      assert(
        r1.anchor.fragment?.key === '{"start":1,"end":9}',
        'anchor_key 往返逐字节一致（引号/花括号未被转义破坏）'
      )
      assert(r1.anchor.norm.quote.exact === '第一章的划线原文', 'excerpt 列装回 quote.exact')
      assert(r1.anchor.norm.quote.prefix === '前文', 'anchor_hint 的 prefix 装回')
      const rWeak = allNotes.find((n) => n.id === nWeak.id)!
      assert(anchorStrengthOf(rWeak.anchor) === 'weak', '无载荷笔记降级为弱锚点（不抛错）')
      assert(rWeak.anchor.norm.quote.exact !== '', '弱锚点仍保留原文（供 remeasure）')

      // ⑥b 更新：批注正文/颜色 + updatedAt 由存储层统一盖戳
      const beforeUpdate = r1.updatedAt
      await wait(5)
      await container.store.updateNote(n1.id, { body: '我的批注', color: 'red' })
      const r1b = (await container.store.listNotes(noteEditionId, 0))[0]
      assert(r1b.body === '我的批注', '批注正文可更新（kookit 侧须按字符串传，不再被丢）')
      assert(r1b.color === 'red', '颜色可更新（存语义名，非 hex）')
      assert(r1b.updatedAt > beforeUpdate, 'updatedAt 由存储层自动盖戳')

      // ⑥c 重锚：chapter_index/anchor_key/anchor_hint + excerpt **必须一起**改（投影不脱节）
      await container.store.updateNote(n1.id, {
        anchor: {
          norm: {
            chapterIndex: 1,
            progression: 0.25,
            quote: { exact: '重锚後的原文', prefix: '新前', suffix: '新後' }
          },
          fragment: { engine: 'kookit-rangy', key: '{"start":99,"end":120}' }
        }
      })
      const re = (await container.store.listNotes(noteEditionId, 1)).find((n) => n.id === n1.id)!
      assert(re.anchor.norm.chapterIndex === 1, '重锚后章节列已更新')
      assert(re.anchor.fragment?.key === '{"start":99,"end":120}', '重锚后 anchor_key 已更新')
      assert(re.anchor.norm.quote.exact === '重锚後的原文', '重锚后 excerpt 同步（投影不脱节）')
      assert(re.anchor.norm.quote.prefix === '新前', '重锚后 anchor_hint 同步')
      assert(
        (await container.store.listNotes(noteEditionId, 0)).length === 0,
        '旧章已无该笔记（无残影）'
      )

      // ⑥d 删除 + 清理
      await container.store.removeNote(n2.id)
      assert((await container.store.listNotes(noteEditionId)).length === 2, '删除后剩 2 条')
      await container.store.removeNote(nWeak.id)
      await container.store.removeNote(n1.id)
      assert((await container.store.listNotes(noteEditionId)).length === 0, '笔记断言清理干净')

      if (failed) throw new Error('存在 FAIL 断言')
      ok(
        `多库切换 OK：新建(${created.name})→空库→跨库复用同一 edition→書箱CRUD→映射库→切回(收录恢复)；注册表=${final.libraries
          .map((l) => l.name)
          .join('/')}`
      )
      host.pushLog(`library 探针通过：${final.libraries.length} 个书库`)
    } catch (err) {
      console.log(`[TUREAD-TEST-FAIL][library] ${(err as Error).message}`)
    }
  })()
}
