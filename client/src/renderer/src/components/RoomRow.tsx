import type { RoomInfo } from '@core/domain/types'

interface RoomRowProps {
  room: RoomInfo
  onEnter: () => void
  /** 进房进行中禁点（审计 C-2：快速连点两行 = 并发 join 互相打架；用例层有代次守卫，这是 UI 侧的第一道） */
  disabled?: boolean
}

/** 大厅房间行（RoomFeature 大厅列表）—— 纯展示；点击整行进入。
 *  STYLE.md §5.1：大厅行是**导航文字**，不是按钮 —— 无边框/无底色，靠留白分行，
 *  hover 只做色温变化（五列对齐关系保持不变，便于扫读）。 */
export function RoomRow({ room, onEnter, disabled }: RoomRowProps): React.JSX.Element {
  return (
    <button
      onClick={onEnter}
      title="点击进入该房间"
      disabled={disabled}
      className="grid w-full grid-cols-[90px_1fr_56px_120px_70px] items-center gap-2.5 py-3 text-left text-[13px] text-[var(--muted)] transition-colors hover:text-[var(--text)] disabled:pointer-events-none disabled:opacity-40"
    >
      <span className="font-ui text-[12.5px]">{room.roomId}</span>
      <span className="truncate">{room.title || '无标题'}</span>
      <b className="justify-self-start font-ui text-[11px] font-bold tracking-label text-[var(--accent)]">
        {room.ext}
      </b>
      <span className="truncate">{room.ownerNick}</span>
      <span className="text-right">{room.memberCount} 人</span>
    </button>
  )
}
