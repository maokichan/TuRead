/**
 * 笔记/划线生命周期钩子（自 ReaderFeature 拆出，行为契约不变）。
 *
 * 三条硬约束驱动了这里的形状（均经 `note` 探针实测，见 RENDER_INTERFACE §5）：
 * ① `renderHighlighters` **只对当前已渲染的那一节生效**（文字类只有一个 iframe）→
 *   **每章 `rendered` 后都必须重挂**，否则换章后新章没有高亮；
 * ② 首次渲染可能**先于**笔记载入（载入要走 IPC）→ 载入完必须补挂一次；
 * ③ 新增/删除由 `createNote`/`removeNote` 自己改 DOM，**不必**整批重挂（重挂会 clear 再画一遍）。
 *
 * 「带目标打开」的消费（笔记管理双击条目：打开他书 + 跳到那条笔记）也归这里：
 * ⚠ **时序是硬约束**（顺序错会**静默落空**）：reveal 依赖 DOM 里那条高亮
 * （`.kookit-note[data-key=…]`），而高亮由 `renderHighlighters` 画、**只对当前渲染节生效**
 * → 必须等 ①书已打开 ②笔记载入完成 ③目标章 `rendered` 之后再 `resolveAnchor(revealNoteId)`。
 * 故只**登记**"待跳"，由上述两个时机尝试；成功即清空（`tick` 防重复消费），
 * 找不到那条笔记时**保持待跳**（等载入/渲染的下一个时机），失败进日志不静默。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { compareNoteOrder } from '@core/domain/anchor'
import type { Note, NoteColor, TextAnchor, NoteMarkStyle 
} from '@core/domain/types'
import type { RenderContextMenuRequest, RenderSelection } from '@core/ports/render'
import type { ServiceContainer } from '@core/container'
import type { FeatureHost, ReaderTarget } from '../types'
import type { CardPageKind } from '../../components/ReaderRail'

/** 批注输入面板的受控态（正文 body 由这里持有——键盘意图 `composerCommit` 要能提交"当前输入内容"） */
export type ReaderComposer = {
  anchor: TextAnchor
  noteId?: string
  body: string
  fromSelection?: boolean
} | null

