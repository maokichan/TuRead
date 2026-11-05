/**
 * 書箱操作与「移動到」子菜单（资源管理器语义）——自 LibraryFeature 拆出，行为契约不变：
 * 新建 = 立即建出「新建書箱」并进入行内更名；更名 = F2/右键 → Enter/失焦提交（**不用 Esc**）；
 * 移除 = Delete/右键（有子書箱时后端拒绝并日志）；拖书入箱 = 移动**收录关系**（单亲归属，
 * 必须带 libraryId）；移动書箱 = "剪切文件夹"语义（同层原地放 = 无操作；成环由后端拒绝）。
 * 「移動到」子菜单 = 上一層（父层，可出書箱）+ 根層（跳层）+ 当前层各兄弟書箱（仅自建模式）。
 */
import { useCallback } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { BookContainer, EditionRecord, LibraryEntry } from '@core/domain/types'
import type { ServiceContainer } from '@core/container'
import type { ContextMenuItem } from '../../components/ContextMenu'
import type { FeatureHost } from '../types'
import type { TrailEntry } from './navHistory'

type NavPos = { containerId: string | null; folder: string | null }

/** 書箱键盘（资源管理器语义）：Enter 进入；F2 更名；Delete 移除。
 *  ⚠ 更名中的条目不响应条目级键盘——Enter 归输入框（提交更名），不能同时"进入"書箱 */
export function useContainerActions(params: {
  container: ServiceContainer
  host: FeatureHost
  /** 收录关系是库内的：凡涉及收录/書箱的调用都要带它 */
  libraryId: string
  libMode: LibraryEntry['mode']
  containers: BookContainer[]
  books: EditionRecord[]
  trail: TrailEntry[]
  libName: string
  activeContainerId: string | null
  setActiveContainerId: Dispatch<SetStateAction<string | null>>
  renamingContainerId: string | null
  setRenamingContainerId: Dispatch<SetStateAction<string | null>>
  commitNav: (next: NavPos) => void
  navRef: MutableRefObject<NavPos>
  enterContainer: (c: BookContainer) => void
}): {
  createContainerHere: (parentId: string | null) => Promise<void>
  commitContainerRename: (id: string, name: string) => Promise<void>
  removeContainerById: (id: string) => Promise<void>
  moveBook: (bookId: string, targetId: string | null) => Promise<void>
  moveContainerHere: (containerId: string, targetParentId: string | null, targetLabel: string) => Promise<void>
  containerKeyDown: (c: BookContainer) => (e: React.KeyboardEvent) => void
  bookMoveChildren: (b: EditionRecord) => ContextMenuItem[]
  containerMoveChildren: (c: BookContainer) => ContextMenuItem[]
} {
  const {
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
  } = params

  const createContainerHere = useCallback(
    async (parentId: string | null): Promise<void> => {
      try {
        const c = await container.store.createContainer({
          libraryId,
          parentId,
          name: '新建書箱'
        })
        setRenamingContainerId(c.id)
        commitNav(navRef.current) // 原地重载（容器列表多一项）
      } catch (err) {
        host.pushLog(`新建書箱失败：${(err as Error).message}`)
      }
    },
    [container, host, commitNav, navRef, libraryId, setRenamingContainerId]
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
    [container, host, commitNav, navRef, setRenamingContainerId]
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
    [container, host, commitNav, navRef, activeContainerId, setActiveContainerId]
  )

  const moveBook = useCallback(
    async (bookId: string, targetId: string | null): Promise<void> => {
      const book = books.find((b) => b.id === bookId)
      try {
        // 移动的是**收录关系**（书属于哪个书箱），所以必须带 libraryId
        await container.store.moveHolding(bookId, libraryId, targetId)
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
    [books, containers, trail, container, host, commitNav, navRef, libraryId]
  )

  /** 移动書箱（资源管理器"剪切文件夹"语义）：拖箱入箱 / 拖到面包屑段。
   *  同层原地放 = 无操作（parentId 没变就不打数据库也不刷日志）；成环由后端拒绝并日志。 */
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
    [containers, container, host, commitNav, navRef]
  )

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
    [renamingContainerId, enterContainer, removeContainerById, setRenamingContainerId]
  )

  const parentOfCurrent = trail.length >= 2 ? (trail[trail.length - 2].containerId ?? null) : null
  const parentLabel = trail.length >= 2 ? (trail[trail.length - 2]?.label ?? '上一層') : '根層'

  const bookMoveChildren = (b: EditionRecord): ContextMenuItem[] => {
    if (libMode !== 'curated') return []
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
    if (libMode !== 'curated') return []
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

  return {
    createContainerHere,
    commitContainerRename,
    removeContainerById,
    moveBook,
    moveContainerHere,
    containerKeyDown,
    bookMoveChildren,
    containerMoveChildren
  }
}
