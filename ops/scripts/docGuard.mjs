/**
 * docGuard —— 文档门控（全项目 Markdown 行数上限；挂在 git pre-commit，见 .githooks/）
 *
 * ── 命名规范 ──
 * `ops/scripts/<域><动作>.mjs`：域 = 治理对象（小写单词），动作 = 对它做什么（驼峰，首字母大写）。
 * 动作词分两族：**Guard = 门控**（不合规 → 非零退出、挡提交）；**Probe = 探针**（只观测不挡）。
 * 本目录（ops/scripts/）只放**仓库治理**脚本（守卫链见 ops/AGENTS.md）；业务与验证探针在
 * client/scripts/（信任分级见其 README），二者分治。本脚本 = 域 `doc`（文档治理）+ 动作 `Guard`。
 *
 * ── 用途 ──
 * 扫描 git 追踪的全部 Markdown（trash/ 留档除外），逐文件比对行数与上限表，超限即挡。
 * `node ops/scripts/docGuard.mjs` = 门控（hook 调的就是它）；`--report` = 体检报告，只打印不挡。
 *
 * ── 目的 ──
 * 本项目的文档体系是 agent 的**按需加载结构**（渐进式披露，见 AGENTS.md）：入口文档必须
 * 保持"只有指针、不复读细节"，设计文档按小节承载细节。
 * 任何文档的无限膨胀都会让指针失灵、让"按需加载"退化成"全量阅读"——这才是要防的事。
 * 本脚本把文档纪律从手写自觉变成提交时的机器约束：超限 = 挡，直到把细节下沉到该在的
 * 小节、把旧条目退役进 git 历史（这正是期望的维护动作）。
 *
 * ── 上限表口径 ──
 * 只登记入口/索引类（AGENTS 族）的硬上限——渐进式披露的命脉，短是结构性的，没有商量；
 * 其余文档（契约/设计/状态/待办/README）统一默认 300（用户 2026-11-05 定，guardrail 非削减目标）：
 * 超限 = 洗——按纪律结合程序事实（对照代码现状），去没必要的形容词与不必要的推演过程，
 * 只留判定、事实与接口形状。
 * 运行环境：零依赖 Node ESM（node >= 20）；路径一律 / 分隔（git ls-files 口径）。
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/** 上限表：路径（/ 分隔）→ 行数上限。只登记入口/索引类硬上限——其余文档一律默认 300。 */
const DOC_LIMITS = {
  // ── 入口/索引类（硬上限：渐进式披露命脉，短是结构性的；"其余文档统一 300"不含此级）──
  'AGENTS.md': 100, // agent 全局入口
  'docs/AGENTS.md': 80, // docs 子树入口
  'client/AGENTS.md': 80, // client 子树入口
  'client/docs/AGENTS.md': 80, // client/docs 文档群入口
  'ops/AGENTS.md': 80, // ops 子树入口（治理域）
  'client/scripts/README.md': 80, // 业务脚本清单（信任分级）
  'client/plugins/AGENTS.md': 80, // 插件子树入口
  'client/plugins/README.md': 80, // 插件工作区清单
  '.agents/notes/README.md': 80, // 决策日志机制
  '.agents/notes/AGENTS.md': 80 // 决策日志 agent 规则
}
// 其余文档（契约/设计/状态/待办/README）统一默认 300（用户 2026-11-05 定，guardrail 非削减目标）：
// 超限 = 按纪律结合程序事实洗一遍——去没必要的形容词、去不必要的推演过程，只留判定与事实。

/** 未登记文档的默认上限 */
const DEFAULT_LIMIT = 300

/** git 追踪的全部 .md（含暂存区新文件；submodule/trash 之外不会混进别的） */
const tracked = execSync('git ls-files -- "*.md"', { encoding: 'utf8' })
  .split('\n')
  .map((p) => p.trim())
  .filter((p) => p.endsWith('.md') && p !== '' && !p.startsWith('trash/'))

const linesOf = (p) => {
  const text = readFileSync(p, 'utf8')
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0) // = wc -l 口径
}

const report = process.argv.includes('--report')
const rows = tracked
  .map((p) => {
    const limit = DOC_LIMITS[p] ?? DEFAULT_LIMIT
    return { p, lines: linesOf(p), limit, unregistered: !(p in DOC_LIMITS) }
  })
  .sort((a, b) => b.lines / b.limit - a.lines / a.limit)

const isTTY = process.stdout.isTTY
const paint = (s, c) => (isTTY ? `\x1b[${c}m${s}\x1b[0m` : s)
const red = (s) => paint(s, '31')
const yellow = (s) => paint(s, '33')
const green = (s) => paint(s, '32')
const dim = (s) => paint(s, '2')

if (report) {
  console.log('docGuard --report：全量文档体检（行数/上限/占用率）\n')
  for (const r of rows) {
    const pct = Math.round((r.lines / r.limit) * 100)
    const mark = r.lines > r.limit ? red('✗') : pct >= 90 ? yellow('△') : green('✓')
    console.log(
      `${mark} ${String(r.lines).padStart(5)} / ${String(r.limit).padStart(5)}  ${String(pct).padStart(3)}%  ${r.p}${
        r.unregistered ? dim('  （未登记，按默认上限）') : ''
      }`
    )
  }
  console.log(
    `\n${rows.length} 个文档。✓ 达标  △ ≥90%（只许降）  ✗ 超限。上限表与口径见本脚本头注。`
  )
  process.exit(0)
}

const over = rows.filter((r) => r.lines > r.limit)
if (over.length > 0) {
  console.error(red('docGuard：以下文档超出行数上限，提交被挡。\n'))
  for (const r of over) {
    console.error(`  ${r.p}  ${r.lines} 行 / 上限 ${r.limit} 行（超 ${r.lines - r.limit} 行）`)
  }
  console.error(
    `\n修法（渐进式披露口径）：细节下沉到该在的小节或权威文档；过时段落退役进 git 历史。` +
      `上限表与口径见 ops/scripts/docGuard.mjs 头注。`
  )
  process.exit(1)
}

console.log(
  green(`docGuard：${rows.length} 个文档全部达标（含 ${rows.filter((r) => r.unregistered).length} 个未登记项按默认上限）。`)
)
