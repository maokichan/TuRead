/**
 * DocumentsFeature —— **文檔（vault）**（笔记 v3 批N5；契约 = features/documents.md）。
 *
 * 定位：文档层 = 建立在阅读之上的**生产管道**末端——消费内容 → 生产笔记 → 生产文档。
 * 红线：**不取代 Obsidian**——本组件是 vault 的轻量管理面（列表 + 三态编辑器），
 * 双向流通的真接口是"真实 .md 文件 + 在 Obsidian 中打开"。
 *
 * 编辑器三态（决策笔记矩阵）：**源碼**（textarea）/ **預覽**（渲染子集）/
 * **所見即所得**（contenteditable + 失焦序列化回源码——源码是唯一真相，所见即所得是它的视图）。
 * 生成的档案文件节标题 = `note-<id>`（汇编引用的解析目标）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { IPC } from '@shared/ipc'
import type { NoteListItem } from '@core/ports/store'
import type { FeatureProps } from '../types'
import { renderNoteMarkdown, markdownToDom, markdownFromDom } from '../../components/noteMarkdown'
import { buildArchiveMd, freeVaultName, safeVaultName } from './notesDocs'

type EditorMode = 'source' | 'preview' | 'wysiwyg'

const MODE_LABEL: Record<EditorMode, string> = { source: '源碼', preview: '預覽', wysiwyg: '所見即所得' }
const MODE_ORDER: EditorMode[] = ['source', 'preview', 'wysiwyg']

export function DocumentsFeature({ container, host, activeFeature }: FeatureProps): React.JSX.Element {
  const [files, setFiles] = useState<string[]>([])
  const [current, setCurrent] = useState<{ name: string; content: string; saved: string } | null>(null)
  const [mode, setMode] = useState<EditorMode>('source')
  const [hint, setHint] = useState<string | null>(null)
  const editableRef = useRef<HTMLDivElement | null>(null)
  const active = activeFeature === 'documents'

  const refreshList = useCallback(async (): Promise<string[]> => {
    const list = (await window.turead.invoke(IPC.vaultList)) as string[]
    setFiles(list)
    return list
  }, [])

  useEffect(() => {
    if (active) void refreshList()
  }, [active, refreshList])

  const flashHint = useCallback((msg: string): void => {
    setHint(msg)
    window.setTimeout(() => setHint(null), 2000)
  }, [])

  const openFile = useCallback(
    async (name: string): Promise<void> => {
      const content = (await window.turead.invoke(IPC.vaultRead, { name })) as string
      setMode('source')
      setCurrent({ name, content, saved: content })
    },
    []
  )

  const save = useCallback(async (): Promise<void> => {
    if (!current) return
    await window.turead.invoke(IPC.vaultWrite, { name: current.name, content: current.content })
    setCurrent({ ...current, saved: current.content })
    flashHint(`已儲存 ${current.name}`)
  }, [current, flashHint])

  const newDoc = useCallback(async (): Promise<void> => {
    const list = await refreshList()
    const name = freeVaultName('未命名', list)
    await window.turead.invoke(IPC.vaultWrite, { name, content: `# 未命名\n\n` })
    await refreshList()
    await openFile(name)
  }, [refreshList, openFile])

  /** 生成笔记档案：全部库的笔记按书分组，每书一份（生成物，重生成整体覆盖）。 */
  const generateArchives = useCallback(async (): Promise<void> => {
    const all = await container.store.listAllNotes()
    const byEdition = new Map<string, NoteListItem[]>()
    for (const it of all) {
      const list = byEdition.get(it.note.editionId) ?? []
      list.push(it)
      byEdition.set(it.note.editionId, list)
    }
    if (byEdition.size === 0) {
      flashHint('沒有筆記可生成檔案')
      return
    }
    const list = await refreshList()
    let written = 0
    for (const [editionId, items] of byEdition) {
      const name = freeVaultName(safeVaultName(`檔案 · ${items[0].editionTitle}`).replace(/\.md$/, ''), list)
      await window.turead.invoke(IPC.vaultWrite, { name, content: buildArchiveMd(items[0].editionTitle, editionId, items) })
      list.push(name)
      written += 1
    }
    await refreshList()
    flashHint(`已生成 ${written} 份筆記檔案`)
  }, [container, refreshList, flashHint])

  const dirty = current !== null && current.content !== current.saved

  /** 所見即所得 ↔ 源码的边界：进入时从源码建 DOM，失焦/切走时序列化回源码（源码 = 唯一真相） */
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
      const el = editableRef.current
      el.replaceChildren(markdownToDom(current.content, document))
    }
    // current.content 只在进入 wysiwyg 时作为初值（编辑期的 state 更新不重建 DOM，防光标跳动）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏：动作区（文字即界面） */}
      <div className="flex flex-none items-center gap-7 border-b border-[var(--border)] px-8 py-3 text-[12.5px]">
        <button className="text-action" onClick={() => void newDoc()}>
          新建文檔
        </button>
        <button className="text-action" onClick={() => void generateArchives()}>
          生成筆記檔案
        </button>
        <button
          className="text-action"
          onClick={() => void window.turead.invoke(IPC.vaultReveal)}
          title="打开 vault 目录（Obsidian 可直接打开它）"
        >
          在檔案管理器打開
        </button>
        {hint && <span className="text-[var(--muted)]">{hint}</span>}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 文件列表 */}
        <aside className="w-56 flex-none overflow-y-auto border-r border-[var(--border)] px-4 py-4">
          {files.length === 0 && (
            <p className="text-[12.5px] text-[var(--muted)]">vault 還沒有文檔——新建，或先生成筆記檔案。</p>
          )}
          <ul>
            {files.map((f) => (
              <li key={f}>
                <button
                  className={`block w-full truncate py-1 text-left text-[13px] ${
                    current?.name === f ? 'text-[var(--fg)]' : 'text-[var(--muted)] hover:text-[var(--fg)]'
                  }`}
                  onClick={() => void openFile(f)}
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
    </div>
  )
}
