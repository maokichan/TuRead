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
/** `--no-window`：压力场景关掉窗口化（A/B 对照） */
const NO_WINDOW = process.argv.includes('--no-window')
const OUT = path.join(os.tmpdir(), 'turead-gallery-smoke.json')
const logs = []

// 必须在 ready 之前：userData 落在工作区外会被沙箱拒绝（实测默认 %APPDATA%\Electron 直接 FATAL）
app.setPath('userData', path.join(__dirname, '.smoke-user-data'))
app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-gpu')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1280, height: 1200 })
  /**
   * ⚠ **计时环境的两个前提**（2026-09-16 踩过：一个假数字差点进了决策文档）：
   * ① 从未显示过的窗口（`show:false`）**合成器不出帧** → `requestAnimationFrame` 的间隔被拉到
   *    ~850ms（实测），于是所有"基于 rAF 的耗时"（如 `refreshMs`）都会虚高成 ~1.7s。
   * ② 隐藏窗口还会节流计时器。
   * 故：关掉后台节流，并**用 `showInactive()` 让窗口真的出帧**（不抢焦点）。
   * 页面侧还有一道自检：空闲 rAF 间隔（见下方 `rafGapMs`），环境不可信就直接判 FAIL ——
   * **探针的假阴性/假数字比 FAIL 更危险**，它会把真回归盖住。
   */
  win.webContents.setBackgroundThrottling(false)
  win.showInactive()
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    logs.push({ kind: 'console', level, message: String(message).slice(0, 500), line, sourceId })
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    logs.push({ kind: 'fail-load', message: `${code} ${desc} ${url}` })
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    logs.push({ kind: 'gone', message: JSON.stringify(details) })
  })

  // ⚠ 预热加载：Vite 在"配置变了/首次请求"时会**重新优化依赖并整页 reload**，
  // 那次 reload 会让随后的测量拿到空 DOM（实测出现过 rootChildren=0 的**假阴性** ——
  // 探针假阴性比 FAIL 更危险，它会把真回归盖住）。故先空跑一次，再正式载入测量。
  try {
    await win.loadURL(URL)
    await new Promise((r) => setTimeout(r, 1200))
    await win.loadURL(URL)
  } catch (e) {
    logs.push({ kind: 'loadURL-throw', message: String(e) })
  }
  await new Promise((r) => setTimeout(r, 3000))

  let stats = null
  try {
    // ⚠ 先把笔记流滚进视野再量：窗口化（正确地）不渲染视口外的条目，
    // 而样张里这一节在首屏之下 —— 不滚过去就量到 0 张卡（曾因此假通过一次断言）。
    await win.webContents.executeJavaScript(`(() => {
      const el = document.querySelector('.note-flow')
      if (el) el.scrollIntoView({ block: 'center' })
      return true
    })()`)
    await new Promise((r) => setTimeout(r, 600))
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
  // 「条目大小随内容变」+「笔记流真的渲染出来了」（STYLE §5.10）：
  // ⚠ 这条曾**假通过** —— 一次 bug 让样张的笔记流渲染出 0 张卡，而旧判据写的是
  //   `noteCards < 2 || ...`（0 张时**豁免**）→ 探针没响。故改为**必须**有卡片、
  //   且实测高度至少 3 种（样张里的批注长短刻意拉开）。若将来要撤掉这一节，**得显式改探针**，
  //   不许它悄悄豁免（探针假阴性比 FAIL 更危险）。
  const notesOk =
    !stats || (stats.noteFlows > 0 && stats.noteCards >= 2 && (stats.noteHeights?.length ?? 0) >= 3)
  // 压力场景（可选）：`?notes-scale=N` → 读 window.__notesScale（笔记管理瀑布流的规模数字）
  let scale = null
  let rafGapMs = -1
  if (SCALE > 0) {
    try {
      await win.loadURL(`${URL}?notes-scale=${SCALE}${NO_WINDOW ? '&no-window=1' : ''}`)
      // 计时环境自检：空闲时 rAF 的平均间隔（> 60ms 说明被节流 → 所有 rAF 指标不可信）
      rafGapMs = await win.webContents.executeJavaScript(`new Promise((res) => {
        const t0 = performance.now()
        requestAnimationFrame(() => requestAnimationFrame(() => res(Math.round((performance.now() - t0) / 2))))
      })`)
      if (rafGapMs > 60) logs.push({ kind: 'timing-env', message: `rAF 间隔 ${rafGapMs}ms（被节流）—— rAF 类指标不可信` })
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
        (SCALE <= 0 || (scale && rafGapMs <= 60))
    ),
    url: URL,
    notesOk,
    stats,
    scale,
    /** 空闲 rAF 间隔（计时环境是否可信；> 60ms 时上面的 commit/refresh 数字都不要当真） */
    rafGapMs,
    pageErrors
  }
  fs.writeFileSync(OUT, JSON.stringify({ verdict, logs }, null, 2))
  console.log(
    `[style-gallery smoke] ${verdict.ok ? 'OK' : 'FAIL'}` +
      (scale ? ` | scale n=${scale.n} commit=${scale.commitMs}ms settle=${scale.settleMs}ms refresh=${scale.refreshMs}ms cards=${scale.cardCount}/${scale.n} rafGap=${rafGapMs}ms` : '') +
      ` → ${OUT}`
  )
  app.exit(verdict.ok ? 0 : 1)
})
