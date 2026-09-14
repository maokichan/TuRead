/**
 * 分层依赖守卫（架构纪律机器化）—— 2026-09-12 架构审查要求，2026-09-14 随 vitest 引入落地。
 *
 * 为什么要有：六边形架构的纪律（依赖方向 UI → usecases → ports ← adapters、领域层零依赖）
 * 此前只有"人肉复查"。审查中 CoverQueue 的依赖倒置就是靠临时 grep 抓到的 —— 一次性的 grep
 * 挡不住下一次。本文件把纪律变成**失败即红的断言**。
 *
 * 手段：静态读源码 + 抽 import 说明符（不解析 AST —— 正则对"说明符"这个粒度足够可靠，
 * 且零依赖、易读易改；真要 AST 再上 ts-morph，现在不值当）。
 *
 * 设计要点：**防静默通过**（守卫测试最危险的失败模式是扫到零文件然后"全绿"），
 * 故每条规则都先断言"真的扫到了文件"；**例外必须显式登记**（见 UI_IMPL_EXCEPTIONS），
 * 收紧/放宽规则要改名单，而不是让规则慢慢失效。
 *
 * 归属：开发设施（devDependency，不进发行物）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/** 仓库内客户端源码根（vitest root = client/） */
const SRC = resolve(process.cwd(), 'src')

/** 一处的 import 记录 */
interface Dep {
  file: string
  spec: string
}

function walk(dir: string): string[] {
  let out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      out = out.concat(walk(p))
    } else if (p.endsWith('.ts') || p.endsWith('.tsx')) {
      out.push(p)
    }
  }
  return out
}

/** 抽出一个文件里所有 import/export/require 的模块说明符 */
function specifiersOf(code: string): string[] {
  const specs: string[] = []
  const push = (m: RegExpMatchArray | null): void => {
    if (m?.[1]) specs.push(m[1])
  }
  // import ... from 'x' / export ... from 'x'
  for (const m of code.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) push(m)
  // import('x') 动态导入
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) push(m)
  // import 'x' 副作用导入
  for (const m of code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) push(m)
  // require('x')
  for (const m of code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) push(m)
  return specs
}

/** 某目录树下（去掉测试文件）的源文件相对路径列表 */
function filesIn(absDir: string): string[] {
  return walk(absDir)
    .filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))
    .map((f) => relative(SRC, f).split(sep).join('/'))
    .sort()
}

/** 收集某目录树下的全部依赖 */
function depsIn(absDir: string): Dep[] {
  const out: Dep[] = []
  for (const rel of filesIn(absDir)) {
    const code = readFileSync(join(SRC, rel), 'utf8')
    for (const spec of specifiersOf(code)) out.push({ file: rel, spec })
  }
  return out
}

const isRelative = (s: string): boolean => s.startsWith('.')
const ALIASES = ['@core/', '@shared/', '@renderer/', '@vendor/']
/** 裸说明符 = 外部 npm 包（非相对、非别名、非 node: 内置） */
const isBare = (s: string): boolean =>
  !isRelative(s) && !ALIASES.some((a) => s.startsWith(a)) && !s.startsWith('node:')

const fmt = (deps: Dep[]): string => deps.map((d) => `  ${d.file} → ${d.spec}`).join('\n')

/**
 * UI 不绕过 ServiceContainer 这条规则的**显式例外**。
 *
 * `renderer/src/parse/` —— 离屏解析页（parse.html）**不是 UI**：它是独立进程的**无头 worker 页**，
 * 存在意义就是替主窗口持有 kookit 实例做全书解析（kookit getMetadata 是全书解析，跑主窗口会把 UI
 * 饿死；见该文件头注释与 `kookitLoader.ts` 的"供两处使用"说明）。把它算作 UI 会逼出
 * "为了过守卫而加一层无意义包装"的坏味道 —— 规则该服务于意图，不是反过来。
 */
const UI_IMPL_EXCEPTIONS = ['renderer/src/parse/']

