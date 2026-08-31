# kookit 逆向文档（渲染引擎黑盒使用指南）

> 归属：**client 专属**。本文基于 `kookit/` 子模块源码逆向整理，**从源码判断 kookit 在做什么、该怎么用**，
> 便于当前开发与日后升级。版本基线：kookit HEAD `6e18465`（2026-08-23）。
> 我们的产物：`client/src/vendor/kookit.esm.js`（单文件 ESM，构建配置 `kookit/rollup.turead.config.mjs`，不受 kookit 版本控制）。
> 验证工具：`client/tools/kookit-harness/`（无 CSP 独立测试页，见 §9）。

## 1. 一句话模型

**kookit = 电子书渲染引擎库**（Koodo Reader 的核心），不是阅读器 UI、不负责书架/窗口/用户交互。
它只做一件事：**吃一个文件的 `ArrayBuffer` + 一份 config，产出"渲染在容器 DOM 里的、可翻页/可滚动的章节内容"**。
对外暴露一个 `rendition` 对象：`renderTo` + 导航（`next`/`prev`/`goToChapterIndex`/`goToPosition`）+ 位置/进度读取 + 事件。

- 桌面端入口 `src/index.ts`（ES module，我们引用的就是这个）；移动端 `src/mobile.ts`（UMD，RN WebView 用，`initMobileBook`）。
- 许可证 **AGPL-3.0**；内部依赖 foliate-js（EPUB/MOBI/AZW3/FB2）、pdf.js（PDF，**未内联**）、jszip/fflate/@zip.js（三重解压容错）、rangy、mammoth、marked 等。
- **关键认知：单文件 ESM 并非全自包含** —— 依赖表见 §7，PDF/漫画需要外部注入的全局对象 + 静态资源。

## 2. 渲染生命周期（最重要，先看这个）

从源码还原的真实时序（含本次无头验证的坑）：

```
1. BookHelper.getRendition(buffer, config, KookitNamespace)   // bookHelper.ts:33
     按 config.format 选择渲染类：EPUB→EpubRender，MOBI/AZW3/AZW→MobiRender，
     PDF→PdfRender(或 PdfTextRender)，TXT/MD/HTML/FB2/DOCX/COMIC/CACHE 各对应类
2. rendition.renderTo(element)                                // EpubRender.ts:15
     解析书籍 → 生成 chapterList / chapterDocList
     → createIframe(element, isAllowScript)                    // layoutUtil.ts:249 建 iframe
     → handleLayout(element, readerMode, doc)                  // layoutUtil.ts:752 布局
     ⚠ 只建 iframe + 布局，【不渲染任何章节正文】
3. 必须再调用一次导航方法才真正渲染正文：
     goToChapterIndex(0) | goToPosition(lastLocation) | next() | prev() ...
     → handleRenderChapter(...)                                // navigationUtil.ts:318
        doc.body.innerHTML = chapterText                        // 正文写进 iframe 的 contentDocument
     → this.trigger("rendered")                                 // 事件：内容已加载
4. 之后：record() / next() / prev() 触发 handleRecord（算位置）+ trigger("page-changed"|"scroll-text")
```

**本次无头验证结论（EPUB/MOBI/AZW3 全 OK，PDF 超时）：**

| 步骤 | 结果 |
|---|---|
| `renderTo` 之后只看 iframe | 正文长度 = 0（空） |
| 补调 `goToChapterIndex(0)` | 正文立即出现（EPUB 1111 字符，scrollHeight 1843） |
| PDF | 超时挂起 —— 因为 `window.pdfjsLib` 未注入（见 §7） |

**推论：我们 App 之前"正文渲染空"的根因 = 适配器在 `renderTo` 后只调了 `record()`（只算位置、不渲染），
从未调导航方法。** CSP 拦 `blob:` 是次要因素（影响 iframe 内图片/CSS 的加载），不是正文为空的直接原因。
修复见 §8。

