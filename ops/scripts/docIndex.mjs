/**
 * docIndex —— 文档跟踪声明（文末「跟踪：」行；挂在 git pre-commit，见 .githooks/）
 *
 * ── 命名规范 ──
 * ops/scripts/<域><动作>.mjs（Guard/Probe 两族，见 docGuard.mjs 头注）。本脚本 = 域 `doc`（文档治理）+ 动作 `Index`：
 * check 之类门（全量校验，错 = 非零退出）；hook 之链位（拦截性错误 + 漂移提醒不拦截）。
 *
 * ── 机制 ──
 * 文档用**文末最后一行**声明自己跟踪哪些事实源：`跟踪：[标签](路径) · [标签2](路径2)`。
 * 声明把「该看一眼」固定在 commit 时刻——被跟踪路径在提交里变了而声明文档没动，提醒漂移。
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
import { existsSync, readFileSync } from 'node:fs'
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

const isAncestorDir = (targetRel, docRel) => {
  const t = dirOf(targetRel)
  const d = dirOf(docRel)
  if (t === d) return false // 平级
  if (t === '') return d !== '' // 仓库根是所有非根目录的祖先
  return d.startsWith(t + '/')
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
 * 返回 { errors: [], notices: [], declarations: Map<声明文档, [被跟踪路径]> }
 */
const inspect = (errorsOnly) => {
  const errors = []
  const notices = []
  const declarations = new Map()
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
    // 链接方向（全文档范围）：只许平级或子一级，不许向上、不许出仓
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = m[1]
      if (/^(https?:|mailto:|#)/.test(target)) continue
      const rel = toRepoRel(doc, target.split('#')[0])
      if (rel === null) errors.push(`${doc}：引用越出仓库 —— ${target}`)
      else if (isAncestorDir(rel, doc)) errors.push(`${doc}：引用方向向上（祖先）—— ${target}（只允许平级或子一级）`)
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
  return { errors, notices, declarations, trackedSet: new Set(docs) }
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
  const { errors, declarations, trackedSet } = inspect(true)
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
  for (const [doc, paths] of declarations) {
    if (staged.has(doc)) continue // 声明文档自己在动，视为知情
    for (const rel of paths) {
      if (staged.has(rel)) drifts.push(`${rel} 在本批提交里变了，声明跟踪它的 ${doc} 没动`)
    }
  }
  if (drifts.length > 0) {
    for (const d of drifts) console.log(yellow(`⚠ doc-index 漂移提醒（不拦截）—— ${d}`))
  } else {
    console.log('doc-index：声明与变更无漂移。')
  }
  process.exit(0)
}

console.log('用法：node ops/scripts/docIndex.mjs check|hook')
process.exit(2)
