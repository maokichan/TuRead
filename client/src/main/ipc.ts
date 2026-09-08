/**
 * IPC 注册（主进程）：把 net / store / 文件选择适配器桥接到渲染进程。
 */
import { ipcMain, dialog, BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { extname, join } from 'node:path'
import { EBOOK_EXTENSIONS, IPC } from '@shared/ipc'
import type { HttpRequestOptions } from '@core/ports/net'
import type { NetConfig, MessageEnvelope, BookRecord } from '@core/domain/types'
import { WsNetAdapter } from './net/wsNetAdapter'
import { JsonStore } from './store/jsonStore'

const EBOOK_EXT_SET = new Set<string>(EBOOK_EXTENSIONS)
const EBOOK_FILTER = [{ name: '电子书', extensions: [...EBOOK_EXTENSIONS] }]

export function registerIpc(
  net: WsNetAdapter,
  store: JsonStore,
  send: (channel: string, payload: unknown) => void
): void {
  net.on('message', (env) => send(IPC.netMessage, env))
  net.on('connection-changed', (state) => send(IPC.netConnectionChanged, state))

  ipcMain.handle(IPC.netConnect, (_e, config: NetConfig) => net.connect(config))
  ipcMain.handle(IPC.netDisconnect, () => net.disconnect())
  ipcMain.handle(IPC.netSend, (_e, env: MessageEnvelope) => net.send(env))
  ipcMain.handle(IPC.netRequest, (_e, opts: HttpRequestOptions) => net.request(opts))
  ipcMain.handle(IPC.netGetMemberId, () => net.getMemberId())

  ipcMain.handle(IPC.storeAddBook, (_e, record: BookRecord) => store.addBook(record))
  ipcMain.handle(IPC.storeUpdateBook, (_e, p: { id: string; patch: Partial<BookRecord> }) =>
    store.updateBook(p.id, p.patch)
  )
  ipcMain.handle(IPC.storeGetBook, (_e, id: string) => store.getBook(id))
  ipcMain.handle(IPC.storeListBooks, () => store.listBooks())
  ipcMain.handle(IPC.storeRemoveBook, (_e, id: string) => store.removeBook(id))
  ipcMain.handle(
    IPC.storeGetSetting,
    (_e, p: { key: string; fallback: unknown }) => store.getSetting(p.key, p.fallback)
  )
  ipcMain.handle(IPC.storeSetSetting, (_e, p: { key: string; value: unknown }) =>
    store.setSetting(p.key, p.value)
  )
  ipcMain.handle(IPC.storeSetCover, (_e, p: { bookId: string; bytes: ArrayBuffer; ext: string }) =>
    store.setCover(p.bookId, p.bytes, p.ext)
  )
  ipcMain.handle(IPC.storeGetCover, (_e, bookId: string) => store.getCover(bookId))
  ipcMain.handle(IPC.storeRemoveCover, (_e, bookId: string) => store.removeCover(bookId))

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

  /** 列目录下**直接**子项中的电子书（不递归）；排序稳定，便于进度可预期 */
  ipcMain.handle(IPC.pickerListEbooks, async (_e, dir: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries
      .filter((it) => it.isFile() && EBOOK_EXT_SET.has(extname(it.name).slice(1).toLowerCase()))
      .map((it) => join(dir, it.name))
      .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  })
}

async function showOpen(
  e: Electron.IpcMainInvokeEvent,
  options: Electron.OpenDialogOptions
): Promise<Electron.OpenDialogReturnValue> {
  const win = BrowserWindow.fromWebContents(e.sender)
  return win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
}
