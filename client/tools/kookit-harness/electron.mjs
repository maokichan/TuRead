/**
 * kookit 单体测试 —— 无头自检（默认）或可见查看（--show）。
 * 用法：
 *   # 无头自检（捕获 TUREAD-TEST-* 标记退出；退出码 0=OK/SKIP，1=FAIL，2=超时）
 *   npx electron electron.mjs --url "http://127.0.0.1:4173/tools/kookit-harness/?auto=test_docs/xxx.epub"
 *   # 可见查看（显示窗口、自动打开指定书、可手动翻页，不自动退出）
 *   npx electron electron.mjs --show --url "…&auto=test_docs/xxx.epub"
 */
import { app, BrowserWindow } from 'electron'

const url =
  process.argv.find((a) => a.startsWith('--url='))?.slice('--url='.length) ||
  'http://127.0.0.1:4173/tools/kookit-harness/'
const SHOW = process.argv.includes('--show')
const TIMEOUT_MS = 120000

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  win.on('ready-to-show', () => {
    if (SHOW) win.show()
  })

  if (SHOW) {
    void win.loadURL(url)
    return
  }

  const timeout = setTimeout(() => {
    console.log('[TUREAD-TEST-FAIL] 超时未完成')
    app.exit(2)
  }, TIMEOUT_MS)

  win.webContents.on('console-message', (_e, _level, message) => {
    if (message.startsWith('[TUREAD-TEST-OK]')) {
      console.log(message)
      clearTimeout(timeout)
      app.exit(0)
    } else if (message.startsWith('[TUREAD-TEST-FAIL]')) {
      console.log(message)
      clearTimeout(timeout)
      app.exit(1)
    } else if (message.startsWith('[TUREAD-TEST-SKIP]')) {
      console.log(message)
      clearTimeout(timeout)
      app.exit(0)
    }
  })

  void win.loadURL(url)
})

app.on('window-all-closed', () => app.quit())
