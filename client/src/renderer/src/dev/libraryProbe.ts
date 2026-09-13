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
