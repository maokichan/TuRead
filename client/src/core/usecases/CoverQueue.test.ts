/**
 * CoverQueue 单测 —— 覆盖"脆弱点恰好都在无覆盖区"里点名的**双队列**之一
 * （见 `TODO.md`「工程与测试设施」组的单测覆盖缺口条目）。
 *
 * 测的是**判据**（纯逻辑：串行、去重、进度、失败负缓存、取消），不是链路 ——
 * 链路由 `TUREAD_DEV_PROBE` 探针负责（项目的分工口径：单测验判据、探针验链路）。
 */
import { describe, expect, it, vi } from 'vitest'
import { CoverQueue } from './CoverQueue'
import type { EditionRecord } from '@core/domain/types'
import type { ILibraryStore } from '@core/ports/store'
import type { IMetadataExtractor } from '@core/ports/metadata'
import type { IImageThumbnailer } from '@core/ports/image'

/** 只实现 CoverQueue 用到的那几个方法的假 store（其余用断言拦住"悄悄多调了"） */
function fakeStore(editions: Record<string, Partial<EditionRecord>>): {
  store: ILibraryStore
  updated: Array<{ id: string; patch: Partial<EditionRecord> }>
  covers: string[]
} {
  const updated: Array<{ id: string; patch: Partial<EditionRecord> }> = []
  const covers: string[] = []
  const store = {
    async getEdition(id: string): Promise<EditionRecord | null> {
      const e = editions[id]
      if (!e) return null
      return {
        id,
        fingerprint: { algorithm: 'md5-sample3-v1', hash: id, size: 1 },
        metadata: { title: id },
        format: 'EPUB',
        filePath: `C:\\books\\${id}.epub`,
        createdAt: 1,
        ...e
      } as EditionRecord
    },
    async updateEdition(id: string, patch: Partial<EditionRecord>): Promise<void> {
      updated.push({ id, patch })
    },
    async setCover(id: string): Promise<string> {
      covers.push(id)
      return `${id}.jpg`
    }
  } as unknown as ILibraryStore
  return { store, updated, covers }
}

const extractor = (cover: string | null): IMetadataExtractor =>
  ({
    extractFromFile: vi.fn(async () => ({ title: 't', ...(cover ? { cover } : {}) }))
  }) as unknown as IMetadataExtractor

const thumbnailer: IImageThumbnailer = {
  make: vi.fn(async () => ({ bytes: new ArrayBuffer(4), ext: 'jpg' }))
} as unknown as IImageThumbnailer

/** 等队列跑完（pump 是 void 起的异步循环，靠 done 事件收口） */
function untilDone(q: CoverQueue): Promise<void> {
  return new Promise((resolve) => q.on('done', () => resolve()))
}

describe('CoverQueue（封面提取队列）', () => {
  it('串行处理并按 done/total 上报进度', async () => {
    const { store } = fakeStore({ a: {}, b: {}, c: {} })
    const q = new CoverQueue(extractor('data:image/png;base64,x'), thumbnailer, store)
    const progress: number[] = []
    q.on('progress', (done, total) => progress.push(done * 100 + total))
    const done = untilDone(q)
    q.enqueue(['a', 'b', 'c'])
    await done
    // 入队即报 (0,3)；之后每本一次 (1,3)/(2,3)/(3,3)
    expect(progress).toEqual([3, 103, 203, 303])
  })

  it('同一 id 重复入队只算一次（planned 去重）', async () => {
    const { store } = fakeStore({ a: {} })
    const q = new CoverQueue(extractor('data:image/png;base64,x'), thumbnailer, store)
    const done = new Promise<{ total: number }>((resolve) => q.on('done', resolve))
    q.enqueue(['a'])
    q.enqueue(['a', 'a'])
    const summary = await done
    expect(summary.total).toBe(1)
  })

  it('已有 coverPath 的书跳过但仍计入 ok（保证进度连续）', async () => {
    const { store, covers } = fakeStore({ a: { coverPath: 'a.jpg' } })
    const q = new CoverQueue(extractor('data:image/png;base64,x'), thumbnailer, store)
    const done = new Promise<{ ok: number; failed: number }>((resolve) => q.on('done', resolve))
    q.enqueue(['a'])
    const summary = await done
    expect(summary.ok).toBe(1)
    expect(summary.failed).toBe(0)
    expect(covers).toEqual([]) // 没有重新写封面
  })

  it('失败落 coverFailed 负缓存并报 cover-failed（不随下次启动重试）', async () => {
    const { store, updated } = fakeStore({ a: {} })
    // 该书没有内嵌封面 → extractOne 抛"该书没有封面"
    const q = new CoverQueue(extractor(null), thumbnailer, store)
    const failed = new Promise<string>((resolve) => q.on('cover-failed', (id) => resolve(id)))
    const done = new Promise<{ failed: number }>((resolve) => q.on('done', resolve))
    q.enqueue(['a'])
    expect(await failed).toBe('a')
    expect((await done).failed).toBe(1)
    expect(updated).toEqual([{ id: 'a', patch: { coverFailed: true } }])
  })

  it('已在库中标记 coverFailed 的书直接跳过，不再解析（负缓存生效）', async () => {
    const { store, covers } = fakeStore({ a: { coverFailed: true } })
    const ex = extractor('data:image/png;base64,x')
    const q = new CoverQueue(ex, thumbnailer, store)
    const done = new Promise<{ ok: number }>((resolve) => q.on('done', resolve))
    q.enqueue(['a'])
    await done
    expect(ex.extractFromFile).not.toHaveBeenCalled()
    expect(covers).toEqual([])
  })

  it('取消剩余队列（已入队但未处理的条目不再处理）', async () => {
    const { store, covers } = fakeStore({ a: {}, b: {}, c: {} })
    const q = new CoverQueue(extractor('data:image/png;base64,x'), thumbnailer, store)
    const done = new Promise<{ cancelled: boolean; ok: number }>((resolve) =>
      q.on('done', resolve)
    )
    q.enqueue(['a', 'b', 'c'])
    q.cancel()
    const summary = await done
    expect(summary.cancelled).toBe(true)
    expect(summary.ok).toBeLessThan(3)
    expect(covers.length).toBeLessThan(3)
  })

  it('批次结束后回到可再次入队的状态（不会卡在 running）', async () => {
    const { store, covers } = fakeStore({ a: {}, b: {} })
    const q = new CoverQueue(extractor('data:image/png;base64,x'), thumbnailer, store)
    const first = new Promise<void>((resolve) => q.on('done', () => resolve()))
    q.enqueue(['a'])
    await first
    const second = new Promise<{ total: number }>((resolve) => q.on('done', resolve))
    q.enqueue(['b'])
    expect((await second).total).toBe(1)
    expect(covers).toEqual(['a', 'b'])
  })
})
