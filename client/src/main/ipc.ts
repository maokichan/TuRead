/**
 * IPC 注册（主进程）：把 net / store / 文件选择适配器桥接到渲染进程。
 */
import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import { promises as fs } from 'node:fs'
import type { Dirent } from 'node:fs'
import { extname, join } from 'node:path'
import { EBOOK_EXTENSIONS, IPC } from '@shared/ipc'
import type { HttpRequestOptions } from '@core/ports/net'
import type { NetConfig, MessageEnvelope, BookRecord } from '@core/domain/types'
import { WsNetAdapter } from './net/wsNetAdapter'
import { LibraryManager } from './store/libraryManager'
import type { SqliteStore } from './store/sqliteStore'
import type { LibraryLevelQuery } from '@core/ports/store'

const EBOOK_EXT_SET = new Set<string>(EBOOK_EXTENSIONS)
const EBOOK_FILTER = [{ name: '电子书', extensions: [...EBOOK_EXTENSIONS] }]

export function registerIpc(
  net: WsNetAdapter,
  libraries: LibraryManager,
  send: (channel: string, payload: unknown) => void
): void {
  // 多库下 store:* 一律打到「当前库」——switchLibrary 换掉 manager 内部的当前句柄即可，
  // 这些 handler 不需要感知库的切换
  const store = (): SqliteStore => libraries.current

  net.on('message', (env) => send(IPC.netMessage, env))
  net.on('connection-changed', (state) => send(IPC.netConnectionChanged, state))

  ipcMain.handle(IPC.netConnect, (_e, config: NetConfig) => net.connect(config))
  ipcMain.handle(IPC.netDisconnect, () => net.disconnect())
  ipcMain.handle(IPC.netSend, (_e, env: MessageEnvelope) => net.send(env))
  ipcMain.handle(IPC.netRequest, (_e, opts: HttpRequestOptions) => net.request(opts))
  ipcMain.handle(IPC.netGetMemberId, () => net.getMemberId())

  ipcMain.handle(IPC.storeAddBook, (_e, record: BookRecord) => store().addBook(record))
  ipcMain.handle(IPC.storeUpdateBook, (_e, p: { id: string; patch: Partial<BookRecord> }) =>
    store().updateBook(p.id, p.patch)
  )
  ipcMain.handle(IPC.storeGetBook, (_e, id: string) => store().getBook(id))
  ipcMain.handle(IPC.storeListBooks, () => store().listBooks())
  ipcMain.handle(IPC.storeRemoveBook, (_e, id: string) => store().removeBook(id))
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
  ipcMain.handle(IPC.storeSetCover, (_e, p: { bookId: string; bytes: ArrayBuffer; ext: string }) =>
    store().setCover(p.bookId, p.bytes, p.ext)
  )
  ipcMain.handle(IPC.storeGetCover, (_e, bookId: string) => store().getCover(bookId))
  ipcMain.handle(IPC.storeRemoveCover, (_e, bookId: string) => store().removeCover(bookId))

  // 多书库：列表 / 新建（随即切换）/ 切换——成功后广播 library-changed（渲染层各自重载）
  ipcMain.handle(IPC.storeListLibraries, () => libraries.listLibraries())
  ipcMain.handle(
    IPC.storeCreateLibrary,
    async (
      _e,
      p?: { name?: string; mode?: 'source' | 'virtual'; rootPath?: string } | string
    ) => {
      // 兼容旧调用（直接传字符串 name）
      const name = typeof p === 'string' ? p : p?.name
      const mode = typeof p === 'string' ? 'virtual' : p?.mode
      const rootPath = typeof p === 'string' ? undefined : p?.rootPath
      const entry = await libraries.createLibrary(name, mode, rootPath)
      send(IPC.storeLibraryChanged, entry)
      return { id: entry.id, name: entry.name }
    }
  )
  ipcMain.handle(IPC.storeSwitchLibrary, async (_e, id: string) => {
    const entry = await libraries.switchLibrary(id)
    send(IPC.storeLibraryChanged, entry)
    return { id: entry.id, name: entry.name }
  })
  ipcMain.handle(IPC.storeRenameLibrary, async (_e, p: { id: string; name: string }) => {
    const entry = await libraries.renameLibrary(p.id, p.name)
    return { id: entry.id, name: entry.name }
  })
  // 在系统文件管理器中显示文件（库管理弹窗「所在文件夾」）：路径来自引导文件，不接受任意路径
  ipcMain.handle(IPC.fsShowInFolder, (_e, p: { libraryId: string }) => {
    const entry = libraries.listLibraries().libraries.find((l) => l.id === p.libraryId)
    if (!entry) return false
    shell.showItemInFolder(entry.dbPath)
    return true
  })

  // 書箱/层级浏览（store:* 打到当前库）
  ipcMain.handle(IPC.storeListContainers, (_e, parentId: string | null) =>
    store().listContainers(parentId)
  )
  ipcMain.handle(
    IPC.storeCreateContainer,
    (_e, p: { parentId: string | null; name: string }) => store().createContainer(p)
  )
  ipcMain.handle(IPC.storeRenameContainer, (_e, p: { id: string; name: string }) =>
    store().renameContainer(p.id, p.name)
  )
  ipcMain.handle(IPC.storeRemoveContainer, (_e, id: string) => store().removeContainer(id))
  ipcMain.handle(IPC.storeListBooksAtLevel, (_e, q: LibraryLevelQuery) =>
    store().listBooksAtLevel(q)
  )
  ipcMain.handle(IPC.storeMoveBook, (_e, p: { bookId: string; containerId: string | null }) =>
    store().moveBookToContainer(p.bookId, p.containerId)
  )
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
   * 列目录下的电子书：`recursive=false` 只此节点，`true` 则连子节点（用户可配置，见 FEATURES §10）。
   * 递归有上限（MAX_SCAN）防止误选到巨大的目录树；子目录读取失败（权限等）跳过，不整体失败。
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
