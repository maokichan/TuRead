/**
 * CardSearchInput —— 卡片本地搜索输入（批1.7d，docs/DIRECTION.md §2：搜索是卡片的本地物件）。
 *
 * 视觉沿原顶栏搜索的输入框（h-7 / radius-control / 1px 边 / 13px）；
 * Esc 清空 + 失焦是输入框自己的**元素级语义**（不进意图层，v1.14 口径）。
 * 聚焦由 searchFocusBus 驱动（Ctrl+F），本组件只持有 ref 并透传。
 */
interface CardSearchInputProps {
  value: string
  onChange: (q: string) => void
  placeholder: string
  inputRef: React.RefObject<HTMLInputElement | null>
}

export function CardSearchInput({
  value,
  onChange,
  placeholder,
  inputRef
}: CardSearchInputProps): React.JSX.Element {
  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onChange('')
          inputRef.current?.blur()
        }
      }}
      placeholder={placeholder}
      aria-label={placeholder}
      className="h-7 w-[320px] max-w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--input-bg)] px-2.5 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
    />
  )
}
