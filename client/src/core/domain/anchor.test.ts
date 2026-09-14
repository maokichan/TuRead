/**
 * `core/domain/anchor.ts` 单元断言 —— 定位转换机制（选区级）的语义回归。
 *
 * 为什么这个模块值得单测：锚点的判据细且**互相耦合**（Fragment 优先/降级 Norm/相似度阈值/
 * 落库往返/坏数据降级），任何一条被改坏都表现为"笔记跳到别处"或"高亮不显示"这类**远端症状**，
 * 靠真机肉眼极难定位。故把判据钉在这里。
 *
 * 归属：开发设施（vitest，devDependency，不进发行物）。
 */
import { describe, expect, it } from 'vitest'
import {
  anchorKey,
  anchorStrengthOf,
  anchorToColumns,
  clipQuote,
  columnsToAnchor,
  compareAnchor,
  describeAnchor,
  normalizeAnchor,
  quoteSimilarity,
  sameAnchor
} from './anchor'
import type { AnchorFragment, TextAnchor } from './types'

/** 造锚点的小工具：fragment 传 null = 无引擎载荷（弱锚点） */
function make(
  chapterIndex: number,
  progression: number,
  exact: string,
  fragmentKey: string | null,
  opts: { prefix?: string; suffix?: string; engine?: string } = {}
): TextAnchor {
  const fragment: AnchorFragment | null = fragmentKey
    ? { engine: opts.engine ?? 'kookit-rangy', key: fragmentKey }
    : null
  return {
    norm: {
      chapterIndex,
      progression,
      quote: { exact, prefix: opts.prefix ?? '', suffix: opts.suffix ?? '' }
    },
    fragment
  }
}

describe('normalizeAnchor（边界容错）', () => {
  it('string 章号归一为 number，progression 越界被 clamp', () => {
    const n = normalizeAnchor({
      norm: { chapterIndex: '3' as unknown as number, progression: 2 },
      fragment: { engine: 'e', key: 'k' }
    })
    expect(n.norm.chapterIndex).toBe(3)
    expect(n.norm.progression).toBe(1)
    expect(n.fragment).not.toBeNull()
  })

  it('半截 fragment（缺 key 或缺 engine）判为无载荷', () => {
    expect(normalizeAnchor({ norm: { chapterIndex: 1 }, fragment: { engine: 'e' } }).fragment).toBeNull()
    expect(normalizeAnchor({ norm: { chapterIndex: 1 }, fragment: { key: 'k' } }).fragment).toBeNull()
  })

  it('null / 空输入不抛错，给空锚点', () => {
    expect(normalizeAnchor(null).norm.quote.exact).toBe('')
    expect(normalizeAnchor(undefined).fragment).toBeNull()
  })

  it('负章号归一为 0', () => {
    expect(normalizeAnchor({ norm: { chapterIndex: -5 } }).norm.chapterIndex).toBe(0)
  })

  it('缺 quote 时补空串（不产生 undefined）', () => {
    const n = normalizeAnchor({ norm: { chapterIndex: 1 } })
    expect(n.norm.quote).toEqual({ exact: '', prefix: '', suffix: '' })
  })
})

describe('sameAnchor（保守口径：只认 Fragment 相等）', () => {
  it('Fragment 相等即同位置，忽略 Norm 侧差异', () => {
    expect(sameAnchor(make(1, 0.1, 'x', 'K1'), make(1, 0.9, 'y', 'K1'))).toBe(true)
  })

  it('Fragment 不等 → 不同', () => {
    expect(sameAnchor(make(1, 0.1, 'x', 'K1'), make(1, 0.1, 'x', 'K2'))).toBe(false)
  })

  it('跨引擎即便 key 相同也不判同（载荷不可互译）', () => {
    expect(sameAnchor(make(1, 0.1, 'x', 'K', { engine: 'a' }), make(1, 0.1, 'x', 'K', { engine: 'b' }))).toBe(
      false
    )
  })

  it('任一锚点无 Fragment → 不判同（宁可漏合并，不误合并）', () => {
    expect(sameAnchor(make(1, 0.1, 'x', null), make(1, 0.1, 'x', null))).toBe(false)
  })
})