## 3. 类层次与模块

```
GeneralRender (GeneralRender.ts, ~1715 行，事件基类 EventEmitter)
 ├─ EpubRender / MobiRender / HtmlRender / Fb2Render
 ├─ TxtRender / MdRender / DocxRender
 ├─ PdfRender / PdfTextRender
 ├─ ComicRender
 └─ CacheRender
```

| 文件 | 职责 |
|---|---|
| `helpers/bookHelper.ts` | 渲染工厂（按格式选类）+ `generateBook`（元数据→Book） |
| `renders/GeneralRender.ts` | 基类：生命周期、导航、位置/进度、事件、触摸注册 |
| `renders/PdfRender.ts` / `PdfTextRender.ts` | PDF 列布局渲染 / 文本化(OCR)渲染 |
| `utils/layoutUtil.ts` | `createIframe`、`handleLayout`、`handleOneChapterDoc`、`progressInfo` |
| `utils/navigationUtil.ts` | `handleRenderChapter`、`handleNext/PrevChapter`、`handleRecord`、`processHtml` |
| `utils/pdfUtil.ts` | PDF 容器/iframe、滚动定位、搜索 |
| `utils/touchUtil.ts` | 安卓/iOS 触摸、滑动动画、blob→base64 |
| `utils/noteUtil.ts` | 高亮笔记渲染/清除 |
| `utils/animationUtil.ts` | 仿真翻书动画 |
| `libs/cfi.ts` | EPUB CFI 解析生成 |
| `libs/cache.ts` | 缓存（CACHE 格式 / preCache） |
| `libs/epub.js` / `pdf.js` | EPUB 解析 / PDF 分页 |
| `model/Book.ts` `chapter.ts` `chapterDoc.ts` | 领域模型 |

## 4. rendition 公开 API（我们 `IRenderService` 的直接映射源）

导航：`renderTo(el, bookLocation?)` `next()` `prev()` `nextChapter()` `prevChapter()`
`goToPage(n)` `goToPercentage(p)` `goToChapterIndex(i)` `goToChapterDocIndex(i)`
`goToChapter(idx, href, title)` `goToPosition(JSON字符串)` `goToNode` `goToXpath` `slideTo(dir)`
`scrollToText(text)` `record()` `removeContent()`

读取：`getPosition()` → `tempLocation`（见 §6）｜`getProgress()` → `{totalPage,currentPage,percentage}`
`getChapter()` `getChapterDoc()` `getDocument()` `getIframe()` `getPageSize()` `visibleText()` `chapterText()`
`getMetadata()`（**各渲染类各自实现**，EPUB/MOBI/PDF/PDFText/FB2/Comic/TXT 有，Cache/Docx/Html/Md 无）

搜索/笔记/样式：`doSearch(kw)` `createOneNote(item, cb)` `removeOneNote(key, chapterDocIndex)`
`renderHighlighters(notes, cb)` `getHightlightCoords()` `setStyle(css)` `displayFontUrl(name,url)`

事件（`rendition.on('...')`）：`rendered`（内容加载完成）｜`page-changed`（翻页/滚动后）｜`scroll-text`

> 注意 `getPosition()` 的 `chapterDocIndex` 是 string（`tempLocation` 原样返回），
> 我们适配器已做 number 归一（`kookitRenderAdapter.ts`）。

## 5. 关键硬编码契约 / 坑（逆向发现的，违反就翻车）

1. **`getDocument()` 硬编码 `document.getElementById("page-area")`**（GeneralRender.ts:582-598、
   PdfRender.ts:750-767）—— 不认 `renderTo` 传入的元素 id。**容器必须带 `id="page-area"`**，
   否则 `getDocument()` 返回 null → `renderTo` 后续流程直接 return（永不 resolve）。
