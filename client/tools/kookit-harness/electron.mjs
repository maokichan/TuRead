/**
 * kookit 单体测试 —— 无头自检（默认）或可见查看（--show）。
 * 用法：
 *   # 无头自检（捕获 TUREAD-TEST-* 标记退出；退出码 0=OK/SKIP，1=FAIL，2=超时）
 *   npx electron electron.mjs --url "http://127.0.0.1:4173/tools/kookit-harness/?auto=test_docs/xxx.epub"
 *   # 可见查看（显示窗口、自动打开指定书、可手动翻页，不自动退出）
 *   npx electron electron.mjs --show --url "…&auto=test_docs/xxx.epub"
 */
import { app, BrowserWindow } from 'electron'

const argIndex = process.argv.indexOf('--url')
const url =
  process.env.TUREAD_HARNESS_URL ||
  process.argv.find((a) => a.startsWith('--url='))?.slice('--url='.length) ||
  (argIndex >= 0 ? process.argv[argIndex + 1] : undefined) ||
  'http://127.0.0.1:4173/tools/kookit-harness/'
if (process.argv.includes('--print-argv')) console.log('[debug] argv=' + JSON.stringify(process.argv.slice(1)))
const SHOW = process.argv.includes('--show')
const VERBOSE = process.argv.includes('--verbose')
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

  win.webContents.on('did-finish-load', () => {
    if (!VERBOSE) return
    console.log('[debug] did-finish-load')
    // 主进程侧直接探测页面状态，绕开 console-message 转发
    const probe = async () => {
      try {
        const r = await win.webContents.executeJavaScript(
          `JSON.stringify({
            title: document.title,
            classicRan: !!window.__classicRan,
            moduleRan: !!window.__moduleRan,
            href: location.href,
            autoParam: new URLSearchParams(location.search).get('auto'),
            iframes: document.querySelectorAll('iframe').length,
            markers: Array.from(document.querySelectorAll('#log div')).map((d) => d.textContent),
            status: document.getElementById('status')?.textContent ?? null
          })`,
          true
        )
        console.log(`[debug] page-state ${r}`)
      } catch (e) {
        console.log(`[debug] probe failed: ${e.message}`)
      }
    }
    let probes = 0
    const iv = setInterval(() => {
      if (++probes > 10) clearInterval(iv)
      else void probe()
    }, 4000)
    probe()
    // 诊断模式：--probe "js 表达式"，在页面里执行并打印结果（可访问 window.__rendition）
    const probeExprIdx = process.argv.indexOf('--probe')
    if (probeExprIdx >= 0) {
      const expr = process.argv[probeExprIdx + 1]
      setTimeout(() => {
        win.webContents
          .executeJavaScript(expr, true)
          .then((r) => {
            console.log('[probe-result] ' + JSON.stringify(r))
            app.exit(0)
          })
          .catch((e) => {
            console.log('[probe-result] error: ' + e.message)
            app.exit(1)
          })
      }, 12000)
    }
    win.webContents.once('did-navigate', () => clearInterval(iv))
  })

  win.webContents.on('console-message', (_e, _level, message) => {
    if (VERBOSE && message.startsWith('[TUREAD-TEST-STEP]')) console.log(`[page] ${message}`)
    else if (VERBOSE && !message.startsWith('[TUREAD-TEST-')) console.log(`[page] ${message}`)
    if (message.startsWith('[TUREAD-TEST-PROBE]')) {
      console.log(message)
      clearTimeout(timeout)
      app.exit(0)
    } else if (message.startsWith('[TUREAD-TEST-OK]')) {
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
