/**
 * repoGuard —— 仓库卫生门控（绝对路径与 API key 双拦截；挂在 git pre-commit，见 .githooks/）
 *
 * ── 命名规范 ──
 * ops/scripts/<域><动作>.mjs（Guard/Probe 两族，见 docGuard.mjs 头注）。本脚本 = 域 `repo`（仓库卫生）+ 动作 `Guard`。
 *
 * ── 用途 ──
 * 逐行比对两类模式，检出即挡：
 * ① 绝对路径（三形态：Windows 盘符、Unix 家目录、git-bash 挂载）——本机路径漏进共享文档，
 *   下一届 agent 会把它读进去当真甚至照着执行。只扫文档/配置类扩展（.md .txt .json .yml
 *   .yaml .toml .ps1 .sh）——程序源码里的绝对路径形状是测试夹具的合法合成数据，不归卫生管。
 * ② API key（八类模式）——密钥入库即泄露。扫全部文本源（含 .ts .tsx .go .mjs）。
 * `node ops/scripts/repoGuard.mjs` = 门控（hook 调的就是它）；`--report` = 体检报告，只打印不挡。
 *
 * ── 口径 ──
 * 排除 trash/（留档）与 client/src/renderer/public/（vendored 第三方产物，不可洗也不必洗）；
 * kookit/ 是 submodule，不在 git ls-files 里，天然排除。逐行先试绝对路径、再试密钥，
 * 一行只报第一个命中；密钥命中的行只显示「（片段隐去）」——检出的密钥不回显。
 * 值形如 `<占位符>` 的不算密钥（`<二级令牌，可空>`、`<7位大小写字母数字>` 是文档的合法写法）。
 * 运行环境：零依赖 Node ESM（node >= 20）；路径一律 / 分隔（git ls-files 口径）。
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const ABS_PATTERNS = [
  [/(?<![A-Za-z0-9])[A-Za-z]:[\\/]/, 'Windows 盘符绝对路径'],
  [/(?<![\w:])\/(?:home|Users|mnt|Volumes|root)\//, 'Unix 绝对路径'],
  [/(?<![\w:])\/(?:[a-z])\/(?=[A-Za-z])/, 'git-bash 挂载路径（/x/…）']
]

const KEY_PATTERNS = [
  [/sk-[A-Za-z0-9_\-]{20,}/, 'OpenAI 风格密钥'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS AccessKey'],
  [/\b(?:ghp|gho)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{20,}/, 'GitHub token'],
  [/\bxox[baprs]-[A-Za-z0-9\-]{10,}/, 'Slack token'],
  [/\bAIza[0-9A-Za-z_\-]{35}\b/, 'Google API key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, '私钥块'],
  [/\b(?:api[_-]?key|apikey|secret|token|password|passwd)\b["']?\s*[:=]\s*["']([^"']{8,})["']/i, '疑似密钥字面量赋值', true],
  [/\bbearer\s+[A-Za-z0-9._\-]{20,}/i, 'Bearer 凭据']
]

/** 占位符值（首尾尖括号、内部无尖括号）不判密钥：文档示例的合法写法 */
const isPlaceholderValue = (v) => /^<[^<>]*>$/.test(v)

const ABS_EXT = /\.(md|txt|json|yml|yaml|toml|ps1|sh)$/
const KEY_EXT = /\.(md|txt|json|yml|yaml|toml|mjs|cjs|ts|tsx|go|sh|ps1)$/
const EXCLUDED_PREFIX = ['trash/', 'client/src/renderer/public/']

const tracked = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .map((p) => p.trim())
  .filter((p) => p !== '' && !EXCLUDED_PREFIX.some((pre) => p.startsWith(pre)))

const isTTY = process.stdout.isTTY
const paint = (s, c) => (isTTY ? `\x1b[${c}m${s}\x1b[0m` : s)
const red = (s) => paint(s, '31')
const green = (s) => paint(s, '32')

const violations = []
let absCount = 0
let keyCount = 0
let scanned = 0

for (const p of tracked) {
  // 每个文件按扩展名决定要试哪些模式族：绝对路径限文档/配置，密钥扫全部文本源
  const pats = [
    ...(ABS_EXT.test(p) ? ABS_PATTERNS : []),
    ...(KEY_EXT.test(p) ? KEY_PATTERNS : [])
  ]
  if (pats.length === 0) continue
  scanned++
  let lines
  try {
    lines = readFileSync(p, 'utf8').split('\n')
  } catch {
    continue // 读取失败（权限/编码）不挡提交，交由 --report 观察
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const [re, kind, placeholderExempt] of pats) {
      const m = line.match(re)
      if (!m) continue
      if (placeholderExempt && isPlaceholderValue(m[1])) continue // 占位符豁免，继续试其余模式
      violations.push([p, i + 1, kind, placeholderExempt ? '（片段隐去）' : line.trim().slice(0, 100)])
      if (ABS_PATTERNS.some(([r]) => r === re)) absCount++
      else keyCount++
      break
    }
  }
}

if (process.argv.includes('--report')) {
  console.log('repoGuard --report：仓库卫生体检\n')
  if (violations.length === 0) {
    console.log(green(`✓ ${scanned} 个文件卫生达标（绝对路径 0 / 密钥 0）。`))
  } else {
    for (const [p, ln, kind, snippet] of violations) {
      console.log(`${red('✗')} ${p}:${ln}  [${kind}]  ${snippet}`)
    }
    console.log(
      `\n${violations.length} 处命中（绝对路径 ${absCount} / 密钥 ${keyCount}），` +
        `共扫描 ${scanned} 个文件。修法见门控模式输出。`
    )
  }
  process.exit(0) // 报告只观察，永不拦截
}

if (violations.length > 0) {
  console.error(red('repoGuard：仓库卫生违规，提交被挡。\n'))
  for (const [p, ln, kind, snippet] of violations) {
    console.error(`  ${p}:${ln}  [${kind}]  ${snippet}`)
  }
  console.error(
    `\n修法：所有路径一律仓库相对——命令示例从仓库根运行；指代仓库根写 <仓库根> 占位；` +
      `引用仓库外文件属越权动作，改写为指认来源的相对引用或删除。` +
      `\n（密钥检出 = 立即移出并轮换；--no-verify 是人类的绕行特权，agent 不可以——AGENTS.md）`
  )
  process.exit(1)
}

console.log(green(`repoGuard：${scanned} 个文件卫生达标（绝对路径 0 / 密钥 0）。`))
