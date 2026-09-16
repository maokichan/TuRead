/**
 * 样式样张的**无头核验**（2026-09-16 立，起因见下）—— 回答一个问题："样张真的渲染出来了吗？"
 *
 * 为什么需要它：2026-09-16 发现 `npm run style` **整页黑屏**（body 底色 `--bg` + React 卸掉整棵树
 * = 一片黑）。根因是**数据层换代后样张没跟着走**：v0.4.0 把 `BookRecord` 拆成
 * `EditionRecord` + `ReadingState`，而 `LibraryToolbar` 的 `crumbs` 是必填 prop ——
 * 缺失时 `crumbs.map` 在**渲染期抛错**，React 卸载整棵树。⚠ 这不是"样式不对"，是**页面没了**，
 * 而样张又是 `STYLE.md` §8.0 规定的"效果确认第一手段" → 基线等于瞎了一半。
 *
 * 两道防线（**先跑第一道，它更便宜**）：
 * 1. `npm run typecheck:preview`（或 `typecheck:all`）—— tsconfig.preview.json 覆盖样张，
 *    任何 prop/类型漂移都会当场列出（本次 15 处漂移一个不漏）。**改数据层/组件 props 后必跑**。
 * 2. 本脚本 —— 类型过了**不等于**能渲染（运行时依然可能抛）。它用 Electron 真载入页面，
 *    量 DOM 事实 + 抓控制台，落盘 JSON。
 *
 * 用法（两个终端）：
 * ```
 * npm run style                                  # 起 dev server（5199；被占则顺延）
 * node_modules\electron\dist\electron.exe tools\style-gallery\smoke.cjs [url]
 * ```
 * ⚠ 环境约束（与 `dev/selfCheck.ts` 同类）：Electron 的 Mojo 通道走**命名管道**，
 *   **受限文件沙箱下必然 `FATAL: platform_channel.cc ... 拒绝访问`** → 必须在放宽模式下跑；
 *   且 userData 要落在**工作区内的可写目录**（默认 `%APPDATA%\Electron` 在工作区外会被拒）。
 *   脚本自己设 userData + `no-sandbox`，因此只需外层放宽。
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { app, BrowserWindow } = require('electron')

const URL = process.argv[2] || 'http://localhost:5199/tools/style-gallery/index.html'
/** `--scale=N`：附加跑压力场景（笔记管理瀑布流的规模数字，见 STYLE §5.10 的窗口化决策） */
const SCALE = Number((process.argv.find((a) => a.startsWith('--scale=')) ?? '').split('=')[1] ?? 0)
const OUT = path.join(os.tmpdir(), 'turead-gallery-smoke.json')
const logs = []

// 必须在 ready 之前：userData 落在工作区外会被沙箱拒绝（实测默认 %APPDATA%\Electron 直接 FATAL）
app.setPath('userData', path.join(__dirname, '.smoke-user-data'))
app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-gpu')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1280, height: 1200 })
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    logs.push({ kind: 'console', level, message: String(message).slice(0, 500), line, sourceId })
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    logs.push({ kind: 'fail-load', message: `${code} ${desc} ${url}` })
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    logs.push({ kind: 'gone', message: JSON.stringify(details) })
  })

  try {
    await win.loadURL(URL)
  } catch (e) {
    logs.push({ kind: 'loadURL-throw', message: String(e) })
  }
  await new Promise((r) => setTimeout(r, 3000))

  let stats = null
  try {
    stats = await win.webContents.executeJavaScript(`(() => {
      const root = document.getElementById('root')
      const body = document.body
      return {
        title: document.title,
        rootChildren: root ? root.children.length : -1,
        panels: document.querySelectorAll('section').length,
        textLen: (body.innerText || '').length,
        bodyBg: getComputedStyle(body).backgroundColor,
        railZones: document.querySelectorAll('.reader-rail').length,
        tocLists: document.querySelectorAll('.toc-list').length,
        noteCards: document.querySelectorAll('.note-card').length,
        noteFlows: document.querySelectorAll('.note-flow').length,
        /* 笔记卡片的实测高度（去重、升序）—— 用来断言「条目大小随内容长度变」：
           STYLE §5.10 的核心要求，若退化成等高（或全被算成同一跨行数）这里会露出来。 */
        noteHeights: [...new Set([...document.querySelectorAll('.note-card')]
          .map((el) => Math.round(el.getBoundingClientRect().height)))].sort((a, b) => a - b),
        fontOk: document.fonts.check('700 16px "GenRyuMin TW"')
      }
    })()`)
  } catch (e) {
    logs.push({ kind: 'eval-throw', message: String(e) })
  }

  // 判据：有面板 + 有文字 + 无 page error（level 2 里排除 Electron 的开发期 CSP 警告）
  const pageErrors = logs.filter(
    (l) =>
      (l.kind === 'console' && l.level >= 2 && !/Content-Security-Policy/.test(l.message)) ||
      l.kind !== 'console'
  )
  // 「条目大小随内容变」（STYLE §5.10）：笔记卡片 ≥2 张时，实测高度至少要出现 3 种
  // —— 样张里的批注长短刻意拉开（1 行 / 2 行 / 6 行截断），若全等高就是回归。
  // 没渲染笔记卡片时本条自动豁免（样张不含该节也不该 FAIL）。
  const notesOk = !stats || stats.noteCards < 2 || (stats.noteHeights?.length ?? 0) >= 3
  // 压力场景（可选）：`?notes-scale=N` → 读 window.__notesScale（笔记管理瀑布流的规模数字）
  let scale = null
  if (SCALE > 0) {
    try {
      await win.loadURL(`${URL}?notes-scale=${SCALE}`)
      const deadline = Date.now() + 120000
      while (Date.now() < deadline) {
        scale = await win.webContents.executeJavaScript('window.__notesScale || null')
        if (scale) break
        await new Promise((r) => setTimeout(r, 500))
      }
    } catch (e) {
      logs.push({ kind: 'scale-throw', message: String(e) })
    }
  }

  const verdict = {
    ok: Boolean(
      stats &&
        stats.rootChildren > 0 &&
        stats.panels > 0 &&
        stats.textLen > 500 &&
        pageErrors.length === 0 &&
        notesOk &&
        (SCALE <= 0 || scale)
    ),
    url: URL,
    notesOk,
    stats,
    scale,
    pageErrors
  }
  fs.writeFileSync(OUT, JSON.stringify({ verdict, logs }, null, 2))
  console.log(
    `[style-gallery smoke] ${verdict.ok ? 'OK' : 'FAIL'}` +
      (scale ? ` | scale n=${scale.n} commit=${scale.commitMs}ms settle=${scale.settleMs}ms refresh=${scale.refreshMs}ms cards=${scale.cardCount}` : '') +
      ` → ${OUT}`
  )
  app.exit(verdict.ok ? 0 : 1)
})
