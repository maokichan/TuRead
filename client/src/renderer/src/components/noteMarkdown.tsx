/**
 * 笔记 body 的 Markdown 渲染（笔记 v3 批N3）—— **纯函数 + React 节点，零依赖，无 innerHTML**。
 *
 * 支持子集（决策笔记 notes-v3-data-model「编辑器特性支持矩阵」——笔记 body 面）：
 * 段落（空行分段，段内单换行 = 换行）· **粗体** · *斜体* · `行内代码` · [文字](https://链接)
 * · `- ` 无序列表 · `> ` 引用。
 *
 * 纪律：
 * - **不用 dangerouslySetInnerHTML**——笔记内容会进 React 树，节点树是唯一出口；
 * - 链接只放行 http(s)（协议白名单，javascript: 等一律降级为纯文本）；
 * - 超出子集的语法（表格/代码块/wikilink…）按**字面文本**渲染——Markdown 对纯文本透明，
 *   未知语法不吞字。
 */

import React from 'react'
import type { ReactNode } from 'react'

const HTTP_URL = /^https?:\/\//i

/** 行内语法 → React 节点（**bold** / *italic* / `code` / [t](url)）。
 *  实现 = 顺序扫描 + 最小匹配：先找最早的触发符，同类不嵌套（子集口径）。 */
function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let rest = text
  let k = 0
  while (rest.length > 0) {
    const patterns: Array<{ re: RegExp; build: (m: RegExpMatchArray) => ReactNode }> = [
      { re: /\*\*([^*]+)\*\*/, build: (m) => <strong key={`${keyBase}-${k}`}>{m[1]}</strong> },
      { re: /\*([^*]+)\*/, build: (m) => <em key={`${keyBase}-${k}`}>{m[1]}</em> },
      { re: /`([^`]+)`/, build: (m) => <code key={`${keyBase}-${k}`}>{m[1]}</code> },
      {
        re: /\[([^\]]+)\]\(([^)\s]+)\)/,
        build: (m) => (
          <a key={`${keyBase}-${k}`} href={m[2]} target="_blank" rel="noreferrer">
            {m[1]}
          </a>
        )
      }
    ]
    let best: { index: number; match: RegExpMatchArray; build: (m: RegExpMatchArray) => ReactNode } | null = null
    for (const p of patterns) {
      const m = rest.match(p.re)
      // 链接协议白名单在**匹配时**判：非法 = 这个模式不参与（整段走字面，一个字符都不吞）
      if (m && m[0].startsWith('[') && !HTTP_URL.test(m[2])) continue
      if (m && m.index !== undefined && (best === null || m.index < best.index)) {
        best = { index: m.index, match: m, build: p.build }
      }
    }
    if (!best) {
      nodes.push(rest)
      break
    }
    if (best.index > 0) nodes.push(rest.slice(0, best.index))
    nodes.push(best.build(best.match))
    rest = rest.slice(best.index + best.match[0].length)
    k += 1
  }
  return nodes
}

/** 块级解析：空行分段；`- ` 列表（连续行合并）；`> ` 引用（连续行合并，段内换行保留）。 */
export function renderNoteMarkdown(body: string): ReactNode[] {
  const lines = body.replaceAll('\r\n', '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i += 1
      continue
    }
    if (line.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2))
        i += 1
      }
      blocks.push(
        <ul key={`b${key++}`}>
          {items.map((it, j) => (
            <li key={j}>{renderInline(it, `l${key}-${j}`)}</li>
          ))}
        </ul>
      )
      continue
    }
    if (line.startsWith('> ')) {
      const quoted: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoted.push(lines[i].slice(2))
        i += 1
      }
      blocks.push(
        <blockquote key={`b${key++}`}>
          {quoted.map((q, j) => (
            <p key={j}>{renderInline(q, `q${key}-${j}`)}</p>
          ))}
        </blockquote>
      )
      continue
    }
    // 普通段落：连续非空、非列表/引用前缀的行合并（单换行 = <br/>）
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('- ') &&
      !lines[i].startsWith('> ')
    ) {
      para.push(lines[i])
      i += 1
    }
    blocks.push(
      <p key={`b${key++}`}>
        {para.flatMap((l, j) =>
          j === 0 ? renderInline(l, `p${key}-${j}`) : [<br key={`br${j}`} />, ...renderInline(l, `p${key}-${j}`)]
        )}
      </p>
    )
  }
  return blocks
}

// ————— DOM 双向（文档层批N5：所见即所得的进入/退出序列化；与上方同一子集）—————

/** Markdown → DOM 节点（容器 innerHTML 之外的路：节点树构建，所见即所得模式的初始内容）。 */
export function markdownToDom(body: string, doc: Document): DocumentFragment {
  const frag = doc.createDocumentFragment()
  const lines = body.replaceAll('\r\n', '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i += 1
      continue
    }
    if (line.startsWith('- ')) {
      const ul = doc.createElement('ul')
      while (i < lines.length && lines[i].startsWith('- ')) {
        const li = doc.createElement('li')
        li.textContent = lines[i].slice(2)
        ul.appendChild(li)
        i += 1
      }
      frag.appendChild(ul)
      continue
    }
    if (line.startsWith('> ')) {
      const bq = doc.createElement('blockquote')
      while (i < lines.length && lines[i].startsWith('> ')) {
        const p = doc.createElement('p')
        p.textContent = lines[i].slice(2)
        bq.appendChild(p)
        i += 1
      }
      frag.appendChild(bq)
      continue
    }
    const p = doc.createElement('p')
    let run = ''
    const flushText = (): void => {
      if (run === '') return
      p.appendChild(doc.createTextNode(run))
      run = ''
    }
    // 行内：粗/斜/码/链接（textContent-only 构建 → 无注入面）
    const inline = line
    let j = 0
    while (j < inline.length) {
      const rest = inline.slice(j)
      const m =
        rest.match(/^\*\*([^*]+)\*\*/) ??
        rest.match(/^\*([^*]+)\*/) ??
        rest.match(/^`([^`]+)`/) ??
        rest.match(/^\[([^\]]+)\]\(([^)\s]+)\)/)
      if (!m) {
        run += inline[j]
        j += 1
        continue
      }
      flushText()
      if (m[0].startsWith('**')) {
        const b = doc.createElement('strong')
        b.textContent = m[1]
        p.appendChild(b)
      } else if (m[0].startsWith('*')) {
        const em = doc.createElement('em')
        em.textContent = m[1]
        p.appendChild(em)
      } else if (m[0].startsWith('`')) {
        const c = doc.createElement('code')
        c.textContent = m[1]
        p.appendChild(c)
      } else if (HTTP_URL.test(m[2])) {
        const a = doc.createElement('a')
        a.href = m[2]
        a.textContent = m[1]
        p.appendChild(a)
      } else {
        // 非法协议：整段字面（回退一个字符重扫，括号不吞）
        run += inline[j]
        j += 1
        continue
      }
      j += m[0].length
    }
    flushText()
    frag.appendChild(p)
    i += 1
  }
  return frag
}

