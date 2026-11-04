/**
 * docIndex —— 路径即跟踪（挂在 git pre-commit，见 .githooks/）
 *
 * ── 机制 ──
 * **有路径就算跟踪**（字面落法）：文档内任何路径形 token——md 链接目标、反引号路径、裸路径——
 * 都是对该文件/目录的跟踪边，无需任何显式语法。被引用文件进了暂存区而引用它的文档没动，
 * commit 时提醒漂移（目录边按前缀命中）。目标须实际存在（对「文档所在目录 → 各级祖先 →
 * 仓库根」依次解析，取首个存在者）；解析失败的 token 忽略，但以已知根段开头而解析失败的
 * 视为**疑似失效路径引用**，check 模式给 notice（不拦截）——文档与现实的脱钩从这里显形。
 * **引用方向纪律只管 md 链接**（导航语义：禁止向上祖先、允许平级或子一级）；路径提及是
 * 跟踪边不是导航，不做方向校验。机制不保证同步、不校验语义；它只让"该看一眼"无处遁形。
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

const dirOf = (rel) => {
  const d = dirname(rel).split(sep).join('/')
  return d === '.' ? '' : d
}

/** md 链接方向的比较基准：目录目标取目录本身，文件目标取其所在目录 */
const effectiveTargetDir = (rel) => {
  try {
    if (statSync(join(ROOT, rel)).isDirectory()) return rel
  } catch {
    // 不存在的路径按文件处理
  }
  return dirOf(rel)
}

const isAncestorDir = (effDir, docRel) => {
  const d = dirOf(docRel)
  if (effDir === d) return false // 平级
  if (effDir === '') return d !== '' // 仓库根是所有非根目录的祖先
  return d.startsWith(effDir + '/')
}

/** 路径形 token：含 `/` 或以 1–4 位扩展名结尾；剥尾部标点 */
const TOKEN_RE = /[A-Za-z0-9_][A-Za-z0-9_./\\-]*/g
const isPathLike = (tok) => tok.includes('/') || /\.[A-Za-z0-9]{1,4}$/.test(tok)
const stripEdgePunct = (tok) => tok.replace(/[.,;:。，、；）)」』】\]]+$/, '')

const gitIgnoredMemo = new Map()
const gitIgnored = (rel, dirForm = false) => {
  const key = rel + (dirForm ? '/' : '')
  if (gitIgnoredMemo.has(key)) return gitIgnoredMemo.get(key)
  let result = false
  try {
    execSync(`git check-ignore -q "${rel}${dirForm ? '/' : ''}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'ignore']
    })
    result = true
  } catch {
    result = false
  }
  gitIgnoredMemo.set(key, result)
  return result
}

/** 已知仓库根段：这些开头而解析失败的引用，大概率是文档与现实的脱钩 */
const KNOWN_ROOTS = ['client/', 'docs/', 'ops/', 'server/', '.agents/', 'scripts/']

/**
 * 对 token 依次按「文档目录 → 各级祖先 → 仓库根 → client/ → server/」解析
 * （人写路径常缺 client/ 前缀，故补两个包根基准），取首个存在者；无扩展名再补 .md/.mjs 一试。
 */
const resolveToken = (doc, raw) => {
  const tok = raw.replace(/\\/g, '/')
  if (/^[A-Za-z]:/.test(tok) || tok.startsWith('//')) return null
  const bases = []
  let cur = dirname(join(ROOT, doc))
  while (true) {
    bases.push(cur)
    if (cur === ROOT) break
    const parent = dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  bases.push(join(ROOT, 'client'), join(ROOT, 'server'))
  const tryRel = (t) => {
    for (const base of bases) {
      const abs = resolve(base, t)
      const rel = relative(ROOT, abs).split(sep).join('/')
      if (!rel.startsWith('..') && existsSync(abs)) return rel
    }
    return null
  }
  const direct = tryRel(tok)
  if (direct) return direct
  if (!/\.[A-Za-z0-9]{1,4}$/.test(tok)) return tryRel(tok + '.md') ?? tryRel(tok + '.mjs')
  return null
}

/**
 * 全量扫描。返回 { errors, notices, edges: Map<文档, Set<路径>> }
 * edges = 路径即跟踪的边集（含 md 链接目标——超集，无需单列）。
 */
const inspect = () => {
  const errors = []
  const notices = []
  const edges = new Map()
  const docs = trackedMd()

  for (const doc of docs) {
    let text
    try {
      text = readFileSync(join(ROOT, doc), 'utf8')
    } catch {
      continue
    }
    const docSet = new Set()
    edges.set(doc, docSet)
    // md 链接：方向纪律（导航语义）
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = m[1]
      if (/^(https?:|mailto:|#)/.test(target)) continue
      const rel = relative(ROOT, resolve(ROOT, dirOf(doc), target.split('#')[0])).split(sep).join('/')
      if (rel.startsWith('..')) errors.push(`${doc}：引用越出仓库 —— ${target}`)
      else if (isAncestorDir(effectiveTargetDir(rel), doc))
        errors.push(`${doc}：引用方向向上（祖先）—— ${target}（只允许平级或子一级）`)
    }
    // 路径 token：引用即跟踪
    for (const m of text.matchAll(TOKEN_RE)) {
      const tok = stripEdgePunct(m[0])
      if (!isPathLike(tok) || /^(https?:|mailto:)/i.test(tok) || tok.includes('://')) continue
      if (tok.includes('*')) continue // glob 模式（如 server/*.log）不作为单一引用
      if (text[m.index + m[0].length] === '<' || text[m.index + m[0].length] === '*') continue // 模板/glob 截断
      if (tok.startsWith('kookit/')) continue // submodule 内部不在跟踪范围（红线：禁 commit/push）
      const rel = resolveToken(doc, tok)
      if (rel && rel.includes('/')) {
        docSet.add(rel) // 单段路径（根层的 client/、AGENTS.md 等泛指）不作边——不可行动的漂移面
      } else if (rel === null && KNOWN_ROOTS.some((r) => tok.startsWith(r))) {
        if (gitIgnored(tok) || gitIgnored(tok, true)) continue // gitignored 运行时路径（如探针 userData）非失效
        const key = `${doc}：疑似失效路径引用 —— ${tok}`
        if (!notices.includes(key)) notices.push(key)
      }
    }
  }
  return { errors, notices, edges }
}

const cmd = process.argv[2]

if (cmd === 'check') {
  const { errors, notices, edges } = inspect()
  for (const n of notices) console.log(yellow(`△ ${n}`))
  if (errors.length > 0) {
    console.error(red('doc-index check：存在错误。\n'))
    for (const e of errors) console.error(`  ${e}`)
    process.exit(1)
  }
  console.log(green(`doc-index check：${edges.size} 个文档的路径引用全部合规。`))
  process.exit(0)
}

if (cmd === 'hook') {
  const { errors, edges } = inspect()
  if (errors.length > 0) {
    console.error(red('doc-index 拦截\n'))
    for (const e of errors) console.error(`  ${e}`)
    console.error(`\n（修正引用或更新对应文档后重试；--no-verify 是人类的绕行特权——AGENTS.md）`)
    process.exit(1)
  }
  const staged = new Set(
    execSync('git diff --cached --name-only', { encoding: 'utf8' })
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p !== '')
  )
  const drifts = []
  for (const [doc, targets] of edges) {
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
