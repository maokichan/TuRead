/**
 * 批注输入（挂载线形态，2026-09-14）—— 高亮/批注的**文字内容**在这里写。
 *
 * 形态与右键菜单同源（`ContextMenu` 的挂载线语汇）：一条横线 + 自线下方生长出的输入区，
 * **无圆角无阴影**。理由见 `STYLE.md` §3.4（内容与背景靠颜色区分）。
 *
 * **受控组件**（`value` + `onChange`）：正文 state 由调用方（ReaderFeature）持有。
 * 为什么不让组件自己存：用户要的"手不离开键盘做笔记"链条需要**从外部提交**（将来配键后
 * `reader.composerCommit` 意图要拿到当前输入内容）—— 若 state 关在组件里，意图层就够不着它。
 *
 * 键位约定（本身就是接口）：
 * - `Enter` 提交、`Shift+Enter` 换行、`Esc` 取消 —— 与主流编辑器一致，不需要鼠标；
 * - 挂载即自动聚焦，故"键盘翻页 → 选中 → 开批注"这条链条中间不必点鼠标。
 */
import { useEffect, useRef } from 'react'

export interface NoteComposerProps {
  /** 挂载线起点（宿主视口坐标） */
  x: number
  y: number
  /** 受控正文 */
  value: string
  onChange: (value: string) => void
  /** 保存（空串 = 清空批注正文，允许 —— 高亮仍在） */
  onSave: () => void
  onCancel: () => void
  /** 编辑既有笔记时才给：移除这条笔记 */
  onRemove?: () => void
  /** 面板标题（「新增批註」/「編輯批註」），由调用方给 */
  title: string
}

export function NoteComposer({
  x,
  y,
  value,
  onChange,
  onSave,
  onCancel,
  onRemove,
  title
}: NoteComposerProps): React.JSX.Element {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  // 挂载即聚焦并把光标放到末尾：键盘链条的落点
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  const left = Math.min(Math.max(8, x), Math.max(8, window.innerWidth - 288))
  const top = Math.max(8, y)

  return (
    <div className="note-composer fixed z-50" style={{ left, top }}>
      <div className="note-composer__rail" aria-hidden="true" />
      <div className="note-composer__body">
        <div className="note-composer__title">{title}</div>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onCancel()
            } else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSave()
            }
          }}
          placeholder="寫點什麼…（Enter 儲存，Shift+Enter 換行，Esc 取消）"
          className="note-composer__input"
          rows={3}
        />
        <div className="note-composer__actions">
          <button className="text-action" onClick={onSave}>
            儲存
          </button>
          <button className="text-action" onClick={onCancel}>
            取消
          </button>
          {onRemove && (
            <button className="text-action note-composer__remove" onClick={onRemove}>
              移除
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
