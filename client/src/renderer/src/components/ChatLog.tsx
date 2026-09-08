import type { ChatMessage } from '@core/domain/types'

/** 聊天记录（RoomFeature 会话视图）—— 纯展示 */
export function ChatLog({ messages }: { messages: ChatMessage[] }): React.JSX.Element {
  return (
    <div className="max-h-[240px] min-h-[110px] overflow-y-auto rounded-xl border border-[var(--border-soft)] px-3 py-2.5">
      {messages.length === 0 && (
        <p className="m-0 py-4 text-center text-[12.5px] text-[var(--muted)]">（还没有消息）</p>
      )}
      {messages.map((c) => (
        <div key={c.id} className="flex items-baseline gap-2 py-0.5 text-[13px]">
          <b className="flex-none text-[var(--accent)]">{c.nick}</b>
          <span className="min-w-0 break-words">{c.text}</span>
          <span className="ml-auto flex-none font-[var(--mono)] text-[10.5px] text-[var(--muted)]">
            #{c.id}
          </span>
        </div>
      ))}
    </div>
  )
}