2. **`renderTo` 不渲染正文** —— 必须补一次导航调用（§2 步骤 3）。这是本次验证最核心的发现。
3. **blob URL 是内部通道**：章节正文经 `item.load()` → `fetch(blobUrl)` → `doc.body.innerHTML`
   （layoutUtil.ts:106-120）；图片/CSS 经 `loadAsset` 转 blob/dataURL。→ **宿主 CSP 必须放行 `blob:`**
   （`connect-src`、`img-src`、`style-src`；iframe 经 `frame-src` 或 `default-src`）。
4. **非 PDF/非移动时 iframe 带 `sandbox="allow-same-origin"`**（layoutUtil.ts:266-268）—— 禁脚本。
5. **PDF/漫画需要外部全局**：`window.pdfjsLib`（+ `/lib/pdfjs/` 静态资源，路径前缀随 `isElectron()` 变）、
   `window.fabric`、`window.PDFLib`/`window.Tesseract`/`window.ort`（PDF 文本化）、`window.RPC`/`window.SevenZip`+wasm（漫画）。
   **mono 单文件不内联这些** → PDF 在无注入时直接超时（验证确认）。见 §7。
6. **`isElectron()` 检测**（common.ts:100、pdf.js:6）影响 `pdfjsPath` 前缀（Electron 下 `.` 开头）。
7. **`tempLocation` 初始为 `{}`** —— 第一次 `getPosition()` 前字段可能为 undefined，调用方需兜底。
8. **readerMode**：`single` | `double` | `scroll`；`animation`：`sliding` | `mimical` | `none`；
   `textOrientation: 'vertical'`（配合非 scroll）启用竖排/列布局。
9. **`record()` 有动画等待**：`animation !== "none" && isMobile !== "yes"` 时会 `sleep(1000)`（GeneralRender.ts:1089-1092）。
10. **scroll 模式的滚动在宿主元素上，不是 kookit 核心的事**：scroll 模式 kookit 把 iframe 拉到
    `doc.body.scrollHeight + 300`（layoutUtil.ts:99-103），翻页用 `this.element.scrollTo/scrollBy`
    （GeneralRender.next()）→ **宿主容器必须 `overflow-y: auto/scroll`**（否则正文裁切、无法滚动——
    我们的 harness 测试页 stage 是 `overflow:hidden`，故不可滑，属测试页简化非 kookit 缺陷）。
    single/double 分页模式 iframe 固定视口高度、内容走 `doc.body.scrollLeft` 列滚动（宿主无需 overflow）。
    **readerMode / 触摸 / 滑动手势 = UI 集成层职责**，由 App 阅读视图决定，kookit 核心只负责解析+渲染进 iframe。

## 6. 位置 / 进度语义

- `tempLocation`（`getPosition()` 返回，handleRecord 写，navigationUtil.ts:703-770）：
  `{ chapterDocIndex, chapterHref, count, page, percentage, text, chapterTitle, xpath, timestamp }`
  - `count` = 可见块在块列表里的序号（string）；`page` = 分页模式当前页（scroll 模式为空串）；
    `percentage` = 按 chapterDoc `text.size` 加权的累计比例（string，0~1）。
  - `text` = 当前可见块前 200 字符。
- `getProgress()` = `progressInfo()`（按 readerMode 算 totalPage/currentPage，见 layoutUtil.ts:281-340）
  + `percentage` 合并。
- 对齐：我们的领域 `BookLocation` 只取 chapterDocIndex/count/page/percentage/text/chapterTitle，
  适配器已做 string→number 归一（`kookitRenderAdapter.ts` toBookLocation）。

## 7. 依赖清单与"单文件不是全自包含"明细

