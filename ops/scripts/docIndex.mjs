/**
 * docIndex —— 文档跟踪声明（文末「跟踪：」行；挂在 git pre-commit，见 .githooks/）
 *
 * ── 命名规范 ──
 * ops/scripts/<域><动作>.mjs（Guard/Probe 两族，见 docGuard.mjs 头注）。本脚本 = 域 `doc`（文档治理）+ 动作 `Index`：
 * check 之类门（全量校验，错 = 非零退出）；hook 之链位（拦截性错误 + 漂移提醒不拦截）。
 *
 * ── 机制 ──
 * **引用即跟踪**（CP 原则的完整落法）：文档对仓库内文件的每个 markdown 链接都是一条跟踪边
 * ——被引用文件进了暂存区而引用它的文档没动，commit 时提醒漂移（目录边按前缀命中）。
 * 文末 `跟踪：[标签](路径)` 声明是**加严层**：声明的路径额外受存在性 / 不入库 / 方向校验。
 * 机制不保证同步、不校验语义（文字是否过时不可判定）；它只让"该看一眼"无处遁形。
 *
 * ── 口径 ──
 * 只登记入库路径；gitignored 路径不可声明；一文件尽量单声明者；链接只许平级或子一级
 * （读者由上而来，向上回指是缠绕的开始）；仓库外引用 = 越权。纯纪律文档（AGENTS/notes）
 * 不声明，例外：ops/AGENTS.md 声明自己的脚本、清单类 README 声明清单项。
 * 用法：`node ops/scripts/docIndex.mjs check`（全量体检）| `hook`（pre-commit 调用）。
 * 运行环境：零依赖 Node ESM（node >= 20）；路径一律 / 分隔（git ls-files 口径）。
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const isTTY = process.stdout.isTTY
const paint = (s, c) => (isTTY ? `\x1b[${c}m${s}\x1b[0m` : s)
const red = (s) => paint(s, '31')
const green = (s) => paint(s, '32')
const yellow = (s) => paint(s, '33')

const trackedMd = () =>
  execSync('git ls-files -- "*.md"', { encoding: 'utf8' })
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => p.endsWith('.md') && p !== '' && !p.startsWith('trash/'))

/** 解析文末声明：最后一行非空行以「跟踪：」开头才算声明；其后再有非空行 = 行文提及，不算。 */
const parseDeclaration = (text) => {
  const lines = text.split('\n')
  let last = lines.length - 1
  while (last >= 0 && lines[last].trim() === '') last--
  if (last < 0 || !lines[last].trimStart().startsWith('跟踪：')) return null
  const links = [...lines[last].matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)]
  if (links.length === 0) return { error: '跟踪行没有任何链接' }
  return { paths: links.map((m) => m[2]) }
}

/** 把链接目标解析为仓库相对 posix 路径；越出仓库返回 null。 */
const toRepoRel = (docPath, target) => {
  const abs = resolve(ROOT, dirname(docPath), target)
  const rel = relative(ROOT, abs).split(sep).join('/')
  if (rel.startsWith('..')) return null
  return rel === '' ? '.' : rel
}

const dirOf = (rel) => {
  const d = dirname(rel).split(sep).join('/')
  return d === '.' ? '' : d
}

/** 目标位置（文件取其所在目录；目录目标取目录本身——声明兄弟目录合法，比较基准是它自己） */
const effectiveTargetDir = (rel) => {
  try {
    if (statSync(join(ROOT, rel)).isDirectory()) return rel
  } catch {
    // 不存在的路径按文件处理（存在性检查另有其责）
  }
  return dirOf(rel)
}

const isAncestorDir = (effDir, docRel) => {
  const d = dirOf(docRel)
  if (effDir === d) return false // 平级
  if (effDir === '') return d !== '' // 仓库根是所有非根目录的祖先
  return d.startsWith(effDir + '/')
}

const gitIgnored = (rel) => {
  try {
    execSync(`git check-ignore -q "${rel}"`, { encoding: 'utf8' })
    return true
  } catch {
    return false // 非零退出 = 未被忽略
  }
}

/**
 * 校验。errorsOnly=true 时跳过「声明路径不入库」检查（hook 模式用，check 全量）。
 * 返回 { errors, notices, declarations: Map<声明文档, [路径]>, linkEdges: Map<文档, Set<路径>> }。
 * linkEdges = **引用即跟踪**的边集：全文档范围的每个仓库内链接（目标须实际存在——
 * 行文示例里解析不到实体的路径不入边），漂移检查的职责面。
 */
