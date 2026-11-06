/**
 * Live Preview 的纯逻辑层（零 CM6 依赖，@lezer/markdown 在 node 环境可测）：
 * 给定 Markdown 文本，产出两类范围——
 * ① **顶层块**（不含光标的块要整体替换成渲染 widget）；
 * ② **行内标记**（活动块里，定界符要隐藏、内容要按样式渲染）。
 * 装饰器装配在 mdEditor.ts（@codemirror/view 侧），本文件只算范围。
 */
import { parser as mdParser } from '@lezer/markdown'

export interface BlockRange {
  from: number
  to: number
  name: string
}

export interface MarkRange {
  from: number
  to: number
  /** delim = 定界符（隐藏）；strong/em/code = 内容样式 */
  kind: 'delim' | 'strong' | 'em' | 'code'
}

/** 顶层块范围（Document 的直接子节点；子节点的 from/to 不含段间空行）。 */
export function topLevelBlocks(text: string): BlockRange[] {
  const tree = mdParser.parse(text)
  const out: BlockRange[] = []
  let cur = tree.topNode.firstChild
  while (cur) {
    out.push({ from: cur.from, to: cur.to, name: cur.name })
    cur = cur.nextSibling
  }
  return out
}

/** 行内码的定界符长度（反引号连跑；`` `code` `` → 1、``````  escaped runs → N） */
function codeDelimLen(text: string): number {
  const m = text.match(/^`+/)
  return m ? m[0].length : 1
}

/**
 * 行内标记范围：**粗体** / *斜体* / `行内码`（定界符 + 内容）。
 * 只取**顶层**行内标记（嵌套强调的内容整体按外层样式走——v1 口径，防 replace 与
 * mark 范围交叉）。行内语法只存在于块内，故全文解析一次即可，位置即绝对位置。
 */
export function inlineMarks(text: string): MarkRange[] {
  const tree = mdParser.parse(text)
  const out: MarkRange[] = []
  // lezer 树节点接口手写最窄面（SyntaxNode 的 name/from/to/firstChild/nextSibling）
  const walk = (node: { name: string; from: number; to: number; firstChild: unknown; nextSibling: unknown }): void => {
    if (node.name === 'StrongEmphasis' || node.name === 'Emphasis' || node.name === 'InlineCode') {
      const len = node.name === 'StrongEmphasis' ? 2 : node.name === 'Emphasis' ? 1 : codeDelimLen(text.slice(node.from, node.to))
      const style = node.name === 'StrongEmphasis' ? 'strong' : node.name === 'Emphasis' ? 'em' : 'code'
      out.push({ from: node.from, to: node.from + len, kind: 'delim' })
      out.push({ from: node.from + len, to: node.to - len, kind: style })
      out.push({ from: node.to - len, to: node.to, kind: 'delim' })
      return
    }
    for (
      let c = node.firstChild as { name: string; from: number; to: number; firstChild: unknown; nextSibling: unknown } | null;
      c;
      c = c.nextSibling as typeof c
    ) {
      walk(c)
    }
  }
  walk(tree.topNode)
  return out
}