/** DOM → Markdown（所见即所得退出/失焦时的序列化；只认子集标签，其余按文本走）。 */
export function markdownFromDom(root: HTMLElement): string {
  const inlineOf = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const el = node as HTMLElement
    switch (el.tagName) {
      case 'BR':
        return '\n'
      case 'STRONG':
      case 'B':
        return `**${inlineChildren(el)}**`
      case 'EM':
      case 'I':
        return `*${inlineChildren(el)}*`
      case 'CODE':
        return `\`${el.textContent ?? ''}\``
      case 'A': {
        const href = el.getAttribute('href') ?? ''
        return HTTP_URL.test(href) ? `[${el.textContent ?? ''}](${href})` : (el.textContent ?? '')
      }
      default:
        return inlineChildren(el)
    }
  }
  const inlineChildren = (el: HTMLElement): string =>
    Array.from(el.childNodes).map(inlineOf).join('')

  const blocks: string[] = []
  for (const child of Array.from(root.children)) {
    const el = child as HTMLElement
    if (el.tagName === 'UL') {
      for (const li of Array.from(el.children)) {
        blocks.push(`- ${(li as HTMLElement).textContent ?? ''}`)
      }
    } else if (el.tagName === 'BLOCKQUOTE') {
      for (const q of Array.from(el.children)) {
        blocks.push(`> ${(q as HTMLElement).textContent ?? ''}`)
      }
    } else {
      // P / DIV / H1-H6 一律按段落（子集内标题不进 v1——进了也只是文本行）
      const text = inlineChildren(el)
      if (text.trim() !== '') blocks.push(text)
    }
  }
  return blocks.join('\n\n')
}
