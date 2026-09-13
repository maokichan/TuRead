/**
 * 功能组件：书架（LibraryFeature）
 * 职责（编排的用例/端口）：
 *   books.*   —— 删除/选中/最近阅读（列表按层级取）
 *   store.*   —— 层级浏览：書箱 CRUD（自建模式）/ 层级取书（listBooksAtLevel）
 *   picker.*  —— 选文件 / 选目录 / 扫描目录（可含子目录）/ 读文件 / 列子目录（虚拟映射）
 *   imports.* —— 批量导入（用例：串行/进度/可取消/失败上报）
 *   covers.*  —— 封面缩略图异步提取（进度/取消）
 * 对外状态：selectedBookId（经 host.selectBook 上报 Shell；详情抽屉显示的就是它）。
 *
 * 层级浏览（2026-09-13 用户定：资源管理器式，两种模式不同屏、建库时二选一）：
 *  - 虛擬映射（kind=source，一库一个）：跟踪唯一真实文件夹（rootPath），书架照搬其文件树
 *    （默认含子文件夹）——"書箱"即真实文件夹，条目 = 子文件夹 + 直接位于当前层的书；
 *  - 自建書箱（kind=virtual）：空库起步，右键书架空白处新建書箱，書箱 = 文件夹可点进。
 *  当前层级显示在状态栏右端（面包屑，相对各自模式的根；自建模式的路径名 = 書箱名）。
 *
 * 布局纪律：**状态栏之上是内容区，详情抽屉只在内容区弹出**。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  BookContainer,
  BookRecord,
  LibraryEntry,
  LibrarySettings,
  LibraryView
} from '@core/domain/types'
import type { LibraryLevelQuery } from '@core/ports/store'
import { IPC } from '@shared/ipc'
import type { FeatureProps } from '../types'
import { forgetCover, getCoverUrl } from '../coverCache'
import { BookRow } from '../../components/BookRow'
import { BookTile } from '../../components/BookTile'
import { ContainerItem } from '../../components/ContainerItem'
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu'
import { BookDetailPanel } from '../../components/BookDetailPanel'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { LibraryManagerDialog } from '../../components/LibraryManagerDialog'
import { LibraryToolbar } from '../../components/LibraryToolbar'
import { useVirtualRange } from '../../components/useVirtualRange'

const DEFAULT_SETTINGS: LibrarySettings = { view: 'list', importRecursive: false }

/** 当前层级的条目：書箱（自建）/ 文件夹（虚拟映射）/ 书；書箱与文件夹外观同书籍（ContainerItem） */
type LevelItem =
  | { kind: 'container'; container: BookContainer }
  | { kind: 'folder'; name: string; path: string }
  | { kind: 'book'; book: BookRecord }

type TrailEntry = { label: string; containerId: string | null; folder: string | null }

type CtxMenuState = { x: number; y: number; items: ContextMenuItem[] }

