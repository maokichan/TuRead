/**
 * mdEditor —— 文档编辑器的 CodeMirror 6 工厂（笔记 v3 文档层，实时渲染内核）。
 *
 * **实时渲染（Live Preview，Obsidian 同款语义）**：不含光标的顶层块 → 整块替换为渲染
 * widget（DOM = `markdownToDom`，与卡片/预览同一渲染器）；含光标的块保留源码，行内
 * 标记（粗/斜/码）按「光标在 token 外隐藏定界符、移入显形」处理。装饰器纯逻辑在
 * `mdEditorLive.ts`（node 可测）。
 *
 * ⚠ **架构约束（真机实锤）**：跨行的 replace 装饰**不允许由 ViewPlugin 提供**
 * （CM6 直接抛 "Decorations that replace line breaks may not be specified via plugins"，
 * 插件整个死掉 → 實時退化成裸源码）。故块级替换走 **StateField**（`block: true` 的
 * block widget，每次事务全量重算——文档体量下成本可忽略）；ViewPlugin 只留**单线安全**
 * 的活动块行内标记与行级装饰。
 *
 * 引用点击：widget/正文里的 `[data-note-ref]` 元素（@ 索引插入、既有引用）经
 * domEventHandlers 上抛 `onNoteRefClick(原文)`——解引用归调用方（DocumentsPanel）。
 */
import { EditorState, Compartment, StateField } from '@codemirror/state'
import {
  EditorView,
  Decoration,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
  type ViewUpdate
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownKeymap } from '@codemirror/lang-markdown'
import type { Extension } from '@codemirror/state'
import { markdownToDom } from './noteMarkdown'
import { inlineMarks, topLevelBlocks } from './mdEditorLive'

/** 行内标记的内容样式类（styles.css .md-editor） */
const MARK_CLASS: Record<string, string> = { strong: 'md-strong', em: 'md-em', code: 'md-code' }

class MdBlockWidget extends WidgetType {
  constructor(readonly text: string) {
    super()
  }
  override eq(o: MdBlockWidget): boolean {
    return o.text === this.text
  }
  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'md-editor__block note-doc'
    wrap.appendChild(markdownToDom(this.text, document))
    return wrap
  }
  /** 让 widget 内的点击（笔记引用）能到达 domEventHandlers */
  override ignoreEvent(): boolean {
    return false
  }
}

/**
 * 块级替换（非活动块 → 渲染 widget）。**StateField 提供**——跨行 replace 的唯一合法
 * 路径（ViewPlugin 侧会抛异常，见文件头）；每次事务全量重算（解析×2，体量可忽略）。
 * 可见性过滤在这里做不了（StateField 没有视口）——装饰全量给出，CM 自会跳过不可见的。
 */
function computeBlockDecorations(state: EditorState): DecorationSet {
  const text = state.doc.toString()
  const head = state.selection.main.head
  const b: Array<ReturnType<Decoration['range']>> = []
  for (const blk of topLevelBlocks(text)) {
    if (blk.to <= blk.from) continue
    if (text.slice(blk.from, blk.to).trim() === '') continue
    const active = head >= blk.from && head <= blk.to
    if (!active) {
      b.push(
        Decoration.replace({ widget: new MdBlockWidget(text.slice(blk.from, blk.to)), block: true }).range(
          blk.from,
          blk.to
        )
      )
    }
  }
  return Decoration.set(b, true)
}

const blockDecoField = StateField.define<DecorationSet>({
  create: (state) => computeBlockDecorations(state),
  update: (value, tr) => computeBlockDecorations(tr.state),
  // ⚠ 必须走 `.from(field)`（@codemirror/language 的 foldState 同款）——动态(函数)形态的
  // facet 输入会被视为插件来源，block 装饰在绘制时抛异常
  provide: (f) => EditorView.decorations.from(f)
})

