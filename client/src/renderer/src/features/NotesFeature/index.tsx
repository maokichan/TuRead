/**
 * NotesFeature —— **笔记管理（跨书）**（契约 = features/notes.md，视觉 = style/components-notes.md）。
 *
 * 定位：**同级功能组件**（不引入分类——「工具组件」的提法已被纠正，就是既有「功能组件」，容器一样）。
 * 所以这里只做三件事：查读模型、渲染卡片流、接动作。
 *
 * 四条纪律（都是定案，写在最前面免得被"顺手优化"掉）：
 * ① **判据是 `body` 是否为空，不是 `kind`** —— "画完线后补 body，那这就是批注"；
 *    `kind='highlight'` 可能带 body，`kind='note'` 可能 body 为空（两个方向都有真实路径）。
 * ② **激活时重读**：本组件与阅读器**不同屏**（切过来即离开阅读器），故不需要 `notes-changed`
 *    广播；每次激活重新查询即可保证新鲜。
 * ③ **检索防抖 ~200ms**：标题栏搜索逐键 setState，不防抖就是"每个字符一次全量筛选 + 重渲染"。
 * ④ **刷新粒度**：筛选/检索变化只重查询、**不重建滚动容器**；窗口化由 `NoteFlow` 负责。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IPC } from '@shared/ipc'
import type { NoteFilter, NoteSettings } from '@core/domain/types'
import type { NoteQuery } from '@core/ports/store'
import type { FeatureProps } from '../types'
import { NoteFlow, type NoteFlowItem } from '../../components/NoteFlow'
import { chromeSearchBus } from '../chromeSearchBus'
import { NotesToolbar } from '../../components/NotesToolbar'
import { ReadingStatsSection } from '../../components/ReadingStats'
import { DocumentsPanel } from './DocumentsPanel'
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { buildCompilationMd, freeVaultName } from './notesDocs'

const DEFAULT_SETTINGS: NoteSettings = {
  view: 'masonry',
  filter: 'annotated',
  textFocus: 'body',
  scope: 'library'
}

const FILTER_CYCLE: NoteFilter[] = ['annotated', 'highlight', 'all']
/** 检索防抖（纪律③） */
const QUERY_DEBOUNCE_MS = 200
/** 「已複製」这类一次性提示的存活时间 */
const HINT_MS = 1500