| 依赖 | 是否内联进 vendor | 说明 |
|---|---|---|
| foliate-js（EPUB/MOBI/AZW3/FB2 渲染） | ✅ 内联 | 电子书主流格式靠它 |
| jszip / fflate / @zip.js | ✅ 内联 | 三重解压容错（EpubRender.ts:37-55） |
| rangy | ✅ 内联 | 选区/高亮 |
| mammoth / marked / mhtml2html | ✅ 内联 | DOCX/MD/MHTML |
| **pdf.js（pdfjsLib）** | ❌ **外部** | `window.pdfjsLib` + `/lib/pdfjs/` 静态资源（pdf.js:1-3） |
| fabric（PDF 标注） | ❌ 外部 | `window.fabric`（PdfRender.ts:1335） |
| PDFLib / Tesseract / onnxruntime（PDF 文本化/OCR） | ❌ 外部 | `window.PDFLib` / `window.Tesseract` / `window.ort`（PdfTextRender.ts） |
| RPC / 7z-wasm（漫画 CBR/CB7） | ❌ 外部 | `window.RPC` / `window.SevenZip` + wasm（ComicRender.ts:68,239） |

**对 TuRead 的含义**：EPUB/MOBI/AZW3/FB2/TXT/MD/DOCX/HTML 走内联依赖，单文件即用；
**PDF 必须支持（2026-09-01 决定，非待评估）**：单独引入 pdfjs-dist 并注入 `window.pdfjsLib`
（+ 正确 serving `/lib/pdfjs/` 静态资源），见 §8.1。

## 8. 我们当前的使用（KookitRenderAdapter）与修复建议

现状 `client/src/core/adapters/render/kookitRenderAdapter.ts`（公开接口清单见 `RENDER_INTERFACE.md`）：
- `open()` 读文件 → `getRendition` → 挂事件 ✅
- `renderTo()` 里 `await rendition.renderTo(el)` 后，**无 lastLocation 时只 `record()`** ❌
  → 正文空。**修复（2026-09-01 已落地）**：无历史位置时改调 `await rendition.goToChapterIndex(0)`；
  有历史位置时 `goToPosition(JSON.stringify(lastLocation))` 保留。
- **vendor 动态加载（2026-09-01 落地，PDF 前置）**：kookit 在模块顶层 `const pdfjsLib = window.pdfjsLib`
  捕获全局 → adapter 改为 `open()` 时先 `ensurePdfjs()`（`import('pdfjs-dist')` 求值自动挂
  `globalThis.pdfjsLib`）再 `import('@vendor/kookit.esm')`，**不能静态 import vendor**（否则 pdfjsLib 捕获为 undefined）。
- 容器 `reader-stage` 已带 `id="page-area"` ✅（v0.1.1 修过）。
- CSP（`client/src/renderer/index.html`）**已补 `blob:` + `worker-src`（2026-09-01 落地）**：
  connect-src / img-src / style-src / frame-src / font-src 全部含 `blob:`，worker-src 含 `self blob:`（PDF worker）——
  章节内图片/CSS/字体走 blob URL，不放开会缺图缺样式。
- App 阅读容器 `.reader-stage` **已改 `overflow-y: auto`（2026-09-01 落地）**：
  scroll 模式滚动在宿主元素（§5.10），`overflow: hidden` 会裁切正文无法滚动。
- **PDF：已支持（2026-09-01 实装）**：pdfjs-dist@4.8.69 注入 + `/lib/pdfjs/` 静态资源，无头验证渲染 OK，见 §8.1。
- **⚠️ 已知问题（2026-09-01，定位中）**：**App 集成侧 EPUB 正文仍空** —— harness（无 CSP 独立页）
  同调用序渲染正常（1111 字），App 内 `renderTo → record() → goToChapterIndex(0)` 后 iframe 内
  `bodyHtml=764`（布局壳）但正文空、无报错。已排除：初始导航顺序（record 前/后无关）、
  StrictMode 双调用（改用模块级防重入 `devAutoOpened`）。当前怀疑 `getDocument()` 硬编码
  `#page-area` 在 App 里定位的元素与渲染目标不一致（探针 `pageAreaSame` 对比已写好待跑）。
  影响范围：EPUB 正文渲染链路在 App 内未闭环；PDF 渲染已 OK（§8.1）。