describe('compareAnchor（先 Fragment 后 Norm，§3.1.1 ②）', () => {
  it('Fragment 相等 → exact 且 order=0，不经过文本比较', () => {
    const c = compareAnchor(make(2, 0.3, ' hello world ', 'K9'), make(2, 0.8, 'hello world', 'K9'))
    expect(c.match).toBe('exact')
    expect(c.order).toBe(0)
  })

  it('Fragment 不同但同章且 quote 相同 → strong', () => {
    const c = compareAnchor(make(2, 0.3, '相同的原文内容', 'KA'), make(2, 0.3, '相同的原文内容', 'KB'))
    expect(c.match).toBe('strong')
  })

  it('同章但 quote 不符 → weak', () => {
    const c = compareAnchor(
      make(2, 0.3, '完全不一样的一段文字', 'KA'),
      make(2, 0.3, '另一个毫不相干的东西', 'KB')
    )
    expect(c.match).toBe('weak')
  })

  it('跨章 → unrelated，但仍给出定序', () => {
    const c = compareAnchor(make(1, 0.9, 'x', null), make(2, 0.1, 'x', null))
    expect(c.match).toBe('unrelated')
    expect(c.order).toBe(-1)
  })

  it('同章按 progression 定序', () => {
    expect(compareAnchor(make(2, 0.2, 'x', null), make(2, 0.7, 'x', null)).order).toBe(-1)
    expect(compareAnchor(make(2, 0.7, 'x', null), make(2, 0.2, 'x', null)).order).toBe(1)
  })

  it('缺锚 → order null', () => {
    expect(compareAnchor(null, make(1, 0, 'x', null)).order).toBeNull()
  })

  it('同引擎但 key 不同 → 不得判 exact（保证 exact 只能是真同一处）', () => {
    expect(compareAnchor(make(1, 0.5, 'q', 'K1'), make(1, 0.5, 'q', 'K2')).match).not.toBe('exact')
  })
})

describe('quoteSimilarity（bigram Dice）', () => {
  it('全等 = 1；空串 = 0', () => {
    expect(quoteSimilarity('一模一样的一段话', '一模一样的一段话')).toBe(1)
    expect(quoteSimilarity('', 'abc')).toBe(0)
    expect(quoteSimilarity('abc', '')).toBe(0)
  })

  it('空白差异被折叠（排版差异不该惩罚相似度）', () => {
    expect(quoteSimilarity('多  个   空白', '多 个 空白')).toBe(1)
  })

  it('局部改一字仍高度相符（> 阈值 0.8）', () => {
    const sim = quoteSimilarity(
      '这是一段用来测试相似度的中文原文内容',
      '这是一段用来测试相似程度的中文原文内容'
    )
    expect(sim).toBeGreaterThan(0.8)
  })

  it('无关文本相似度很低', () => {
    expect(
      quoteSimilarity('这是一段用来测试相似度的中文原文内容', '完全不同的另一句话在此处出现')
    ).toBeLessThan(0.3)
  })

  it('短串（<2 字符）走包含判定而非 bigram', () => {
    expect(quoteSimilarity('甲', '甲')).toBe(1)
    expect(quoteSimilarity('甲', '乙')).toBe(0)
  })
})

describe('anchorStrengthOf（单锚点的回跳能力属性）', () => {
  it('有 Fragment → strong；只有 quote → weak；皆无 → none', () => {
    expect(anchorStrengthOf(make(1, 0.5, 'q', 'K'))).toBe('strong')
    expect(anchorStrengthOf(make(1, 0.5, 'q', null))).toBe('weak')
    expect(anchorStrengthOf(make(1, 0.5, '', null))).toBe('none')
    expect(anchorStrengthOf(null)).toBe('none')
  })
})

