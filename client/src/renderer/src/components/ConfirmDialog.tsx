import { useEffect, useState } from 'react'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** 可勾选的"不再提示"；勾选结果随 onConfirm 回传，由调用方持久化 */
  rememberLabel?: string
  onConfirm: (remembered: boolean) => void
  onCancel: () => void
}

/** 确认弹窗（纯展示）：Esc / 点遮罩 = 取消 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  rememberLabel,
  onConfirm,
  onCancel
}: ConfirmDialogProps): React.JSX.Element {
  const [remembered, setRemembered] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[380px] rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-2xl"
      >
        <h3 className="m-0 text-[14px] font-semibold">{title}</h3>
        <p className="mt-2 mb-0 text-[12.5px] leading-relaxed text-[var(--muted)]">{message}</p>

        {rememberLabel && (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12px] text-[var(--muted)]">
            <input
              type="checkbox"
              checked={remembered}
              onChange={(e) => setRemembered(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            {rememberLabel}
          </label>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-[13px] text-[var(--muted)] hover:text-[var(--text)]"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => onConfirm(remembered)}
            className="rounded-lg border border-transparent bg-[var(--accent)] px-3 py-1.5 text-[13px] text-[var(--on-accent)] hover:brightness-110"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
