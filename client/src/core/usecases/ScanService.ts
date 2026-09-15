/**
 * IScanService —— **映射库与真实路径的对账**（应用服务 / 用例层，v0.4.0 新增）。
 * 依据：`client/docs/DATA_MODEL.md` §6.1（虚拟映射的写入语义）+ D5/F4。
 *
 * **为什么需要它**：映射库（`mode='mapped'`）**不能导入** —— 书只能在真实路径上添加
 * （DATA_MODEL D5）。所以"让书库跟着文件夹走"的唯一入口就是**扫描对账**。
 *
 * **对账语义**（不是"重新导入一遍"）：
 * - 磁盘上有、库里没有 → 读文件 → `importBook(origin='scan')`（指纹去重仍生效）；
 * - 库里有、磁盘上没了 → **标 `missing`**（**不删收录、不删笔记、不删阅读状态**）；
 * - 又回来了 → 清掉 `missing`；
 * - 路径变了但指纹相同 → `importBook` 的 upsert 会更新 `file_path`，收录路径随之更新。
 *
 * ⚠ **不做 `fs.watch`**（用户判断：监听开销不会更低；且与"阅读器不管理源文件"张力最大）——
 * 扫描是**显式动作**：① 用户在状态栏点「掃描」；② 建库后自动跑一次；③ 进库时惰性对账（后续接）。
 */
import type { ILibraryStore } from '@core/ports/store'
import type { Holding } from '@core/domain/types'
import { basename, extToFormat } from '@core/domain/format'
import type { IBookService } from './BookService'

export interface ScanSummary {
  /** 本次扫到的磁盘文件数 */
  found: number
  /** 新增收录数 */
  added: number
  /** 指纹命中（已在库中）的数量 */
  reused: number
  /** 标记为"来源缺失"的收录数 */
  missing: number
  /** 恢复（重新出现）的收录数 */
  restored: number
  /** 逐条失败（读不动/格式不认识） */
  failed: number
}

export interface IScanService {
  /** 扫描一个映射库并对其收录做对账 */
  scanLibrary(libraryId: string): Promise<ScanSummary>
}

export class ScanService implements IScanService {
  constructor(
    private listEbooks: (dir: string, recursive: boolean) => Promise<string[]>,
    private readFile: (path: string) => Promise<ArrayBuffer>,
    private books: IBookService,
    private store: ILibraryStore
  ) {}

  async scanLibrary(libraryId: string): Promise<ScanSummary> {
    const library = await this.store.getLibrary(libraryId)
    if (!library) throw new Error('書庫不存在')
    if (library.mode !== 'mapped') throw new Error('只有映射庫需要掃描（自建庫的書靠導入）')
    const root = library.rootPath
    if (!root) throw new Error('映射庫沒有跟蹤文件夾')

    const summary: ScanSummary = {
      found: 0,
      added: 0,
      reused: 0,
      missing: 0,
      restored: 0,
      failed: 0
    }

    const before = await this.store.listHoldings(libraryId)
    const byPath = new Map<string, Holding>()
    for (const h of before) if (h.path) byPath.set(normalizePath(h.path), h)

    // ① 磁盘 → 库
    const found = await this.listEbooks(root, true)
    summary.found = found.length
    const seen = new Set<string>()
    for (const path of found) {
      const key = normalizePath(path)
      seen.add(key)
      const prev = byPath.get(key)
      try {
        const buffer = await this.readFile(path)
        const res = await this.books.importBook(
          buffer,
          basename(path),
          extToFormat(basename(path)),
          path,
          libraryId,
          'scan'
        )
        if (res.reused) summary.reused++
        else summary.added++
        // ② 曾经缺失、现在回来了 → 清标记
        if (prev?.missing) {
          await this.store.setHoldingMissing(libraryId, res.edition.id, false)
          summary.restored++
        }
      } catch {
        summary.failed++
      }
    }

    // ③ 库 → 磁盘：不在本次扫描结果里的收录 → 标缺失（**只标不删**）
    for (const h of before) {
      if (!h.path) continue
      if (seen.has(normalizePath(h.path))) continue
      if (h.missing) continue // 已经是缺失态，不重复计数
      await this.store.setHoldingMissing(libraryId, h.editionId, true)
      summary.missing++
    }

    return summary
  }
}

/** 路径归一（与主进程 `holdings.parent_path` 同口径：去尾分隔符 + 统一反斜杠 + 小写比较） */
function normalizePath(p: string): string {
  return p.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase()
}
