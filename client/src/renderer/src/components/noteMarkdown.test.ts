import { describe, expect, it } from 'vitest'
import { renderNoteMarkdown, markdownToDom, markdownFromDom } from './noteMarkdown'
import type { ReactElement, ReactNode } from 'react'

/** 取块级节点的类型序列（段落 p / 列表 ul / 引用 blockquote） */
function blockTypes(nodes: ReactNode[]): string[] {
  return nodes.map((n) => (n as ReactElement).type as string)
}

/** 断言辅助：块级元素的 props（ReactElement 的 props 在测试里收紧成 Record） */
function propsOf(n: ReactNode): Record<string, unknown> {
  return (n as ReactElement).props as Record<string, unknown>
}

/** 行内子节点（块级元素的 children；单子节点归一成数组） */
function inlineOf(block: ReactNode): ReactNode[] {
  const c = propsOf(block).children
  return (Array.isArray(c) ? c : [c]) as ReactNode[]
}

describe('renderNoteMarkdown（笔记 body 渲染子集）', () => {
  it('纯文本 = 单段落（Markdown 对纯文本透明）', () => {
    const nodes = renderNoteMarkdown('就是一句话')
    expect(blockTypes(nodes)).toEqual(['p'])
  })

  it('粗体/斜体/行内代码', () => {
    const nodes = renderNoteMarkdown('**重**和*斜*与`码`')
    const parts = inlineOf(nodes[0])
    expect(parts.some((n) => (n as ReactElement)?.type === 'strong')).toBe(true)
    expect(parts.some((n) => (n as ReactElement)?.type === 'em')).toBe(true)
    expect(parts.some((n) => (n as ReactElement)?.type === 'code')).toBe(true)
  })

  it('http 链接成 <a>；javascript: 降级纯文本不吞字', () => {
    const ok = inlineOf(renderNoteMarkdown('[站](https://a.b)')[0])
    const a = ok.find((n) => (n as ReactElement)?.type === 'a') as ReactElement
    expect((a.props as Record<string, unknown>).href).toBe('https://a.b')

    const bad = inlineOf(renderNoteMarkdown('[x](javascript:alert(1))')[0])
    // 非法协议 = 整段字面文本（一个字符都不吞——括号是完整的）
    const text = bad.filter((n) => typeof n === 'string').join('')
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
})

// ————— 笔记引用（wikilink，文档层批）—————

const UUID = '3f2c9a1e-5b6d-4c7e-8a9b-0c1d2e3f4a5b'
const REF_FULL = `[[檔案 · 三體#note-${UUID}|跳轉名]]`
const REF_SHORT = `![[note-${UUID}]]`

describe('笔记引用渲染与往返（noteRef）', () => {
  it('预览（Round-node）：全形态/短形态都渲染成 data-note-ref span，原文存 data-note-raw', () => {
    const nodes = renderNoteMarkdown(`前 ${REF_FULL} 中 ${REF_SHORT} 后`)
    const spans = inlineOf(nodes[0]).filter((n) => (n as ReactElement)?.type === 'span') as ReactElement[]
    expect(spans).toHaveLength(2)
    const [full, short] = spans.map((s) => s.props as Record<string, unknown>)
    expect(full['data-note-ref']).toBe(`note-${UUID}`)
    expect(full['data-note-raw']).toBe(REF_FULL)
    expect(full['children']).toBe('跳轉名')
    expect(String(full['className'])).toContain('note-ref')
    // 短形态无 `|` 段：顯示名兜底 = 目标本身（note-<uuid>）
    expect(short['data-note-ref']).toBe(`note-${UUID}`)
    expect(short['data-note-raw']).toBe(REF_SHORT)
    expect(short['children']).toBe(`note-${UUID}`)
  })

  it('非笔记引用的 wikilink 按字面（不吞字）；![[ 优先于 [[ 不误伤', () => {
    const nodes = renderNoteMarkdown('看 [[不是引用]] 与 [[x|y]]，引用在 [[not-note]] 后')
    const text = inlineOf(nodes[0]).filter((n) => typeof n === 'string').join('')
    expect(text).toContain('[[不是引用]]')
    expect(text).toContain('[[x|y]]')
    expect(text).toContain('[[not-note]]')
  })

  it('DOM 往返：markdownToDom 产 data-note-ref span，markdownFromDom 原样还原引用串', () => {
    const frag = markdownToDom(`第一行\n\n${REF_FULL}\n\n前 ${REF_SHORT} 后`, stubDoc as unknown as Document)
    const spans = findByAttr(frag as unknown as StubNode, 'data-note-ref')
    expect(spans).toHaveLength(2)
    expect(spans[0].getAttribute('data-note-raw')).toBe(REF_FULL)
    expect(spans[0].textContent).toBe('跳轉名')
    expect(spans[1].getAttribute('data-note-raw')).toBe(REF_SHORT)
    expect(markdownFromDom(frag as unknown as HTMLElement)).toBe(`第一行\n\n${REF_FULL}\n\n前 ${REF_SHORT} 后`)
  })

  it('DOM 往返：列表项里的引用同样无损序列化', () => {
    const frag = markdownToDom(`- 甲 ${REF_SHORT}`, stubDoc as unknown as Document)
    expect(findByAttr(frag as unknown as StubNode, 'data-note-ref')).toHaveLength(1)
    expect(markdownFromDom(frag as unknown as HTMLElement)).toBe(`- 甲 ${REF_SHORT}`)
  })
})

// ————— DOM 桩（vitest = node 环境；只实现 noteMarkdown 的 DOM 路径用到的面）—————

const TEXT_NODE_TYPE = 3
const ELEMENT_NODE_TYPE = 1
// markdownFromDom 以 `Node.TEXT_NODE` 判节点类型——node 环境无此全局，补最小面。
// 必须是**可 new 的类**：vitest 的断言打印器内部有 `x instanceof Node` 探测，
// 换成普通对象会让它直接崩（掩盖真实断言失败）。
class NodeStub {
  static TEXT_NODE = TEXT_NODE_TYPE
  static ELEMENT_NODE = ELEMENT_NODE_TYPE
}
;(globalThis as unknown as Record<string, unknown>).Node = NodeStub

class StubNode {
  nodeType: number
  childNodes: StubNode[] = []
  textContent = ''
  constructor(nodeType: number) {
    this.nodeType = nodeType
  }
}

class StubElement extends StubNode {
  tagName: string
  children: StubElement[] = []
  private attrs = new Map<string, string>()
  constructor(tag: string) {
    super(ELEMENT_NODE_TYPE)
    this.tagName = tag.toUpperCase()
  }
  appendChild(child: StubNode): StubNode {
    this.childNodes.push(child)
    if (child instanceof StubElement) this.children.push(child)
    return child
  }
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value)
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name)
  }
}

/** 够 markdownToDom 用的最小 Document 面（createElement/createTextNode/createDocumentFragment） */
const stubDoc = {
  createElement: (tag: string): StubElement => new StubElement(tag),
  createTextNode: (text: string): StubNode => {
    const n = new StubNode(TEXT_NODE_TYPE)
    n.textContent = text
    return n
  },
  createDocumentFragment: (): StubElement => new StubElement('#fragment')
}

/** 深度优先找带某属性的元素（桩不实现 querySelector，走手写遍历） */
function findByAttr(node: StubNode, attr: string): StubElement[] {
  const out: StubElement[] = []
  for (const child of node.childNodes) {
    if (child instanceof StubElement) {
      if (child.hasAttribute(attr)) out.push(child)
      out.push(...findByAttr(child, attr))
    }
  }
  return out
}
