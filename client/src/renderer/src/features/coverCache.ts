/**
 * 封面对象 URL 缓存（模块级）—— 把落盘的缩略图字节换成 <img src> 可用的 URL。
 *
 * 为什么缓存：切视图（列表↔网格）会重建组件，若每次都走 IPC 取字节 + createObjectURL，
 * 翻页/滚动时会反复分配与泄漏。这里按 bookId 缓存 URL，重复请求复用同一个。
 * 生命周期：书从书架移除时 `forgetCover` 释放（revokeObjectURL）。
 */
import type { ILibraryStore } from '@core/ports/store'

const urls = new Map<string, string>()
const inflight = new Map<string, Promise<string | null>>()

/** 取封面 URL；无 coverPath / 无文件 → null（调用方回落到"文字封面"） */
export function getCoverUrl(
  store: ILibraryStore,
  bookId: string,
  coverPath?: string
): Promise<string | null> {
  if (!coverPath) return Promise.resolve(null)
  const cached = urls.get(bookId)
  if (cached) return Promise.resolve(cached)
  const pending = inflight.get(bookId)
  if (pending) return pending

  const task = (async (): Promise<string | null> => {
    const bytes = await store.getCover(bookId)
    if (!bytes) return null
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }))
    urls.set(bookId, url)
    return url
  })()
  inflight.set(bookId, task)
  void task.finally(() => inflight.delete(bookId))
  return task
}

export function forgetCover(bookId: string): void {
  const url = urls.get(bookId)
  if (url) {
    URL.revokeObjectURL(url)
    urls.delete(bookId)
  }
  inflight.delete(bookId)
}