## 8.1 PDF 支持方案（2026-09-01 定案，实施中）

**背景**：kookit 的 PDF 渲染依赖**外部全局** `window.pdfjsLib`（pdf.js）+
`/lib/pdfjs/` 静态资源；单文件 ESM 未内联（rollup 不打包 window 全局依赖）。
kookit 仓库本身不携带 pdfjs 资产，由宿主注入。

**API 兼容结论（实测 pdfjs-dist 4.8.69，匹配 kookit 用法）**：
- `new pdfjsLib.PDFDataRangeTransport(size, [])` + `getDocument({range, cMapUrl, standardFontDataUrl, isEvalSupported:false, password})` ✅
- `new pdfjsLib.TextLayer({ textContentSource, container, viewport })` + `render()` ✅
- `new pdfjsLib.AnnotationLayer({ div, page, viewport })` + `render({...})` ✅
- `page.streamTextContent()` ✅
- `cmaps/`（169 个文件）+ `standard_fonts/`（16 个）随包提供 ✅
- **注意：`text_layer_builder.css` / `annotation_layer_builder.css` 不在 npm 包内** ——
  kookit 每页 iframe 内 `fetchText(pdfjsPath("text_layer_builder.css"))` 注入（pdf.js:47-50,281-282），
  缺失会致该页 iframe 构建失败 → **需自备这 2 个 css**（来自 pdf.js viewer `web/` 目录，对应版本）。
  pdfjs-dist v4.x 是匹配 kookit 代码的版本线（v5+ 移除 `PDFDataRangeTransport` 等 API，勿升）。

**注入清单（实施步骤）**：
1. `client` 依赖加 `pdfjs-dist@^4.8.69`；渲染进程注入 `window.pdfjsLib = await import('pdfjs-dist')`（open PDF 前）。
2. `/lib/pdfjs/` 静态资源 = cmaps/ + standard_fonts/ + text_layer_builder.css + annotation_layer_builder.css，
   dev（vite publicDir）与 build（electron-vite 静态）两处 serving；Electron 下 `pdfjsPath` 前缀 `.`（`isElectron()`）。
3. CSP 放行 pdfjs 所需：`worker-src 'self' blob:`（worker）、`script-src 'self'` 内联已放行。
4. **定位路线（重要）**：PDF 不文本化即可页码定位 —— `chapterDocIndex` = 页码（每页一个 section，
   `book.sections = Array.from({length: pdf.numPages})`），`getProgress()` = 页码/总页数；
   笔记高亮走 `showPDFHighlight` 的页码+视口坐标，均不依赖 OCR 文本（2026-09-01 源码核实）。
5. **扫描版 PDF**：`isScannedPDF=yes` 时走 `PdfTextRender`，OCR 引擎为**插槽式**（§8.2）；
   TuRead 用 `external-engine` 插槽接本地 OCR（`config.externalWorker = { recognize }`），
   无需改 kookit 源码。OCR 引擎实现（如 PP-OCRv5）**单独立项**，本轮只定接口。

## 8.2 OCR 文本化的多端一致性问题（2026-09-01 记录，方法待讨论）

**问题**：扫描版 PDF 经 OCR 文本化后，**文本内容两端不一致**：

| 定位层 | 是否跨端一致 | 说明 |
|---|---|---|
| 页码（chapterDocIndex） | ✅ 一致 | 每页一章，页码由 pdf.js 确定，与 OCR 无关 |
| count（滚动块序号） | ⚠️ 依赖文本 | 由 OCR 产出的 DOM 结构决定，引擎不同则可能错位 |
| text（前 200 字兜底） | ❌ 不一致 | 错字/空格/段落切分随引擎、模型、版本变化 |
| 笔记 range | ❌ 不一致 | 字符偏移/坐标建立在各自渲染结果上，跨引擎对不上 |

**影响**：同步回跳（text/count 兜底）与笔记跨端回显在"两端 OCR 引擎不同"时失效。

