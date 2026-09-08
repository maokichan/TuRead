/**
 * 功能组件：书架（LibraryFeature）
 * 职责（编排的用例/端口）：
 *   books.*   —— 导入/去重/列表/删除/选中
 *   picker.*  —— 选文件 / 选目录 / 扫描目录 / 读文件（本地文件能力）
 *   covers.*  —— 封面缩略图异步提取（进度/取消）
 * 对外状态：selectedBookId（经 host.selectBook 上报 Shell；详情抽屉显示的就是它）。
 * 依据：client/docs/FEATURES.md §10（书库重做）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BookRecord, LibrarySettings, LibraryView } from '@core/domain/types'
import type { FeatureProps } from '../types'
import { extToFormat } from '../util'
import { forgetCover, getCoverUrl } from '../coverCache'
import { BookRow } from '../../components/BookRow'
import { BookTile } from '../../components/BookTile'
import { BookDetailPanel } from '../../components/BookDetailPanel'
import { LibraryToolbar } from '../../components/LibraryToolbar'

const DEFAULT_SETTINGS: LibrarySettings = { view: 'list' }

export function LibraryFeature({ container, host, selectedBookId }: FeatureProps): React.JSX.Element {
  const [books, setBooks] = useState<BookRecord[]>([])
  const [view, setView] = useState<LibraryView>(DEFAULT_SETTINGS.view)
  const [covers, setCovers] = useState<Record<string, string>>({})
  const [detailId, setDetailId] = useState<string | null>(null)
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null)
  const [coverProgress, setCoverProgress] = useState<{ done: number; total: number } | null>(null)
  const cancelImportRef = useRef(false)

  /** 重载书库列表 + 取回各书封面 URL（缓存命中不重复走 IPC） */
  const refresh = useCallback(async (): Promise<BookRecord[]> => {
    const list = await container.books.list()
    setBooks(list)
    const pairs = await Promise.all(
      list.map(async (b) => [b.id, await getCoverUrl(container.store, b.id, b.coverPath)] as const)
    )
    setCovers(Object.fromEntries(pairs.filter((p): p is [string, string] => p[1] !== null)))
    return list
  }, [container])

  // 启动：读设置 + 载入书库
  useEffect(() => {
    void container.store
      .getSetting<LibrarySettings>('librarySettings', DEFAULT_SETTINGS)
      .then((s) => setView(s.view === 'grid' ? 'grid' : 'list'))
    void refresh()
  }, [container, refresh])

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
  }, [container, host])

  // 存量补封面：老书库里的书没有封面 → 后台补齐（dev 无头自检跳过，保持渲染验证确定性）
  useEffect(() => {
    if (window.turead.devBook) return
    void (async () => {
      const list = await container.books.list()
      const missing = list.filter((b) => !b.coverPath).map((b) => b.id)
      if (missing.length > 0) container.covers.enqueue(missing)
    })()
  }, [container])

  const changeView = useCallback(
    (v: LibraryView) => {
      setView(v)
      void container.store.setSetting('librarySettings', { view: v })
    },
    [container]
  )

  /** 批量导入：串行 + 进度 + 可取消（FEATURES §10 定案） */
  const importPaths = useCallback(
    async (paths: string[]): Promise<void> => {
      if (paths.length === 0) return
      cancelImportRef.current = false
      setImporting({ done: 0, total: paths.length })

      const importedIds: string[] = []
      let reused = 0
      let failed = 0
      for (let i = 0; i < paths.length; i++) {
        if (cancelImportRef.current) break
        const path = paths[i]
        const name = path.split(/[\\/]/).pop() ?? path
        try {
          const buffer = await container.picker.readFile(path)
          const res = await container.books.importBook(buffer, name, extToFormat(name), path)
          importedIds.push(res.book.id)
          if (res.reused) reused++
        } catch (err) {
          failed++
          host.pushLog(`导入失败（${name}）：${(err as Error).message}`)
        }
        setImporting({ done: i + 1, total: paths.length })
      }

      const cancelled = cancelImportRef.current
      setImporting(null)
      await refresh()
      if (importedIds.length > 0) {
        host.selectBook(importedIds[0])
        container.covers.enqueue(importedIds)
      }

      const parts = [`导入 ${importedIds.length - reused} 本`]
      if (reused > 0) parts.push(`指纹复用 ${reused} 本`)
      if (failed > 0) parts.push(`失败 ${failed} 本`)
      if (cancelled) parts.push('（已取消）')
      host.pushLog(parts.join('，'))
    },
    [container, host, refresh]
  )

  const importFiles = useCallback(async (): Promise<void> => {
    await importPaths(await container.picker.pickFiles())
  }, [container, importPaths])

  const importFolder = useCallback(async (): Promise<void> => {
    const dir = await container.picker.pickDirectory()
    if (!dir) return
    const paths = await container.picker.listEbooks(dir)
    if (paths.length === 0) {
      host.pushLog(`该目录下没有可导入的电子书：${dir}`)
      return
    }
    await importPaths(paths)
  }, [container, host, importPaths])

  const removeBook = useCallback(
    async (id: string): Promise<void> => {
      const book = books.find((b) => b.id === id)
      try {
        await container.books.remove(id)
        forgetCover(id)
        setDetailId((cur) => (cur === id ? null : cur))
        if (selectedBookId === id) host.selectBook(null)
        await refresh()
        host.pushLog(`已从书架移除：${book?.metadata.title ?? id}`)
      } catch (err) {
        host.pushLog(`删除失败：${(err as Error).message}`)
      }
    },
    [books, container, host, refresh, selectedBookId]
  )

  /** 单击 → 选中并弹详情（详情显示的书 = selectedBookId，单一真相） */
  const openDetail = useCallback(
    (id: string) => {
      host.selectBook(id)
      setDetailId(id)
    },
    [host]
  )

  const detailBook = books.find((b) => b.id === detailId) ?? null
  const itemProps = (b: BookRecord): {
    book: BookRecord
    active: boolean
    coverUrl: string | null
    onDetail: () => void
    onOpen: () => void
    onDelete: () => void
  } => ({
    book: b,
    active: b.id === selectedBookId,
    coverUrl: covers[b.id] ?? null,
    onDetail: () => openDetail(b.id),
    onOpen: () => host.openReader(b.id),
    onDelete: () => void removeBook(b.id)
  })

  return (
    <section className="flex h-full flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {books.length === 0 ? (
          <p className="m-0 py-10 text-center text-[12.5px] text-[var(--muted)]">
            书架为空，点右下角「＋ 导入」添加电子书
          </p>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-x-4 gap-y-5">
            {books.map((b) => (
              <BookTile key={b.id} {...itemProps(b)} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {books.map((b) => (
              <BookRow key={b.id} {...itemProps(b)} />
            ))}
          </div>
        )}
      </div>

      <LibraryToolbar
        view={view}
        onViewChange={changeView}
        bookCount={books.length}
        onImportFiles={() => void importFiles()}
        onImportFolder={() => void importFolder()}
        importing={importing}
        onCancelImport={() => {
          cancelImportRef.current = true
        }}
        coverProgress={coverProgress}
      />

      {detailBook && (
        <BookDetailPanel
          book={detailBook}
          coverUrl={covers[detailBook.id] ?? null}
          onClose={() => setDetailId(null)}
          onOpen={() => host.openReader(detailBook.id)}
          onDelete={() => void removeBook(detailBook.id)}
        />
      )}
    </section>
  )
}
