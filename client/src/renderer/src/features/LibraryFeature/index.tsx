/**
 * 功能组件：书架（LibraryFeature）
 * 职责（编排的用例/端口）：
 *   books.*   —— 删除/选中/最近阅读（列表按层级取）
 *   store.*   —— 层级浏览：書箱 CRUD（自建库）/ 层级取书（listItemsAtLevel）/ 收录与书库管理
 *   picker.*  —— 选文件 / 选目录 / 扫描目录（可含子目录）/ 读文件 / 列子目录（映射库）
 *   imports.* —— 批量导入（用例：串行/进度/可取消/失败上报；**仅自建库**）
 *   scan.*    —— 映射库与真实路径的**扫描对账**（映射库不能导入，只能扫描）
 *   covers.*  —— 封面缩略图异步提取（进度/取消）
 * 对外状态：selectedBookId（经 host.selectBook 上报 Shell；聚焦舞台显示的就是它）。
 *
 * 层级浏览（资源管理器式，两种模式不同屏、建库时二选一；术语与代码值见 `DATA_MODEL.md` §6.2）：
 *  - **映射库**（`mode='mapped'`）：跟踪唯一真实文件夹（rootPath），书架照搬其文件树
 *    （默认含子文件夹）——"書箱"即真实文件夹，条目 = 子文件夹 + 直接位于当前层的**收录**；
 *    ⚠ **不能导入**：书只能在真实路径上加，靠「掃描」对账（DATA_MODEL §6.1）。
 *  - **自建库**（`mode='curated'`）：空库起步，右键书架空白处新建書箱，
 *    書箱 = 文件夹可点进；书靠导入。
 *  当前层级显示在状态栏右端（面包屑，相对各自模式的根；自建库的路径名 = 書箱名）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BookContainer,
  EditionRecord,
  LibraryEntry,
  LibrarySettings,
  LibraryView,
  ReadingState
} from '@core/domain/types'
import type { LibraryLevelQuery } from '@core/ports/store'
import { IPC } from '@shared/ipc'
import type { FeatureProps } from '../types'
import { clearCoverCache, forgetCover } from '../coverCache'
import { chromeSearchBus } from '../chromeSearchBus'
import { useLibraryNavHistory, type TrailEntry } from './navHistory'
import { useLibraryQueues } from './queues'
import { useContainerActions } from './containerActions'
import { coverUrlPairs, useLibrarySearch } from './librarySearch'
import { BookRow } from '../../components/BookRow'
import { BookTile } from '../../components/BookTile'
import { ContainerItem } from '../../components/ContainerItem'
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu'
import { FocusStage } from '../../components/FocusStage'
import { stageSupported } from '../../components/focusStageEngine'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { LibraryManagerDialog } from '../../components/LibraryManagerDialog'
import { LibraryToolbar } from '../../components/LibraryToolbar'
import { useVirtualRange } from '../../components/useVirtualRange'

/* WebGL 能力与会话同寿命：false 时单击只选中（无详情视觉；概率极低，见 TODO「聚焦舞台」） */
const STAGE_SUPPORTED = stageSupported()

const DEFAULT_SETTINGS: LibrarySettings = { view: 'list', importRecursive: false }

/** 当前层级的条目：書箱（自建）/ 文件夹（映射库）/ 书；書箱与文件夹外观同书籍（ContainerItem） */
type LevelItem =
  | { kind: 'container'; container: BookContainer }
  | { kind: 'folder'; name: string; path: string }
  | { kind: 'book'; book: EditionRecord }

type CtxMenuState = { x: number; y: number; items: ContextMenuItem[] }