**待讨论方向（先记，不现在定）**：
- PDF 定位以**页码为主键**（天然稳定），text/count 兜底仅在同 OCR 引擎族内有效；
- 笔记同步在 PDF 场景优先走坐标（页码+视口坐标），不依赖文本；
- 或约定统一 OCR 引擎/模型版本（成本高，影响"本地 OCR 自由选择"）；
- OCR 结果按 BookFingerprint 持久化（本地书库），换引擎则缓存失效重建（§4 持久化同构）。

## 9. 独立测试工具

`client/tools/kookit-harness/`（隔离 CSP 干扰验证单体）：
- `index.html`：**无 CSP** 的测试页，直接 `import ../../src/vendor/kookit.esm.js`，
  文件选择 → `getRendition` → `renderTo(#page-area)` → `goToChapterIndex(0)` → 自检（章节数/正文长度/翻页）。
- `serve.mjs`：零依赖静态服务器（root=client/），`node serve.mjs` 后浏览器打开打印的地址。
- `electron.mjs`：无头自检入口，`npx electron electron.mjs --url "…?auto=test_docs/xxx.epub"`，
  捕获 `[TUREAD-TEST-OK/FAIL]` 标记退出（0/1/2）。
- 无头验证结果（2026-08-31）：EPUB 98 章正文 1111 ✅、MOBI 13 章（首章 814 字，next 后落到短分节）✅、AZW3 7 章（首章为封面短内容）✅、PDF 超时（缺 pdfjsLib）。
- **测试页刻意简化**：硬编码 `scroll` 模式 + `.reader-stage { overflow: hidden }` → 页内不可滑动、未暴露
  readerMode 切换。属测试页限制（§5.10），**不是 kookit 缺陷**；App 侧需自行提供可滚动容器 + 模式切换 UI。

## 10. 升级指南（kookit 升级时）

1. `kookit/` 是 git submodule（HEAD `6e18465`）。**升级 = 子模块 pull 新 commit**（子模块内禁止 commit/push，见其 CLAUDE.md）。
2. 重打 vendor：在 `kookit/` 下 `npx rollup -c rollup.turead.config.mjs` → 覆盖 `client/src/vendor/kookit.esm.js`
   （构建配置在 kookit 仓库里但**不受其版本控制**，`external: []` 全内联；注意 pdfjs 等外部队列不因内联而消失）。
3. 若升级改了 `src/index.ts` 导出或 `BookHelper` 签名 → 同步更新 `client/src/vendor/kookit.esm.d.ts`（黑盒声明）。
4. 契约回归清单（每次升级必跑）：
   - 无头验证 4 格式（`kookit-harness`，§9）——**尤其确认"renderTo 后需导航才渲染"未变**；
   - `#page-area` 硬编码契约未变（grep `getElementById("page-area")`）；
   - blob URL 使用方式未变（grep `blob:` in layoutUtil/navigationUtil）；
   - 外部全局依赖清单未新增（grep `window\.` in renders/）。
5. 文档维护：本文件的 §2/§5/§7 是升级敏感区，升级后核对一遍。

## 11. 结论

- kookit 单体在"依照其真实用法"（renderTo + 导航调用）下，**EPUB/MOBI/AZW3/TXT/MD/DOCX/HTML/FB2 可用**。
- 我们 App 正文为空的**根因是用法错误（缺初始导航）**，CSP 是次因；两处都已修（2026-09-01）。
- **PDF 必须支持（决定）**：注入 pdfjs-dist@4.x + serving `/lib/pdfjs/`（含 2 个 css），
  页码定位不依赖 OCR；扫描版走 external-engine 插槽接本地 OCR（单独立项）。见 §8.1。
- **OCR 多端一致性**是已记录问题（§8.2），同步/笔记在 PDF 场景的定位策略待讨论。
- 本文档随 kookit 升级需维护，敏感点集中在 §2/§5/§7/§8/§10。
