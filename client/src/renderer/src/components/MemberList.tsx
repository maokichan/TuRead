import type { RoomMember } from '@core/domain/types'

/** 成员列表（RoomFeature 会话视图）—— 纯展示 */
export function MemberList({ members }: { members: RoomMember[] }): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      {members.map((m) => (
        <span
          key={m.id}
          className={`rounded-full border px-2.5 py-1 text-[12px] ${
            m.isMe
              ? 'border-[var(--accent-ring)] text-[var(--accent)]'
              : 'border-[var(--border)] text-[var(--muted)]'
          }`}
        >
          {m.nickName}
          {m.isMe ? '（我）' : ''}
        </span>
      ))}
      {members.length === 0 && <span className="text-[12px] text-[var(--muted)]">（无）</span>}
    </div>
  )
}
