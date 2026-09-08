/**
 * 功能组件：书架（LibraryFeature）
 * 职责（编排的用例/端口）：
 *   books.*   —— 列表/删除/选中/最近阅读
 *   picker.*  —— 选文件 / 选目录 / 扫描目录（可含子目录）/ 读文件（本地文件能力）
 *   imports.* —— 批量导入（用例：串行/进度/可取消/失败上报，v0.1.9 从本组件下沉）
 *   covers.*  —— 封面缩略图异步提取（进度/取消）
 * 对外状态：selectedBookId（经 host.selectBook 上报 Shell；详情抽屉显示的就是它）。
 * 依据：client/docs/FEATURES.md §10（书库重做）。
 *
 * 布局纪律：**状态栏之上是内容区，详情抽屉只在内容区弹出** —— 抽屉由内容区容器
 * `relative` 定位，因此不覆盖底部状态栏。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BookRecord, LibrarySettings, LibraryView } from '@core/domain/types'
import type { FeatureProps } from '../types'
import { forgetCover, getCoverUrl } from '../coverCache'
import { BookRow } from '../../components/BookRow'
import { BookTile } from '../../components/BookTile'
import { BookDetailPanel } from '../../components/BookDetailPanel'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { LibraryToolbar } from '../../components/LibraryToolbar'

const DEFAULT_SETTINGS: LibrarySettings = { view: 'list', importRecursive: false }

export function LibraryFeature({ container, host, selectedBookId }: FeatureProps): React.JSX.Element {
  const [books, setBooks] = useState<BookRecord[]>([])
  const [view, setView] = useState<LibraryView>(DEFAULT_SETTINGS.view)
  const [covers, setCovers] = useState<Record<string, string>>({})
  const [detailId, setDetailId] = useState<string | null>(null)
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null)
  const [coverProgress, setCoverProgress] = useState<{ done: number; total: number } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<BookRecord | null>(null)
  const [skipDeleteNotice, setSkipDeleteNotice] = useState(false)
  /** 本批导入成功的书 id（done 时一次性交给封面队列） */
  const importedIdsRef = useRef<string[]>([])

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
    void container.store
      .getSetting<{ skip?: boolean }>('deleteNotice', {})
      .then((s) => setSkipDeleteNotice(s.skip === true))
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

  // 导入事件 → 进度 / 失败日志 / 收尾（刷新列表 + 选中首本 + 入队封面）
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
        await refresh()
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
  }, [container, host, refresh])

  // 存量补封面：老书库里的书没有封面 → 后台补齐（dev 无头自检跳过，保持渲染验证确定性）
  useEffect(() => {
    if (window.turead.devBook) return
    void (async () => {
      const list = await container.books.list()
      const missing = list.filter((b) => !b.coverPath).map((b) => b.id)
      if (missing.length > 0) container.covers.enqueue(missing)
    })()
  }, [container])

  /** 切换视图并持久化（**局部更新**：主进程原子合并，不会冲掉设置界面管的 importRecursive） */
  const changeView = useCallback(
    (v: LibraryView) => {
      setView(v)
      void container.store.patchSetting('librarySettings', { view: v })
    },
    [container]
  )

  const importFiles = useCallback(async (): Promise<void> => {
    container.imports.enqueue(await container.picker.pickFiles())
  }, [container])

  const importFolder = useCallback(async (): Promise<void> => {
    const dir = await container.picker.pickDirectory()
    if (!dir) return
    // "是否含子目录"在设置界面配置 —— 这里每次导入时现读，避免跨 Feature 的变更通知问题
    const cfg = await container.store.getSetting<LibrarySettings>(
      'librarySettings',
      DEFAULT_SETTINGS
    )
    const recursive = cfg.importRecursive === true
    const paths = await container.picker.listEbooks(dir, recursive)
    if (paths.length === 0) {
      host.pushLog(`该目录下没有可导入的电子书：${dir}${recursive ? '（含子目录）' : '（仅此节点）'}`)
      return
    }
    container.imports.enqueue(paths)
  }, [container, host])

  const removeBook = useCallback(
    async (id: string): Promise<void> => {
      const book = books.find((b) => b.id === id)
      try {
        // 只删书库索引（不删源文件）；封面是我们生成的缓存，一并清理
        await container.books.remove(id)
        forgetCover(id)
        setDetailId((cur) => (cur === id ? null : cur))
        if (selectedBookId === id) host.selectBook(null)
        await refresh()
        host.pushLog(`已从书库移除：${book?.metadata.title ?? id}（源文件保留）`)
      } catch (err) {
        host.pushLog(`移除失败：${(err as Error).message}`)
      }
    },
    [books, container, host, refresh, selectedBookId]
  )

  /** 删除入口：首次弹确认（说明"只删索引、不删源文件"，可勾选不再提示） */
  const requestDelete = useCallback(
    (book: BookRecord) => {
      if (skipDeleteNotice) void removeBook(book.id)
      else setPendingDelete(book)
    },
    [removeBook, skipDeleteNotice]
  )

  const confirmDelete = useCallback(
    async (remembered: boolean): Promise<void> => {
      const target = pendingDelete
      setPendingDelete(null)
      if (!target) return
      if (remembered) {
        setSkipDeleteNotice(true)
        void container.store.patchSetting('deleteNotice', { skip: true })
      }
      await removeBook(target.id)
    },
    [container, pendingDelete, removeBook]
  )

  /** 单击 → 选中并弹详情（详情显示的书 = selectedBookId，单一真相） */
  const openDetail = useCallback(
    (id: string) => {
      host.selectBook(id)
      setDetailId(id)
    },
    [host]
  )

  /** 双击 / Enter → 打开阅读（同时收起抽屉，避免回到书库时还挂着上一本） */
  const openBook = useCallback(
    (id: string) => {
      setDetailId(null)
      host.openReader(id)
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
    onOpen: () => openBook(b.id),
    onDelete: () => requestDelete(b)
  })

  return (
    <section className="flex h-full flex-col gap-3">
      {/* 内容区：抽屉的定位上下文（抽屉只在这里弹出，不覆盖下方状态栏） */}
      <div className="relative min-h-0 flex-1">
        <div className="h-full overflow-y-auto pr-1">
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

        {detailBook && (
          <BookDetailPanel
            book={detailBook}
            coverUrl={covers[detailBook.id] ?? null}
            onClose={() => setDetailId(null)}
            onOpen={() => openBook(detailBook.id)}
            onDelete={() => requestDelete(detailBook)}
          />
        )}
      </div>

      <LibraryToolbar
        view={view}
        onViewChange={changeView}
        bookCount={books.length}
        onImportFiles={() => void importFiles()}
        onImportFolder={() => void importFolder()}
        importing={importing}
        onCancelImport={() => container.imports.cancel()}
        coverProgress={coverProgress}
      />

      {pendingDelete && (
        <ConfirmDialog
          title="从书库移除？"
          message={`《${pendingDelete.metadata.title || '未命名'}》只会从书库索引中移除，源文件不会被删除。`}
          confirmLabel="移除"
          rememberLabel="下次不再提示"
          onConfirm={(remembered) => void confirmDelete(remembered)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  )
}
