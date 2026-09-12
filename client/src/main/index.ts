/**
 * Electron 主进程入口。
 */
import { app, BrowserWindow, shell, Menu, ipcMain } from 'electron'
import { join } from 'node:path'
import type { WebContents } from 'electron'
import { registerIpc } from './ipc'
import { WsNetAdapter } from './net/wsNetAdapter'
import { JsonStore } from './store/jsonStore'
import { IPC } from '@shared/ipc'

// —— 离屏解析窗口（封面/元数据提取专用，2026-09-12）——
// 为什么：kookit getMetadata 全书解析（EPUB zip / PDF pdfjs）在主窗口渲染进程跑会把
// UI 整个饿死（328 本书库实测启动挂死）。隐藏 BrowserWindow = **独立进程**、DOM 齐全
// （EPUB 解析需 DOMParser，Worker 走不通），kookit 零改动。
// 协议：主窗口 invoke(parseRequest) → 这里排队/派发 → 解析页 invoke(parseResult) →
// 按 jobId 回给请求方。解析页就绪（parseReady）前只排队不派发，防早派丢任务。
let parseWindow: BrowserWindow | null = null
let parseReady = false
const parseQueue: Array<{ jobId: string; path: string; format: string }> = []
const parsePending = new Map<string, { sender: WebContents; job: { jobId: string } }>()

function ensureParseWindow(): BrowserWindow {
  if (parseWindow && !parseWindow.isDestroyed()) return parseWindow
  parseReady = false
  parseWindow = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false // 隐藏窗口默认节流定时器；解析是纯计算不受影响，但关掉保险
    }
  })
  parseWindow.webContents.on('render-process-gone', () => {
    // 在途任务快速失败（否则请求方只能干等 60s 超时）；未派发的排队任务保留，窗口重建后续派
    for (const { sender, job } of parsePending.values()) {
      if (!sender.isDestroyed()) {
        sender.send(IPC.metadataParseResult, { jobId: job.jobId, error: '解析进程退出' })
      }
    }
    parsePending.clear()
    parseReady = false
  })
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void parseWindow.loadURL(`${devUrl}/parse.html`)
  else void parseWindow.loadFile(join(__dirname, '../renderer/parse.html'))
  return parseWindow
}

function registerMetadataRelay(): void {
  ipcMain.handle(IPC.metadataParseRequest, (e, job: { jobId: string; path: string; format: string }) => {
    if (!job?.jobId || !job.path) return
    parsePending.set(job.jobId, { sender: e.sender, job })
    if (parseReady && parseWindow && !parseWindow.isDestroyed()) {
      parseWindow.webContents.send(IPC.metadataParseJob, job)
    } else {
      parseQueue.push(job)
      ensureParseWindow()
    }
  })
  ipcMain.handle(IPC.metadataParseReady, () => {
    parseReady = true
    if (!parseWindow || parseWindow.isDestroyed()) return
    const queued = parseQueue.splice(0)
    for (const job of queued) parseWindow.webContents.send(IPC.metadataParseJob, job)
  })
  ipcMain.handle(IPC.metadataParseResult, (e, payload: { jobId?: string; meta?: unknown; error?: string }) => {
    if (!payload?.jobId) return
    const entry = parsePending.get(payload.jobId)
    parsePending.delete(payload.jobId)
    if (entry && !entry.sender.isDestroyed()) entry.sender.send(IPC.metadataParseResult, payload)
  })
}

function createWindow(): void {
  const devBook = process.env['TUREAD_DEV_BOOK']
  const devProbe = process.env['TUREAD_DEV_PROBE']
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    title: 'TuRead',
    // 无边框（2026-09-12 用户定）：不用系统窗口控制键，自绘标题栏（TitleBar.tsx）——
    // 拖拽/双击最大化由 -webkit-app-region 提供，右缘控制键经 win:* IPC 调本进程 API
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [
        ...(devBook ? [`--turead-dev-book=${devBook}`] : []),
        ...(devProbe ? [`--turead-dev-probe=${devProbe}`] : [])
      ]
    }
  })

  // 最大化状态广播（自绘控制键要切换 □/❐ 图标）
  const broadcastMaximized = (is: boolean): void => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send(IPC.winMaximizedChanged, is)
    }
  }
  win.on('maximize', () => broadcastMaximized(true))
  win.on('unmaximize', () => broadcastMaximized(false))

  win.on('ready-to-show', () => win.show())
  // 主窗口关闭 = 应用退出（离屏解析窗口不计数，否则关掉主窗口后应用挂着不退）
  win.on('closed', () => {
    if (parseWindow && !parseWindow.isDestroyed()) parseWindow.destroy()
    if (process.platform !== 'darwin') app.quit()
  })
  // 双保险：应用菜单置空 + 移除本窗口菜单（Windows 下 autoHideMenuBar 按 Alt 仍可能弹出）
  win.removeMenu()

  if (devBook || devProbe) {
    // dev-only 无头验证：渲染进程打印 TUREAD-TEST-* 标记后自动退出
    // 上限 180s：文字类书（尤其 MOBI/AZW3）找不到正文时会逐章向前扫描，单次可耗 60~120s，
    // 原来 120s 会把「跑得慢」误报成 FAIL（2026-09-11 实测）。
    const timeout = setTimeout(() => {
      console.error('[TUREAD-TEST-FAIL] 超时未完成')
      app.exit(2)
    }, 180000)
    win.webContents.on('console-message', (_e, level, message) => {
      if (message.startsWith('[TUREAD-TEST-')) {
        console.log(message)
        clearTimeout(timeout)
        app.exit(message.startsWith('[TUREAD-TEST-OK') ? 0 : 1)
      } else if (level >= 2 && !message.startsWith('[dev]')) {
        // dev-only 诊断：转发渲染进程的 error/warning（CSP 拦截、JS 异常等）
        console.log(`[renderer:${level === 3 ? 'error' : 'warn'}] ${message}`)
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
  // 去掉 Electron 自带菜单栏（File/Edit/...），应用内统一由侧边栏功能组件导航
  Menu.setApplicationMenu(null)

  const net = new WsNetAdapter()
  const store = new JsonStore({
    libraryPath: join(app.getPath('userData'), 'library.json'),
    configPath: join(app.getPath('userData'), 'config.json'),
    coversDir: join(app.getPath('userData'), 'covers')
  })
  await store.init()

  registerIpc(net, store, (channel, payload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, payload)
    }
  })

  registerMetadataRelay()

  // 自绘窗口控制键（无边框窗口，2026-09-12）：控制键只操作**发起调用的那个窗口**。
  // ⚠ 渲染层桥是 invoke（ipcRenderer.invoke）→ 这里必须 ipcMain.handle，用 .on 会报
  // "No handler registered"（2026-09-12 实测踩坑）
  ipcMain.handle(IPC.winMinimize, (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.handle(IPC.winMaximizeToggle, (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.handle(IPC.winClose, (e) => BrowserWindow.fromWebContents(e.sender)?.close())

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
