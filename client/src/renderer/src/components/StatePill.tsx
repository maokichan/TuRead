import type { ConnectionState } from '@core/domain/types'

const STATE_LABEL: Record<ConnectionState, string> = {
  connected: '已连接',
  disconnected: '未连接',
  reconnecting: '重连中'
}

const STATE_TEXT: Record<ConnectionState, string> = {
  connected: 'text-[var(--ok)] border-[var(--ok-border)]',
  disconnected: 'text-[var(--err)] border-[var(--err-border)]',
  reconnecting: 'text-[var(--warn)] border-[var(--warn-border)]'
}

const DOT_STYLE: Record<ConnectionState, string> = {
  connected: 'bg-[var(--ok)] shadow-[0_0_8px_var(--ok)]',
  disconnected: 'bg-[var(--err)]',
  reconnecting: 'bg-[var(--warn)] animate-pulse'
}

/** 连接状态胶囊 —— 纯展示 */
export function StatePill({ state }: { state: ConnectionState }): React.JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-[var(--muted)] ${STATE_TEXT[state]}`}
    >
      <i className={`h-2 w-2 rounded-full ${DOT_STYLE[state]}`} />
      {STATE_LABEL[state]}
    </span>
  )
}
