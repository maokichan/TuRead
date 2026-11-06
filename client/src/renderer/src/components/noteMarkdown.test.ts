import { describe, expect, it } from 'vitest'
import { renderNoteMarkdown, markdownFromDom, markdownToDom } from './noteMarkdown'
import type { ReactElement } from 'react'

/** 取块级节点的类型序列（段落 p / 列表 ul / 引用 blockquote） */
function blockTypes(nodes: ReactNode[]): string[] {
  return nodes.map((n) => (n as ReactElement).type as string)
}

describe('renderNoteMarkdown（笔记 body 渲染子集）', () => {
  it('纯文本 = 单段落（Markdown 对纯文本透明）', () => {
    const nodes = renderNoteMarkdown('就是一句话')
    expect(blockTypes(nodes)).toEqual(['p'])
  })

  it('粗体/斜体/行内代码', () => {
    const nodes = renderNoteMarkdown('**重**和*斜*与`码`')
    const p = nodes[0] as ReactElement
    const parts = p.props.children as ReactNode[]
    expect(parts.some((n) => (n as ReactElement)?.type === 'strong')).toBe(true)
    expect(parts.some((n) => (n as ReactElement)?.type === 'em')).toBe(true)
    expect(parts.some((n) => (n as ReactElement)?.type === 'code')).toBe(true)
  })

  it('http 链接成 <a>；javascript: 降级纯文本不吞字', () => {
    const ok = renderNoteMarkdown('[站](https://a.b)')[0] as ReactElement
    expect(((ok.props.children as ReactNode[]).find((n) => (n as ReactElement)?.type === 'a') as ReactElement)?.props.href).toBe('https://a.b')
    const bad = renderNoteMarkdown('[x](javascript:alert(1))')[0] as ReactElement
    const text = (bad.props.children as ReactNode[]).map((n) => String((n as ReactElement)?.props?.children ?? n)).join('')
    expect(text).toContain('[x](javascript:alert(1))')
  })

  it('列表与引用分段', () => {
    const nodes = renderNoteMarkdown('- 甲\n- 乙\n\n> 引言')
    expect(blockTypes(nodes)).toEqual(['ul', 'blockquote'])
  })

  it('空行分段；段内单换行成 <br/>', () => {
    const nodes = renderNoteMarkdown('第一行\n第二行\n\n第三行')
    expect(blockTypes(nodes)).toEqual(['p', 'p'])
  })

  it('markdownFromDom(markdownToDom(x)) ≈ x（子集内 round-trip）', () => {
    const src = '**粗** *斜* `码` [站](https://a.b)\n\n- 甲\n- 乙\n\n> 引言'
    const frag = markdownToDom(src, document)
    const holder = document.createElement('div')
    holder.appendChild(frag)
    const out = markdownFromDom(holder)
    expect(out).toBe(src)
  })
})
