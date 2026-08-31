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

  if (devBook) {
    // dev-only 无头验证：渲染进程打印 TUREAD-TEST-* 标记后自动退出
    const timeout = setTimeout(() => {
      console.error('[TUREAD-TEST-FAIL] 超时未完成')
      app.exit(2)
    }, 120000)
    win.webContents.on('console-message', (_e, _level, message) => {
      if (message.startsWith('[TUREAD-TEST-')) {
        console.log(message)
        clearTimeout(timeout)
        app.exit(message.startsWith('[TUREAD-TEST-OK') ? 0 : 1)
      }
    })
  }

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
