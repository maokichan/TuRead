/**
 * logsClean —— 工作区日志清扫（域 scripts / 动作 Clean；业务脚本，信任级见本目录 README）
 *
 * ── 用途 ──
 * 统一日志（决策笔记 2026-11-05-unified-logging）落地后，工作区的日志收拢点 = 仓库根 `logs/`
 * （gitignored）。历史上散落的日志文件由本脚本一次性归拢：**默认只列单不删**（观察模式），
 * `--yes` 才删除。只在白名单模式内命中——不做通配全盘扫。
 *
 * ── 口径 ──
 * 命中模式（相对仓库根，文件级）：
 *   logs/**                        统一日志收拢点（全部可清）
 *   client/.probe-run*.log         探针手动重定向遗留
 *   client/*.log                   根级散落（npm-install*.log / smoke*.log / release-build.log / .style-server.log）
 *   server/server*.log             server 手动重定向遗留
 *   kookit/npm-install*.log        submodule 内 npm 日志（kookit 自己的 .gitignore 未覆盖）
 * 运行环境：零依赖 Node ESM（node >= 20）。
 */

import { readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const yes = process.argv.includes('--yes')

/** 白名单：目录 → 文件名判据。模式在此处收口，不散落。 */
const PATTERNS = [
  { dir: 'logs', match: () => true, note: '统一日志收拢点' },
  { dir: 'client', match: (n) => /^\.probe-run[^/]*\.log$/.test(n), note: '探针重定向遗留' },
  { dir: 'client', match: (n) => n.endsWith('.log'), note: 'client 根级散落日志' },
  { dir: 'server', match: (n) => /^server[^/]*\.log$/.test(n), note: 'server 重定向遗留' },
  { dir: 'kookit', match: (n) => /^npm-install[^/]*\.log$/.test(n), note: 'kookit npm 日志（其 .gitignore 未覆盖）' }
]

const hits = []
const seen = new Set()
for (const { dir, match, note } of PATTERNS) {
  const abs = join(ROOT, dir)
  let entries
  try {
    entries = readdirSync(abs, { withFileTypes: true })
  } catch {
    continue
  }
  for (const e of entries) {
    if (!e.isFile() || !match(e.name)) continue
    const rel = relative(ROOT, join(abs, e.name))
    if (seen.has(rel)) continue // 模式间重叠（如 .probe-run*.log 同属探针与根级散落）只列一次
    seen.add(rel)
    try {
      hits.push({ rel, bytes: statSync(join(abs, e.name)).size, note })
    } catch {
      // 竞态删除/读取失败跳过
    }
  }
}

if (hits.length === 0) {
  console.log('logsClean：无散落日志。')
  process.exit(0)
}

const total = hits.reduce((s, h) => s + h.bytes, 0)
for (const h of hits) {
  console.log(`${yes ? '✗' : '△'} ${h.rel}  (${h.bytes} B)  ${h.note}`)
}
console.log(`\n${hits.length} 个文件，共 ${(total / 1024).toFixed(1)} KB。${yes ? '已删除。' : '观察模式未删除；确认后加 --yes 执行删除。'}`)

if (yes) {
  for (const h of hits) rmSync(join(ROOT, h.rel), { force: true })
}
