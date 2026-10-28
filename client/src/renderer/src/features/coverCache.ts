/**
 * 封面对象 URL 缓存（模块级）—— 把落盘的缩略图字节换成 <img src> 可用的 URL。
 *
 * 为什么缓存：切视图（列表↔网格）会重建组件，若每次都走 IPC 取字节 + createObjectURL，
 * 翻页/滚动时会反复分配与泄漏。这里按 bookId 缓存 URL，重复请求复用同一个。
 * 生命周期：书从书架移除时 `forgetCover` 释放（revokeObjectURL）；
 * 切库时 `clearCoverCache` 整体释放（LibraryFeature 订阅 library-changed 调用）。
 */
import type { ILibraryStore } from '@core/ports/store'

const urls = new Map<string, string>()
const inflight = new Map<string, Promise<string | null>>()
/** 缓存代次：清空自增。在途请求据此作废——否则清空后回来还会把 URL 塞回去（复活泄漏） */
let epoch = 0

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

  const myEpoch = epoch
  const task = (async (): Promise<string | null> => {
    const bytes = await store.getCover(bookId)
    // 取字节是唯一的 await；此后到 urls.set 之间无让点，代次判净即无竞态
    if (!bytes || epoch !== myEpoch) return null
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

/** 切库广播：整体释放对象 URL（旧库的 URL 留着只是累积到退出），在途结果作废 */
export function clearCoverCache(): void {
  epoch += 1
  for (const url of urls.values()) URL.revokeObjectURL(url)
  urls.clear()
  inflight.clear()
}
