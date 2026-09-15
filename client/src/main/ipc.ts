/**
 * IPC 注册（主进程）：把 net / store / 文件选择适配器桥接到渲染进程。
 *
 * ⚠ v0.4.0（2026-09-15「书的身份」）：`store:*` 不再"打到当前库"——**全应用一个全局 .db**，
 * 书库是**库内实体**；写在收录/内容上的操作都**显式带 libraryId**（见 `ILibraryStore`）。
 */
import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import { promises as fs } from 'node:fs'
import type { Dirent } from 'node:fs'
import { extname, join } from 'node:path'
import { EBOOK_EXTENSIONS, IPC } from '@shared/ipc'
import type { HttpRequestOptions } from '@core/ports/net'
import type {
  BookFingerprint,
  EditionRecord,
  Holding,
  LibraryEntry,
  NetConfig,
  MessageEnvelope,
  Note,
  ReadingSession,
  ReadingState,
  WorkIdentity
} from '@core/domain/types'
import { WsNetAdapter } from './net/wsNetAdapter'
import { LibraryManager } from './store/libraryManager'
import { SqliteStore } from './store/sqliteStore'
import type { LibraryLevelQuery, NotePatch } from '@core/ports/store'

const EBOOK_EXT_SET = new Set<string>(EBOOK_EXTENSIONS)
const EBOOK_FILTER = [{ name: '电子书', extensions: [...EBOOK_EXTENSIONS] }]

