/**
 * 统一日志的文件适配器（主进程专用）—— 契约与轮转判据 = `@shared/log`。
 * 落点：`<userData>/logs/app.jsonl`；超限轮转为 `app-<时间戳>.jsonl`，启动时修剪归档。
 * **永不抛错**：日志是诊断设施，自身故障只允许降级为 stderr 提示，不允许演变成应用故障。
 * dev 与生产同一格式同一落点——探针用隔离 userData，日志天然随目录隔离（2026-11-05）。
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, appendFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import {
  type LogEntry,
  type ArchivedLog,
  formatLogLine,
  needsRotate,
  planPrune,
  LOG_POLICY
} from '@shared/log'

const CURRENT = 'app.jsonl'

let logsDir: string | null = null

/** 就绪后调用一次（需要 userData 路径）；失败 = 记 stderr 后保持未初始化态。 */
export function initFileLog(): void {
  try {
    logsDir = join(app.getPath('userData'), 'logs')
    mkdirSync(logsDir, { recursive: true })
    rotateIfNeeded()
    pruneArchives()
  } catch (err) {
    logsDir = null
    console.error('[fileLog] 初始化失败，本次会话日志只进 stderr:', err)
  }
}

/** 写一条。未初始化 / 写失败 → 降级 stderr，不抛。 */
export function fileLog(entry: LogEntry): void {
  const line = formatLogLine(entry)
  try {
    if (!logsDir) throw new Error('fileLog 未初始化')
    const file = join(logsDir, CURRENT)
    if (existsSync(file) && needsRotate(statSync(file).size)) {
      rotateIfNeeded()
    }
    appendFileSync(join(logsDir, CURRENT), line + '\n', 'utf8')
  } catch {
    console.error(`[fileLog] ${line}`)
  }
}

function rotateIfNeeded(): void {
  if (!logsDir) return
  const current = join(logsDir, CURRENT)
  if (!existsSync(current) || !needsRotate(statSync(current).size)) return
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
  renameSync(current, join(logsDir, `app-${stamp}.jsonl`))
}

function pruneArchives(): void {
  if (!logsDir) return
  const archives: ArchivedLog[] = readdirSync(logsDir)
    .filter((name) => /^app-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.jsonl$/.test(name))
    .map((name) => ({ name, mtimeMs: statSync(join(logsDir!, name)).mtimeMs }))
  for (const name of planPrune(archives, Date.now(), LOG_POLICY)) {
    try {
      unlinkSync(join(logsDir!, name))
    } catch {
      // 单个删除失败不牵连其余
    }
  }
}