export function LibraryFeature({
  container,
  host,
  selectedBookId,
  activeFeature,
  libraryQuery = ''
}: FeatureProps): React.JSX.Element {
  const [books, setBooks] = useState<BookRecord[]>([])
  const [view, setView] = useState<LibraryView>(DEFAULT_SETTINGS.view)
  const [covers, setCovers] = useState<Record<string, string>>({})
  const [detailId, setDetailId] = useState<string | null>(null)
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null)
  const [coverProgress, setCoverProgress] = useState<{ done: number; total: number } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<BookRecord | null>(null)
  const [skipDeleteNotice, setSkipDeleteNotice] = useState(false)
  /** 書庫管理弹窗（Obsidian 仓库管理页风格） */
  const [managerOpen, setManagerOpen] = useState(false)
  /** 本批导入成功的书 id（done 时一次性交给封面队列） */
  const importedIdsRef = useRef<string[]>([])

  // —— 层级浏览状态（导航 id 放 ref：加载器按 ref 取值，靠 navKey 触发重载，避免闭包过期）——
  const navRef = useRef<{ containerId: string | null; folder: string | null }>({
    containerId: null,
    folder: null
  })
  const [navKey, setNavKey] = useState(0)
  const [trail, setTrail] = useState<TrailEntry[]>([])
  const [libMode, setLibMode] = useState<'source' | 'virtual'>('virtual')
  const [rootPath, setRootPath] = useState<string | undefined>(undefined)
  const [libName, setLibName] = useState('')
  const [containers, setContainers] = useState<BookContainer[]>([])
  const [folders, setFolders] = useState<Array<{ name: string; path: string }>>([])
  /** 行内更名中的書箱（资源管理器 F2 语义：Enter/失焦提交，不用 Esc） */
  const [renamingContainerId, setRenamingContainerId] = useState<string | null>(null)
  /** 选中的書箱（资源管理器单击选中；F2/Delete 作用于它） */
  const [activeContainerId, setActiveContainerId] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null)
  const loadSeq = useRef(0)

  const commitNav = useCallback((next: { containerId: string | null; folder: string | null }) => {
    navRef.current = next
    setNavKey((k) => k + 1)
  }, [])

  /**
   * 加载当前层级（模式/根路径随当前库解析；快速导航时用序号丢弃过期结果）。
   * 虚拟映射：书 = 直接位于当前文件夹的（子文件夹的书属于子层级）+ 子目录条目；
   * 自建：书 = 当前書箱成员（根 = 不属于任何書箱）+ 子書箱条目。
   */
  const loadLevel = useCallback(async (): Promise<void> => {
    const seq = ++loadSeq.current
    const info = await container.store.listLibraries()
    const cur = info.libraries.find((l) => l.id === info.currentId)
    if (seq !== loadSeq.current) return
    const mode = cur?.mode ?? 'virtual'
    const root = cur?.rootPath
    setLibMode(mode)
    setRootPath(root)
    if (cur) setLibName(cur.name)
    const nav = navRef.current
    const query: LibraryLevelQuery =
      mode === 'source' ? { folder: nav.folder ?? root ?? '' } : { containerId: nav.containerId }
    const [list, subs] = await Promise.all([
      container.store.listBooksAtLevel(query),
      mode === 'virtual'
        ? container.store.listContainers(nav.containerId)
        : container.picker.listSubdirectories(nav.folder ?? root ?? '')
    ])
    if (seq !== loadSeq.current) return
    setContainers(mode === 'virtual' ? (subs as BookContainer[]) : [])
    setFolders(mode === 'source' ? (subs as Array<{ name: string; path: string }>) : [])
    setBooks(list)
    const pairs = await Promise.all(
      list.map(async (b) => [b.id, await getCoverUrl(container.store, b.id, b.coverPath)] as const)
    )
    if (seq !== loadSeq.current) return
    setCovers(Object.fromEntries(pairs.filter((p): p is [string, string] => p[1] !== null)))
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

  // 切换书库（2026-09-13）：main 广播 library-changed = "当前库已变"的唯一信号——
  // 重置导航到根层、重读库级设置，加载器按新库解析模式与根路径。
  // 选中与阅读器状态由 AppShell 清理（旧库的 bookId 在新库无意义）
  useEffect(() => {
    const off = window.turead.subscribe(IPC.storeLibraryChanged, (payload) => {
      const entry = payload as LibraryEntry
      setDetailId(null)
      setBooks([])
      setCovers({})
      setContainers([])
      setFolders([])
      navRef.current = { containerId: null, folder: null }
      setTrail([])
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
  }, [container, host, loadLevel])

  // 封面提取事件 → 进度 / 单本就绪 / 失败日志
  useEffect(() => {
    const offProgress = container.covers.on('progress', (done, total) =>
      setCoverProgress(total > 0 ? { done, total } : null)
    )
    const offReady = container.covers.on('cover-ready', (id) => {
      void (async () => {
        const book = await container.books.get(id)
        if (!book) return
        forgetCover(id) // 重新提取过：旧 URL 作废
        const url = await getCoverUrl(container.store, id, book.coverPath)
        if (url) setCovers((prev) => ({ ...prev, [id]: url }))
        setBooks((prev) => prev.map((b) => (b.id === id ? book : b)))
      })()
    })
    const offFailed = container.covers.on('cover-failed', (id, message) =>
      host.pushLog(`封面提取失败（${id.slice(0, 8)}）：${message}`)
    )
    const offDone = container.covers.on('done', (summary) => {
      setCoverProgress(null)
      if (summary.failed > 0) {
        host.pushLog(`封面提取完成：成功 ${summary.ok} 本，失败 ${summary.failed} 本`)
      }
    })
    return () => {
      offProgress()
      offReady()
      offFailed()
      offDone()
    }
  }, [container, host])

  // 导入事件 → 进度 / 失败日志 / 收尾（刷新当前层级 + 选中首本 + 入队封面）
  useEffect(() => {
    const offProgress = container.imports.on('progress', (done, total) =>
      setImporting(total > 0 ? { done, total } : null)
    )
    const offImported = container.imports.on('imported', (book) => {
      importedIdsRef.current.push(book.id)
    })
    const offFailed = container.imports.on('import-failed', (path, message) =>
      host.pushLog(`导入失败（${path}）：${message}`)
    )
    const offDone = container.imports.on('done', (summary) => {
      setImporting(null)
      const ids = importedIdsRef.current
      importedIdsRef.current = []
      void (async () => {
        await loadLevel()
        if (ids.length > 0) {
          host.selectBook(ids[0])
          container.covers.enqueue(ids)
        }
        const parts = [`导入 ${summary.imported - summary.reused} 本`]
        if (summary.reused > 0) parts.push(`指纹复用 ${summary.reused} 本`)
        if (summary.failed > 0) parts.push(`失败 ${summary.failed} 本`)
        if (summary.cancelled) parts.push('（已取消）')
        host.pushLog(parts.join('，'))
      })()
    })
    return () => {
      offProgress()
      offImported()
      offFailed()
      offDone()
    }
  }, [container, host, loadLevel])

  // 存量补封面：老书库里的书没有封面 → 后台补齐（dev 无头自检跳过，保持渲染验证确定性）。
  // ⚠ 两条纪律（2026-09-12，"启动即饿死 UI"事故）：
  // ① **延迟启动**（推迟 20s，让应用先可用）② **只补没试过的**（负缓存与已有 coverPath 不重试）
  useEffect(() => {
    if (window.turead.devBook) return
    const timer = setTimeout(() => {
      void (async () => {
        const list = await container.books.list()
        const missing = list.filter((b) => !b.coverPath && !b.coverFailed).map((b) => b.id)
        if (missing.length > 0) container.covers.enqueue(missing)
      })()
    }, 20000)
    return () => clearTimeout(timer)
  }, [container])

  // 离开书库（进阅读器/设置/房间）时收起详情抽屉（功能组件常驻挂载，状态继承）
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

  const importFiles = useCallback(async (): Promise<void> => {
    container.imports.enqueue(await container.picker.pickFiles())
  }, [container])

  const importFolder = useCallback(async (): Promise<void> => {
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
    container.imports.enqueue(paths)
  }, [container, host])

  const removeBook = useCallback(
    async (id: string): Promise<void> => {
      const book = books.find((b) => b.id === id)
      try {
        // 只删书库索引（不删源文件）；封面是我们生成的缓存，一并清理
        await container.books.remove(id)
        forgetCover(id)
        setDetailId((cur) => (cur === id ? null : cur))
        if (selectedBookId === id) host.selectBook(null)
        await loadLevel()
        host.pushLog(`已从书库移除：${book?.metadata.title ?? id}（源文件保留）`)
      } catch (err) {
        host.pushLog(`移除失败：${(err as Error).message}`)
      }
    },
    [books, container, host, loadLevel, selectedBookId]
  )

  /** 删除入口：首次弹确认（说明"只删索引、不删源文件"，可勾选不再提示） */
  const requestDelete = useCallback(
    (book: BookRecord) => {
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
      setDetailId(id)
    },
    [host]
  )

  /** 双击 / Enter → 打开阅读（同时收起抽屉，避免回到书库时还挂着上一本） */
  const openBook = useCallback(
    (id: string) => {
      setDetailId(null)
      host.openReader(id)
    },
    [host]
  )

  // —— 层级导航（资源管理器式：書箱/文件夹单击进入，面包屑回跳）——
  const enterContainer = useCallback(
    (c: BookContainer) => {
      setTrail((t) => [...t, { label: c.name, containerId: c.id, folder: null }])
      commitNav({ containerId: c.id, folder: null })
    },
    [commitNav]
  )
  const enterFolder = useCallback(
    (name: string, path: string) => {
      setTrail((t) => [...t, { label: name, containerId: null, folder: path }])
      commitNav({ containerId: null, folder: path })
    },
    [commitNav]
  )
  /** 面包屑回跳：depth = trail 下标（-1 = 根层） */
  const goToLevel = useCallback(
    (depth: number) => {
      const t = depth < 0 ? [] : trail.slice(0, depth + 1)
      const last = t[t.length - 1]
      setTrail(t)
      commitNav({
        containerId: last?.containerId ?? null,
        folder: last?.folder ?? null
      })
    },
    [trail, commitNav]
  )

  /**
   * 書箱操作（资源管理器语义，2026-09-13 用户定）：
   * 新建 = 立即建出「新建書箱」并进入行内更名；更名 = F2/右键 → Enter/失焦提交（**不用 Esc**）；
   * 移除 = Delete/右键（有子書箱时后端拒绝并日志）；拖书入箱 = 移动（单亲归属）；
   * 書箱本身可拖（拖箱入箱 / 拖到面包屑段）；书与書箱右键「移動到」= 上層/根層/兄弟書箱。
   */
  const createContainerHere = useCallback(
    async (parentId: string | null): Promise<void> => {
      try {
        const c = await container.store.createContainer({ parentId, name: '新建書箱' })
        setRenamingContainerId(c.id)
        commitNav(navRef.current) // 原地重载（容器列表多一项）
      } catch (err) {
        host.pushLog(`新建書箱失败：${(err as Error).message}`)
      }
    },
    [container, host, commitNav]
  )

  const commitContainerRename = useCallback(
    async (id: string, name: string): Promise<void> => {
      setRenamingContainerId(null)
      try {
        await container.store.renameContainer(id, name)
        commitNav(navRef.current) // 面包屑/列表同步新名
      } catch (err) {
        host.pushLog(`更名失败：${(err as Error).message}`)
      }
    },
    [container, host, commitNav]
  )

  const removeContainerById = useCallback(
    async (id: string): Promise<void> => {
      try {
        await container.store.removeContainer(id)
        if (activeContainerId === id) setActiveContainerId(null)
        commitNav(navRef.current)
        host.pushLog('已移除書箱（其成员书回到上一层）')
      } catch (err) {
        host.pushLog(`移除書箱失败：${(err as Error).message}`)
      }
    },
    [container, host, commitNav, activeContainerId]
  )

  const moveBook = useCallback(
    async (bookId: string, targetId: string | null): Promise<void> => {
      const book = books.find((b) => b.id === bookId)
      try {
        await container.store.moveBookToContainer(bookId, targetId)
        commitNav(navRef.current)
        const where =
          targetId === null
            ? '上一層'
            : (containers.find((c) => c.id === targetId)?.name ??
              trail.find((t) => t.containerId === targetId)?.label ??
              '書箱')
        host.pushLog(`已移动《${book?.metadata.title ?? bookId}》到 ${where}`)
      } catch (err) {
        host.pushLog(`移动失败：${(err as Error).message}`)
      }
    },
    [books, containers, trail, container, host, commitNav]
  )

  /**
   * 移动書箱（资源管理器"剪切文件夹"语义）：拖箱入箱 / 拖到面包屑段。
   * 同层原地放 = 无操作（ parentId 没变就不打数据库也不刷日志）；成环由后端拒绝并日志。
   */
  const moveContainerHere = useCallback(
    async (containerId: string, targetParentId: string | null, targetLabel: string): Promise<void> => {
      const c = containers.find((x) => x.id === containerId)
      if (!c) return
      if (c.parentId === targetParentId) return
      try {
        await container.store.moveContainer(containerId, targetParentId)
        commitNav(navRef.current)
        host.pushLog(`已移动書箱「${c.name}」到「${targetLabel}」`)
      } catch (err) {
        host.pushLog(`移动書箱失败：${(err as Error).message}`)
      }
    },
    [containers, container, host, commitNav]
  )

  /** 書箱键盘（资源管理器语义）：Enter 进入；F2 更名；Delete 移除。
   *  ⚠ 更名中的条目不响应条目级键盘——Enter 归输入框（提交更名），不能同时"进入"書箱 */
  const containerKeyDown = useCallback(
    (c: BookContainer) => (e: React.KeyboardEvent): void => {
      if (renamingContainerId === c.id) return
      if (e.key === 'Enter') {
        e.preventDefault()
        enterContainer(c)
      } else if (e.key === 'f2' || e.key === 'F2') {
        e.preventDefault()
        setRenamingContainerId(c.id)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        void removeContainerById(c.id)
      }
    },
    [renamingContainerId, enterContainer, removeContainerById]
  )

  /** 「移動到」子菜单（自建模式）：上一層（父层，可出書箱）+ 根層（跳层）+ 当前层各兄弟書箱 */
  const parentOfCurrent = trail.length >= 2 ? (trail[trail.length - 2].containerId ?? null) : null
  const parentLabel = trail.length >= 2 ? (trail[trail.length - 2]?.label ?? '上一層') : '根層'
  const bookMoveChildren = (b: BookRecord): ContextMenuItem[] => {
    if (libMode !== 'virtual') return []
    const children: ContextMenuItem[] = []
    if (navRef.current.containerId) {
      children.push({
        label: parentOfCurrent === null ? '上一層（到根層）' : `上一層（${parentLabel}）`,
        onClick: () => void moveBook(b.id, parentOfCurrent)
      })
      if (parentOfCurrent !== null) {
        children.push({ label: '根層', onClick: () => void moveBook(b.id, null) })
      }
    }
    for (const c of containers) {
      children.push({ label: c.name, onClick: () => void moveBook(b.id, c.id) })
    }
    return children
  }
  const containerMoveChildren = (c: BookContainer): ContextMenuItem[] => {
    if (libMode !== 'virtual') return []
    const children: ContextMenuItem[] = []
    if (navRef.current.containerId) {
      children.push({
        label: parentOfCurrent === null ? '上一層（到根層）' : `上一層（${parentLabel}）`,
        onClick: () => void moveContainerHere(c.id, parentOfCurrent, parentLabel)
      })
      if (parentOfCurrent !== null) {
        children.push({ label: '根層', onClick: () => void moveContainerHere(c.id, null, libName || '書庫') })
      }
    }
    for (const sib of containers) {
      if (sib.id === c.id) continue
      children.push({ label: sib.name, onClick: () => void moveContainerHere(c.id, sib.id, sib.name) })
    }
    return children
  }

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
      if (libMode !== 'virtual') return
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

  const detailBook = books.find((b) => b.id === detailId) ?? null

  // 书库搜索（标题栏搜索栏）：标题/路径包含即命中，过滤当前层的书（書箱/文件夹不参与过滤）
  const q = libraryQuery.trim().toLowerCase()
  const visibleBooks =
    q.length > 0
      ? books.filter(
          (b) =>
            (b.metadata.title || '').toLowerCase().includes(q) ||
            b.filePath.toLowerCase().includes(q)
        )
      : books

  // 当前层条目 = 書箱/文件夹在前、书在后
  const levelItems: LevelItem[] = [
    ...containers.map((container) => ({ kind: 'container' as const, container })),
    ...folders.map((f) => ({ kind: 'folder' as const, name: f.name, path: f.path })),
    ...visibleBooks.map((book) => ({ kind: 'book' as const, book }))
  ]

  // —— 窗口化渲染（2026-09-12）：只挂载可视区 ± 缓冲条目。
  // 書箱/文件夹条目与书籍条目同几何（网格 2:3+34px 标签；列表 h-16），共用同一 stride。
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const listVirtual = useVirtualRange(scrollRef, {
    itemCount: levelItems.length,
    stride: 68,
    resetKey: `list-${view}-${levelItems.length}-${q}-${navKey}`
  })
  // 网格列数：与原 auto-fill minmax(118px,1fr) + gap-x-4(16) 同口径
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

  const itemProps = (b: BookRecord) => ({
    book: b,
    active: b.id === selectedBookId,
    coverUrl: covers[b.id] ?? null,
    onDetail: () => openDetail(b.id),
    onOpen: () => openBook(b.id),
    onDelete: () => requestDelete(b),
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
        return <BookRow key={it.book.id} {...itemProps(it.book)} />
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
      onDropBook: libMode === 'virtual' ? (id: string) => void moveBook(id, null) : undefined,
      onDropContainer:
        libMode === 'virtual' ? (id: string) => void moveContainerHere(id, null, libName || '書庫') : undefined
    },
    ...trail.map((t, i) => ({
      label: t.label,
      onGo: () => goToLevel(i),
      onDropBook:
        libMode === 'virtual' && t.containerId
          ? (id: string) => void moveBook(id, t.containerId)
          : undefined,
      onDropContainer:
        libMode === 'virtual' && t.containerId
          ? (id: string) => void moveContainerHere(id, t.containerId, t.label)
          : undefined
    }))
  ]
  const insideVirtual = libMode === 'virtual' && trail.length > 0

  return (
    <section className="flex h-full flex-col gap-3">
      {/* 内容区：抽屉的定位上下文（抽屉只在这里弹出，不覆盖下方状态栏） */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onContentScroll}
          onContextMenu={onContentContextMenu}
          className="h-full select-none overflow-y-auto pr-1"
        >
          {levelItems.length === 0 ? (
            <p className="m-0 py-10 text-center text-[12.5px] text-[var(--muted)]">
              {libMode === 'virtual'
                ? insideVirtual
                  ? '此書箱還沒有書。右鍵空白處可新建子書箱'
                  : '書架為空：點右下角「導入」添加電子書，或右鍵空白處新建書箱'
                : '此文件夾沒有電子書'}
            </p>
          ) : q.length > 0 && visibleBooks.length === 0 ? (
            <p className="m-0 py-10 text-center text-[12.5px] text-[var(--muted)]">
              没有匹配「{libraryQuery.trim()}」的书
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
          <BookDetailPanel
            book={detailBook}
            coverUrl={covers[detailBook.id] ?? null}
            onClose={() => setDetailId(null)}
            onOpen={() => openBook(detailBook.id)}
            onDelete={() => requestDelete(detailBook)}
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
              const l = await container.store.createLibrary(name, mode, root)
              host.pushLog(
                `已新建書庫：${l.name}${mode === 'source' && root ? `（跟蹤 ${root}）` : ''}`
              )
              // 虚拟映射：建库即扫描跟踪文件夹（默认遍历子文件夹），交给导入队列
              if (mode === 'source' && root) {
                const paths = await container.picker.listEbooks(root, true)
                if (paths.length > 0) {
                  container.imports.enqueue(paths)
                  host.pushLog(`開始導入跟蹤文件夾中的 ${paths.length} 本電子書…`)
                } else {
                  host.pushLog('跟蹤文件夾中沒有電子書')
                }
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
