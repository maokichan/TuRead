import type { RoomInfo } from '@core/domain/types'

interface RoomRowProps {
  room: RoomInfo
  onEnter: () => void
}

/** 大厅房间行（RoomFeature 大厅列表）—— 纯展示；点击整行进入。
 *  STYLE.md §5.1：大厅行是**导航文字**，不是按钮 —— 无边框/无底色，靠留白分行，
 *  hover 只做色温变化（五列对齐关系保持不变，便于扫读）。 */
export function RoomRow({ room, onEnter }: RoomRowProps): React.JSX.Element {
  return (
    <button
      onClick={onEnter}
      title="点击进入该房间"
      className="grid w-full grid-cols-[90px_1fr_56px_120px_70px] items-center gap-2.5 py-3 text-left text-[13px] text-[var(--muted)] transition-colors hover:text-[var(--text)]"
    >
      <span className="font-[var(--mono)] text-[12px]">{room.roomId}</span>
      <span className="truncate">{room.title || '无标题'}</span>
      <b className="justify-self-start font-[var(--mono)] text-[9.5px] font-bold tracking-[0.4px] text-[var(--accent)]">
        {room.ext}
      </b>
      <span className="truncate">{room.ownerNick}</span>
      <span className="text-right">{room.memberCount} 人</span>
    </button>
  )
}
