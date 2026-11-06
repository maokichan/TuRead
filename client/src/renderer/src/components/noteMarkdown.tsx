/**
 * 笔记 body 的 Markdown 渲染（笔记 v3 批N3）—— **纯函数 + React 节点，零依赖，无 innerHTML**。
 *
 * 支持子集（决策笔记 notes-v3-data-model「编辑器特性支持矩阵」——body 面 + 文档层基础 GFM）：
 * 段落（空行分段，段内单换行 = 换行）· **粗体** · *斜体* · `行内代码` · [文字](https://链接)
 * · `- ` 无序列表 · `> ` 引用 · `#`/`##`/`###` 标题（文档层；body 里同样按块渲染）
 * · 笔记引用 `![[目標]]` / `[[目標|顯示名]]`（文档层批：目標 = `檔案 · 書名#note-<uuid>`
 *   或短形态 `note-<uuid>`，渲染成可点 span，点击解引用归调用方）。
 *
 * 纪律：
 * - **不用 dangerouslySetInnerHTML**——笔记内容会进 React 树，节点树是唯一出口；
 * - 链接只放行 http(s)（协议白名单，javascript: 等一律降级为纯文本）；
 * - 超出子集的语法（表格/代码块/普通 wikilink…）按**字面文本**渲染——Markdown 对纯文本透明，
 *   未知语法不吞字（笔记引用除外：上方正则认得的才解析，认不得的照旧字面）。
 */

import React from 'react'
import type { ReactNode } from 'react'

const HTTP_URL = /^https?:\/\//i

// ————— 笔记引用（wikilink）—————
/** 笔记 id 形态（uuid，小写十六进制——落库即此形态） */
const NOTE_UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
/**
 * 笔记引用：`![[目標]]` / `[[目標|顯示名]]`；目標 = `檔案 · 書名#note-<uuid>` 或短形态 `note-<uuid>`。
 * 「目标必须指向 note-<uuid>」的合法性**直接编进正则**——不合法（普通 wikilink）= 不匹配 =
 * 字面渲染，一个字符都不吞。捕获组：1 = `!`（嵌入记号），2 = 书部（含结尾 `#`，可空），
 * 3 = noteId（恒为 `note-<uuid>`），4 = 顯示名（可空）。
 */
const NOTE_REF_RE = new RegExp(`(!?)\\[\\[((?:[^\\]|\\n]*#)?)(note-${NOTE_UUID})(?:\\|([^\\]\\n]+))?\\]\\]`)
/** 同上、锚定行内起点（markdownToDom 的逐位扫描用） */
const NOTE_REF_RE_AT = new RegExp(`^${NOTE_REF_RE.source}`)

