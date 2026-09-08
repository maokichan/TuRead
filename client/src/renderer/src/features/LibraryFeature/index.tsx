/**
 * 功能组件：书架（LibraryFeature）
 * 职责（编排的用例/端口）：books.*（导入/去重/列表/删除/选中）。
 * 对外状态：selectedBookId（经 host.selectBook 上报 Shell）。
 */
import { useCallback, useEffect, useState } from 'react'
import { IPC } from '@shared/ipc'
import type { BookRecord } from '@core/domain/types'
import type { FeatureProps } from '../types'
import { extToFormat } from '../util'
import { BookCard } from '../../components/BookCard'

export function LibraryFeature({
  container,
  host,
  selectedBookId,
  readerBookId
}: FeatureProps): React.JSX.Element {
  const [books, setBooks] = useState<BookRecord[]>([])
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null)

  useEffect(() => {
    void container.books.list().then(setBooks)
  }, [container])

  /** 导入路径：指纹去重（复用检测）、选中新书、刷新列表 */
  const importFromPath = useCallback(
    async (path: string, name?: string): Promise<BookRecord | null> => {
      try {
        const buffer = (await window.turead.invoke(IPC.fsReadFile, path)) as ArrayBuffer
        const displayName = name ?? path.split(/[\\/]/).pop() ?? path
        // 导入前快照书架 id 集合，用于区分「新导入」与「指纹命中复用」（BookService 内部按指纹去重）
        const beforeIds = new Set((await container.books.list()).map((b) => b.id))
        const book = await container.books.importBook(
          buffer,
          displayName,
          extToFormat(displayName),
          path
        )
        const reused = beforeIds.has(book.id)
        const list = await container.books.list()
        setBooks(list)
        host.selectBook(book.id)
        host.pushLog(
          reused
            ? `已在书架（指纹命中，复用）：${book.metadata.title}`
            : `已导入：${book.metadata.title}（${book.format}，${book.fingerprint.hash.slice(0, 10)}…）`
        )
        return book
      } catch (err) {
        host.pushLog(`导入失败：${(err as Error).message}`)
        return null
      }
    },
    [container, host]
  )

  /** 文件对话框导入 */
  const importBook = useCallback(async () => {
    try {
      const picked = (await window.turead.invoke(IPC.dialogPickBook)) as {
        path: string
        name: string
      } | null
      if (!picked) return
      await importFromPath(picked.path, picked.name)
    } catch (err) {
      host.pushLog(`导入失败：${(err as Error).message}`)
    }
  }, [importFromPath, host])

  const removeBook = useCallback(
    async (id: string) => {
      const book = books.find((b) => b.id === id)
      if (!book) return
      try {
        await container.books.remove(id)
        const list = await container.books.list()
        setBooks(list)
        if (selectedBookId === id) host.selectBook(null)
        host.pushLog(`已从书架移除：${book.metadata.title}`)
      } catch (err) {
        host.pushLog(`删除失败：${(err as Error).message}`)
      }
    },
    [books, selectedBookId, container, host]
  )

  const selectedBook = books.find((b) => b.id === selectedBookId)
  const bookOpened = readerBookId === selectedBookId

  return (
    <section className="flex h-full flex-col gap-3">
      <header className="flex items-center justify-between">
        <h2 className="m-0 text-[15px]">书架</h2>
        <button
          className="rounded-lg border border-[var(--border)] bg-[var(--accent-soft)] px-2.5 py-1 text-xs text-[var(--accent)] hover:bg-[var(--accent-strong)]"
          onClick={() => void importBook()}
        >
          ＋ 导入
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] p-2">
        {books.map((b) => (
          <BookCard
            key={b.id}
            book={b}
            active={b.id === selectedBookId}
            armed={confirmDelId === b.id}
            onSelect={() => {
              setConfirmDelId(null)
              host.selectBook(b.id)
            }}
            onDelete={() => {
              if (confirmDelId === b.id) void removeBook(b.id)
              else setConfirmDelId(b.id)
            }}
          />
        ))}
        {books.length === 0 && (
          <p className="m-0 py-4 text-center text-[12.5px] text-[var(--muted)]">
            书架为空，点「＋ 导入」添加一本电子书
          </p>
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-[var(--border-soft)] px-1 pt-2 text-[11.5px]">
        {selectedBook ? (
          <>
            <span className="truncate text-[var(--muted)]">
              已选：{selectedBook.metadata.title} · {(selectedBook.fingerprint.size / 1024).toFixed(0)} KB
            </span>
            <button
              className="rounded-lg border border-transparent bg-[var(--accent)] px-3 py-1.5 text-[13px] text-[var(--on-accent)] hover:brightness-110 disabled:opacity-40"
              onClick={() => host.openReader(selectedBook.id)}
              disabled={bookOpened}
            >
              打开阅读
            </button>
          </>
        ) : (
          <span className="text-[var(--muted)]">未选择书籍</span>
        )}
      </footer>
    </section>
  )
}