const inspect = (errorsOnly) => {
  const errors = []
  const notices = []
  const declarations = new Map()
  const linkEdges = new Map()
  const docs = trackedMd()
  const declarers = new Map() // 被跟踪路径 → 声明文档列表

  for (const doc of docs) {
    let text
    try {
      text = readFileSync(join(ROOT, doc), 'utf8')
    } catch {
      continue
    }
    const decl = parseDeclaration(text)
    if (decl?.error) errors.push(`${doc}：${decl.error}`)
    if (decl?.paths) {
      const resolved = []
      for (const target of decl.paths) {
        const rel = toRepoRel(doc, target)
        if (rel === null) errors.push(`${doc}：跟踪路径越出仓库 —— ${target}`)
        else resolved.push(rel)
      }
      declarations.set(doc, resolved)
      for (const rel of resolved) {
        if (!declarers.has(rel)) declarers.set(rel, [])
        declarers.get(rel).push(doc)
      }
    }
    // 链接方向（全文档范围）：只许平级或子一级，不许向上、不许出仓；边集同时在此收集
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = m[1]
      if (/^(https?:|mailto:|#)/.test(target)) continue
      const rel = toRepoRel(doc, target.split('#')[0])
      if (rel === null) errors.push(`${doc}：引用越出仓库 —— ${target}`)
      else {
        if (isAncestorDir(effectiveTargetDir(rel), doc))
          errors.push(`${doc}：引用方向向上（祖先）—— ${target}（只允许平级或子一级）`)
        if (!linkEdges.has(doc)) linkEdges.set(doc, new Set())
        if (existsSync(join(ROOT, rel))) linkEdges.get(doc).add(rel) // 不存在的目标（行文示例）不入边
      }
    }
  }

  for (const [doc, paths] of declarations) {
    for (const rel of paths) {
      if (!existsSync(join(ROOT, rel))) errors.push(`${doc}：跟踪的路径不存在 —— ${rel}`)
    }
  }
  if (!errorsOnly) {
    for (const [doc, paths] of declarations) {
      for (const rel of paths) {
        if (gitIgnored(rel)) errors.push(`${doc}：跟踪的路径不入库（gitignored）—— ${rel}`)
      }
    }
  }
  for (const [rel, docs2] of declarers) {
    if (docs2.length > 1) notices.push(`${rel} 有两个声明者（${docs2.join('、')}）——尽量单声明`)
  }
  return { errors, notices, declarations, linkEdges, trackedSet: new Set(docs) }
}

const cmd = process.argv[2]

if (cmd === 'check') {
  const { errors, notices } = inspect(false)
  for (const n of notices) console.log(yellow(`△ ${n}`))
  if (errors.length > 0) {
    console.error(red('doc-index check：声明与链接存在错误。\n'))
    for (const e of errors) console.error(`  ${e}`)
    process.exit(1)
  }
  console.log(green('doc-index check：声明与链接全部合规。'))
  process.exit(0)
}

if (cmd === 'hook') {
  const { errors, linkEdges } = inspect(true)
  if (errors.length > 0) {
    console.error(red('doc-index 拦截\n'))
    for (const e of errors) console.error(`  ${e}`)
    console.error(`\n（修正声明或更新对应文档后重试；--no-verify 是人类的绕行特权——AGENTS.md）`)
    process.exit(1)
  }
  const staged = new Set(
    execSync('git diff --cached --name-only', { encoding: 'utf8' })
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p !== '')
  )
  const drifts = []
  // 引用即跟踪：全部链接边都是漂移检查面（含目录边——staged 文件落在被链接目录内即触发）
  for (const [doc, targets] of linkEdges) {
    if (staged.has(doc)) continue // 文档自己在动，视为知情
    for (const rel of targets) {
      const hit = staged.has(rel) || [...staged].some((s) => s.startsWith(rel + '/'))
      if (hit) drifts.push(`${rel} 在本批提交里变了，引用它的 ${doc} 没动`)
    }
  }
  if (drifts.length > 0) {
    for (const d of drifts) console.log(yellow(`⚠ doc-index 漂移提醒（不拦截）—— ${d}`))
  } else {
    console.log('doc-index：引用与变更无漂移。')
  }
  process.exit(0)
}

console.log('用法：node ops/scripts/docIndex.mjs check|hook')
process.exit(2)
