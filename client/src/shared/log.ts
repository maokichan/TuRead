/**
 * 统一日志契约（纯函数，零依赖）—— 决策笔记 =
 * `.agents/notes/implemented/process/2026-11-05-unified-logging.md`。
 * 主进程（文件适配器）与渲染层（console-message 转发判据）共用同一份格式与口径；
 * 单行 JSONL：一行一事件，机器可断言（探针/清理/未来查看器同吃一种格式）。
 * 轮转与修剪是**策略规则**，放纯函数便于单测——判据不能散落在 fs 调用里。
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** 一条日志事件。`err` = 可序列化的错误说明（消息或 stack，不保证形状）。 */
export interface LogEntry {
  /** 事件时刻（epoch 毫秒） */
  t: number
  lvl: LogLevel
  /** 来源组件（如 renderer / plugin / store / probe:<名>） */
  scope: string
  msg: string
  err?: string
}

/** 单事件 → 单行 JSONL。多余字段不进文件：格式是契约，不是杂物抽屉。 */
export function formatLogLine(entry: LogEntry): string {
  const line: Record<string, unknown> = {
    t: entry.t,
    lvl: entry.lvl,
    scope: entry.scope,
    msg: entry.msg
  }
  if (entry.err !== undefined) line['err'] = entry.err
  return JSON.stringify(line)
}

/** console-message 的 level（0 verbose / 1 log / 2 warn / 3 error）→ LogLevel */
export function consoleLevelToLogLevel(level: number): LogLevel {
  if (level >= 3) return 'error'
  if (level === 2) return 'warn'
  if (level === 1) return 'info'
  return 'debug'
}

/** 轮转策略（默认档）：单文件 5MB 触发轮转；归档保留 7 份、14 天。 */
export const LOG_POLICY = { maxBytes: 5 * 1024 * 1024, maxArchives: 7, maxAgeDays: 14 } as const

/** 当前文件超限即轮转（严格大于：恰好等于不轮，避免压线抖动）。 */
export function needsRotate(sizeBytes: number, maxBytes: number = LOG_POLICY.maxBytes): boolean {
  return sizeBytes > maxBytes
}

export interface ArchivedLog {
  name: string
  mtimeMs: number
}

/**
 * 修剪计划（纯函数）：归档文件超出份数上限或年龄上限者删除。
 * 两限各自独立成立；返回待删名单按「最旧优先、超量优先」排序，供调用方逐个删。
 */
export function planPrune(
  archives: ArchivedLog[],
  nowMs: number,
  policy: { maxArchives: number; maxAgeDays: number } = LOG_POLICY
): string[] {
  const remove = new Set<string>()
  const byAge = archives
    .filter((a) => nowMs - a.mtimeMs > policy.maxAgeDays * 24 * 60 * 60 * 1000)
    .sort((a, b) => a.mtimeMs - b.mtimeMs)
  for (const a of byAge) remove.add(a.name)
  const survivors = archives
    .filter((a) => !remove.has(a.name))
    .sort((a, b) => b.mtimeMs - a.mtimeMs) // 新→旧
  for (const a of survivors.slice(policy.maxArchives)) remove.add(a.name)
  return [...remove]
}
