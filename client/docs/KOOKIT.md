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
**PDF 若要支持，需单独引入 pdfjs 并注入 `window.pdfjsLib`（+ 正确 serving `/lib/pdfjs/`）**——单独立项。

## 8. 我们当前的使用（KookitRenderAdapter）与修复建议

现状 `client/src/core/adapters/render/kookitRenderAdapter.ts`：
- `open()` 读文件 → `getRendition` → 挂事件 ✅
- `renderTo()` 里 `await rendition.renderTo(el)` 后，**无 lastLocation 时只 `record()`** ❌
  → 正文空。**修复**：无历史位置时改调 `await rendition.goToChapterIndex(0)`（或 `goToPosition({chapterDocIndex:0,…})`）；
  有历史位置时 `goToPosition(JSON.stringify(lastLocation))` 保留。
- 容器 `reader-stage` 已带 `id="page-area"` ✅（v0.1.1 修过）。
- CSP（`client/src/renderer/index.html`）需补 `blob:` 放行（connect-src / img-src / style-src / frame-src）——
  虽然正文空的主因不是它，但章节内图片/CSS 仍走 blob，不放开会缺图缺样式。
- PDF：当前必超时（无 pdfjsLib）——决策是否进 v1，若进则先做 pdfjs 注入（见 §7）。

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

- kookit 单体在"依照其真实用法"（renderTo + 导航调用）下，**EPUB/MOBI/AZW3 可用**。
- 我们 App 正文为空的**根因是用法错误（缺初始导航）**，CSP 是次因；两处都要修。
- PDF 需要额外注入 pdfjs，单文件不背这个锅，单独立项评估。
- 本文档随 kookit 升级需维护，敏感点集中在 §2/§5/§7/§10。
