/**
 * IPC 注册（主进程）：把 net / store 适配器桥接到渲染进程。
 */
import { ipcMain, dialog, BrowserWindow } from 'electron'
import { promises as fs } from 'node:fs'
import { IPC, type PickedBookFile } from '@shared/ipc'
import type { HttpRequestOptions } from '@core/ports/net'
import type { NetConfig, MessageEnvelope, BookRecord } from '@core/domain/types'
import { WsNetAdapter } from './net/wsNetAdapter'
import { JsonStore } from './store/jsonStore'

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

  ipcMain.handle(IPC.fsReadFile, async (_e, path: string) => {
    const buf = await fs.readFile(path)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  })

  ipcMain.handle(IPC.dialogPickBook, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const options = {
      title: '导入电子书',
      properties: ['openFile' as const],
      filters: [
        {
          name: '电子书',
          extensions: [
            'epub', 'pdf', 'mobi', 'azw3', 'azw', 'txt', 'md', 'fb2',
            'docx', 'html', 'xml', 'cbz', 'cbr', 'cbt', 'cb7'
          ]
        }
      ]
    }
    const { canceled, filePaths } = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (canceled || filePaths.length === 0) return null
    const path = filePaths[0]
    const stat = await fs.stat(path)
    const result: PickedBookFile = {
      path,
      name: path.split(/[\\/]/).pop() ?? path,
      size: stat.size
    }
    return result
  })
}
