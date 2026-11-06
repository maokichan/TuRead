/**
 * DocumentsPanel —— 筆記区内的**文档视图**（笔记 v3；文档 = 消费笔记所生产的内容，
 * 归笔记区管，不是独立功能——侧栏不设「文檔」，由「筆」的工具栏切入）。
 *
 * 定位红线：**不取代 Obsidian**。vault = 真实 .md 文件目录，这是双向流通的物质基础；
 * 「打開 vault 資料夾」就是把目录交给系统/Obsidian 的那一下，不是什么"文件管理器"。
 *
 * 两类文件（决策笔记 notes-v3-data-model「文档层」）：**彙編**（用户所有，
 * `![[note-<id>]]` 引用笔记）与**筆記檔案**（生成物，每书一份、节标题 = note-<id> =
 * 引用解析目标；重生成整体覆盖）。编辑器三态：源碼 / 預覽 / 所見即所得——
 * **源码是唯一真相**，所见即所得失焦/切态时序列化回源码。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { IPC } from '@shared/ipc'
import type { NoteListItem } from '@core/ports/store'
import type { ServiceContainer } from '@core/container'
import { renderNoteMarkdown, markdownToDom, markdownFromDom } from '../../components/noteMarkdown'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu'
import { buildArchiveMd, freeVaultName, safeVaultName } from './notesDocs'

type EditorMode = 'source' | 'preview' | 'wysiwyg'

const MODE_LABEL: Record<EditorMode, string> = { source: '源碼', preview: '預覽', wysiwyg: '所見即所得' }
const MODE_ORDER: EditorMode[] = ['source', 'preview', 'wysiwyg']

export function DocumentsPanel({
  container
}: {
  container: ServiceContainer
}): React.JSX.Element {
  const [files, setFiles] = useState<string[]>([])
  const [current, setCurrent] = useState<{ name: string; content: string; saved: string } | null>(null)
  const [mode, setMode] = useState<EditorMode>('source')
  const [hint, setHint] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; name: string } | null>(null)
  const editableRef = useRef<HTMLDivElement | null>(null)

  const flashHint = useCallback((msg: string): void => {
    setHint(msg)
    window.setTimeout(() => setHint(() => null), 2000)
  }, [])

  const refreshList = useCallback(async (): Promise<string[]> => {
    const list = (await window.turead.invoke(IPC.vaultList)) as string[]
    setFiles(list)
    return list
  }, [])

  useEffect(() => {
    void refreshList()
  }, [refreshList])

  const openFile = useCallback(async (name: string): Promise<void> => {
    const content = (await window.turead.invoke(IPC.vaultRead, { name })) as string
    setMode('source')
    setCurrent({ name, content, saved: content })
  }, [])

  const save = useCallback(async (): Promise<void> => {
    if (!current) return
    await window.turead.invoke(IPC.vaultWrite, { name: current.name, content: current.content })
    setCurrent({ ...current, saved: current.content })
    flashHint(`已儲存 ${current.name.replace(/\.md$/, '')}`)
  }, [current, flashHint])

  const newDoc = useCallback(async (): Promise<void> => {
    const list = await refreshList()
    const name = freeVaultName('未命名', list)
    await window.turead.invoke(IPC.vaultWrite, { name, content: '# 未命名\n\n' })
    await refreshList()
    await openFile(name)
  }, [refreshList, openFile])

  const deleteFile = useCallback(
    async (name: string): Promise<void> => {
      await window.turead.invoke(IPC.vaultDelete, { name })
      if (current?.name === name) setCurrent(null)
      await refreshList()
      flashHint(`已刪除 ${name.replace(/\.md$/, '')}`)
    },
    [current, refreshList, flashHint]
  )

  /** 匯出筆記檔案：全部笔记按书分组，每书一份 .md（节标题 = note-<id>，汇编引用的解析目标）。 */
  const exportArchives = useCallback(async (): Promise<void> => {
    const all = await container.store.listAllNotes()
    const byEdition = new Map<string, NoteListItem[]>()
    for (const it of all) {
      const list = byEdition.get(it.note.editionId) ?? []
      list.push(it)
      byEdition.set(it.note.editionId, list)
    }
    if (byEdition.size === 0) {
      flashHint('還沒有筆記可匯出')
      return
    }
    const taken = await refreshList()
    let written = 0
    for (const [editionId, items] of byEdition) {
      // 檔案是生成物：同名固定 → 整体覆盖（重生成语义），不做防撞名
      const name = safeVaultName(`檔案 · ${items[0].editionTitle}`)
      await window.turead.invoke(IPC.vaultWrite, {
        name,
        content: buildArchiveMd(items[0].editionTitle, editionId, items)
      })
      if (!taken.includes(name)) taken.push(name)
      written += 1
    }
    await refreshList()
    flashHint(`已匯出 ${written} 份筆記檔案`)
  }, [container, refreshList, flashHint])

  const dirty = current !== null && current.content !== current.saved

  /** 所見即所得 ↔ 源码的边界：进入时从源码建 DOM，失焦/切走时序列化回源码 */
  const applyMode = useCallback(
    (next: EditorMode): void => {
      if (next === mode) return
      if (mode === 'wysiwyg' && editableRef.current) {
        const md = markdownFromDom(editableRef.current)
        setCurrent((c) => (c ? { ...c, content: md } : c))
      }
      setMode(next)
    },
    [mode]
  )

  useEffect(() => {
    if (mode === 'wysiwyg' && editableRef.current && current) {
      editableRef.current.replaceChildren(markdownToDom(current.content, document))
    }
    // current.content 只在进入 wysiwyg 时作初值（编辑期不重建 DOM，防光标跳动）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  return (
    <div className="flex h-full flex-col">
      {/* 动作区：文字即界面，动作可读 */}
      <div className="flex flex-none items-center gap-7 border-b border-[var(--border)] px-8 py-3 text-[12.5px]">
        <button className="text-action" onClick={() => void newDoc()}>
          新建文檔
        </button>
        <button className="text-action" onClick={() => void exportArchives()} title="把全部笔记按书导出成 .md（节标题 = 笔记引用的目标；Obsidian 里汇编的引用由此解析）">
          匯出筆記檔案
        </button>
        <button
          className="text-action"
          onClick={() => void window.turead.invoke(IPC.vaultReveal)}
          title="在系统資料夾中打开 vault——用 Obsidian 打开这个資料夾即可双向流通"
        >
          打開 vault 資料夾
        </button>
        {hint && <span className="text-[var(--muted)]">{hint}</span>}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 文件列表（右键 = 刪除） */}
        <aside className="w-56 flex-none overflow-y-auto border-r border-[var(--border)] px-4 py-4">
          {files.length === 0 && (
            <p className="text-[12.5px] leading-6 text-[var(--muted)]">
              還沒有文檔。新建一份，或「匯出筆記檔案」。
            </p>
          )}
          <ul>
            {files.map((f) => (
              <li key={f}>
                <button
                  className={`block w-full truncate py-1 text-left text-[13px] ${
                    current?.name === f ? 'text-[var(--fg)]' : 'text-[var(--muted)] hover:text-[var(--fg)]'
                  }`}
                  onClick={() => void openFile(f)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenu({ x: e.clientX, y: e.clientY, name: f })
                  }}
                >
                  {f.replace(/\.md$/, '')}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* 编辑区 */}
        {current ? (
          <section className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-none items-center gap-7 border-b border-[var(--border)] px-8 py-2 text-[12.5px]">
              <span className="truncate text-[var(--fg)]">{current.name.replace(/\.md$/, '')}</span>
              {MODE_ORDER.map((m) => (
                <button
                  key={m}
                  className={m === mode ? 'text-[var(--fg)]' : 'text-action'}
                  onClick={() => applyMode(m)}
                >
                  {MODE_LABEL[m]}
                </button>
              ))}
              <span className="flex-1" />
              {dirty && (
                <button className="text-action" onClick={() => void save()}>
                  儲存
                </button>
              )}
              {dirty && <span className="text-[var(--muted)]">未儲存</span>}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-10 py-6">
              {mode === 'source' && (
                <textarea
                  className="h-full w-full resize-none bg-transparent text-[14px] leading-7 text-[var(--fg)] outline-none"
                  value={current.content}
                  onChange={(e) => setCurrent({ ...current, content: e.target.value })}
                  spellCheck={false}
                />
              )}
              {mode === 'preview' && (
                <div className="note-doc text-[14px] leading-7 text-[var(--fg)]">
                  {renderNoteMarkdown(current.content)}
                </div>
              )}
              {mode === 'wysiwyg' && (
                <div
                  ref={editableRef}
                  className="note-doc min-h-full text-[14px] leading-7 text-[var(--fg)] outline-none"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={() => {
                    if (editableRef.current) {
                      const md = markdownFromDom(editableRef.current)
                      setCurrent((c) => (c ? { ...c, content: md } : c))
                    }
                  }}
                />
              )}
            </div>
          </section>
        ) : (
          <section className="flex flex-1 items-center justify-center">
            <p className="text-[13px] text-[var(--muted)]">左側選一個文檔，或新建。</p>
          </section>
        )}
      </div>

      {/* 文件右键菜单（刪除）——标准 ContextMenu 容器（视觉/关闭语义与全局同源） */}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={
            [
              {
                label: '刪除',
                onClick: () => setPendingDelete(menu.name)
              }
            ] satisfies ContextMenuItem[]
          }
          onClose={() => setMenu(null)}
        />
      )}
      {pendingDelete && (
        <ConfirmDialog
          title="刪除文檔"
          message={`「${pendingDelete.replace(/\.md$/, '')}」将被删除，不可恢复。`}
          confirmLabel="刪除"
          onConfirm={() => {
            void deleteFile(pendingDelete)
            setPendingDelete(null)
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