describe('落库映射（notes 表三列，§3.1.1 ①）', () => {
  const orig = make(7, 0.4286, '划线原文快照', '{"start":10,"end":20}', {
    prefix: '前文',
    suffix: '后文'
  })

  it('anchor_key 逐字节原样（不套壳、不加前缀）', () => {
    expect(anchorToColumns(orig).anchorKey).toBe('{"start":10,"end":20}')
  })

  it('chapterIndex → chapter_index', () => {
    expect(anchorToColumns(orig).chapterIndex).toBe(7)
  })

  it('engine/prefix/suffix/progression 存进 anchor_hint，而 exact **不**进 hint', () => {
    const hint = JSON.parse(anchorToColumns(orig).anchorHint) as Record<string, unknown>
    expect(hint.engine).toBe('kookit-rangy')
    expect(hint.prefix).toBe('前文')
    expect(hint.suffix).toBe('后文')
    expect(hint.progression).toBe(0.4286)
    expect(hint.exact).toBeUndefined()
  })

  it('往返后 Fragment 仍判同，且 Norm 各字段装回', () => {
    const cols = anchorToColumns(orig)
    const back = columnsToAnchor({
      chapterIndex: cols.chapterIndex,
      anchorKey: cols.anchorKey,
      anchorHint: cols.anchorHint,
      excerpt: '划线原文快照'
    })
    expect(sameAnchor(orig, back)).toBe(true)
    expect(back.norm.quote.exact).toBe('划线原文快照')
    expect(back.norm.quote.prefix).toBe('前文')
    expect(back.norm.progression).toBe(0.4286)
  })

  it('无 Fragment 时 anchor_key 为空串', () => {
    expect(anchorToColumns(make(1, 0.5, 'q', null)).anchorKey).toBe('')
  })
})

describe('columnsToAnchor 降级（一条坏笔记不该让整本书的笔记列表打不开）', () => {
  it('hint 非法 JSON → 降级为无载荷，但章号与 excerpt 仍可用', () => {
    const bad = columnsToAnchor({
      chapterIndex: 3,
      anchorKey: 'K',
      anchorHint: '{不是合法JSON',
      excerpt: '原文'
    })
    expect(bad.fragment).toBeNull()
    expect(bad.norm.chapterIndex).toBe(3)
    expect(bad.norm.quote.exact).toBe('原文')
  })

  it('缺 engine → 降级（不认识的载荷不硬解释）', () => {
    expect(
      columnsToAnchor({ chapterIndex: 3, anchorKey: 'K', anchorHint: '{"progression":0.5}', excerpt: '' })
        .fragment
    ).toBeNull()
  })

  it('缺 anchor_key → 降级', () => {
    expect(
      columnsToAnchor({ chapterIndex: 3, anchorKey: '', anchorHint: '{"engine":"kookit-rangy"}' }).fragment
    ).toBeNull()
  })

  it('列缺失/为 null 不抛错', () => {
    const a = columnsToAnchor({})
    expect(a.norm.chapterIndex).toBe(0)
    expect(a.fragment).toBeNull()
  })
})

describe('anchorKey / describeAnchor / clipQuote', () => {
  it('有 Fragment 用精确键，无 Fragment 用 Norm 粗键（前缀可辨精度）', () => {
    expect(anchorKey(make(2, 0.5, 'q', 'K1'))).toBe('kookit-rangy|K1')
    expect(anchorKey(make(2, 0.5, 'q', null))).toBe('norm|c2@0.5000')
  })

  it('describeAnchor 可读且 null 安全', () => {
    expect(describeAnchor(make(7, 0.5, '原文', 'K'))).toContain('c7')
    expect(describeAnchor(make(7, 0.5, '原文', null))).toContain('norm-only')
    expect(describeAnchor(null)).toBe('(无锚点)')
  })

  it('clipQuote 超长截断、不超长时原样', () => {
    expect(clipQuote('abcdefghij', 4)).toBe('abcd')
    expect(clipQuote('ab', 4)).toBe('ab')
    expect(clipQuote('', 4)).toBe('')
  })
})
