import { describe, expect, it } from 'vitest'
import { inlineMarks, topLevelBlocks } from './mdEditorLive'

describe('mdEditorLive（Live Preview 纯逻辑）', () => {
  it('顶层块切分：段落/标题/空行分隔', () => {
    const blocks = topLevelBlocks('# 标题\n\n第一段\n\n- 甲\n- 乙')
    expect(blocks.map((b) => b.name)).toEqual(['ATXHeading1', 'Paragraph', 'BulletList'])
  })

  it('粗体：定界符 + 内容三段', () => {
    const marks = inlineMarks('前缀 **粗体** 后缀')
    expect(marks).toHaveLength(3)
    const text = '前缀 **粗体** 后缀'
    // 定界符 = ** 两处；内容 = 中间
    expect(text.slice(marks[0].from, marks[0].to)).toBe('**')
    expect(text.slice(marks[1].from, marks[1].to)).toBe('粗体')
    expect(marks[1].kind).toBe('strong')
    expect(text.slice(marks[2].from, marks[2].to)).toBe('**')
  })

  it('行内码：反引号连跑长度为定界长', () => {
    const text = 'a `code` b'
    const marks = inlineMarks(text)
    expect(text.slice(marks[0].from, marks[0].to)).toBe('`')
    expect(marks[1].kind).toBe('code')
    expect(text.slice(marks[1].from, marks[1].to)).toBe('code')
    expect(text.slice(marks[2].from, marks[2].to)).toBe('`')
  })

  it('斜体单星', () => {
    const marks = inlineMarks('*斜*')
    expect(marks[1].kind).toBe('em')
  })

  it('无标记文本 = 空范围', () => {
    expect(inlineMarks('普通文本没有标记')).toHaveLength(0)
  })
})
