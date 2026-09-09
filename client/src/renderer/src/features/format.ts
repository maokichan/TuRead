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

/**
 * 相对时间（"3 天前"）—— 抽屉的「最近阅读」用（2026-09-09 用户定）。
 * 粒度：刚刚 / n 分钟前 / n 小时前 / n 天前 / n 个月前 / n 年前；未来时间按"刚刚"处理。
 */
export function formatRelative(ms?: number): string {
  if (!ms) return '—'
  const diff = Date.now() - ms
  if (diff < 60_000) return '刚刚'
  const min = Math.floor(diff / 60_000)
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  const month = Math.floor(day / 30)
  if (month < 12) return `${month} 个月前`
  return `${Math.floor(month / 12)} 年前`
}