describe('分层依赖守卫', () => {
  it('领域层零依赖：domain/** 只允许同层相对导入（零外部 npm、零跨层）', () => {
    const files = filesIn(join(SRC, 'core', 'domain'))
    // 防静默通过：先确认真的扫到了领域层源码
    expect(files.length).toBeGreaterThanOrEqual(4)

    const deps = depsIn(join(SRC, 'core', 'domain'))
    expect(deps.length).toBeGreaterThanOrEqual(3)

    const bad = deps.filter((d) => !isRelative(d.spec))
    expect(bad, `领域层出现了非相对导入：\n${fmt(bad)}`).toEqual([])

    // 相对导入不得越出 domain 层（'../' 出界即跨层）
    const escaping = deps.filter((d) => d.spec.startsWith('..'))
    expect(escaping, `领域层的相对导入越出了本层：\n${fmt(escaping)}`).toEqual([])
  })

  it('用例层只依赖 domain / ports（不得 import adapters / 渲染层 / 外部 npm）', () => {
    expect(filesIn(join(SRC, 'core', 'usecases')).length).toBeGreaterThanOrEqual(3)
    const deps = depsIn(join(SRC, 'core', 'usecases'))
    const ok = (s: string): boolean =>
      s.startsWith('@core/domain/') ||
      s.startsWith('@core/ports/') ||
      s.startsWith('./') ||
      s.startsWith('../domain/') ||
      s.startsWith('../ports/')
    const bad = deps.filter((d) => !ok(d.spec))
    expect(bad, `用例层出现了越界依赖：\n${fmt(bad)}`).toEqual([])
  })

  it('端口层不依赖适配器与用例（依赖倒置的方向不能反）', () => {
    expect(filesIn(join(SRC, 'core', 'ports')).length).toBeGreaterThanOrEqual(4)
    const deps = depsIn(join(SRC, 'core', 'ports'))
    const bad = deps.filter(
      (d) => d.spec.startsWith('@core/adapters') || d.spec.startsWith('@core/usecases') || isBare(d.spec)
    )
    expect(bad, `端口层反向依赖了实现：\n${fmt(bad)}`).toEqual([])
  })

  it('适配器不依赖 UI 与用例（adapters 只朝 ports/domain 依赖）', () => {
    expect(filesIn(join(SRC, 'core', 'adapters')).length).toBeGreaterThanOrEqual(4)
    const deps = depsIn(join(SRC, 'core', 'adapters'))
    const bad = deps.filter(
      (d) => d.spec.startsWith('@renderer/') || d.spec.startsWith('@core/usecases')
    )
    expect(bad, `适配器依赖了上层：\n${fmt(bad)}`).toEqual([])
  })

  it('UI 不直接 import 实现（vendor / adapters / 原生模块）—— 只走 ServiceContainer', () => {
    const files = filesIn(join(SRC, 'renderer', 'src'))
    expect(files.length).toBeGreaterThanOrEqual(20)

    // 例外名单防腐烂：每条例外都必须真的命中现存文件
    for (const prefix of UI_IMPL_EXCEPTIONS) {
      expect(
        files.some((f) => f.startsWith(prefix)),
        `UI 例外名单里的 ${prefix} 已不存在（名单过期，请清理）`
      ).toBe(true)
    }

    const forbidden = ['@vendor/', '@core/adapters/', 'better-sqlite3', 'ws', 'pdfjs-dist']
    const deps = depsIn(join(SRC, 'renderer', 'src')).filter(
      (d) => !UI_IMPL_EXCEPTIONS.some((p) => d.file.startsWith(p))
    )
    const bad = deps.filter((d) => forbidden.some((f) => d.spec.startsWith(f)))
    expect(bad, `UI 绕过了 ServiceContainer：\n${fmt(bad)}`).toEqual([])
  })

  it('主进程不 import 渲染层（进程边界不可跨越）', () => {
    expect(filesIn(join(SRC, 'main')).length).toBeGreaterThanOrEqual(3)
    const deps = depsIn(join(SRC, 'main'))
    const bad = deps.filter((d) => d.spec.startsWith('@renderer/'))
    expect(bad, `主进程依赖了渲染层：\n${fmt(bad)}`).toEqual([])
  })

  it('通用层（shared）保持叶子地位：不依赖 core 的任何子层', () => {
    expect(filesIn(join(SRC, 'shared')).length).toBeGreaterThanOrEqual(1)
    const deps = depsIn(join(SRC, 'shared'))
    const bad = deps.filter((d) => d.spec.startsWith('@core/'))
    expect(bad, `shared 反向依赖了 core：\n${fmt(bad)}`).toEqual([])
  })

  it('守卫自身可信：说明符抽取能认出各种 import 形态', () => {
    // 元测试 —— 若抽取逻辑被改坏（例如正则失效恒返回空），上面所有规则都会静默"全绿"。
    // 这里用一段构造代码把各形态各验一遍，保证守卫本身不会失效。
    const sample = [
      "import a from './x'",
      "import type { B } from '@core/domain/types'",
      "import './side-effect'",
      "export { c } from '@core/ports/render'",
      "const d = await import('@vendor/kookit.esm')",
      "const e = require('better-sqlite3')"
    ].join('\n')
    // 顺序 = 抽取函数的正则遍次（from → 动态 import → 副作用 import → require），非源码行序。
    // 断言精确顺序而非排序比较：这样"漏认一种形态"或"重复计入"都会现形。
    expect(specifiersOf(sample)).toEqual([
      './x',
      '@core/domain/types',
      '@core/ports/render',
      '@vendor/kookit.esm',
      './side-effect',
      'better-sqlite3'
    ])
  })
})