/** 引用顯示名兜底：无 `|` 段时 = 目标去掉 `#note-<uuid>` 部分（全形态 = 「檔案 · 書名」；短形态 = noteId）。 */
function noteRefTitle(m: RegExpMatchArray): string {
  return m[2] !== '' ? m[2].replace(/#$/, '') : m[3]
}

/** 行内语法 → React 节点（笔记引用 / **bold** / *italic* / `code` / [t](url)）。
 *  实现 = 顺序扫描 + 最小匹配：先找最早的触发符，同类不嵌套（子集口径）。 */
function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let rest = text
  let k = 0
  while (rest.length > 0) {
    const patterns: Array<{
      re: RegExp
      /** 可选闸：命中但不合法 = 该模式不参与（整段走字面，一个字符都不吞） */
      guard?: (m: RegExpMatchArray) => boolean
      build: (m: RegExpMatchArray) => ReactNode
    }> = [
      {
        // 笔记引用（合法性已编进正则，无需 guard）；`![[` 与 `[[` 同一模式，`!` 记号不参与先后
        re: NOTE_REF_RE,
        build: (m) => (
          <span
            key={`${keyBase}-${k}`}
            className="note-ref"
            data-note-ref={m[3]}
            data-note-raw={m[0]}
          >
            {m[4] ?? noteRefTitle(m)}
          </span>
        )
      },
      { re: /\*\*([^*]+)\*\*/, build: (m) => <strong key={`${keyBase}-${k}`}>{m[1]}</strong> },
      { re: /\*([^*]+)\*/, build: (m) => <em key={`${keyBase}-${k}`}>{m[1]}</em> },
      { re: /`([^`]+)`/, build: (m) => <code key={`${keyBase}-${k}`}>{m[1]}</code> },
      {
        re: /\[([^\]]+)\]\(([^)\s]+)\)/,
        guard: (m) => HTTP_URL.test(m[2]),
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
      // 闸在**匹配时**判（链接协议白名单）：非法 = 这个模式不参与（整段走字面，一个字符都不吞）
      if (m && p.guard && !p.guard(m)) continue
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
    // 标题（文档层 = 基础 GFM；# / ## / ###，更深按字面）
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      const H = `h${heading[1].length}` as 'h1' | 'h2' | 'h3'
      blocks.push(<H key={`b${key++}`}>{renderInline(heading[2], `h${key}`)}</H>)
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
      !lines[i].startsWith('> ') &&
      !/^(#{1,3})\s+/.test(lines[i])
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
        fillInline(li, lines[i].slice(2))
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
        fillInline(p, lines[i].slice(2))
        bq.appendChild(p)
        i += 1
      }
      frag.appendChild(bq)
      continue
    }
    // 标题
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      const h = doc.createElement(`h${heading[1].length}`)
      fillInline(h, heading[2])
      frag.appendChild(h)
      i += 1
      continue
    }
    const p = doc.createElement('p')
    fillInline(p, line)
    frag.appendChild(p)
    i += 1
  }
  return frag

  /** 行内填充（笔记引用/粗/斜/码/链接；textContent-only 构建 → 无注入面） */
  function fillInline(el: HTMLElement, text: string): void {
    let run = ''
    const flushText = (): void => {
      if (run === '') return
      el.appendChild(doc.createTextNode(run))
      run = ''
    }
    let j = 0
    while (j < text.length) {
      const rest = text.slice(j)
      const ref = rest.match(NOTE_REF_RE_AT)
      const m =
        ref ??
        rest.match(/^\*\*([^*]+)\*\*/) ??
        rest.match(/^\*([^*]+)\*/) ??
        rest.match(/^`([^`]+)`/) ??
        rest.match(/^\[([^\]]+)\]\(([^)\s]+)\)/)
      if (!m) {
        run += text[j]
        j += 1
        continue
      }
      flushText()
      if (ref) {
        // 笔记引用：span 带 data-note-ref（noteId）+ data-note-raw（原文，序列化无损的锚）
        const span = doc.createElement('span')
        span.className = 'note-ref'
        span.setAttribute('data-note-ref', ref[3])
        span.setAttribute('data-note-raw', ref[0])
        span.textContent = ref[4] ?? noteRefTitle(ref)
        el.appendChild(span)
      } else if (m[0].startsWith('**')) {
        const b = doc.createElement('strong')
        b.textContent = m[1]
        el.appendChild(b)
      } else if (m[0].startsWith('*')) {
        const em = doc.createElement('em')
        em.textContent = m[1]
        el.appendChild(em)
      } else if (m[0].startsWith('`')) {
        const c = doc.createElement('code')
        c.textContent = m[1]
        el.appendChild(c)
      } else if (HTTP_URL.test(m[2])) {
        const a = doc.createElement('a')
        a.href = m[2]
        a.textContent = m[1]
        el.appendChild(a)
      } else {
        // 非法协议：整段字面（回退一个字符重扫，括号不吞）
        run += text[j]
        j += 1
        continue
      }
      j += m[0].length
    }
    flushText()
  }
}

/** DOM → Markdown（所见即所得退出/失焦时的序列化；只认子集标签，其余按文本走）。 */
export function markdownFromDom(root: HTMLElement): string {
  const inlineOf = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const el = node as HTMLElement
    // 笔记引用：原样还回插入串（无损 round-trip 的锚是 data-note-raw；缺失时按 noteId 重建）
    if (el.getAttribute('data-note-ref') !== null) {
      return el.getAttribute('data-note-raw') ?? `[[${el.getAttribute('data-note-ref')}]]`
    }
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
        // 走行内序列化（li 里可能有引用/粗斜/码——textContent 会把这些拍平丢语法）
        blocks.push(`- ${inlineChildren(li as HTMLElement)}`)
      }
    } else if (el.tagName === 'BLOCKQUOTE') {
      for (const q of Array.from(el.children)) {
        blocks.push(`> ${inlineChildren(q as HTMLElement)}`)
      }
    } else if (/^H[1-3]$/.test(el.tagName)) {
      const text = inlineChildren(el)
      if (text.trim() !== '') blocks.push('#'.repeat(Number(el.tagName[1])) + ' ' + text)
    } else {
      const text = inlineChildren(el)
      if (text.trim() !== '') blocks.push(text)
    }
  }
  return blocks.join('\n\n')
}
