/**
 * mdEditor —— 文档编辑器的 CodeMirror 6 工厂（笔记 v3 文档层，实时渲染内核）。
 *
 * **实时渲染（Live Preview，Obsidian 同款语义）**：不含光标的顶层块 → 整块替换为渲染
 * widget（DOM = `markdownToDom`，与卡片/预览同一渲染器）；含光标的块保留源码，行内
 * 标记（粗/斜/码）按「光标在 token 外隐藏定界符、移入显形」处理。装饰器纯逻辑在
 * `mdEditorLive.ts`（node 可测）。
 *
 * 引用点击：widget/正文里的 `[data-note-ref]` 元素（@ 索引插入、既有引用）经
 * domEventHandlers 上抛 `onNoteRefClick(原文)`——解引用归调用方（DocumentsPanel）。
 */
import { EditorState, Compartment } from '@codemirror/state'
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
import { syntaxTree } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import type { Extension } from '@codemirror/state'
import { markdownToDom } from './noteMarkdown'
import { inlineMarks, topLevelBlocks } from './mdEditorLive'

/** 非 CSI/被隐藏的定界符样式：replace 装饰本身不可见；内容样式走类名（styles.css .md-editor） */
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

function livePreview(): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none
      constructor(view: EditorView) {
        this.decorations = this.build(view)
      }
      update(u: ViewUpdate): void {
        if (u.docChanged || u.selectionSet || u.viewportChanged) {
          this.decorations = this.build(u.view)
        }
      }
      build(view: EditorView): DecorationSet {
        const text = view.state.doc.toString()
        const head = view.state.selection.main.head
        const b: Array<ReturnType<Decoration['range']>> = []
        const marks = inlineMarks(text)
        for (const blk of topLevelBlocks(text)) {
          if (blk.to <= blk.from) continue
          // 只对可见范围发装饰（全量解析、按可见过滤——文档体量下解析成本可忽略）
          if (!view.visibleRanges.some((vr) => blk.from < vr.to && blk.to > vr.from)) continue
          const active = head >= blk.from && head <= blk.to
          if (!active) {
            if (text.slice(blk.from, blk.to).trim() !== '') {
              b.push(Decoration.replace({ widget: new MdBlockWidget(text.slice(blk.from, blk.to)) }).range(blk.from, blk.to))
            }
          } else {
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
        }
        return Decoration.set(b, true)
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
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    markdown(),
    EditorView.lineWrapping,
    liveComp.of(opts.live ? livePreview() : []),
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
    }),
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
      view.dispatch({ effects: liveComp.reconfigure(on ? livePreview() : []) })
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
