/**
 * 批注输入（2026-09-14 立；**2026-09-16 用户改形态**）。
 *
 * 形态（用户 2026-09-16 原话）："新建的笔记输入栏默认在底部中心对齐，作为一个**纯色带边框的容器**，
 * **不带任何提示词**，作为焦点存在，但是操作逻辑还和现在一样" —— 因此：
 * - **位置**：屏幕**底部居中**（不再跟随右键坐标；`fixed` + `translateX(-50%)`，见 `styles.css`）；
 * - **外观**：纯色底（`--panel-2`）+ 1px 描边，**一个字都没有**（无标题、无 placeholder、无按钮）
 *   → 焦点态由容器自身给强调边（`:focus-within`），"作为焦点存在"；
 * - **操作逻辑不变**：挂载即聚焦、`Enter` 提交、`Shift+Enter` 换行、`Esc` 取消。
 *   ⚠ 按钮去掉后，**移除既有笔记**只剩右键菜单一条路径（`ContextMenu` 的「移除」，仍在）。
 *
 * **受控组件**（`value` + `onChange`）：正文 state 由调用方（ReaderFeature）持有。
 * 为什么不让组件自己存：用户要的"手不离开键盘做笔记"链条需要**从外部提交**（将来配键后
 * `reader.composerCommit` 意图要拿到当前输入内容）—— 若 state 关在组件里，意图层就够不着它。
 */
import { useEffect, useRef } from 'react'

export interface NoteComposerProps {
  /** 受控正文 */
  value: string
  onChange: (value: string) => void
  /** 保存（空串 = 清空批注正文，允许 —— 高亮仍在） */
  onSave: () => void
  onCancel: () => void
}

export function NoteComposer({
  value,
  onChange,
  onSave,
  onCancel
}: NoteComposerProps): React.JSX.Element {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  // 挂载即聚焦并把光标放到末尾：键盘链条的落点
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  return (
    <div className="note-composer fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
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
        className="note-composer__input"
        rows={3}
        aria-label="批註"
      />
    </div>
  )
}
