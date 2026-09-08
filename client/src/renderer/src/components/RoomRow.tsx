import type { RoomInfo } from '@core/domain/types'

interface RoomRowProps {
  room: RoomInfo
  onEnter: () => void
}

/** 大厅房间行（RoomFeature 大厅列表）—— 纯展示；点击整行进入 */
export function RoomRow({ room, onEnter }: RoomRowProps): React.JSX.Element {
  return (
    <button
      onClick={onEnter}
      title="点击进入该房间"
      className="grid w-full grid-cols-[90px_1fr_56px_120px_70px] items-center gap-2.5 border-b border-[var(--border-soft)] px-3.5 py-2 text-left text-[13px] last:border-b-0 hover:bg-[var(--panel-2)]"
    >
      <span className="font-[var(--mono)] text-[12px]">{room.roomId}</span>
      <span className="truncate">{room.title || '无标题'}</span>
      <b className="justify-self-start rounded border border-[var(--border)] bg-[var(--badge-bg)] px-1 text-[9.5px] font-bold tracking-[0.4px] text-[var(--accent)]">
        {room.ext}
      </b>
      <span className="truncate text-[var(--muted)]">{room.ownerNick}</span>
      <span className="text-right text-[var(--muted)]">{room.memberCount} 人</span>
    </button>
  )
}