export function NotesFeature({ container, host, activeFeature }: FeatureProps): React.JSX.Element {
  /** 检索词（词归本功能自持，输入框是底面顶条带的 UI 面；防抖链路不变） */
  const [notesQuery, setNotesQuery] = useState('')
  const [settings, setSettings] = useState<NoteSettings>(DEFAULT_SETTINGS)
  const [items, setItems] = useState<NoteFlowItem[]>([])
  const [count, setCount] = useState(0)
  /** 当前筛选为「批註」时被隐藏的划线数（空态要报出来 —— 缺失要可见，不静默） */
  const [hiddenHighlights, setHiddenHighlights] = useState(0)
  const [libId, setLibId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; item: NoteFlowItem } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<NoteFlowItem | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  /** 文档视图（笔记 v3）：文档 = 消费笔记所生产的内容，归筆记区管（无独立侧栏项） */
  const [docsOpen, setDocsOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  /** 匯出彙編（笔记 v3 文档层）：当前筛选结果 → vault .md（wikilink 引用；档案使其可解析） */
  const exportCompilation = useCallback(async (): Promise<void> => {
    if (items.length === 0) {
      setHint('沒有可匯出的筆記')
      return
    }
    const title = `彙編 · ${items[0].editionTitle} 等 ${items.length} 條`
    const md = buildCompilationMd(title, items)
    const list = ((await window.turead.invoke(IPC.vaultList)) as string[]) ?? []
    const name = freeVaultName('彙編', list)
    await window.turead.invoke(IPC.vaultWrite, { name, content: md })
    setHint(`已匯出 ${name.replace(/\.md$/, '')}`)
  }, [items])
  const active = activeFeature === 'notes'

  // ————— 设置（持久化于全局 settings 表的 noteSettings 键；设置一律全局，D9）—————
  useEffect(() => {
    void container.store.getSetting<NoteSettings>('noteSettings', DEFAULT_SETTINGS).then((s) => {
      setSettings({ ...DEFAULT_SETTINGS, ...s })
    })
  }, [container])

  const patchSettings = useCallback(
    (patch: Partial<NoteSettings>) => {
      setSettings((prev) => ({ ...prev, ...patch }))
      void container.store.patchSetting('noteSettings', patch)
    },
    [container]
  )

  // ————— 当前库（作用域「當前庫」的判据；切库广播后重取）—————
  useEffect(() => {
    const read = (): void => {
      void container.store.listLibraries().then((r) => setLibId(r.currentId))
    }
    read()
    return window.turead.subscribe(IPC.storeLibraryChanged, read)
  }, [container])

  // ————— 检索防抖（纪律③）—————
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(notesQuery), QUERY_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [notesQuery])

  // 底面全局搜索：笔记被激活时向 chromeSearchBus 注册绑定（恒驻挂载，
  // 必须跟激活态走）；value 变化即重注册（绑定闭包要拿到新词，见 chromeSearchBus 注释）。
  useEffect(() => {
    if (activeFeature !== 'notes') return
    chromeSearchBus.register({
      placeholder: '搜索筆記…',
      value: notesQuery,
      onChange: setNotesQuery
    })
    return () => chromeSearchBus.register(null)
  }, [activeFeature, notesQuery])

  // ————— 激活时重读（纪律②）—————
  useEffect(() => {
    if (active) setReloadTick((t) => t + 1)
  }, [active])

  /** 当前查询（**唯一构造处**：列表与三个计数共用同一套条件，避免口径漂移） */
  const buildQuery = useCallback(
    (filter: NoteFilter): NoteQuery => ({
      libraryId: settings.scope === 'library' ? libId : null,
      hasBody: filter === 'annotated' ? true : filter === 'highlight' ? false : null,
      text: debouncedQuery.trim() === '' ? null : debouncedQuery,
      orderBy: 'updated'
    }),
    [settings.scope, libId, debouncedQuery]
  )

  // ————— 查询（读模型；筛选/检索/作用域/激活变化都走这里）—————
  useEffect(() => {
    if (!active) return
    if (settings.scope === 'library' && !libId) return
    let cancelled = false
    const run = async (): Promise<void> => {
      try {
        const query = buildQuery(settings.filter)
        const [list, n] = await Promise.all([
          container.store.listAllNotes(query),
          container.store.countAllNotes(query)
        ])
        if (cancelled) return
        setItems(list.map((it) => ({ note: it.note, editionTitle: it.editionTitle })))
        setCount(n)
        // 空态要能说"被隐藏了多少条" —— 只在当前是「批註」时算它
        if (settings.filter === 'annotated') {
          const hidden = await container.store.countAllNotes({ ...query, hasBody: false })
          if (!cancelled) setHiddenHighlights(hidden)
        } else {
          setHiddenHighlights(0)
        }
      } catch (err) {
        if (!cancelled) host.pushLog(`筆記讀取失敗：${(err as Error).message}`)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [active, settings.filter, settings.scope, libId, buildQuery, container, host, reloadTick])

  // 一次性提示自动消失
  useEffect(() => {
    if (!hint) return
    const t = window.setTimeout(() => setHint(null), HINT_MS)
    return () => window.clearTimeout(t)
  }, [hint])

  // ————— 动作 —————
  /** 双击 = 跳转：带目标打开阅读器（`openReader` 的可选参数——「带目标打开」契约） */
  const openNote = useCallback(
    (item: NoteFlowItem) => {
      host.openReader(item.note.editionId, { revealNoteId: item.note.id })
    },
    [host]
  )

  /** 複製批註：**只複製批注正文**；不放开拖选（守全局禁选） */
  const copyNote = useCallback(
    async (item: NoteFlowItem) => {
      const text = item.note.body.trim()
      if (text === '') return
      try {
        await container.clipboard.writeText(text)
        setHint('已複製批註')
        host.pushLog(`已複製批註：${text.slice(0, 12)}…`)
      } catch (err) {
        host.pushLog(`複製失敗：${(err as Error).message}`)
      }
    },
    [container, host]
  )

  /** 刪除 = **真实删除**（⚠ 不是书库的「移除」——那个只删索引、不删源文件；两词不得混用） */
  const removeNote = useCallback(
    async (item: NoteFlowItem) => {
      try {
        await container.store.removeNote(item.note.id)
        setSelectedId((id) => (id === item.note.id ? null : id))
        setReloadTick((t) => t + 1)
        host.pushLog(`已刪除筆記：${item.note.anchor.norm.quote.exact.slice(0, 12)}…`)
      } catch (err) {
        host.pushLog(`刪除筆記失敗：${(err as Error).message}`)
      }
    },
    [container, host]
  )

  const menuItems = useMemo<ContextMenuItem[]>(() => {
    if (!menu) return []
    const item = menu.item
    const items: ContextMenuItem[] = [{ label: '跳轉', onClick: () => openNote(item) }]
    if (item.note.body.trim() !== '') {
      items.push({
        label: '複製批註',
        onClick: () => {
          void copyNote(item)
        }
      })
    }
    items.push({ label: '刪除', onClick: () => setPendingDelete(item) })
    return items
  }, [menu, openNote, copyNote])

  // ————— 空态（缺失要可见，不静默）—————
  const emptyText = useMemo(() => {
    if (items.length > 0) return null
    if (debouncedQuery.trim() !== '') return '沒有符合條件的筆記'
    if (settings.filter === 'annotated' && hiddenHighlights > 0) {
      return `批註 0 條 —— 有 ${hiddenHighlights} 條劃線未顯示（點篩選按鈕切到「劃線」）`
    }
    return settings.scope === 'library' ? '當前書庫還沒有筆記' : '還沒有任何筆記'
  }, [items.length, debouncedQuery, settings.filter, settings.scope, hiddenHighlights])

  return (
    <div className="flex h-full flex-col">
      {docsOpen ? (
        /* 文档视图（笔记 v3）：文档 = 消费笔记所生产的内容，归筆记区。
           整个滚动容器让位——文档面板有自己的列表+编辑区布局。 */
        <DocumentsPanel container={container} />
      ) : (
      <>
      {/* 滚动容器由本功能自己持有（窗口化要它，避免两层滚动条）；
          ⚠ 筛选/检索变化**不重建**本容器（刷新粒度纪律④）。 */}
      <div ref={scrollRef} className="cjk-ui min-h-0 flex-1 overflow-y-auto pr-1">
        {/* 「閱讀」统计段：寄生筆列表顶部，**全局口径**（跨书全库；逐日聚合与 Top 榜本就不带书过滤）。
            放滚动容器内 = 随内容滚，不占常驻注意力；全宽 page 档两栏。 */}
        <ReadingStatsSection container={container} variant="page" />
        {items.length > 0 ? (
          <NoteFlow
            view={settings.view}
            items={items}
            selectedId={selectedId}
            textFocus={settings.textFocus}
            scrollRef={scrollRef}
            onSelect={(it) => setSelectedId(it.note.id)}
            onOpen={openNote}
            onContextMenu={(it, e) => {
              e.preventDefault()
              setSelectedId(it.note.id)
              setMenu({ x: e.clientX, y: e.clientY, item: it })
            }}
          />
        ) : (
          <div className="pt-6 text-[12.5px] text-[var(--muted)] opacity-70">{emptyText}</div>
        )}
      </div>
      </>
      )}

      <NotesToolbar
        view={settings.view}
        filter={settings.filter}
        textFocus={settings.textFocus}
        scope={settings.scope}
        count={count}
        hint={hint}
        onToggleView={() => patchSettings({ view: settings.view === 'masonry' ? 'grid' : 'masonry' })}
        onCycleFilter={() => {
          const i = FILTER_CYCLE.indexOf(settings.filter)
          patchSettings({ filter: FILTER_CYCLE[(i + 1) % FILTER_CYCLE.length] })
        }}
        onToggleFocus={() =>
          patchSettings({ textFocus: settings.textFocus === 'body' ? 'excerpt' : 'body' })
        }
        onToggleScope={() => patchSettings({ scope: settings.scope === 'library' ? 'all' : 'library' })}
        onExportCompilation={() => void exportCompilation()}
        docsOpen={docsOpen}
        onToggleDocs={() => setDocsOpen((v) => !v)}
      />

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}

      {/* 刪除确认：**不可恢复**、且**不给"下次不再提示"**（不可逆动作不能免确认；
          与书库「移除」的确认弹窗口径不同 —— 那个可以"下次不再提示"，因为它不删源文件） */}
      {pendingDelete && (
        <ConfirmDialog
          title="刪除這條筆記？"
          message="筆記會被真正刪除（不是書庫的「移除」—— 那個只刪索引、不動源文件）。此操作不可恢復。"
          confirmLabel="刪除"
          cancelLabel="取消"
          onConfirm={() => {
            const item = pendingDelete
            setPendingDelete(null)
            void removeNote(item)
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