/** 活动块的行内标记 + 行级装饰（单线安全——不跨行，ViewPlugin 合法）。 */
function activeBlockDecorations(view: EditorView): DecorationSet {
  const text = view.state.doc.toString()
  const head = view.state.selection.main.head
  const b: Array<ReturnType<Decoration['range']>> = []
  const marks = inlineMarks(text)
  for (const blk of topLevelBlocks(text)) {
    if (blk.to <= blk.from) continue
    const active = head >= blk.from && head <= blk.to
    if (!active) continue
    // 活动引用块：行级装饰（左竖条 + 缩进——写的时候也有引用的样子）
    if (blk.name === 'BlockQuote') {
      for (let pos = blk.from; pos <= blk.to; ) {
        const line = view.state.doc.lineAt(pos)
        b.push(Decoration.line({ class: 'md-quote-line' }).range(line.from))
        pos = line.to + 1
      }
    }
    // 活动标题行：与 .note-doc 同阶的字号/字重（编辑中也能看到层级）
    const hLevel = /^ATXHeading([123])$/.exec(blk.name ?? '')
    if (hLevel) {
      for (let pos = blk.from; pos <= blk.to; ) {
        const line = view.state.doc.lineAt(pos)
        b.push(Decoration.line({ class: `md-heading-${hLevel[1]}` }).range(line.from))
        pos = line.to + 1
      }
    }
    for (const m of marks) {
      if (m.from < blk.from || m.to > blk.to) continue
      if (head > m.from && head < m.to) continue // 光标在 token 内 = 显形源码
      if (m.kind === 'delim') {
        b.push(Decoration.replace({}).range(m.from, m.to))
      } else {
        b.push(Decoration.mark({ class: MARK_CLASS[m.kind] ?? '' }).range(m.from, m.to))
      }
    }
  }
  return Decoration.set(b, true)
}

function inlineLive(): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none
      constructor(view: EditorView) {
        this.decorations = activeBlockDecorations(view)
      }
      update(u: ViewUpdate): void {
        if (u.docChanged || u.selectionSet) {
          this.decorations = activeBlockDecorations(u.view)
        }
      }
    },
    {
      decorations: (v: { decorations: DecorationSet }) => v.decorations
    }
  )
  return plugin
}

export interface MdEditorOptions {
  parent: HTMLElement
  doc: string
  /** Live Preview 开关初值（源碼模式传 false——同一实例，compartment 切换） */
  live: boolean
  /** 内容变化（唯一真相在调用方的 state） */
  onChange: (text: string) => void
  /** 编辑区内点中笔记引用（原文 = 插入时的完整引用串） */
  onNoteRefClick?: (raw: string) => void
  /** 追加扩展（@ 补全等，调用方装配） */
  extra?: Extension[]
}

export interface MdEditorHandle {
  view: EditorView
  /** 外部换内容（打开别的文件）；触发 onChange（同值无扰） */
  setDoc(text: string): void
  /** 切 Live Preview（compartment reconfigure，不重建实例） */
  setLive(on: boolean): void
  setExtra(ext: Extension[]): void
  focus(): void
  destroy(): void
}

export function createMdEditor(opts: MdEditorOptions): MdEditorHandle {
  const liveComp = new Compartment()
  const extraComp = new Compartment()
  const extensions: Extension[] = [
    blockDecoField,
    history(),
    // markdownKeymap = 列表/引用的**续行**（Enter 自动补 `- `/`> `,退格剥壳）——
    // 漏了它，引用和列表写一行就断（真机实锤："根本没用"的主因）
    keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap]),
    markdown(),
    EditorView.lineWrapping,
    liveComp.of(opts.live ? inlineLive() : []),
    extraComp.of(opts.extra ?? []),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) opts.onChange(u.state.doc.toString())
    }),
    EditorView.domEventHandlers({
      mousedown: (e) => {
        const el = (e.target as HTMLElement | null)?.closest?.('[data-note-ref]')
        if (el instanceof HTMLElement) {
          opts.onNoteRefClick?.(el.getAttribute('data-note-raw') ?? el.getAttribute('data-note-ref') ?? '')
          return true
        }
        return false
      }
    })
  ]
  const view = new EditorView({
    state: EditorState.create({ doc: opts.doc, extensions }),
    parent: opts.parent
  })
  return {
    view,
    setDoc(text: string): void {
      if (view.state.doc.toString() === text) return
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
    },
    setLive(on: boolean): void {
      view.dispatch({ effects: liveComp.reconfigure(on ? inlineLive() : []) })
    },
    /** 追加扩展重配（@ 补全候选异步加载后重装） */
    setExtra(ext: Extension[]): void {
      view.dispatch({ effects: extraComp.reconfigure(ext) })
    },
    focus(): void {
      view.focus()
    },
    destroy(): void {
      view.destroy()
    }
  }
}