export function registerIpc(
  net: WsNetAdapter,
  libraries: LibraryManager,
  send: (channel: string, payload: unknown) => void
): void {
  /** 全局 store（v0.4.0：只有一个；书库是库内实体） */
  const store = (): SqliteStore => libraries.store

  net.on('message', (env) => send(IPC.netMessage, env))
  net.on('connection-changed', (state) => send(IPC.netConnectionChanged, state))

  ipcMain.handle(IPC.netConnect, (_e, config: NetConfig) => net.connect(config))
  ipcMain.handle(IPC.netDisconnect, () => net.disconnect())
  ipcMain.handle(IPC.netSend, (_e, env: MessageEnvelope) => net.send(env))
  ipcMain.handle(IPC.netRequest, (_e, opts: HttpRequestOptions) => net.request(opts))
  ipcMain.handle(IPC.netGetMemberId, () => net.getMemberId())

  // ————— 内容身份（edition）—————
  ipcMain.handle(IPC.storeUpsertEdition, (_e, record: EditionRecord) => store().upsertEdition(record))
  ipcMain.handle(IPC.storeGetEdition, (_e, id: string) => store().getEdition(id))
  ipcMain.handle(IPC.storeFindEditionByFingerprint, (_e, fp: BookFingerprint) =>
    store().findEditionByFingerprint(fp)
  )
  ipcMain.handle(
    IPC.storeUpdateEdition,
    (_e, p: { id: string; patch: Partial<EditionRecord> }) => store().updateEdition(p.id, p.patch)
  )
  ipcMain.handle(IPC.storeRemoveEdition, (_e, id: string) => store().removeEdition(id))

  // ————— 收录（holding）—————
  ipcMain.handle(IPC.storeAddHolding, (_e, h: Holding) => store().addHolding(h))
  ipcMain.handle(IPC.storeRemoveHolding, (_e, p: { libraryId: string; editionId: string }) =>
    store().removeHolding(p.libraryId, p.editionId)
  )
  ipcMain.handle(IPC.storeGetHolding, (_e, p: { libraryId: string; editionId: string }) =>
    store().getHolding(p.libraryId, p.editionId)
  )
  ipcMain.handle(IPC.storeListHoldings, (_e, libraryId: string) => store().listHoldings(libraryId))
  ipcMain.handle(
    IPC.storeSetHoldingMissing,
    (_e, p: { libraryId: string; editionId: string; missing: boolean }) =>
      store().setHoldingMissing(p.libraryId, p.editionId, p.missing)
  )
  ipcMain.handle(IPC.storeListItemsAtLevel, (_e, q: LibraryLevelQuery) =>
    store().listItemsAtLevel(q)
  )
  ipcMain.handle(IPC.storeListAllHeldEditions, () => store().listAllHeldEditions())
  ipcMain.handle(
    IPC.storeMoveHolding,
    (_e, p: { editionId: string; libraryId: string; containerId: string | null }) =>
      store().moveHolding(p.editionId, p.libraryId, p.containerId)
  )

  // ————— 设置（全局，D9）—————
  ipcMain.handle(
    IPC.storeGetSetting,
    (_e, p: { key: string; fallback: unknown }) => store().getSetting(p.key, p.fallback)
  )
  ipcMain.handle(IPC.storeSetSetting, (_e, p: { key: string; value: unknown }) =>
    store().setSetting(p.key, p.value)
  )
  ipcMain.handle(IPC.storePatchSetting, (_e, p: { key: string; patch: Record<string, unknown> }) =>
    store().patchSetting(p.key, p.patch)
  )
  ipcMain.handle(IPC.storeSetCover, (_e, p: { editionId: string; bytes: ArrayBuffer; ext: string }) =>
    store().setCover(p.editionId, p.bytes, p.ext)
  )
  ipcMain.handle(IPC.storeGetCover, (_e, editionId: string) => store().getCover(editionId))
  ipcMain.handle(IPC.storeRemoveCover, (_e, editionId: string) => store().removeCover(editionId))

  // ————— 阅读状态 / 阅读时间 —————
  ipcMain.handle(IPC.storeGetReadingState, (_e, editionId: string) =>
    store().getReadingState(editionId)
  )
  ipcMain.handle(IPC.storePutReadingState, (_e, state: ReadingState) =>
    store().putReadingState(state)
  )
  ipcMain.handle(IPC.storeAppendReadingSession, (_e, s: Omit<ReadingSession, 'id'>) =>
    store().appendReadingSession(s)
  )
  ipcMain.handle(IPC.storeTotalReadMsByWork, (_e, work: WorkIdentity) =>
    store().totalReadMsByWork(work)
  )
  ipcMain.handle(IPC.storeGetLastReadEdition, () => store().getLastReadEdition())

  // ————— 书库（组织模式）—————
  ipcMain.handle(IPC.storeListLibraries, () => store().listLibraries())
  ipcMain.handle(
    IPC.storeCreateLibrary,
    async (
      _e,
      p: { name?: string; mode?: 'mapped' | 'curated'; rootPath?: string } | string
    ) => {
      // 兼容旧调用（直接传字符串 name）：按自建库处理
      const input: { name?: string; mode: 'mapped' | 'curated'; rootPath?: string } =
        typeof p === 'string'
          ? { name: p, mode: 'curated' }
          : { name: p?.name, mode: p?.mode ?? 'curated', rootPath: p?.rootPath }
      const entry: LibraryEntry = await store().createLibrary(input)
      send(IPC.storeLibraryChanged, entry)
      return entry
    }
  )
  ipcMain.handle(IPC.storeSwitchLibrary, async (_e, id: string) => {
    await store().switchLibrary(id)
    const entry = await store().getLibrary(id)
    send(IPC.storeLibraryChanged, entry)
    return entry
  })
  ipcMain.handle(IPC.storeRenameLibrary, async (_e, p: { id: string; name: string }) => {
    return store().renameLibrary(p.id, p.name)
  })
  ipcMain.handle(IPC.storeRemoveLibrary, async (_e, id: string) => {
    await store().removeLibrary(id)
    const { currentId } = await store().listLibraries()
    const entry = await store().getLibrary(currentId)
    send(IPC.storeLibraryChanged, entry)
    return entry
  })
  ipcMain.handle(IPC.storeGetLibrary, (_e, id: string) => store().getLibrary(id))

  // 在系统文件管理器中显示数据库文件（库管理弹窗「所在文件夾」）：
  // ⚠ v0.4.0 起只有一个全局 .db，**不接受任意路径**（只揭示引导文件指向的那个库文件）
  ipcMain.handle(IPC.fsShowInFolder, (_e, p: { libraryId?: string }) => {
    const dbPath = store().describeDbPath()
    if (!dbPath) return false
    shell.showItemInFolder(dbPath)
    return true
  })

  // ————— 書箱 / 层级浏览（树在库内）—————
  ipcMain.handle(IPC.storeListContainers, (_e, p: { libraryId: string; parentId: string | null }) =>
    store().listContainers(p.libraryId, p.parentId)
  )
  ipcMain.handle(
    IPC.storeCreateContainer,
    (_e, p: { libraryId: string; parentId: string | null; name: string }) =>
      store().createContainer(p)
  )
  ipcMain.handle(IPC.storeRenameContainer, (_e, p: { id: string; name: string }) =>
    store().renameContainer(p.id, p.name)
  )
  ipcMain.handle(IPC.storeRemoveContainer, (_e, id: string) => store().removeContainer(id))
  ipcMain.handle(IPC.storeMoveContainer, (_e, p: { id: string; parentId: string | null }) =>
    store().moveContainer(p.id, p.parentId)
  )

  // ————— 笔记 / 划线（挂 edition）—————
  ipcMain.handle(IPC.storeListNotes, (_e, p: { editionId: string; chapterIndex?: number }) =>
    store().listNotes(p.editionId, p.chapterIndex)
  )
  ipcMain.handle(IPC.storeAddNote, (_e, note: Note) => store().addNote(note))
  ipcMain.handle(IPC.storeUpdateNote, (_e, p: { id: string; patch: NotePatch }) =>
    store().updateNote(p.id, p.patch)
  )
  ipcMain.handle(IPC.storeRemoveNote, (_e, id: string) => store().removeNote(id))

  // 虚拟映射模式的层级浏览：列子目录（不递归，名称+绝对路径，稳定排序）
  ipcMain.handle(IPC.fsListDirectories, async (_e, dir: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    return entries
      .filter((it) => it.isDirectory() && !it.name.startsWith('.'))
      .map((it) => ({ name: it.name, path: join(dir, it.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
  })

  ipcMain.handle(IPC.fsReadFile, async (_e, path: string) => {
    const buf = await fs.readFile(path)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  })

  // 文件选择（IBookPicker 适配）：Windows 下文件与目录不能同框选择 → 两个通道
  ipcMain.handle(IPC.pickerPickFiles, async (e) => {
    const { canceled, filePaths } = await showOpen(e, {
      title: '导入电子书',
      properties: ['openFile', 'multiSelections'],
      filters: EBOOK_FILTER
    })
    return canceled ? [] : filePaths
  })

  ipcMain.handle(IPC.pickerPickDirectory, async (e) => {
    const { canceled, filePaths } = await showOpen(e, {
      title: '导入文件夹（该目录下的电子书）',
      properties: ['openDirectory']
    })
    return canceled || filePaths.length === 0 ? null : filePaths[0]
  })

  /**
   * 列目录下的电子书：`recursive=false` 只此节点，`true` 则连子节点（用户可配置）。
   * 递归有上限（MAX_SCAN）防误选巨大目录树；子目录读取失败（权限等）跳过，不整体失败。
   */
  ipcMain.handle(IPC.pickerListEbooks, async (_e, p: { dir: string; recursive: boolean }) => {
    const out: string[] = []
    await collectEbooks(p.dir, p.recursive, out, 0)
    return out.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  })
}

const MAX_SCAN = 2000
const MAX_DEPTH = 12

async function collectEbooks(
  dir: string,
  recursive: boolean,
  out: string[],
  depth: number
): Promise<void> {
  if (out.length >= MAX_SCAN || depth > MAX_DEPTH) return
  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return // 目录不可读（权限/竞态删除）→ 跳过，不打断整次导入
  }
  const subdirs: string[] = []
  for (const it of entries) {
    if (it.isFile() && EBOOK_EXT_SET.has(extname(it.name).slice(1).toLowerCase())) {
      out.push(join(dir, it.name))
    } else if (recursive && it.isDirectory() && !it.name.startsWith('.')) {
      subdirs.push(join(dir, it.name))
    }
  }
  for (const sub of subdirs) {
    if (out.length >= MAX_SCAN) return
    await collectEbooks(sub, true, out, depth + 1)
  }
}

async function showOpen(
  e: Electron.IpcMainInvokeEvent,
  options: Electron.OpenDialogOptions
): Promise<Electron.OpenDialogReturnValue> {
  const win = BrowserWindow.fromWebContents(e.sender)
  return win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
}
