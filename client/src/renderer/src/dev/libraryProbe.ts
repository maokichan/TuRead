/**
 * dev-only 无头探针：多书库切换链路（2026-09-13 用户立项「書庫」入口的断言级验证）。
 *
 * 链路：迁移后的默认库（devBook 已导入）→ 新建库（自动切换）→ 断言当前库书单为空
 * → 在新库导入一本 → 断言书单为 1 → 切回默认库 → 断言书单恢复且 devBook 仍在
 * → 断言引导文件语义（config.json 有 libraries 数组）。
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
    try {
      const devBook = window.turead.devBook
      if (!devBook) throw new Error('library 探针需要 TUREAD_DEV_BOOK 指向任意电子书')

      // ① 默认库：先导入 devBook（含库级设置读写，验证默认库可用）
      const buffer = await container.picker.readFile(devBook)
      await container.books.importBook(
        buffer,
        devBook.split(/[\\/]/).pop() ?? devBook,
        extToFormat(devBook),
        devBook
      )
      const base = await container.store.listLibraries()
      assert(base.libraries.length === 1, `初始只有默认库（${base.libraries.length} 个）`)
      const before = await container.books.list()
      assert(before.length > 0, `默认库书单非空（实际 ${before.length}，迁移链路验证）`)

      // ② 新建库（端口契约：创建即切换）→ 书单应为空
      const created = await container.store.createLibrary()
      await wait(300)
      const afterCreate = await container.store.listLibraries()
      assert(afterCreate.currentId === created.id, `新建后当前库 = 新库（${created.name}）`)
      const newLibBooks = await container.books.list()
      assert(newLibBooks.length === 0, `新库书单为空（实际 ${newLibBooks.length}）`)

      // ③ 新库独立导入：同书可再入库（不同库各自指纹去重，互不影响）
      const buffer2 = await container.picker.readFile(devBook)
      await container.books.importBook(
        buffer2,
        devBook.split(/[\\/]/).pop() ?? devBook,
        extToFormat(devBook),
        devBook
      )
      assert((await container.books.list()).length === 1, '新库可独立导入同一本书')

      // ③b 更名（显示名，路径不变；不切库）
      await container.store.renameLibrary(created.id, '測試改名')
      const renamed = await container.store.listLibraries()
      assert(
        renamed.libraries.find((l) => l.id === created.id)?.name === '測試改名',
        '新库可更名'
      )

      // ③c 書箱 CRUD + 层级取书（自建模式核心链路）
      const c1 = await container.store.createContainer({ parentId: null, name: '測試書箱' })
      const subs = await container.store.listContainers(null)
      assert(subs.length === 1 && subs[0].name === '測試書箱', '根层可新建書箱')
      const rootBooks = await container.store.listBooksAtLevel({ containerId: null })
      assert(rootBooks.length === 1, `根层取书=未入箱的书（实际 ${rootBooks.length}）`)
      // 移动语义：书入箱后根层为空、箱内有一本；移出后还原
      await container.store.moveBookToContainer(rootBooks[0].id, c1.id)
      assert(
        (await container.store.listBooksAtLevel({ containerId: null })).length === 0,
        '书入箱后根层为空'
      )
      assert(
        (await container.store.listBooksAtLevel({ containerId: c1.id })).length === 1,
        '箱内取书=1'
      )
      await container.store.moveBookToContainer(rootBooks[0].id, null)
      assert(
        (await container.store.listBooksAtLevel({ containerId: null })).length === 1,
        '移回根层后还原'
      )
      await container.store.renameContainer(c1.id, '改名書箱')
      assert(
        (await container.store.listContainers(null))[0]?.name === '改名書箱',
        '書箱可更名'
      )
      await container.store.removeContainer(c1.id)
      assert((await container.store.listContainers(null)).length === 0, '空書箱可移除')

      // ③c+ 書箱移动（moveContainer）：拖箱入箱的后端语义——入箱 / 防成环 / 移回根层
      const pa = await container.store.createContainer({ parentId: null, name: '移動父箱' })
      const child = await container.store.createContainer({ parentId: pa.id, name: '子箱' })
      const other = await container.store.createContainer({ parentId: null, name: '旁箱' })
      await container.store.moveContainer(other.id, child.id)
      const childSubs = await container.store.listContainers(child.id)
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
        (await container.store.listContainers(null)).find((c) => c.id === other.id) != null,
        '書箱可移回根层'
      )
      await container.store.removeContainer(child.id)
      await container.store.removeContainer(pa.id)
      await container.store.removeContainer(other.id)
      assert((await container.store.listContainers(null)).length === 0, '移动断言清理干净')

      // ③d 虚拟映射建库：mode/rootPath 必须持久化（初始扫描导入是弹窗层职责，不在此探针）
      const srcDir = devBook.replace(/[\\/][^\\/]+$/, '')
      await container.store.createLibrary('映射庫', 'source', srcDir)
      const withSource = await container.store.listLibraries()
      const srcEntry = withSource.libraries.find((l) => l.mode === 'source')
      assert(srcEntry?.rootPath === srcDir, '虚拟映射库的 mode/rootPath 持久化')

      // ④ 切回默认库：书单恢复（顺带验证"关过的库能重开"——切库会 close/init 往返）
      await container.store.switchLibrary(base.currentId)
      await wait(300)
      const backCount = (await container.books.list()).length
      assert(backCount === before.length, `切回默认库后书单恢复（${backCount}/${before.length}）`)

      // ⑤ 引导文件语义：config.json 只有注册表，书库数据在 .db（由 main 保证，这里只验 IPC 面）
      const final = await container.store.listLibraries()
      assert(final.libraries.length === 3, `库注册表三个条目（实际 ${final.libraries.length}）`)

      // ⑥ 笔记/划线全链路（2026-09-14 阶段 2）：渲染层 → IPC → 主进程 → SQLite → 读回。
      //    重点验**锚点落库往返**（Fragment 逐字节 + excerpt/prefix 投影不脱节）与**重锚一致性**，
      //    这两处错了表现为"高亮跳到别处"，肉眼极难定位，故钉在探针里。
      const noteBookId = (await container.books.list())[0].id
      const mkNote = (
        chapter: number,
        progression: number,
        exact: string,
        frag: string | null
      ): Note => ({
        id: crypto.randomUUID(),
        bookId: noteBookId,
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
      const allNotes = await container.store.listNotes(noteBookId)
      assert(allNotes.length === 3, `笔记落库 3 条（实际 ${allNotes.length}）`)
      assert(
        allNotes.map((n) => n.anchor.norm.chapterIndex).join(',') === '0,1,2',
        `listNotes 按阅读序（章序）返回：${allNotes.map((n) => n.anchor.norm.chapterIndex).join(',')}`
      )
      const onlyCh0 = await container.store.listNotes(noteBookId, 0)
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
      const r1b = (await container.store.listNotes(noteBookId, 0))[0]
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
      const re = (await container.store.listNotes(noteBookId, 1)).find((n) => n.id === n1.id)!
      assert(re.anchor.norm.chapterIndex === 1, '重锚后章节列已更新')
      assert(re.anchor.fragment?.key === '{"start":99,"end":120}', '重锚后 anchor_key 已更新')
      assert(re.anchor.norm.quote.exact === '重锚後的原文', '重锚后 excerpt 同步（投影不脱节）')
      assert(re.anchor.norm.quote.prefix === '新前', '重锚后 anchor_hint 同步')
      assert(
        (await container.store.listNotes(noteBookId, 0)).length === 0,
        '旧章已无该笔记（无残影）'
      )

      // ⑥d 删除 + 清理
      await container.store.removeNote(n2.id)
      assert((await container.store.listNotes(noteBookId)).length === 2, '删除后剩 2 条')
      await container.store.removeNote(nWeak.id)
      await container.store.removeNote(n1.id)
      assert((await container.store.listNotes(noteBookId)).length === 0, '笔记断言清理干净')

      if (failed) throw new Error('存在 FAIL 断言')
      ok(
        `多库切换 OK：新建(${created.name})→空库→独立导入→書箱CRUD→映射库→切回(书单恢复)；注册表=${final.libraries
          .map((l) => l.name)
          .join('/')}`
      )
      host.pushLog(`library 探针通过：${final.libraries.length} 个书库`)
    } catch (err) {
      console.log(`[TUREAD-TEST-FAIL][library] ${(err as Error).message}`)
    }
  })()
}
