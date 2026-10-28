/**
 * 设计语法守卫（styleGrammar）—— 批1 地基（设计语法 v2）的机器化纪律。
 *
 * 为什么要有：视觉语汇此前只有 STYLE.md 人肉约束，探查证实已经漂移过四次（rounded 档位、
 * 负片范围、动效时长旁路、死 token）。本文件把语法变成**失败即红的断言**，
 * 与 `layering.test.ts`（架构分层守卫）同一手段：静态读源码 + 行级正则，零依赖。
 *
 * 守卫面（渲染层 tsx/ts，不含 styles.css——那是 token 唯一来源，另有人查）：
 *   ① 圆角：字面档位类（rounded-sm/md/lg/xl/2xl/3xl）禁用 —— 一律
 *      `rounded-[var(--radius-*)]` 四档语义 token；rounded-full（胶囊）豁免。
 *   ② 动效：出现 `transition-*` 类的行必须带 `--dur-`（默认 150ms 旁路就此堵死）。
 *      行级判据：className 模板全部单行书写，拆行书写 = 先改写法再写样式。
 *   ③ 层级：`z-<数字>` 字面档位禁用 —— 一律 `z-[var(--z-*)]` 五档命名档位。
 *
 * 设计要点（与 layering.test.ts 同口径）：**防静默通过** —— 先断言真的扫到了文件与
 * 既有 token 用法，规则失效时是红不是绿。例外不设白名单，走"改代码对齐语法"。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const RENDERER = resolve(process.cwd(), 'src', 'renderer', 'src')

function walk(dir: string): string[] {
  let out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      out = out.concat(walk(p))
    } else if ((p.endsWith('.ts') || p.endsWith('.tsx')) && !p.endsWith('.test.ts')) {
      out.push(p)
    }
  }
  return out
}

/** 相对路径列表；防"扫到零文件"式静默全绿 */
function files(): string[] {
  const list = walk(RENDERER).map((f) => relative(RENDERER, f).split(sep).join('/'))
  expect(list.length, '语法守卫没扫到任何源文件——扫描根可能错了').toBeGreaterThanOrEqual(30)
  return list
}

const fmt = (hits: Array<{ file: string; line: number; text: string }>): string =>
  hits.map((h) => `  ${h.file}:${h.line}  ${h.text.trim()}`).join('\n')

/** 行级扫描：返回命中规则的行（文件内行号从 1 起） */
function scanLines(files: string[], keep: (line: string) => boolean): Array<{ file: string; line: number; text: string }> {
  const hits: Array<{ file: string; line: number; text: string }> = []
  for (const rel of files) {
    readFileSync(join(RENDERER, rel), 'utf8')
      .split('\n')
      .forEach((text, i) => {
        if (keep(text)) hits.push({ file: rel, line: i + 1, text })
      })
  }
  return hits
}

describe('设计语法守卫（批1 地基）', () => {
  it('圆角：字面档位类禁用，一律 radius token（rounded-full 豁免）', () => {
    const all = files()
    // 防静默通过：语法落地后，token 形态的用法应该真实存在
    expect(
      scanLines(all, (l) => l.includes('rounded-[var(--radius-')).length,
      '渲染层没有任何 rounded-[var(--radius-*)] 用法——守卫对象不存在了'
    ).toBeGreaterThanOrEqual(10)

    const bad = scanLines(all, (l) => /[\s"'`]rounded-(sm|md|lg|xl|2xl|3xl)[\s"'`]/.test(l))
    expect(bad, `圆角字面档位（应改用 rounded-[var(--radius-*)] 四档 token）：\n${fmt(bad)}`).toEqual([])
  })

  it('动效：出现 transition-* 类的行必须带 --dur- 时长（堵默认 150ms 旁路）', () => {
    const all = files()
    expect(scanLines(all, (l) => l.includes('duration-[var(--dur-')).length).toBeGreaterThanOrEqual(8)

    const bad = scanLines(all, (l) => l.includes('transition-') && !l.includes('--dur-'))
    expect(bad, `transition 类缺 --dur- 时长（吃默认 150ms 或写死）：\n${fmt(bad)}`).toEqual([])
  })

  it('层级：z 字面档位禁用，一律 z token（阅读器内部微序在 styles.css，不在扫描面）', () => {
    const all = files()
    expect(scanLines(all, (l) => l.includes('z-[var(--z-')).length).toBeGreaterThanOrEqual(5)

    const bad = scanLines(all, (l) => /[\s"'`]z-\d+/.test(l))
    expect(bad, `z-index 字面档位（应改用 z-[var(--z-*)] 五档命名档位）：\n${fmt(bad)}`).toEqual([])
  })
})
