/**
 * DocumentsPanel —— 筆記区内的**文档视图**（笔记 v3；文档 = 消费笔记所生产的内容，
 * 归笔记区管，不是独立功能——侧栏不设「文檔」，由「筆」的工具栏切入）。
 *
 * 定位红线：**不取代 Obsidian**。vault = 真实 .md 文件目录，这是双向流通的物质基础；
 * 「打開 vault 資料夾」就是把目录交给系统/Obsidian 的那一下。
 *
 * 两类文件（决策笔记 notes-v3-data-model「文档层」）：**彙編**（用户所有，
 * `![[note-<id>]]` 引用笔记）与**筆記檔案**（生成物，每书一份、节标题 = note-<id> =
 * 引用解析目标；重生成整体覆盖）。
 *
 * 编辑器三态（CodeMirror 6）：**源碼**（裸源码）/ **實時**（Live Preview——非光标块
 * 实时渲染，同一实例 compartment 切换）/ **預覽**（renderNoteMarkdown 只读）。
 * 源码（CM6 doc）是唯一真相，经 updateListener 单向同步回 state。
 *
 * 收注意力（用户定）：编辑器获得焦点 → 文件列表收起（编辑头「清單」唤回）——
 * 编辑时注意力面就是一张纸。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { autocompletion } from '@codemirror/autocomplete'
import { IPC } from '@shared/ipc'
import type { NoteListItem } from '@core/ports/store'
import type { ServiceContainer } from '@core/container'
import type { FeatureHost } from '../types'
import { renderNoteMarkdown } from '../../components/noteMarkdown'
import { createMdEditor, type MdEditorHandle } from '../../components/mdEditor'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu'
import { buildArchiveMd, freeVaultName, safeVaultName } from './notesDocs'
import { noteRefCompletion, type NoteRefCandidate } from './noteRefCompletion'

type EditorMode = 'source' | 'live' | 'preview'

const MODE_LABEL: Record<EditorMode, string> = { source: '源碼', live: '實時', preview: '預覽' }
const MODE_ORDER: EditorMode[] = ['source', 'live', 'preview']

export function DocumentsPanel({
  container,
  host
}: {
  container: ServiceContainer
  host: FeatureHost
}): React.JSX.Element {
  const [files, setFiles] = useState<string[]>([])
  const [current, setCurrent] = useState<{ name: string; content: string; saved: string } | null>(null)
  const [mode, setMode] = useState<EditorMode>('source')
  const [hint, setHint] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; name: string } | null>(null)
  /** 收注意力：编辑器聚焦 → 列表收起；「清單」按钮唤回 */
  const [listOpen, setListOpen] = useState(true)

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

  // ————— 笔记索引（@ 补全候选 + 引用点击解引用的**同一份缓存**）—————
  /** listAllNotes 全量（挂载即拉；匯出档案时顺带刷新——一次拉取，两处共用） */
  const [noteItems, setNoteItems] = useState<NoteListItem[]>([])
  const loadNotes = useCallback(async (): Promise<NoteListItem[]> => {
    const all = await container.store.listAllNotes()
    setNoteItems(all)
    return all
  }, [container])

  useEffect(() => {
    void loadNotes()
  }, [loadNotes])

  const openFile = useCallback(async (name: string): Promise<void> => {
    const content = (await window.turead.invoke(IPC.vaultRead, { name })) as string
    setMode('source')
    setListOpen(true)
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
    const all = await loadNotes()
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
  }, [loadNotes, refreshList, flashHint])

  // ————— 引用点击解引用（预览容器委托 + 编辑器经 onNoteRefClick 上抛）—————
  /** noteId（`note-<uuid>` 或裸 uuid）→ 笔记 → 带目标打开阅读器；找不到 = 提示（缺失可见）。 */
  const openNoteRef = useCallback(
    (noteId: string): void => {
      const id = noteId.startsWith('note-') ? noteId.slice('note-'.length) : noteId
      const hit = noteItems.find((it) => it.note.id === id)
      if (!hit) {
        flashHint('引用的筆記不存在')
        return
      }
      host.openReader(hit.note.editionId, { revealNoteId: hit.note.id })
    },
    [noteItems, host, flashHint]
  )

  const onRefClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): void => {
      const el = (e.target as HTMLElement | null)?.closest?.('[data-note-ref]')
      if (el instanceof HTMLElement) {
        e.preventDefault()
        openNoteRef(el.getAttribute('data-note-ref') ?? '')
      }
    },
    [openNoteRef]
  )

  // ————— @ 补全（候选随 listAllNotes 刷新，经 setExtra 重配进编辑器）—————
  /** 候选投影：过滤面 = excerpt / body / editionTitle（见 noteRefCompletion） */
  const noteCandidates = useMemo<NoteRefCandidate[]>(
    () =>
      noteItems.map((it) => ({
        id: it.note.id,
        editionId: it.note.editionId,
        editionTitle: it.editionTitle,
        chapterIndex: it.note.anchor.norm.chapterIndex,
        excerpt: it.note.anchor.norm.quote.exact,
        body: it.note.body
      })),
    [noteItems]
  )
  const noteRefExtra = useMemo(
    () => [autocompletion({ override: [noteRefCompletion(noteCandidates)] })],
    [noteCandidates]
  )

  // ————— CodeMirror 6 编辑器（源碼/實時同一实例；預覽 = renderNoteMarkdown）—————
  const editorHostRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<MdEditorHandle | null>(null)
  /** 编辑器当前属于哪个文件（换文件 = 重建；undo 栈随之清——跨文件撤销本就该断） */
  const editorFileRef = useRef<string | null>(null)

  useEffect(() => {
    if (!current) {
      editorRef.current?.destroy()
      editorRef.current = null
      editorFileRef.current = null
      return
    }
    if (editorFileRef.current === current.name || !editorHostRef.current) return
    editorRef.current?.destroy()
    const handle = createMdEditor({
      parent: editorHostRef.current,
      doc: current.content,
      live: mode === 'live',
      onChange: (text) => setCurrent((c) => (c ? { ...c, content: text } : c)),
      onNoteRefClick: openNoteRef,
      extra: noteRefExtra
    })
    // 编辑器聚焦 = 注意力进文档 → 文件列表收起（「清單」按钮唤回）
    handle.view.dom.addEventListener('focusin', () => setListOpen(false))
    editorRef.current = handle
    editorFileRef.current = current.name
    if (mode === 'preview') setMode('source')
    // mode/noteRefExtra 变化另行处理（下方两个 effect），这里只跟文件绑定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.name])

  /** 补全候选异步加载/刷新 → 重配进编辑器（empty → loaded → exportArchives 刷新都覆盖） */
  useEffect(() => {
    editorRef.current?.setExtra(noteRefExtra)
  }, [noteRefExtra])

  const dirty = current !== null && current.content !== current.saved

  /** 切态：源碼 ⇄ 實時 = compartment 切 Live Preview（同一实例）；进/出預覽 = 显隐编辑器 */
  const applyMode = useCallback(
    (next: EditorMode): void => {
      if (next === mode) return
      if (next !== 'preview') {
        editorRef.current?.setDoc(current?.content ?? '')
        editorRef.current?.setLive(next === 'live')
        editorRef.current?.focus()
      }
      setMode(next)
    },
    [mode, current]
  )

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
        {/* 文件列表（右键 = 刪除）：编辑器聚焦时收起（收注意力），「清單」唤回 */}
        <aside
          className="docs-aside flex-none overflow-y-auto border-r border-[var(--border)] px-4 py-4"
          data-open={listOpen || undefined}
        >
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
              <button
                className="text-action"
                onClick={() => setListOpen((v) => !v)}
                title="文件列表收起/展开（编辑器聚焦时自动收起）"
              >
                清單
              </button>
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
              {/* 编辑器宿主：source/live 共用同一 CM6 实例；preview 时隐藏（状态保留） */}
              <div
                ref={editorHostRef}
                className="md-editor h-full text-[14px] text-[var(--fg)]"
                style={{ display: mode === 'preview' ? 'none' : undefined }}
              />
              {mode === 'preview' && (
                <div className="note-doc h-full text-[14px] leading-7 text-[var(--fg)]" onClick={onRefClick}>
                  {renderNoteMarkdown(current.content)}
                </div>
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
