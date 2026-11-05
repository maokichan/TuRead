/**
 * 聊天室列表（右欄卡片页的「聊天」页；只出现在经房间进入的那本书上）。
 *
 * 它**不新造视觉**：容器 / 列表 / 遮罩全部沿用目录那一套
 * （`.toc-list` 家族 + `--toc-veil` 按距离的遮罩）。
 * 唯一的例外是**输入类**（style/components-shell.md 例外①：输入必须可见可点）——发消息的
 * 输入框带发丝描边，与 `.note-composer` 同一口径（Enter 送出 / Shift+Enter 换行 / 自增长到五行封顶）。
 *
 * 纪律：组件是**纯 props**（消息 + 回调），会话状态归 `features/roomSession.ts`（跨功能共享一份）。
 */
import { useEffect, useRef } from 'react'
import type { ChatMessage } from '@core/domain/types'
import { paintVeil as paintVeilImpl } from './veil'

interface ChatPanelProps {
  messages: ChatMessage[]
  /** 房间号（空态显示用；也提醒"这是哪个房间的聊天"） */
  roomId: string
  /** 发消息（空文本由上游忽略；失败由上游进日志） */
  onSend: (text: string) => void
  /** 当前草稿（受控：输入内容归调用方，便于将来键盘意图直接提交） */
  draft: string
  onDraftChange: (text: string) => void
  /** 跟随模式：开 → 其他成员翻页时本端跟到同一位置（跳转逻辑在 ReaderFeature） */
  following: boolean
  onToggleFollow: () => void
}

/** unix 秒 → `HH:MM`（本地时区；聊天里只需要"什么时候说的"） */
function formatTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export function ChatPanel({
  messages,
  roomId,
  onSend,
  draft,
  onDraftChange,
  following,
  onToggleFollow
}: ChatPanelProps): React.JSX.Element {
  const rowsRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  /** 新消息到达 → 滚到底（聊天的默认阅读位置；用户手动上翻后仍跟随，保持简单可预期） */
  useEffect(() => {
    const box = rowsRef.current
    if (!box) return
    box.scrollTop = box.scrollHeight
  }, [messages])

  /** 遮罩按距离（共享实现见 veil.ts）；mousemove 挂根层 */
  const paint = (clientX: number | null, clientY: number | null): void => {
    paintVeilImpl(rootRef.current, { selector: '.chat-row', veilVar: '--toc-veil', restVars: ['--toc-veil-rest'] }, clientY)
  }

  const submit = (): void => {
    if (!draft.trim()) return
    onSend(draft)
  }

  return (
    <div
      className="toc-list toc-list--right chat-panel"
      ref={rootRef}
      onMouseMove={(e) => paint(e.clientX, e.clientY)}
      onMouseLeave={() => paint(null, null)}
    >
      {/* 跟随模式开关：文字动作 + 选中态换 accent —— 不新造视觉语汇（style/components-shell.md）。
          放在消息列表上方 = 聊天格的"状态行"，与格内容一体。 */}
      <div className="flex flex-none items-center justify-between px-1 pb-1">
        <button
          className={`text-action text-[13px] ${following ? 'text-action--primary' : ''}`}
          onClick={onToggleFollow}
          title={following ? '跟隨中：成員翻頁時跟到同一位置（再點一次關閉）' : '開啟後跟隨成員的閱讀位置'}
        >
          {following ? '跟隨中' : '跟隨'}
        </button>
      </div>
      <div className="toc-list__rows" ref={rowsRef}>
        {messages.length === 0 && (
          <div className="toc-list__empty">房間 {roomId} 裡還沒有消息</div>
        )}
        {messages.map((m) => (
          <div className="chat-row" key={m.id}>
            <div className="chat-row__head">
              <span className="chat-row__nick">{m.nick || '（無名）'}</span>
              <span className="chat-row__time">{formatTime(m.createdAt)}</span>
            </div>
            <div className="chat-row__text">{m.text}</div>
            <span className="toc-row__veil" aria-hidden="true" />
          </div>
        ))}
      </div>
      {/* 输入类 = style/components-shell.md 例外①（必须可见可点）。Enter 送出 / Shift+Enter 换行，与批注输入栏同一操作口径 */}
      <div className="chat-composer">
        <textarea
          ref={inputRef}
          className="chat-composer__input"
          value={draft}
          rows={1}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            // IME 组合守卫（审计 B-5）：组合中的 Enter = 确认候选词，不是发送
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <button className="text-action text-action--primary" onClick={submit} disabled={!draft.trim()}>
          送出
        </button>
      </div>
    </div>
  )
}