export function useReaderNotes(params: {
  container: ServiceContainer
  host: FeatureHost
  /** 当前书（null = 未打开）：笔记按它载入；`createMark` 没书直接放弃 */
  book: { id: string } | null
  readerTarget?: ReaderTarget | null
  /** 右键菜单与卡片页的落点（事件需要关菜单/切到筆記卡；state 所有权在 Feature） */
  setMenu: Dispatch<SetStateAction<RenderContextMenuRequest | null>>
  setRightPanel: Dispatch<SetStateAction<CardPageKind>>
  setControlsOpen: Dispatch<SetStateAction<boolean>>
}): {
  notes: Note[]
  /** 事件回调与右键菜单读最新列表的唯一通道（订阅一次性挂载，闭包会锁旧 state） */
  notesRef: RefObject<Note[]>
  composer: ReaderComposer
  setComposer: Dispatch<SetStateAction<ReaderComposer>>
  /** 「看这条笔记」请求（点正文高亮 = 看内容不是改内容；`tick` 让同一条再点也重新定位） */
  focusNote: { id: string; tick: number } | null
  /** 当前正文选区（适配器在**书文档**上观测后广播；null = 无选区） */
  selection: RenderSelection | null
  createMark: (anchor: TextAnchor, color: NoteColor, body?: string, markStyle?: NoteMarkStyle) => Promise<void>
  /** 武装几何标注捕获（PDF 专用；色 = 捕获完成后建笔记用的色） */
  armGeom: (mode: 'rect' | 'stroke', color: NoteColor) => void
  saveAnnotation: () => Promise<void>
  jumpNote: (note: Note) => Promise<void>
  editNote: (note: Note) => void
  removeNote: (note: Note) => Promise<void>
} {
  const { container, host, book, readerTarget, setMenu, setRightPanel, setControlsOpen } = params
  /**
   * 本书笔记。**用 ref 供事件回调读取**：`rendered` 订阅是一次性挂载的，
   * 闭包会锁住旧 state —— 经 ref 才拿得到最新列表。
   */
  const [notes, setNotes] = useState<Note[]>([])
  const notesRef = useRef<Note[]>([])
  const [composer, setComposer] = useState<ReaderComposer>(null)
  const [focusNote, setFocusNote] = useState<{ id: string; tick: number } | null>(null)
  const focusNoteTick = useRef(0)
  /** 当前正文选区（适配器在**书文档**上观测后广播；null = 无选区） */
  const [selection, setSelection] = useState<RenderSelection | null>(null)

  const pendingReveal = useRef<{ tick: number; noteId: string } | null>(null)
  useEffect(() => {
    if (!readerTarget?.revealNoteId) return
    if (book && readerTarget.editionId !== book.id) return // 书还没换过来，下一轮再登记
    pendingReveal.current = { tick: readerTarget.tick, noteId: readerTarget.revealNoteId }
  }, [readerTarget, book])

  const tryRevealPending = useCallback((): void => {
    const pending = pendingReveal.current
    if (!pending) return
    const target = notesRef.current.find((n) => n.id === pending.noteId)
    if (!target) return // 笔记还没载入 → 保持待跳
    pendingReveal.current = null
    void container.render
      .resolveAnchor(target.anchor, { revealNoteId: pending.noteId })
      .catch((err) => {
        host.pushLog(`跳轉筆記失敗：${(err as Error).message}`)
      })
  }, [container, host])

  // 载入本书笔记（打开/切书时）→ 载入完补挂一次（约束②）
  useEffect(() => {
    if (!book) {
      setNotes([])
      notesRef.current = []
      return
    }
    let cancelled = false
    void container.store.listNotes(book.id).then((list) => {
      if (cancelled) return
      notesRef.current = list
      setNotes(list)
      container.render
        .renderHighlighters(list)
        .catch((err) => host.pushLog(`回顯筆記失敗：${(err as Error).message}`))
      // 笔记载入完成 = 消费"带目标打开"的第 ② 个时机
      tryRevealPending()
    })
    return () => {
      cancelled = true
    }
  }, [container, book, tryRevealPending])

  // 每渲染完一章 → 回显该章高亮（约束①；适配器内部按当前节过滤）
  useEffect(() => {
    return container.render.on('rendered', () => {
      container.render
        .renderHighlighters(notesRef.current)
        .catch((err) => host.pushLog(`回顯筆記失敗：${(err as Error).message}`))
      tryRevealPending()
    })
  }, [container, tryRevealPending])

  // 正文选区变化（适配器在书文档上观测）。新建的入口是右键菜单，但**仍要跟踪选区**：
  // ① 它决定右键菜单里"新建"两项是否可用；② **输入框的生命周期挂在它上面**；
  // ③ 键盘驱动的流程（预留）没有鼠标坐标，靠它定位。
  useEffect(() => {
    return container.render.on('selection-changed', (sel) => {
      setSelection(sel)
      // 选区消失 → 关闭"由选区召唤"的输入框。只关 fromSelection 那种：
      // 编辑既有笔记的输入框，其对象是**那条笔记**而不是选区。
      if (sel === null) setComposer((c) => (c && c.fromSelection ? null : c))
    })
  }, [container])

  // 阅读区右键 → 弹菜单（适配器换算好坐标与命中：有选区可新建，点在笔记上可编辑/移除）
  useEffect(() => {
    return container.render.on('context-menu', (req) => {
      setComposer(null)
      setMenu(req)
    })
  }, [container, setComposer, setMenu])

  // 单击已有高亮 → **不是**开编辑器，而是"看它"：右欄切到「筆記」卡片页并按 `focusNote`
  // 定位到这一条；要**改**仍走右键菜单的「編輯批註」。
  useEffect(() => {
    return container.render.on('note-clicked', ({ noteId }) => {
      const target = notesRef.current.find((n) => n.id === noteId)
      if (!target) return
      setMenu(null)
      setComposer(null)
      setRightPanel('notes')
      setControlsOpen(true)
      focusNoteTick.current += 1
      setFocusNote({ id: noteId, tick: focusNoteTick.current })
    })
  }, [container, setComposer, setControlsOpen, setMenu, setRightPanel])

  /**
   * 输入框的**对象**没了，它自己就该收。不依赖"谁去关它"——`notes` 是唯一权威。
   */
  useEffect(() => {
    if (!composer?.noteId) return
    if (notes.some((n) => n.id === composer.noteId)) return
    setComposer(null)
  }, [notes, composer])

  /**
   * 新建一条标记（高亮或批注）。
   * `id`/时间戳在**用例层**生成（存储层不代生成 id —— 它是同步主键，须跨端稳定）；
   * 落库成功后交给引擎立即回显，不必等整批重挂（约束③）。
   * 笔记 v3 kind 收敛：**统一落 `highlight`**（带不带 body 都是它，"批注/划线"由 body 有无
   * 表达——`NoteKind` 是载体类型不是创建来路，DATA_MODEL §3.2.1）。
   */
  const createMark = useCallback(
    async (anchor: TextAnchor, color: NoteColor, body = '', markStyle: NoteMarkStyle = 'background'): Promise<void> => {
      if (!book) return
      const now = Date.now()
      const note: Note = {
        id: crypto.randomUUID(),
        editionId: book.id,
        kind: 'highlight',
        anchor,
        color,
        markStyle,
        body,
        createdAt: now,
        updatedAt: now
      }
      try {
        await container.store.addNote(note)
        await container.render.createNote(note)
        // **按阅读序插入**，不是追加。库里同一条序列由 `compareNoteOrder` 保证 ——
        // 追加到末尾会让界面看上去按创建时间排（第 5 章的新笔记掉到第 1 章后面）。
        const next = [...notesRef.current, note].sort(compareNoteOrder)
        notesRef.current = next
        setNotes(next)
        // 几何标注没有文字 quote（excerpt 空）→ 日志不带引文
        const label = body ? '已加批註' : note.anchor.norm.quote.exact ? '已劃線' : '已幾何標註'
        host.pushLog(`${label}${note.anchor.norm.quote.exact ? `：${note.anchor.norm.quote.exact.slice(0, 12)}…` : ''}`)
      } catch (err) {
        host.pushLog(`標記失敗：${(err as Error).message}`)
      }
      // 清掉书文档选区：否则浏览器自带的选区高亮会盖在我们画的高亮上
      container.render.clearSelection()
    },
    [container, book, host]
  )

  // 几何标注（PDF 拖曳）：武装时记下色，捕获完成（适配器事件）→ 建笔记
  const geomColorRef = useRef<NoteColor>('yellow')
  const armGeom = useCallback(
    (mode: 'rect' | 'stroke', color: NoteColor): void => {
      geomColorRef.current = color
      container.render.armGeomCapture(mode)
      host.pushLog(mode === 'rect' ? '幾何標註（框選）：在頁面上拖曳，Esc 取消' : '幾何標註（記號筆）：在頁面上拖曳，Esc 取消')
    },
    [container, host]
  )
  useEffect(() => {
    return container.render.on('geom-captured', ({ anchor }) => {
      void createMark(anchor, geomColorRef.current)
    })
  }, [container, createMark])

  /** 保存批注正文：既有笔记 → 更新；新建（无 noteId）→ 落一条带 body 的划线（同一条序列） */
  const saveAnnotation = useCallback(async (): Promise<void> => {
    const c = composer
    if (!c) return
    setComposer(null)
    try {
      if (c.noteId) {
        await container.store.updateNote(c.noteId, { body: c.body })
        const next = notesRef.current.map((n) =>
          n.id === c.noteId ? { ...n, body: c.body, updatedAt: Date.now() } : n
        )
        notesRef.current = next
        setNotes(next)
        // 批注有无会影响 kookit 的"带批注"图标（`isNote = item.notes !== ""`）→ 整批重挂一次
        await container.render.renderHighlighters(next)
      } else {
        await createMark(c.anchor, 'yellow', c.body)
      }
    } catch (err) {
      host.pushLog(`儲存批註失敗：${(err as Error).message}`)
    }
  }, [composer, container, host, createMark])

  /**
   * 跳到一条笔记（笔记面板点击）。走 `resolveAnchor` 的 `revealNoteId` 口径：
   * 章级导航 + 把该条高亮元素滚进视野 —— **不依赖 Fragment 解算**，故弱锚点笔记也能看到落点。
   */
  const jumpNote = useCallback(
    async (note: Note): Promise<void> => {
      try {
        await container.render.resolveAnchor(note.anchor, { revealNoteId: note.id })
      } catch (err) {
        host.pushLog(`跳轉筆記失敗：${(err as Error).message}`)
      }
    },
    [container, host]
  )

  /** 从筆記卡「編輯」打开该条的编辑——焦点由 `NoteComposer` 挂载即聚焦保证（同一入口，键盘/鼠标都在输入栏落点）。
   *  与"点高亮 = 看内容"的分工：看 = 定位；改 = 这里或右键菜单「編輯批註」。 */
  const editNote = useCallback(
    (note: Note): void => {
      setMenu(null)
      setComposer({ anchor: note.anchor, noteId: note.id, body: note.body })
    },
    [setComposer, setMenu]
  )

  /** 删除一条笔记：先落库删，再让引擎摘掉 DOM 里的高亮（否则划线会留到换章为止） */
  const removeNote = useCallback(
    async (note: Note): Promise<void> => {
      try {
        await container.store.removeNote(note.id)
        await container.render.removeNote(note.id)
        const next = notesRef.current.filter((n) => n.id !== note.id)
        notesRef.current = next
        setNotes(next)
      } catch (err) {
        host.pushLog(`移除筆記失敗：${(err as Error).message}`)
      }
    },
    [container, host]
  )

  return {
    notes,
    notesRef,
    composer,
    setComposer,
    focusNote,
    selection,
    createMark,
    armGeom,
    saveAnnotation,
    jumpNote,
    editNote,
    removeNote
  }
}
