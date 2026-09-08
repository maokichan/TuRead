/** 书库展示用的格式化小工具（纯函数，无副作用） */
import type { BookRecord } from '@core/domain/types'

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** 阅读进度文案（`percentage` 是 display 角色字段，仅展示，见 CONTRACTS §2.1） */
export function progressText(book: BookRecord): string {
  if (!book.lastLocation) return '未读'
  return `已读 ${Math.round((book.lastLocation.percentage ?? 0) * 100)}%`
}

/** 时间戳 → 本地可读时间（unix 毫秒） */
export function formatTime(ms?: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