export function LibraryFeature({
  container,
  host,
  selectedBookId,
  activeFeature
}: FeatureProps): React.JSX.Element {
  /** 书库检索词（底面全局搜索框经 chromeSearchBus 写入；防抖过滤链路不变） */
  const [libraryQuery, setLibraryQuery] = useState('')
  const [books, setBooks] = useState<EditionRecord[]>([])
  /** 本层每本书的阅读状态（与 `books` 并列，来自 `listItemsAtLevel` 的读模型 —— 避免 N+1） */
  const [readingStates, setReadingStates] = useState<Record<string, ReadingState | null>>({})
  /** 当前库 id（收录关系是库内的，凡涉及收录/书箱的调用都要带它） */
  const [libraryId, setLibraryId] = useState('')
  const [view, setView] = useState<LibraryView>(DEFAULT_SETTINGS.view)
  const [covers, setCovers] = useState<Record<string, string>>({})
  const [detailId, setDetailId] = useState<string | null>(null)
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null)
  const [coverProgress, setCoverProgress] = useState<{ done: number; total: number } | null>(null)
  /** 映射库扫描进行中（按钮禁用 + 文案） */
  const [scanning, setScanning] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<EditionRecord | null>(null)
  const [skipDeleteNotice, setSkipDeleteNotice] = useState(false)
  /** 書庫管理弹窗 */
  const [managerOpen, setManagerOpen] = useState(false)

  // —— 层级浏览状态（导航 id 放 ref：加载器按 ref 取值，靠 navKey 触发重载，避免闭包过期）——
  const navRef = useRef<{ containerId: string | null; folder: string | null }>({
    containerId: null,
    folder: null
  })
  const [navKey, setNavKey] = useState(0)
  const [trail, setTrail] = useState<TrailEntry[]>([])
  const [libMode, setLibMode] = useState<LibraryEntry['mode']>('curated')
  const [libName, setLibName] = useState('')
  const [containers, setContainers] = useState<BookContainer[]>([])
  const [folders, setFolders] = useState<Array<{ name: string; path: string }>>([])
  /** 行内更名中的書箱（资源管理器 F2 语义：Enter/失焦提交，不用 Esc） */
  const [renamingContainerId, setRenamingContainerId] = useState<string | null>(null)
  /** 选中的書箱（资源管理器单击选中；F2/Delete 作用于它） */
  const [activeContainerId, setActiveContainerId] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null)
  const loadSeq = useRef(0)

  // 导航历史与层级动作（历史栈 / 后退前进 / 鼠标侧键 / libraryNavBus；见 navHistory.ts）
  const { commitNav, enterContainer, enterFolder, goToLevel, resetHistory } = useLibraryNavHistory({
    navRef,
    setNavKey,
    setTrail,
    activeFeature
  })

  // 底面全局搜索（搜索上底板）：书库被激活时向 chromeSearchBus 注册绑定（恒驻挂载，
  // 必须跟激活态走）；value 变化即重注册（绑定闭包要拿到新词，见 chromeSearchBus 注释）。
  // Ctrl+F 的聚焦在 AppShell（全局输入框归 ChromeControls），不经过这里。
  useEffect(() => {
    if (activeFeature !== 'library') return
    chromeSearchBus.register({
      placeholder: '搜索書庫…',
      value: libraryQuery,
      onChange: setLibraryQuery
    })
    return () => chromeSearchBus.register(null)
  }, [activeFeature, libraryQuery])

  /**
   * 加载当前层级（模式/根路径随当前库解析；快速导航时用序号丢弃过期结果）。
   * 映射库（`mapped`）：书 = 直接位于当前文件夹的**收录**（子目录的书属于子层级）+ 子目录条目；
   * 自建库（`curated`）：书 = 当前書箱成员（根 = 不属于任何書箱）+ 子書箱条目。
   */
  const loadLevel = useCallback(async (): Promise<void> => {
    const seq = ++loadSeq.current
    const info = await container.store.listLibraries()
    const cur = info.libraries.find((l) => l.id === info.currentId)
    if (seq !== loadSeq.current) return
    const mode: LibraryEntry['mode'] = cur?.mode ?? 'curated'
    const root = cur?.rootPath
    setLibMode(mode)
    setLibraryId(info.currentId)
    if (cur) setLibName(cur.name)
    const nav = navRef.current
    const query: LibraryLevelQuery =
      mode === 'mapped'
        ? { libraryId: info.currentId, folder: nav.folder ?? root ?? '' }
        : { libraryId: info.currentId, containerId: nav.containerId }
    const [list, subs] = await Promise.all([
      container.store.listItemsAtLevel(query),
      mode === 'curated'
        ? container.store.listContainers(info.currentId, nav.containerId)
        : container.picker.listSubdirectories(nav.folder ?? root ?? '')
    ])
    if (seq !== loadSeq.current) return
    setContainers(mode === 'curated' ? (subs as BookContainer[]) : [])
    setFolders(mode === 'mapped' ? (subs as Array<{ name: string; path: string }>) : [])
    setBooks(list.map((it) => it.edition))
    setReadingStates(Object.fromEntries(list.map((it) => [it.edition.id, it.readingState])))
    const pairs = await coverUrlPairs(container.store, list)
    if (seq !== loadSeq.current) return
    setCovers(Object.fromEntries(pairs))
  }, [container])

  // 启动 + 每次导航/切库：读设置 + 加载层级
  useEffect(() => {
    void container.store
      .getSetting<LibrarySettings>('librarySettings', DEFAULT_SETTINGS)
      .then((s) => setView(s.view === 'grid' ? 'grid' : 'list'))
    void container.store
      .getSetting<{ skip?: boolean }>('deleteNotice', {})
      .then((s) => setSkipDeleteNotice(s.skip === true))
  }, [container, navKey])
  useEffect(() => {
    void loadLevel()
  }, [loadLevel, navKey])

  // 切换书库：main 广播 library-changed = "当前库已变"的唯一信号——
  // 重置导航到根层、重读库级设置，加载器按新库解析模式与根路径。
  // 选中与阅读器状态由 AppShell 清理（旧库的 bookId 在新库无意义）
  useEffect(() => {
    const off = window.turead.subscribe(IPC.storeLibraryChanged, (payload) => {
      const entry = payload as LibraryEntry
      clearCoverCache()
      setDetailId(null)
      setBooks([])
      setCovers({})
      setContainers([])
      setFolders([])
      navRef.current = { containerId: null, folder: null }
      setTrail([])
      resetHistory()
      setRenamingContainerId(null)
      setActiveContainerId(null)
      setCtxMenu(null)
      void container.store
        .getSetting<LibrarySettings>('librarySettings', DEFAULT_SETTINGS)
        .then((s) => setView(s.view === 'grid' ? 'grid' : 'list'))
      void container.store
        .getSetting<{ skip?: boolean }>('deleteNotice', {})
        .then((s) => setSkipDeleteNotice(s.skip === true))
      void loadLevel()
      host.pushLog(`已切换到書庫：${entry.name}`)
    })
    return off
  }, [container, host, loadLevel, resetHistory])

  // 三条后台事件接线（封面提取 / 批量导入 / 存量补封面；见 queues.ts）
  useLibraryQueues({
    container,
    host,
    loadLevel,
    setCovers,
    setBooks,
    setCoverProgress,
    setImporting
  })

  // 离开书库（进阅读器/设置/房间）时收起聚焦舞台与右键菜单（功能组件常驻挂载，状态继承）
  useEffect(() => {
    if (activeFeature !== 'library') {
      setDetailId(null)
      setCtxMenu(null)
    }
  }, [activeFeature])

  /** 切换视图并持久化（**局部更新**：主进程原子合并，不会冲掉设置界面管的 importRecursive） */
  const changeView = useCallback(
    (v: LibraryView) => {
      setView(v)
      void container.store.patchSetting('librarySettings', { view: v })
    },
    [container]
  )

  /**
   * 导入（文件）—— ⚠ **映射库不允许导入**（DATA_MODEL D5/F4：映射库的书只能在真实路径上加，
   * 入口是「掃描」）。这里把关，并在日志里说明为什么。
   */
  const importFiles = useCallback(async (): Promise<void> => {
    if (libMode === 'mapped') {
      host.pushLog('映射庫的書只能靠掃描真實文件夾進來（若要加書，請先在真實路徑上放置）')
      return
    }
    container.imports.enqueue(await container.picker.pickFiles(), libraryId)
  }, [container, host, libMode, libraryId])

  const importFolder = useCallback(async (): Promise<void> => {
    if (libMode === 'mapped') {
      host.pushLog('映射庫的書只能靠掃描真實文件夾進來（若要加書，請先在真實路徑上放置）')
      return
    }
    const dir = await container.picker.pickDirectory()
    if (!dir) return
    // "是否含子目录"在设置界面配置 —— 这里每次导入时现读，避免跨 Feature 的变更通知问题
    const cfg = await container.store.getSetting<LibrarySettings>(
      'librarySettings',
      DEFAULT_SETTINGS
    )
    const recursive = cfg.importRecursive === true
    const paths = await container.picker.listEbooks(dir, recursive)
    if (paths.length === 0) {
      host.pushLog(`该目录下没有可导入的电子书：${dir}${recursive ? '（含子目录）' : '（仅此节点）'}`)
      return
    }
    container.imports.enqueue(paths, libraryId)
  }, [container, host, libMode, libraryId])

  /** 映射库的「掃描」：与真实文件夹对账（DATA_MODEL §6.1 —— 映射库不能导入，只能扫描） */
  const runScan = useCallback(async (): Promise<void> => {
    if (!libraryId || libMode !== 'mapped') return
    setScanning(true)
    try {
      const s = await container.scan.scanLibrary(libraryId)
      await loadLevel()
      const parts = [`掃描 ${s.found} 本`, `新增 ${s.added}`, `已在庫 ${s.reused}`]
      if (s.missing > 0) parts.push(`來源缺失 ${s.missing}`)
      if (s.restored > 0) parts.push(`已恢復 ${s.restored}`)
      if (s.failed > 0) {
        parts.push(`讀取失敗 ${s.failed}`)
        // 逐条原因进诊断日志（最多 5 条，防刷屏；全量见扫描完成后的库状态）
        for (const f of s.failures.slice(0, 5)) {
          host.pushLog(`掃描失敗：${f.path} —— ${f.reason}`)
        }
      }
      host.pushLog(parts.join('，'))
    } catch (err) {
      host.pushLog(`掃描失敗：${(err as Error).message}`)
    } finally {
      setScanning(false)
    }
  }, [container, host, libMode, libraryId, loadLevel])

  /**
   * 从书库移除 = **取消收录**：只删收录关系，**真实文件不动、笔记与阅读状态也不动**
   * （DATA_MODEL §6.1 / contracts/domain-types.md 不变量）。
   */
  const removeBook = useCallback(
    async (id: string): Promise<void> => {
      const book = books.find((b) => b.id === id)
      try {
        await container.books.remove(id, libraryId)
        forgetCover(id)
        setDetailId((cur) => (cur === id ? null : cur))
        if (selectedBookId === id) host.selectBook(null)
        await loadLevel()
        host.pushLog(`已從書庫移除：${book?.metadata.title ?? id}（源文件與筆記保留）`)
      } catch (err) {
        host.pushLog(`移除失败：${(err as Error).message}`)
      }
    },
    [books, container, host, libraryId, loadLevel, selectedBookId]
  )

  /** 删除入口：首次弹确认（说明"只删索引、不删源文件"，可勾选不再提示） */
  const requestDelete = useCallback(
    (book: EditionRecord) => {
      if (skipDeleteNotice) void removeBook(book.id)
      else setPendingDelete(book)
    },
    [removeBook, skipDeleteNotice]
  )

  const confirmDelete = useCallback(
    async (remembered: boolean): Promise<void> => {
      const target = pendingDelete
      setPendingDelete(null)
      if (!target) return
      if (remembered) {
        setSkipDeleteNotice(true)
        void container.store.patchSetting('deleteNotice', { skip: true })
      }
      await removeBook(target.id)
    },
    [container, pendingDelete, removeBook]
  )

  /** 单击 → 选中并弹详情（详情显示的书 = selectedBookId，单一真相） */
  const openDetail = useCallback(
    (id: string) => {
      host.selectBook(id)
      if (STAGE_SUPPORTED) setDetailId(id)
    },
    [host]
  )

  /** 双击 / Enter → 打开阅读（同时收起聚焦舞台，避免回到书库时还挂着上一本） */
  const openBook = useCallback(
    (id: string) => {
      setDetailId(null)
      host.openReader(id)
    },
    [host]
  )

  // 書箱操作与「移動到」子菜单（资源管理器语义；见 containerActions.ts）
  const {
    createContainerHere,
    commitContainerRename,
    removeContainerById,
    moveBook,
    moveContainerHere,
    containerKeyDown,
    bookMoveChildren,
    containerMoveChildren
  } = useContainerActions({
    container,
    host,
    libraryId,
    libMode,
    containers,
    books,
    trail,
    libName,
    activeContainerId,
    setActiveContainerId,
    renamingContainerId,
    setRenamingContainerId,
    commitNav,
    navRef,
    enterContainer
  })

  /** 内容区右键：書箱 = 新建子書箱/更名/移動到/移除；书 = 打开/詳情/移動到/移除；空白（自建）= 新建書箱 */
  const onContentContextMenu = useCallback(
    (e: React.MouseEvent): void => {
      const target = e.target as HTMLElement
      const containerEl = target.closest<HTMLElement>('[data-container-id]')
      if (containerEl) {
        e.preventDefault()
        const c = containers.find((x) => x.id === containerEl.dataset.containerId)
        if (!c) return
        setActiveContainerId(c.id)
        const moveChildren = containerMoveChildren(c)
        setCtxMenu({
          x: e.clientX,
          y: e.clientY,
          items: [
            { label: '新建子書箱', onClick: () => void createContainerHere(c.id) },
            { label: '更名', onClick: () => setRenamingContainerId(c.id) },
            ...(moveChildren.length > 0 ? [{ label: '移動到', children: moveChildren }] : []),
            { label: '移除', onClick: () => void removeContainerById(c.id) }
          ]
        })
        return
      }
      const bookEl = target.closest<HTMLElement>('[data-book-id]')
      if (bookEl) {
        e.preventDefault()
        const b = books.find((x) => x.id === bookEl.dataset.bookId)
        if (!b) return
        const moveChildren = bookMoveChildren(b)
        setCtxMenu({
          x: e.clientX,
          y: e.clientY,
          items: [
            { label: '打開', onClick: () => openBook(b.id) },
            { label: '詳情', onClick: () => openDetail(b.id) },
            ...(moveChildren.length > 0 ? [{ label: '移動到', children: moveChildren }] : []),
            { label: '從書庫移除', onClick: () => requestDelete(b) }
          ]
        })
        return
      }
      if (libMode !== 'curated') return
      e.preventDefault()
      setCtxMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: '新建書箱', onClick: () => void createContainerHere(navRef.current.containerId) }
        ]
      })
    },
    [
      containers,
      books,
      libMode,
      trail,
      createContainerHere,
      removeContainerById,
      openBook,
      openDetail,
      requestDelete,
      moveBook,
      moveContainerHere
    ]
  )

  // 书库全库检索（底面全局搜索·书库作用域；见 librarySearch.ts）
  const { debouncedLibraryQuery, q, searching, searchResults, searchCovers, searchReadingStates } =
    useLibrarySearch({ container, host, libraryQuery, libraryId })

  const visibleBooks = searching ? (searchResults ?? []) : books

  // 条目源：检索态 = 全库命中书的平面列表；常态 = 当前层（書箱/文件夹在前、书在后）
  const levelItems: LevelItem[] = searching
    ? visibleBooks.map((book) => ({ kind: 'book' as const, book }))
    : [
        ...containers.map((container) => ({ kind: 'container' as const, container })),
        ...folders.map((f) => ({ kind: 'folder' as const, name: f.name, path: f.path })),
        ...books.map((book) => ({ kind: 'book' as const, book }))
      ]

  // 详情对象从两个来源找（常态 = 当前层 books；检索态 = 全库命中 searchResults）
  // 单击详情 = 「聚焦舞台」（唯一形态；旧抽屉已退役进 trash/，见 TODO「聚焦舞台」）
  const detailBook =
    books.find((b) => b.id === detailId) ??
    (searching ? (searchResults ?? []).find((b) => b.id === detailId) ?? null : null)

  // —— 窗口化渲染：只挂载可视区 ± 缓冲条目。
  // 書箱/文件夹条目与书籍条目同几何（网格 2:3+34px 标签；列表 h-16），共用同一 stride。
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const listVirtual = useVirtualRange(scrollRef, {
    itemCount: levelItems.length,
    stride: 68,
    resetKey: `list-${view}-${levelItems.length}-${q}-${navKey}`
  })
  // 网格列数：等价于 auto-fill minmax(118px,1fr) + gap-x-4(16) 的显式口径
  const gridCols = Math.max(1, Math.floor((listVirtual.width + 16) / (118 + 16)))
  const gridColW = (listVirtual.width - (gridCols - 1) * 16) / gridCols
  const gridStride = gridColW * 1.5 + 6 + 34 + 20
  const gridVirtual = useVirtualRange(scrollRef, {
    itemCount: levelItems.length,
    stride: gridStride,
    perRow: gridCols,
    resetKey: `grid-${view}-${levelItems.length}-${q}-${navKey}`
  })
  const onContentScroll = (): void => {
    listVirtual.onScroll()
    gridVirtual.onScroll()
  }

  const itemProps = (b: EditionRecord) => ({
    book: b,
    active: b.id === selectedBookId,
    coverUrl: covers[b.id] ?? searchCovers[b.id] ?? null,
    onDetail: () => openDetail(b.id),
    onOpen: () => openBook(b.id),
    onDelete: () => requestDelete(b),
    /* 聚焦舞台在场：该卡变"空缺提示槽"（原位留空 + 浅提示，点击 = 直接打开阅读） */
    vacant: detailId === b.id,
    // 页面内拖拽源（书 → 書箱 移动）：数据走 dataTransfer，路径真实 id
    draggable: true,
    onDragStartBook: (e: React.DragEvent) => {
      e.dataTransfer.setData('text/turead-book-id', b.id)
      e.dataTransfer.effectAllowed = 'move'
    }
  })

  const containerProps = (c: BookContainer) => ({
    containerId: c.id,
    name: c.name,
    active: c.id === activeContainerId,
    renaming: c.id === renamingContainerId,
    onOpen: () => enterContainer(c),
    onSelect: () => {
      setActiveContainerId(c.id)
      setDetailId(null)
    },
    onKeyDown: containerKeyDown(c),
    onContextMenu: (e: React.MouseEvent) => {
      // 让内容区统一右键处理（菜单按 data-container-id 定位条目）
      onContentContextMenu(e)
    },
    onRenameCommit: (name: string) => void commitContainerRename(c.id, name),
    onDropBook: (bookId: string) => void moveBook(bookId, c.id),
    // 書箱也是拖拽源（资源管理器"剪切文件夹"）：拖箱入箱 / 拖到面包屑段 = 移动
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData('text/turead-container-id', c.id)
      e.dataTransfer.effectAllowed = 'move'
    },
    onDropContainer: (id: string) => void moveContainerHere(id, c.id, c.name)
  })

  const folderProps = (f: { name: string; path: string }) => ({
    name: f.name,
    onOpen: () => enterFolder(f.name, f.path)
  })

  const renderLevelItem = (it: LevelItem): React.JSX.Element => {
    switch (it.kind) {
      case 'book':
        return <BookTile key={it.book.id} {...itemProps(it.book)} />
      case 'container':
        return <ContainerItem key={`c-${it.container.id}`} view="grid" {...containerProps(it.container)} />
      case 'folder':
        return <ContainerItem key={`f-${it.path}`} view="grid" {...folderProps(it)} />
    }
  }

  const renderLevelRow = (it: LevelItem): React.JSX.Element => {
    switch (it.kind) {
      case 'book':
        return (
          <BookRow
            key={it.book.id}
            {...itemProps(it.book)}
            readingState={readingStates[it.book.id] ?? searchReadingStates[it.book.id] ?? null}
          />
        )
      case 'container':
        return <ContainerItem key={`c-${it.container.id}`} view="list" {...containerProps(it.container)} />
      case 'folder':
        return <ContainerItem key={`f-${it.path}`} view="list" {...folderProps(it)} />
    }
  }

  // 面包屑（状态栏右端"当前层级"）：根 = 库名，其后是書箱名（自建）/ 文件夹名（虚拟映射）。
  // 面包屑也是拖放目标：书/書箱拖到某段 = 移动到该层（根段 = 移出書箱，仅自建模式）
  const crumbs = [
    {
      label: libName || '書庫',
      onGo: () => goToLevel(-1),
      onDropBook: libMode === 'curated' ? (id: string) => void moveBook(id, null) : undefined,
      onDropContainer:
        libMode === 'curated' ? (id: string) => void moveContainerHere(id, null, libName || '書庫') : undefined
    },
    ...trail.map((t, i) => ({
      label: t.label,
      onGo: () => goToLevel(i),
      onDropBook:
        libMode === 'curated' && t.containerId
          ? (id: string) => void moveBook(id, t.containerId)
          : undefined,
      onDropContainer:
        libMode === 'curated' && t.containerId
          ? (id: string) => void moveContainerHere(id, t.containerId, t.label)
          : undefined
    }))
  ]
  const insideVirtual = libMode === 'curated' && trail.length > 0

  return (
    <section className="flex h-full flex-col gap-3">
      <div className="min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onContentScroll}
          onContextMenu={onContentContextMenu}
          className="h-full overflow-y-auto pr-1"
        >
          {searching && searchResults === null ? (
            // 检索结果在途（代次守卫防乱序；不闪空态）
            null
          ) : searching && visibleBooks.length === 0 ? (
            // 检索态空态优先于"書架為空"（两个空态分层）：全库没命中就是说没命中
            <p className="m-0 py-10 text-center text-[12.5px] text-[var(--muted)]">
              整座書庫沒有匹配「{debouncedLibraryQuery.trim()}」的书
            </p>
          ) : !searching && levelItems.length === 0 ? (
            <p className="m-0 py-10 text-center text-[12.5px] text-[var(--muted)]">
              {libMode === 'curated'
                ? insideVirtual
                  ? '此書箱還沒有書。右鍵空白處可新建子書箱'
                  : '書架為空：點右下角「導入」添加電子書，或右鍵空白處新建書箱'
                : '此文件夾沒有電子書'}
            </p>
          ) : view === 'grid' ? (
            <div
              className="grid gap-x-4"
              style={{
                gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
                rowGap: 20,
                paddingTop: gridVirtual.padTop,
                paddingBottom: gridVirtual.padBottom
              }}
            >
              {levelItems.slice(gridVirtual.sliceStart, gridVirtual.sliceStop).map(renderLevelItem)}
            </div>
          ) : (
            <div
              className="flex flex-col gap-1"
              style={{ paddingTop: listVirtual.padTop, paddingBottom: listVirtual.padBottom }}
            >
              {levelItems.slice(listVirtual.sliceStart, listVirtual.sliceStop).map(renderLevelRow)}
            </div>
          )}
        </div>

        {detailBook && (
          /* 单击详情 = 「聚焦舞台」（key = book.id：换书即重挂，编排一次性）。
             舞台内无操作（功能键交给右键菜单）；聚焦期原卡 = 空缺提示槽 */
          <FocusStage
            key={detailBook.id}
            book={detailBook}
            readingState={
              readingStates[detailBook.id] ?? searchReadingStates[detailBook.id] ?? null
            }
            coverUrl={covers[detailBook.id] ?? searchCovers[detailBook.id] ?? null}
            collectionLabel={crumbs.at(-1)?.label ?? null}
            onClose={() => setDetailId(null)}
            onOpen={() => openBook(detailBook.id)}
          />
        )}

        {ctxMenu && (
          <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />
        )}
      </div>

      <LibraryToolbar
        view={view}
        onViewChange={changeView}
        onImportFiles={() => void importFiles()}
        onImportFolder={() => void importFolder()}
        importing={importing}
        onCancelImport={() => container.imports.cancel()}
        coverProgress={coverProgress}
        onOpenManager={() => setManagerOpen(true)}
        onScan={libMode === 'mapped' ? () => void runScan() : undefined}
        scanning={scanning}
        crumbs={crumbs}
      />

      {managerOpen && (
        <LibraryManagerDialog
          onClose={() => setManagerOpen(false)}
          listLibraries={() => container.store.listLibraries()}
          onSwitch={async (id) => {
            try {
              await container.store.switchLibrary(id)
            } catch (err) {
              host.pushLog(`切换書庫失败：${(err as Error).message}`)
            }
          }}
          onCreate={async (name, mode, root) => {
            try {
              const l = await container.store.createLibrary({ name, mode, rootPath: root })
              host.pushLog(`已新建書庫：${l.name}${mode === 'mapped' && root ? `（跟蹤 ${root}）` : ''}`)
              // 映射库：建库即**扫描**跟踪文件夹（映射库不能导入，书只能在真实路径上加）
              if (mode === 'mapped' && root) {
                host.pushLog('開始掃描跟蹤文件夾…')
                const s = await container.scan.scanLibrary(l.id)
                host.pushLog(
                  `掃描完成：發現 ${s.found} 本，新增 ${s.added} 本，已在庫 ${s.reused} 本` +
                    (s.failed > 0 ? `，失敗 ${s.failed} 本` : '')
                )
              }
            } catch (err) {
              host.pushLog(`新建書庫失败：${(err as Error).message}`)
            }
          }}
          onRename={async (id, name) => {
            try {
              const l = await container.store.renameLibrary(id, name)
              host.pushLog(`書庫已更名：${l.name}`)
            } catch (err) {
              host.pushLog(`更名失败：${(err as Error).message}`)
            }
          }}
          onPickDirectory={() => container.picker.pickDirectory()}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="从书库移除？"
          message={`《${pendingDelete.metadata.title || '未命名'}》只会从书库索引中移除，源文件不会被删除。`}
          confirmLabel="移除"
          rememberLabel="下次不再提示"
          onConfirm={(remembered) => void confirmDelete(remembered)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  )
}
