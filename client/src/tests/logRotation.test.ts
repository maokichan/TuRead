/**
 * 统一日志的轮转/修剪判据（`@shared/log` 纯函数）——策略规则，判据不能散落在 fs 里。
 */
import { describe, expect, it } from 'vitest'
import {
  consoleLevelToLogLevel,
  formatLogLine,
  needsRotate,
  planPrune,
  LOG_POLICY
} from '../shared/log'

describe('formatLogLine', () => {
  it('固定字段齐全且为单行 JSON', () => {
    const line = formatLogLine({ t: 1700000000000, lvl: 'warn', scope: 'renderer', msg: 'a"b' })
    expect(line).not.toContain('\n')
    const parsed = JSON.parse(line) as Record<string, unknown>
    expect(parsed).toEqual({ t: 1700000000000, lvl: 'warn', scope: 'renderer', msg: 'a"b' })
  })

  it('err 缺省时不占位', () => {
    const parsed = JSON.parse(formatLogLine({ t: 1, lvl: 'info', scope: 's', msg: 'm' })) as Record<string, unknown>
    expect('err' in parsed).toBe(false)
  })

  it('err 存在时进文件', () => {
    const parsed = JSON.parse(
      formatLogLine({ t: 1, lvl: 'error', scope: 's', msg: 'm', err: 'stack…' })
    ) as Record<string, unknown>
    expect(parsed['err']).toBe('stack…')
  })
})

describe('consoleLevelToLogLevel', () => {
  it('chromium 等级映射', () => {
    expect(consoleLevelToLogLevel(0)).toBe('debug')
    expect(consoleLevelToLogLevel(1)).toBe('info')
    expect(consoleLevelToLogLevel(2)).toBe('warn')
    expect(consoleLevelToLogLevel(3)).toBe('error')
  })
})

describe('needsRotate', () => {
  it('严格大于才轮转（压线不抖动）', () => {
    expect(needsRotate(LOG_POLICY.maxBytes)).toBe(false)
    expect(needsRotate(LOG_POLICY.maxBytes + 1)).toBe(true)
  })
})

describe('planPrune', () => {
  const day = 24 * 60 * 60 * 1000
  const now = 1_700_000_000_000
  const mk = (name: string, ageDays: number) => ({ name, mtimeMs: now - ageDays * day })

  it('超龄删除（无论份数）', () => {
    const files = [mk('a.jsonl', 20), mk('b.jsonl', 1)]
    expect(planPrune(files, now, { maxArchives: 7, maxAgeDays: 14 })).toEqual(['a.jsonl'])
  })

  it('超量删除，保留最新的 N 份（删最旧一份）', () => {
    const files = [mk('old.jsonl', 3), mk('mid.jsonl', 2), mk('new.jsonl', 1)]
    expect(planPrune(files, now, { maxArchives: 2, maxAgeDays: 14 })).toEqual(['old.jsonl'])
  })

  it('年龄与份数两限独立成立，并集去重', () => {
    const files = [mk('a.jsonl', 30), mk('b.jsonl', 2), mk('c.jsonl', 1), mk('d.jsonl', 0.5)]
    // a 超龄；b 超出 2 份保留额
    expect(planPrune(files, now, { maxArchives: 2, maxAgeDays: 14 }).sort()).toEqual(['a.jsonl', 'b.jsonl'])
  })

  it('空表与不满额皆不删', () => {
    expect(planPrune([], now)).toEqual([])
    expect(planPrune([mk('a.jsonl', 1)], now)).toEqual([])
  })
})
