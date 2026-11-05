/**
 * 批注输入。
 *
 * 形态：屏幕**底部居中**（不跟随右键坐标；`fixed` + `translateX(-50%)`，见 `styles.css`）；
 * 纯色底（`--panel-2`）+ 1px 描边，**一个字都没有**（无标题、无 placeholder、无按钮）
 * → 焦点态由容器自身给强调边（`:focus-within`）。
 * 操作逻辑：挂载即聚焦、`Enter` 提交、`Shift+Enter` 换行、`Esc` 取消。
 * ⚠ 按钮没有——**移除既有笔记**只剩右键菜单一条路径（`ContextMenu` 的「移除」）。
 * **自增长**：默认**至少两行**，内容多时自己撑起来，**上限五行**，超过在框内滚动
 * —— 见 `styles.css`（`field-sizing: content` + `min/max-height`）。
 *
 * **受控组件**（`value` + `onChange`）：正文 state 由调用方（ReaderFeature）持有。
 * 为什么不让组件自己存："手不离开键盘做笔记"链条需要**从外部提交**（`reader.composerCommit`
 * 意图要拿到当前输入内容）—— 若 state 关在组件里，意图层就够不着它。
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
    <div className="note-composer absolute bottom-6 left-1/2 z-[var(--z-menu)] -translate-x-1/2">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // IME 组合守卫（审计 B-5）：组合中的 Enter = 确认候选词，不是提交/取消
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSave()
          }
        }}
        className="note-composer__input"
        rows={2}
        aria-label="批註"
      />
    </div>
  )
}
