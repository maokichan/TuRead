/**
 * 書庫管理弹窗（2026-09-13 用户立项：参考 Obsidian 仓库管理页）。
 *
 * 职能：库列表（点击切换，当前标「當前」）/ 新建（行内输入命名）/ 更名（行内编辑）/
 * 「所在文件夾」（系统文件管理器高亮 .db，路径管理 = 引导文件持有路径，这里只显示与揭示）。
 * 移除引用不在本弹窗（语义待定，见 TODO「书库管理完善」）。
 *
 * 风格：ConfirmDialog 同款骨架（遮罩点击/Esc 关闭、面板 = token 边框 + panel 底），
 * 行内操作一律文字按钮（STYLE.md：文字即界面）。列表打开时现取（库可能随时被建/切/更名）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LibraryEntry } from '@core/domain/types'
import { IPC } from '@shared/ipc'

interface LibraryManagerDialogProps {
  onClose: () => void
  listLibraries: () => Promise<{ libraries: LibraryEntry[]; currentId: string }>
  onSwitch: (id: string) => Promise<void>
  onCreate: (name: string) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
}

export function LibraryManagerDialog({
  onClose,
  listLibraries,
  onSwitch,
  onCreate,
  onRename
}: LibraryManagerDialogProps): React.JSX.Element {
  const [libs, setLibs] = useState<{ libraries: LibraryEntry[]; currentId: string } | null>(null)
  /** 行内更名的目标库 id（null = 无） */
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  /** 新建行的开合与草稿 */
  const [creating, setCreating] = useState(false)
  const [createDraft, setCreateDraft] = useState('')

  const refresh = useCallback(async () => {
    setLibs(await listLibraries())
  }, [listLibraries])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const startRename = (l: LibraryEntry): void => {
    setCreating(false)
    setRenamingId(l.id)
    setRenameDraft(l.name)
  }

  const commitRename = async (): Promise<void> => {
    if (!renamingId) return
    if (renameDraft.trim()) {
      await onRename(renamingId, renameDraft)
    }
    setRenamingId(null)
    await refresh()
  }

  const commitCreate = async (): Promise<void> => {
    await onCreate(createDraft)
    setCreating(false)
    setCreateDraft('')
    await refresh()
  }

  const rowActions = (l: LibraryEntry, isCurrent: boolean): React.JSX.Element => (
    <div className="flex flex-none items-center gap-4">
      {!isCurrent && (
        <button
          onClick={() => void onSwitch(l.id).then(onClose)}
          className="text-action"
          title="切换到该書庫"
        >
          切換
        </button>
      )}
      <button
        onClick={() => startRename(l)}
        disabled={renamingId === l.id}
        className="text-action"
      >
        更名
      </button>
      <button
        onClick={() => void window.turead.invoke(IPC.fsShowInFolder, { libraryId: l.id })}
        className="text-action"
        title="在文件管理器中显示该書庫的 .db 文件"
      >
        所在文件夾
      </button>
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[70vh] w-full max-w-[560px] flex-col rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-2xl"
      >
        <h3 className="m-0 text-[14px] font-semibold">書庫管理</h3>
        <p className="mt-1 mb-3 text-[12px] text-[var(--muted)]">
          每個書庫是一份獨立的庫（一個 .db 文件）；點擊書庫名切換。
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {(libs?.libraries ?? []).map((l) => {
            const isCurrent = l.id === libs?.currentId
            return (
              <div
                key={l.id}
                className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-2 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  {renamingId === l.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void commitRename()
                          if (e.key === 'Escape') setRenamingId(null)
                        }}
                        className="h-7 w-full rounded-sm border border-[var(--border)] bg-[var(--bg)] px-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
                      />
                      <button onClick={() => void commitRename()} className="text-action text-action--primary">
                        確認
                      </button>
                      <button onClick={() => setRenamingId(null)} className="text-action">
                        取消
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => void onSwitch(l.id).then(onClose)}
                          disabled={isCurrent}
                          className={`truncate text-[13.5px] ${
                            isCurrent
                              ? 'cursor-default font-semibold text-[var(--text)]'
                              : 'text-[var(--text)] hover:text-[var(--accent)]'
                          }`}
                          title={isCurrent ? '當前書庫' : `切换到「${l.name}」`}
                        >
                          {l.name}
                          {isCurrent && '　·　當前'}
                        </button>
                      </div>
                      <div className="mt-0.5 truncate text-[11.5px] text-[var(--muted)]" title={l.dbPath}>
                        {l.dbPath}
                      </div>
                    </>
                  )}
                </div>
                {renamingId !== l.id && rowActions(l, isCurrent)}
              </div>
            )
          })}

          {/* 新建行（行内输入命名，确认后即建即切） */}
          {creating ? (
            <div className="flex items-center gap-2 pt-3">
              <input
                autoFocus
                value={createDraft}
                placeholder="新書庫名稱"
                onChange={(e) => setCreateDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commitCreate()
                  if (e.key === 'Escape') setCreating(false)
                }}
                className="h-7 w-full rounded-sm border border-[var(--border)] bg-[var(--bg)] px-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
              />
              <button onClick={() => void commitCreate()} className="text-action text-action--primary">
                建立
              </button>
              <button onClick={() => setCreating(false)} className="text-action">
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setRenamingId(null)
                setCreating(true)
              }}
              className="mt-3 text-action text-action--primary"
            >
              ＋ 新建書庫
            </button>
          )}
        </div>

        <div className="mt-3 flex justify-end">
          <button onClick={onClose} className="text-action">
            關閉
          </button>
        </div>
      </div>
    </div>
  )
}
