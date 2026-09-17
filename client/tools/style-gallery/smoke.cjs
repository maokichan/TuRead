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

  /**
   * ————— 挂载线几何机检（2026-09-16；用户定的口径 + v1.9 的纠正）—————
   *
   * 为什么必须机检：这些都是**几何**要求，肉眼在样张里"看着差不多"根本不可靠
   * （项目已有教训：`show:false` 的窗口量出的 1.6s 假数字）。故量真实矩形：
   * ① **两挂件关于「挂载线的中心」镜像** —— 线 = 固定的一条（样张里 = 演示框本身），
   *    两段**等宽**且**各贴线的一端**（等宽 + 贴齐 ⟺ 互为镜像，不需要中心点算式）；
   * ② **宽度不得由纸宽派生** —— 把 `--read-width` 现场改掉，两挂件宽度必须**一点不变**
   *    （v1.8 曾把宽度写成纸宽的函数，用户判定"可笑之极"）；
   * ③ **面板不许压到纸上** —— 挂件宽是固定的，所以让位的是**纸**（`.reader-stage` 的 min() 夹取）；
   * ④ **左抽屉顶部的两格页签关于抽屉中心对称**（用户 2026-09-16 点名的那一条）；
   * ⑤ **目录当前条目居中** —— 位置钉在第 12 章，量那一条的中心与滚动容器中心之差。
   */
  let geometry = null
  try {
    geometry = await win.webContents.executeJavaScript(`(async () => {
      const demos = Array.prototype.slice.call(document.querySelectorAll('[data-rail-demo]'))
      const demo = demos.filter((el) => (el.dataset.railDemo || '').indexOf('鏡像') >= 0)[0]
      if (!demo) return { error: 'mirror demo not found', demoCount: demos.length }
      const toc = demo.querySelector('.toc-list')
      const params = demo.querySelector('.reader-controls')
      if (!toc || !params) return { error: 'panels missing', toc: !!toc, params: !!params }
      const box = demo.getBoundingClientRect()
      const t = toc.getBoundingClientRect()
      const p = params.getBoundingClientRect()
      const center = box.left + box.width / 2
      // ② 目录当前条目：滚动容器必须真的能滚，否则"居中"是平凡成立的
      const rowsBox = demo.querySelector('.toc-list__rows')
      const rows = rowsBox ? rowsBox.querySelectorAll('.toc-row') : []
      let hit = null
      for (let i = 0; i < rows.length; i++) {
        if ((rows[i].textContent || '').indexOf('第十二章') >= 0) { hit = rows[i]; break }
      }
      const rowsRect = rowsBox ? rowsBox.getBoundingClientRect() : null
      const hitRect = hit ? hit.getBoundingClientRect() : null
      const first = {
        demoWidth: Math.round(box.width),
        tocLeftGap: Math.round(center - t.left),
        paramsRightGap: Math.round(p.right - center),
        tocFlushLeft: Math.round(t.left - box.left),
        paramsFlushRight: Math.round(box.right - p.right),
        tocWidth: Math.round(t.width),
        paramsWidth: Math.round(p.width),
        tocMaxH: getComputedStyle(toc).maxHeight,
        paramsMaxH: getComputedStyle(params).maxHeight,
        /* ③ **面板不许压到纸上**：量纸（#page-area = .reader-stage）与两挂件的矩形，判据 = 横向不相交 */
        paperLeft: null,
        paperRight: null,
        paperClear: true,
        /* ④ **两格页签关于抽屉中心对称**：量两格中心到抽屉中心的距离差 + 两格之间的中点是否落在中心上 */
        tabsSymDelta: null,
        tabMidDelta: null
      }
      const paperEl = demo.querySelector('.reader-stage')
      if (paperEl) {
        const pr = paperEl.getBoundingClientRect()
        first.paperLeft = Math.round(pr.left - box.left)
        first.paperRight = Math.round(pr.right - box.left)
        first.paperClear = pr.left >= t.right - 1 && pr.right <= p.left + 1
      }
      const tabs = demo.querySelectorAll('.rail-tabs__tab')
      if (tabs.length === 2) {
        const ra = tabs[0].getBoundingClientRect()
        const rb = tabs[1].getBoundingClientRect()
        /* ⚠ 参照必须是**抽屉自己的几何中心**（用户原话"相对于挂载线下左侧抽屉栏的几何中心"），
           不是演示框中心 —— 第一版拿 box 中心比，量出 tabMidDelta=-192 的**假 FAIL**。 */
        const drawerCenter = (t.left + t.right) / 2
        first.tabsSymDelta = Math.round(
          Math.abs(drawerCenter - (ra.left + ra.right) / 2) -
            Math.abs((rb.left + rb.right) / 2 - drawerCenter)
        )
        first.tabMidDelta = Math.round((ra.right + rb.left) / 2 - drawerCenter)
      }
      // 换一个纸宽再量宽度（判据 ②：宽度不许是纸的函数）
      demo.style.setProperty('--read-width', '520px')
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const wide = {
        tocWidth: Math.round(toc.getBoundingClientRect().width),
        paramsWidth: Math.round(params.getBoundingClientRect().width)
      }
      demo.style.setProperty('--read-width', '260px')
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      return Object.assign(first, {
        widthAtOtherPaper: wide.tocWidth,
        widthAtOtherPaper2: wide.paramsWidth,
        rows: rows.length,
        scrollable: rowsBox ? rowsBox.scrollHeight - rowsBox.clientHeight : -1,
        hitFound: !!hit,
        centeredDelta: rowsRect && hitRect
          ? Math.round((hitRect.top + hitRect.height / 2) - (rowsRect.top + rowsRect.height / 2))
          : null
      })
    })()`)
  } catch (e) {
    logs.push({ kind: 'geometry-throw', message: String(e) })
  }

  /**
   * ————— 右抽屉 · 聊天室机检（2026-09-17）—————
   *
   * 用户定的两条（逐字）：
   * ① "右抽屜，像是目錄和筆記共用一個掛載線一樣，和右邊的閱讀參數面板處於一根掛載線，
   *    **但是沒有通過房間進入一本書就不會有這個項**，樣式和左側抽屜一樣"
   *    → 房间里：右抽屉两格页签（參數 / 聊天）关于**右抽屉中心**对称、与参数面板**同宽同高上限**、
   *      贴线的右端、聊天行与输入框都在；输入框是输入类（§5.2 例外①）→ 发丝描边。
   *    → 非房间：右抽屉（展开态）里**一格页签都不该有** —— "这一项不存在"要机器可证。
   * ② 与左抽屉同族：容器 / 页签 / 遮罩的类名与几何同源（这条由 `mirrorOk` + `tabsSymOk` 的
   *    同款量法覆盖，这里只量"右抽屉自己"的对称与同宽）。
   */
  let chatGeometry = null
  try {
    chatGeometry = await win.webContents.executeJavaScript(`(() => {
      const demos = Array.prototype.slice.call(document.querySelectorAll('[data-rail-demo]'))
      const chatDemo = demos.filter((el) => (el.dataset.railDemo || '').indexOf('聊天') >= 0)[0]
      const paramOnlyDemo = demos.filter((el) => (el.dataset.railDemo || '').indexOf('閱讀參數面板') >= 0)[0]
      if (!chatDemo) return { error: 'chat demo not found', demoCount: demos.length }
      const box = chatDemo.getBoundingClientRect()
      const chat = chatDemo.querySelector('.toc-list--right')
      const tabs = chatDemo.querySelectorAll('.rail-tabs__tab')
      const rows = chatDemo.querySelectorAll('.chat-row')
      const input = chatDemo.querySelector('.chat-composer__input')
      const paramPanel = paramOnlyDemo ? paramOnlyDemo.querySelector('.reader-controls') : null
      const out = {
        chatFound: !!chat,
        tabs: tabs.length,
        rows: rows.length,
        inputFound: !!input,
        inputBorderTopPx: input ? Number.parseFloat(getComputedStyle(input).borderTopWidth) : -1,
        chatWidth: chat ? Math.round(chat.getBoundingClientRect().width) : -1,
        paramsWidth: paramPanel ? Math.round(paramPanel.getBoundingClientRect().width) : -1,
        chatFlushRight: chat ? Math.round(box.right - chat.getBoundingClientRect().right) : -1,
        chatMaxH: chat ? getComputedStyle(chat).maxHeight : null,
        paramsMaxH: paramPanel ? getComputedStyle(paramPanel).maxHeight : null,
        tabsSymDelta: null,
        tabMidDelta: null,
        /* 非房间阅读（"閱讀參數面板"那一格）：右抽屉展开态下的页签数，必须是 0 */
        noRoomTabs: paramOnlyDemo ? paramOnlyDemo.querySelectorAll('.rail-tabs__tab').length : -1
      }
      if (chat && tabs.length === 2) {
        const cr = chat.getBoundingClientRect()
        const drawerCenter = (cr.left + cr.right) / 2
        const ra = tabs[0].getBoundingClientRect()
        const rb = tabs[1].getBoundingClientRect()
        out.tabsSymDelta = Math.round(
          Math.abs(drawerCenter - (ra.left + ra.right) / 2) - Math.abs((rb.left + rb.right) / 2 - drawerCenter)
        )
        out.tabMidDelta = Math.round((ra.right + rb.left) / 2 - drawerCenter)
      }
      return out
    })()`)
  } catch (e) {
    logs.push({ kind: 'chat-geometry-throw', message: String(e) })
  }

  // ③ 批注输入栏：点开再量（React 状态 → 渲染，等一拍）
  let composer = null
  try {
    await win.webContents.executeJavaScript(
      `(() => { const b = document.getElementById('demo-composer-toggle'); if (b) b.click(); return true })()`
    )
    await new Promise((r) => setTimeout(r, 400))
    composer = await win.webContents.executeJavaScript(`(() => {
      const el = document.querySelector('.note-composer')
      if (!el) return { error: 'composer not mounted' }
      const cs = getComputedStyle(el)
      const ta = el.querySelector('textarea')
      // ⚠ 两个量法上的坑（第一版判据在这里**假 FAIL** 过）：
      // ① 描边宽度不能断言字面 "1px"：Windows 125% 缩放下 DPR=1.25，1 CSS px 吸附成 1 设备 px
      //    → getComputedStyle 报 **0.8px**（实测）。判据应是"有描边且是发丝级"。
      // ② 居中要跟 **documentElement.clientWidth** 比：window.innerWidth 含滚动条
      //    → 页面长到出现滚动条时，fixed 元素（按视口定位）会被判成偏了 5~8px。
      const cw = document.documentElement.clientWidth
      /* ⚠ 期望的"纸宽"要与 styles.css 的 :root 变量 --page-w **同一口径**（探针独立重算一遍，
         算式见那里的注释）：min(视口, 用户档位, 视口 - 2×(侧边栏 + 挂件 + 缝))，下限 160。
         ⚠ 让位量里必须含 --sidebar-w：纸是窗口居中的、挂件是从侧边栏右缘起算的。 */
      const rootCs2 = getComputedStyle(document.documentElement)
      const rw2 = Number.parseFloat(rootCs2.getPropertyValue('--read-width')) || 760
      const sw2 = Number.parseFloat(rootCs2.getPropertyValue('--sidebar-w')) || 56
      const pw2 = Number.parseFloat(rootCs2.getPropertyValue('--rail-panel-w')) || 280
      const gap2 = Number.parseFloat(rootCs2.getPropertyValue('--rail-gap')) || 16
      const paperW = Math.min(cw, rw2, Math.max(160, cw - 2 * (sw2 + pw2 + gap2)))
      const lineH = ta ? Number.parseFloat(getComputedStyle(ta).fontSize) * 1.55 : 0
      const emptyH = Math.round(el.getBoundingClientRect().height)
      // ③b **自增长**（用户 2026-09-16）：默认至少两行、内容多了自己撑起来、上限五行后转滚动。
      //    用原生 setter 写值再派发 input（React 受控组件必须这样喂）。
      let grownH = null
      let taScroll = null
      let taClient = null
      if (ta) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
        setter.call(ta, 'a\\nb\\nc\\nd\\ne\\nf\\ng\\nh')
        ta.dispatchEvent(new Event('input', { bubbles: true }))
      }
      return new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (ta) {
            grownH = Math.round(el.getBoundingClientRect().height)
            taScroll = ta.scrollHeight
            taClient = ta.clientHeight
          }
          resolve({
            visibleText: (el.innerText || '').trim().length,
            placeholder: ta ? ta.placeholder : null,
            background: cs.backgroundColor,
            borderTopPx: Number.parseFloat(cs.borderTopWidth),
            centerDelta: Math.round(el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2 - cw / 2),
            /* 「填充阅读纸、两侧各留 5% 缝」= 宽 = 纸宽 × 0.9（纸宽 = min(视口, --read-width)） */
            widthDelta: Math.round(el.getBoundingClientRect().width - paperW * 0.9),
            emptyHeightPx: emptyH,
            grownHeightPx: grownH,
            lineHeightPx: Math.round(lineH * 100) / 100,
            taValueLen: ta ? ta.value.length : -1,
            fieldSizing: ta ? getComputedStyle(ta).getPropertyValue('field-sizing') : 'n/a',
            taScrollH: taScroll,
            taClientH: taClient,
            dpr: window.devicePixelRatio,
            focusIsTextarea: document.activeElement === ta
          })
        }))
      })
    })()`)
    await win.webContents.executeJavaScript(
      `(() => { const b = document.getElementById('demo-composer-toggle'); if (b) b.click(); return true })()`
    )
    await new Promise((r) => setTimeout(r, 200))
  } catch (e) {
    logs.push({ kind: 'composer-throw', message: String(e) })
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

  /**
   * 几何判据（**逐条独立**，便于失败时一眼看出是哪一条破了）：
   * ① 镜像 = 两挂件**等宽**且**各贴线的一端**（等宽 + 贴齐 ⟺ 关于线中心互为镜像）+ 高度上限同值；
   * ② 不随内容 = 把 `--read-width` 改成 520px 后，两挂件宽度**一点不变**（v1.8 的错就在这条）；
   * ③ 跟随 = 目录滚动容器**真的能滚**（否则平凡成立，必须防假通过）+「第十二章」落在容器正中（±8px）；
   * ④ 输入栏 = 零可见文字 + 无 placeholder + 非透明纯色底 + 发丝描边 + 居中 ±2px + 挂载即聚焦
   *    + **宽 = 纸宽 × 0.9**（两侧各 5% 缝）+ **矮**（单行；三轮文本约 90px，这里判 ≤56px）。
   */
  const mirrorOk = Boolean(
    geometry &&
      !geometry.error &&
      geometry.tocWidth === geometry.paramsWidth &&
      Math.abs(geometry.tocFlushLeft ?? 99) <= 1 &&
      Math.abs(geometry.paramsFlushRight ?? 99) <= 1 &&
      Math.abs((geometry.tocLeftGap ?? 0) - (geometry.paramsRightGap ?? 0)) <= 1 &&
      geometry.tocMaxH === geometry.paramsMaxH
  )
  const widthIndependentOk = Boolean(
    geometry && !geometry.error && geometry.widthAtOtherPaper === geometry.tocWidth && geometry.widthAtOtherPaper2 === geometry.paramsWidth
  )
  /** 面板不许压到纸上（用户 2026-09-16："会盖住页面的内容"）—— 让位的是纸，不是线 */
  const paperClearOk = Boolean(geometry && !geometry.error && geometry.paperClear === true)
  /** 左抽屉顶部的两格页签关于抽屉中心对称（用户 2026-09-16 点名的那一条） */
  const tabsSymOk = Boolean(
    geometry &&
      !geometry.error &&
      geometry.tabsSymDelta !== null &&
      Math.abs(geometry.tabsSymDelta) <= 1 &&
      Math.abs(geometry.tabMidDelta ?? 99) <= 1
  )
  const followedOk = Boolean(
    geometry && !geometry.error && (geometry.scrollable ?? -1) > 40 && geometry.hitFound && Math.abs(geometry.centeredDelta ?? 999) <= 8
  )
  /**
   * 右抽屉 · 聊天室（2026-09-17 用户定）：两格页签关于**右抽屉中心**对称 + 与参数面板同宽同高上限
   * + 贴线的右端 + 聊天行渲染 + 输入框是输入类（发丝描边）。
   * ⚠ 参照必须是**抽屉自己的中心**（同 `tabsSymOk` 的教训：拿演示框中心比会量出假 FAIL）。
   */
  const chatDrawerOk = Boolean(
    chatGeometry &&
      !chatGeometry.error &&
      chatGeometry.chatFound &&
      chatGeometry.tabs === 2 &&
      chatGeometry.rows >= 1 &&
      chatGeometry.inputFound &&
      chatGeometry.inputBorderTopPx > 0 &&
      chatGeometry.inputBorderTopPx <= 1.5 &&
      Math.abs(chatGeometry.chatFlushRight ?? 99) <= 1 &&
      chatGeometry.chatWidth === chatGeometry.paramsWidth &&
      chatGeometry.chatMaxH === chatGeometry.paramsMaxH &&
      chatGeometry.tabsSymDelta !== null &&
      Math.abs(chatGeometry.tabsSymDelta) <= 1 &&
      Math.abs(chatGeometry.tabMidDelta ?? 99) <= 1
  )
  /** 「沒有通過房間進入一本書就不會有這個項」：非房间阅读的右抽屉里**一格页签都没有** */
  const noRoomTabsOk = Boolean(chatGeometry && !chatGeometry.error && chatGeometry.noRoomTabs === 0)
  /**
   * 输入栏：零文字 + 纯色底 + 发丝描边 + 居中 + 宽 = 纸宽×0.9 + **自增长**（用户 2026-09-16）：
   * 空态 ≈ **两行**高、灌 8 行后 ≈ **五行**高（封顶）且内容溢出转滚动。
   * 判据用实测行高算，不写死 px（DPR/字体差异都不会把它变成假 FAIL）。
   */
  const lineH = composer?.lineHeightPx ?? 23.25
  const composerOk = Boolean(
    composer &&
      !composer.error &&
      composer.visibleText === 0 &&
      composer.placeholder === '' &&
      composer.background !== 'rgba(0, 0, 0, 0)' &&
      composer.background !== 'transparent' &&
      composer.borderTopPx > 0 &&
      composer.borderTopPx <= 1.5 && // 发丝级（125% 缩放下实测 0.8px，见上面的量法说明）
      Math.abs(composer.centerDelta ?? 999) <= 2 &&
      Math.abs(composer.widthDelta ?? 999) <= 2 &&
      (composer.emptyHeightPx ?? 0) >= 1.7 * lineH &&
      (composer.emptyHeightPx ?? 0) <= 2.9 * lineH &&
      (composer.grownHeightPx ?? 0) >= 4.2 * lineH &&
      (composer.grownHeightPx ?? 0) <= 5.9 * lineH &&
      (composer.taScrollH ?? 0) > (composer.taClientH ?? 0) && // 到了上限就转滚动，而不是继续长高
      composer.focusIsTextarea === true
  )
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
        mirrorOk &&
        widthIndependentOk &&
        paperClearOk &&
        tabsSymOk &&
        followedOk &&
        chatDrawerOk &&
        noRoomTabsOk &&
        composerOk &&
        (SCALE <= 0 || (scale && rafGapMs <= 60))
    ),
    url: URL,
    notesOk,
    /** 几何判据（2026-09-16）：镜像 / 宽度不随纸变 / 纸不被压住 / 页签对称 / 当前条目居中 / 输入栏
     *  ＋（2026-09-17）右抽屉聊天室 `chatDrawerOk` / 非房间无页签 `noRoomTabsOk` */
    mirrorOk,
    widthIndependentOk,
    paperClearOk,
    tabsSymOk,
    followedOk,
    chatDrawerOk,
    noRoomTabsOk,
    composerOk,
    stats,
    geometry,
    chatGeometry,
    composer,
    scale,
    /** 空闲 rAF 间隔（计时环境是否可信；> 60ms 时上面的 commit/refresh 数字都不要当真） */
    rafGapMs,
    pageErrors
  }
  fs.writeFileSync(OUT, JSON.stringify({ verdict, logs }, null, 2))
  console.log(
    `[style-gallery smoke] ${verdict.ok ? 'OK' : 'FAIL'}` +
      ` | mirror=${mirrorOk ? 'ok' : 'FAIL'} fixedWidth=${widthIndependentOk ? 'ok' : 'FAIL'} paperClear=${paperClearOk ? 'ok' : 'FAIL'} tabsSym=${tabsSymOk ? 'ok' : 'FAIL'} followed=${followedOk ? 'ok' : 'FAIL'} chatDrawer=${chatDrawerOk ? 'ok' : 'FAIL'} noRoomTabs=${noRoomTabsOk ? 'ok' : 'FAIL'} composer=${composerOk ? 'ok' : 'FAIL'}` +
      (scale ? ` | scale n=${scale.n} commit=${scale.commitMs}ms settle=${scale.settleMs}ms refresh=${scale.refreshMs}ms cards=${scale.cardCount}/${scale.n} rafGap=${rafGapMs}ms` : '') +
      ` → ${OUT}`
  )
  app.exit(verdict.ok ? 0 : 1)
})
