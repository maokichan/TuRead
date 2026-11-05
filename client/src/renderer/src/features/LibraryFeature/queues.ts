/**
 * 书库的三条后台事件接线（封面提取 / 批量导入 / 存量补封面）——自 LibraryFeature 拆出。
 * 全是 effect 订阅：宿主下发 state setter，本钩子不持有渲染状态。
 * ⚠ 纪律（契约保留）：存量补封面 ① **延迟启动**（20s，让应用先可用）
 * ② **只补没试过的**（负缓存与已有 coverPath 不重试）；dev 无头自检跳过（保持渲染验证确定性）。
 */
import { useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { EditionRecord } from '@core/domain/types'
import type { ServiceContainer } from '@core/container'
import type { FeatureHost } from '../types'
import { forgetCover, getCoverUrl } from '../coverCache'

export function useLibraryQueues(params: {
  container: ServiceContainer
  host: FeatureHost
  /** 导入 done 的收尾要刷新当前层级 */
  loadLevel: () => Promise<void>
  setCovers: Dispatch<SetStateAction<Record<string, string>>>
  setBooks: Dispatch<SetStateAction<EditionRecord[]>>
  setCoverProgress: Dispatch<SetStateAction<{ done: number; total: number } | null>>
  setImporting: Dispatch<SetStateAction<{ done: number; total: number } | null>>
}): void {
  const { container, host, loadLevel, setCovers, setBooks, setCoverProgress, setImporting } = params
  /** 本批导入成功的书 id（done 时一次性交给封面队列） */
  const importedIdsRef = useRef<string[]>([])

  // 封面提取事件 → 进度 / 单本就绪 / 失败日志
  useEffect(() => {
    const offProgress = container.covers.on('progress', (done, total) =>
      setCoverProgress(total > 0 ? { done, total } : null)
    )
    const offReady = container.covers.on('cover-ready', (id) => {
      void (async () => {
        const book = await container.books.get(id)
        if (!book) return
        forgetCover(id) // 重新提取过：旧 URL 作废
        const url = await getCoverUrl(container.store, id, book.coverPath)
        if (url) setCovers((prev) => ({ ...prev, [id]: url }))
        setBooks((prev) => prev.map((b) => (b.id === id ? book : b)))
      })()
    })
    const offFailed = container.covers.on('cover-failed', (id, message) =>
      host.pushLog(`封面提取失败（${id.slice(0, 8)}）：${message}`)
    )
    const offDone = container.covers.on('done', (summary) => {
      setCoverProgress(null)
      if (summary.failed > 0) {
        host.pushLog(`封面提取完成：成功 ${summary.ok} 本，失败 ${summary.failed} 本`)
      }
    })
    return () => {
      offProgress()
      offReady()
      offFailed()
      offDone()
    }
  }, [container, host, setCovers, setBooks, setCoverProgress])

  // 导入事件 → 进度 / 失败日志 / 收尾（刷新当前层级 + 选中首本 + 入队封面）
  useEffect(() => {
    const offProgress = container.imports.on('progress', (done, total) =>
      setImporting(total > 0 ? { done, total } : null)
    )
    const offImported = container.imports.on('imported', (book) => {
      importedIdsRef.current.push(book.id)
    })
    const offFailed = container.imports.on('import-failed', (path, message) =>
      host.pushLog(`导入失败（${path}）：${message}`)
    )
    const offDone = container.imports.on('done', (summary) => {
      setImporting(null)
      const ids = importedIdsRef.current
      importedIdsRef.current = []
      void (async () => {
        await loadLevel()
        if (ids.length > 0) {
          host.selectBook(ids[0])
          container.covers.enqueue(ids)
        }
        const parts = [`导入 ${summary.imported - summary.reused} 本`]
        if (summary.reused > 0) parts.push(`指纹复用 ${summary.reused} 本`)
        if (summary.failed > 0) parts.push(`失败 ${summary.failed} 本`)
        if (summary.cancelled) parts.push('（已取消）')
        host.pushLog(parts.join('，'))
      })()
    })
    return () => {
      offProgress()
      offImported()
      offFailed()
      offDone()
    }
  }, [container, host, loadLevel, setImporting])

  // 存量补封面：老书库里的书没有封面 → 后台补齐（dev 无头自检跳过，保持渲染验证确定性）。
  // ⚠ 两条纪律：① **延迟启动**（推迟 20s，让应用先可用）② **只补没试过的**（负缓存与已有 coverPath 不重试）
  useEffect(() => {
    if (window.turead.devBook) return
    const timer = setTimeout(() => {
      void (async () => {
        const list = await container.books.listAll()
        const missing = list.filter((b) => !b.coverPath && !b.coverFailed).map((b) => b.id)
        if (missing.length > 0) container.covers.enqueue(missing)
      })()
    }, 20000)
    return () => clearTimeout(timer)
  }, [container])
}
