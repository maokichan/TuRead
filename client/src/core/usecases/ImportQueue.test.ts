/**
 * ImportQueue 单测 —— 覆盖"脆弱点恰好都在无覆盖区"里点名的**双队列**之一
 * （见 `TODO.md`「工程与测试设施」组的单测覆盖缺口条目）。
 *
 * ⚠ v0.4.0 起 `enqueue(paths, libraryId)`：**导入必须给出目标书库**（收录关系是库内的）。
 * 这条也在这里钉住 —— 目标库串台会让书进错库，而 UI 上很难发现。
 */
import { describe, expect, it } from 'vitest'
import { ImportQueue } from './ImportQueue'
import type { EditionRecord } from '@core/domain/types'
import type { IBookService, ImportResult } from './BookService'

function fakeBooks(opts: {
  /** 命中"指纹复用"的路径 */
  reusedPaths?: string[]
  /** 这些路径的导入会抛错 */
  failPaths?: string[]
}): {
  books: IBookService
  calls: Array<{ path: string; libraryId: string; origin?: string }>
} {
  const calls: Array<{ path: string; libraryId: string; origin?: string }> = []
  const books = {
    async importBook(
      _file: ArrayBuffer,
      _name: string,
      _format: unknown,
      filePath: string,
      libraryId: string,
      origin?: 'scan' | 'import'
    ): Promise<ImportResult> {
      calls.push({ path: filePath, libraryId, origin })
      if (opts.failPaths?.includes(filePath)) throw new Error('boom')
      const edition = {
        id: `e-${filePath}`,
        fingerprint: { algorithm: 'md5-sample3-v1', hash: filePath, size: 1 },
        metadata: { title: filePath },
        format: 'EPUB',
        filePath,
        createdAt: 1
      } as EditionRecord
      const reused = opts.reusedPaths?.includes(filePath) ?? false
      return {
        edition,
        holding: {
          libraryId,
          editionId: edition.id,
          containerId: null,
          origin: origin ?? 'import',
          path: filePath,
          missing: false,
          sort: 0,
          addedAt: 1
        },
        reused
      }
    }
  } as unknown as IBookService
  return { books, calls }
}

const readFile = async (): Promise<ArrayBuffer> => new ArrayBuffer(8)

describe('ImportQueue（批量导入队列）', () => {
  it('串行导入、按 done/total 上报进度、done 里给出汇总', async () => {
    const { books } = fakeBooks({})
    const q = new ImportQueue(readFile, books)
    const progress: number[] = []
    q.on('progress', (done, total) => progress.push(done * 100 + total))
    const done = new Promise<{ total: number; imported: number; reused: number; failed: number }>(
      (resolve) => q.on('done', resolve)
    )
    q.enqueue(['C:\\b\\1.epub', 'C:\\b\\2.epub'], 'lib-1')
    const s = await done
    expect(s).toMatchObject({ total: 2, imported: 2, reused: 0, failed: 0 })
    expect(progress).toEqual([2, 102, 202])
  })

  it('同一路径重复入队只算一次', async () => {
    const { books } = fakeBooks({})
    const q = new ImportQueue(readFile, books)
    const done = new Promise<{ total: number }>((resolve) => q.on('done', resolve))
    q.enqueue(['C:\\b\\1.epub'], 'lib-1')
    q.enqueue(['C:\\b\\1.epub', 'C:\\b\\1.epub'], 'lib-1')
    expect((await done).total).toBe(1)
  })

  it('指纹复用单独计数（reused）并原样透传给 imported 事件', async () => {
    const { books } = fakeBooks({ reusedPaths: ['C:\\b\\1.epub'] })
    const q = new ImportQueue(readFile, books)
    const reusedFlags: boolean[] = []
    q.on('imported', (_edition, reused) => reusedFlags.push(reused))
    const done = new Promise<{ imported: number; reused: number }>((resolve) =>
      q.on('done', resolve)
    )
    q.enqueue(['C:\\b\\1.epub', 'C:\\b\\2.epub'], 'lib-1')
    const s = await done
    expect(s).toMatchObject({ imported: 2, reused: 1 })
    expect(reusedFlags).toEqual([true, false])
  })

  it('单条失败不影响其余：失败逐条上报，成功照常计入', async () => {
    const { books } = fakeBooks({ failPaths: ['C:\\b\\2.epub'] })
    const q = new ImportQueue(readFile, books)
    const failed: string[] = []
    q.on('import-failed', (path) => failed.push(path))
    const done = new Promise<{ imported: number; failed: number; total: number }>((resolve) =>
      q.on('done', resolve)
    )
    q.enqueue(['C:\\b\\1.epub', 'C:\\b\\2.epub', 'C:\\b\\3.epub'], 'lib-1')
    const s = await done
    expect(s).toMatchObject({ total: 3, imported: 2, failed: 1 })
    expect(failed).toEqual(['C:\\b\\2.epub'])
  })

  it('目标书库透传到每一条导入（不会串台到别的库）', async () => {
    const { books, calls } = fakeBooks({})
    const q = new ImportQueue(readFile, books)
    const done = new Promise<void>((resolve) => q.on('done', () => resolve()))
    q.enqueue(['C:\\b\\1.epub', 'C:\\b\\2.epub'], 'lib-42')
    await done
    expect(calls.map((c) => c.libraryId)).toEqual(['lib-42', 'lib-42'])
  })

  it('取消剩余队列', async () => {
    const { books } = fakeBooks({})
    const q = new ImportQueue(readFile, books)
    const done = new Promise<{ cancelled: boolean; imported: number }>((resolve) =>
      q.on('done', resolve)
    )
    q.enqueue(['C:\\b\\1.epub', 'C:\\b\\2.epub', 'C:\\b\\3.epub'], 'lib-1')
    q.cancel()
    const s = await done
    expect(s.cancelled).toBe(true)
    expect(s.imported).toBeLessThan(3)
  })

  it('批次结束后可再次入队（下批可换一个库）', async () => {
    const { books, calls } = fakeBooks({})
    const q = new ImportQueue(readFile, books)
    const first = new Promise<void>((resolve) => q.on('done', () => resolve()))
    q.enqueue(['C:\\b\\1.epub'], 'lib-1')
    await first
    const second = new Promise<void>((resolve) => q.on('done', () => resolve()))
    q.enqueue(['C:\\b\\2.epub'], 'lib-2')
    await second
    expect(calls.map((c) => c.libraryId)).toEqual(['lib-1', 'lib-2'])
  })
})
