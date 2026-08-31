/**
 * Electron 主进程入口。
 */
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { WsNetAdapter } from './net/wsNetAdapter'
import { JsonStore } from './store/jsonStore'

function createWindow(): void {
  const devBook = process.env['TUREAD_DEV_BOOK']
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    title: 'TuRead',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: devBook ? [`--turead-dev-book=${devBook}`] : []
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(async () => {
  const net = new WsNetAdapter()
  const store = new JsonStore(join(app.getPath('userData'), 'library.json'))
  await store.init()

  registerIpc(net, store, (channel, payload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, payload)
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
