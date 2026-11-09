/**
 * docIndex —— 引用即链接（挂在 git pre-commit，见 .githooks/）
 *
 * ── 法律（用户 2026-11-10 结构治理批终裁）──
 * ① **所有引用必须 []() 链接形态**：反引号壳、裸路径、裸文档名、裸词干都算引用——
 *    解析到仓库实物（文件级）的一律必须写成链接；目录（含 gitignored 运行时路径）形态自由。
 * ② **向上引用无合法形态**：解析目标在引用文档的祖先目录（含仓库根）的——链接、反引号、
 *    裸词，任何形态都违规。唯一处置 = 删除该引用或改写为不含路径 token 的中文表述
 *    （渐进式披露：内容只向下流，竖直导航由入口链承担）。
 * ③ **死引用非法**：链接目标不存在 = 死链；以已知根段开头而解析失败 = 死引用。均拦截。
 * ④ **解析不到仓库实物的不算引用**（EPUB/PDF 类散文词、模板串、非仓库路径）——合法，不管。
 * ⑤ 方向纪律只约束引用的**方向合法性**（见②）；「平级/子一级/跨支」引用走①必须是链接。
 * 解析次序：文档目录 → 各级祖先 → 仓库根 → client/ → server/，取首个存在者；
 * 无扩展名补 .md/.mjs 一试；仍失败且形如文档名/词干的，走「全仓唯一文件名索引」，
 * 唯一命中即解析成功、多命中报「重名需显式路径」。机制不保证同步、不校验语义；
 * 它只让「该看一眼」无处遁形。漂移提醒保留：被引用文件进暂存区而引用文档没动 → 提醒。
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

/** 方向比较基准：目录目标取目录本身，文件目标取其所在目录 */
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

const isDirPath = (rel) => {
  try {
    return statSync(join(ROOT, rel)).isDirectory()
  } catch {
    return false
  }
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

/** 已知仓库根段：这些开头而解析失败的引用 = 死引用 */
const KNOWN_ROOTS = ['client/', 'docs/', 'ops/', 'server/', '.agents/', 'scripts/']

/** 直接路径层：文档目录 → 各级祖先 → 仓库根 → client/ → server/，无扩展名补 .md/.mjs 一试 */
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

/** 全量扫描。返回 { errors, edges }；edges = 跟踪边集（漂移提醒用） */
const inspect = () => {
  const errors = []
  const edges = new Map()
  const docs = trackedMd()

  // 全仓文件名索引：裸文档名/词干在直接路径层失败后的唯一命中解析层
  const byName = new Map()
  for (const p of docs) {
    const base = p.split('/').pop().toLowerCase()
    if (!byName.has(base)) byName.set(base, [])
    byName.get(base).push(p)
  }
  const resolveByName = (doc, tok) => {
    const key = (tok.toLowerCase().endsWith('.md') ? tok : tok + '.md').toLowerCase()
    const hits = byName.get(key)
    if (!hits || hits.length === 0) return null
    if (hits.length > 1) return { ambiguous: hits }
    return hits[0]
  }

  for (const doc of docs) {
    let text
    try {
      text = readFileSync(join(ROOT, doc), 'utf8')
    } catch {
      continue
    }
    const docSet = new Set()
    edges.set(doc, docSet)
    const lines = text.split('\n')
    let fence = false
    for (let li = 0; li < lines.length; li++) {
      const raw = lines[li]
      if (/^\s*(```|~~~)/.test(raw)) {
        fence = !fence
        continue
      }
      if (fence) continue
      if (/^\s*跟踪[:：]/.test(raw)) continue
      const at = `${doc}:${li + 1}`
      // ① 链接：越仓 / 向上 / 死链 三查，然后掩掉（链接形态 = 合法形态，token 层不再看它）
      const line = raw.replace(/\[[^\]]*\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (m, target) => {
        if (/^(https?:|mailto:|#)/.test(target)) return ' '.repeat(m.length)
        const bare = target.split('#')[0]
        const rel = relative(ROOT, resolve(ROOT, dirOf(doc), bare)).split(sep).join('/')
        if (rel.startsWith('..')) errors.push(`${at}：引用越出仓库 —— ${target}`)
        else if (isAncestorDir(effectiveTargetDir(rel), doc))
          errors.push(`${at}：引用方向向上（祖先）—— ${target}（向上引用无合法形态：删除或改写为不含路径的中文表述）`)
        else if (!existsSync(join(ROOT, rel))) {
          if (!gitIgnored(rel) && !gitIgnored(rel, true)) errors.push(`${at}：死链 —— ${target}`)
        } else docSet.add(rel)
        return ' '.repeat(m.length)
      })
      // ② 反引号 span 与自由文本：同一条 token 法（链接已掩掉，剩下的可解析文件引用都是非法形态）
      const parts = line.split(/(`[^`\n]+`)/)
      for (let pi = 0; pi < parts.length; pi++) {
        const seg = parts[pi]
        for (const m of seg.matchAll(TOKEN_RE)) {
          const tok = stripEdgePunct(m[0])
          if (!isPathLike(tok) || /^(https?:|mailto:)/i.test(tok) || tok.includes('://')) continue
          if (tok.includes('*') || /[{<]/.test(tok)) continue // glob/模板不作单一引用
          const after = seg[m.index + m[0].length]
          if (after === '*' || after === '<') continue // glob/模板截断（token 停在记号前）
          if (tok.startsWith('kookit/')) continue // submodule 不在跟踪范围（红线）
          let rel = resolveToken(doc, tok)
          let ambiguous = null
          if (!rel) {
            const byIdx = resolveByName(doc, tok)
            if (byIdx && byIdx.ambiguous) {
              ambiguous = byIdx.ambiguous
            } else if (byIdx) {
              rel = byIdx
            }
          }
          if (!rel) {
            if (KNOWN_ROOTS.some((r) => tok.startsWith(r))) {
              if (!gitIgnored(tok) && !gitIgnored(tok, true))
                errors.push(`${at}：死引用 —— ${tok}（解析不到仓库实物）`)
            }
            continue
          }
          if (rel === doc) continue // 自引：本文提自己，任何形态合法
          if (isAncestorDir(effectiveTargetDir(rel), doc)) {
            errors.push(`${at}：向上引用无合法形态 —— ${tok} ⇒ ${rel}（删除或改写为不含路径的中文表述）`)
            continue
          }
          docSet.add(rel)
          if (!isDirPath(rel))
            errors.push(`${at}：引用必须为 []() 链接 —— ${tok}（反引号/裸写形态已废，改为 [${tok}](${toRel(doc, rel)})）`)
        }
      }
    }
  }
  return { errors, edges }
}

/** 链接目标建议：文档目录相对路径 */
const toRel = (doc, relResolved) => {
  let rel = relative(dirname(join(ROOT, doc)), join(ROOT, relResolved)).split(sep).join('/')
  return rel === '' ? relResolved : rel
}

const cmd = process.argv[2]

if (cmd === 'check') {
  const { errors, edges } = inspect()
  if (errors.length > 0) {
    console.error(red('doc-index check：存在错误。\n'))
    for (const e of errors) console.error(`  ${e}`)
    process.exit(1)
  }
  console.log(green(`doc-index check：${edges.size} 个文档的引用全部合规（引用即链接 / 无向上 / 无死链）。`))
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
