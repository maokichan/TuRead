# kookit 逆向文档（渲染引擎黑盒使用指南）

> 归属：**client 专属**。基于 `kookit/` 子模块源码逆向整理：kookit 在做什么、该怎么用、违反什么会翻车。
> 版本基线：kookit HEAD `6e18465`；产物 `client/src/vendor/kookit.esm.js`（单文件 ESM，
> 构建配置 `kookit/rollup.turead.config.mjs`，不受 kookit 版本控制）。
> 验证工具：`client/tools/kookit-harness/`（§8）。历史定位过程见 git log，本文只记**当前事实**。

## 1. 一句话模型

**kookit = 电子书渲染引擎库**（Koodo Reader 的核心），不是阅读器 UI。
吃一个文件的 `ArrayBuffer` + config，产出"渲染进容器 DOM、可翻页/滚动的章节内容"，
对外暴露 `rendition`：`renderTo` + 导航 + 位置/进度读取 + 事件。

- 入口 `src/index.ts`（ESM，我们引用的）；许可证 **AGPL-3.0**。
- **单文件 ESM 并非全自包含**：依赖表见 §4，PDF/漫画需要宿主页面注入全局对象 + 静态资源。

## 2. 渲染生命周期（最重要）

```
1. BookHelper.getRendition(buffer, config, KookitNamespace)   // bookHelper.ts:33
     按 config.format 选渲染类：EPUB→EpubRender，MOBI/AZW3/AZW→MobiRender，
     PDF→PdfRender(或 PdfTextRender)，TXT/MD/HTML/FB2/DOCX/COMIC/CACHE 各对应类
2. rendition.renderTo(element)                                // EpubRender.ts:15
     解析 → chapterList / chapterDocList → createIframe → handleLayout
     ⚠ 只建 iframe + 布局，【不渲染任何章节正文】
3. 必须再调一次导航方法才渲染正文：
     goToChapterIndex(0) | goToPosition(lastLocation) | next() | prev()
     → handleRenderChapter（navigationUtil.ts:318）：doc.body.innerHTML = chapterText
     → trigger("rendered")
4. 之后：record() / next() / prev() → handleRecord（算位置）+ trigger("page-changed"|"scroll-text")
```

## 3. 类层次与模块

```
GeneralRender (GeneralRender.ts，事件基类)
 ├─ EpubRender / MobiRender / HtmlRender / Fb2Render
 ├─ TxtRender / MdRender / DocxRender
 ├─ PdfRender / PdfTextRender
 ├─ ComicRender
 └─ CacheRender
```

| 文件 | 职责 |
|---|---|
| `helpers/bookHelper.ts` | 渲染工厂（按格式选类）+ `generateBook` |
| `renders/GeneralRender.ts` | 基类：生命周期、导航、位置/进度、事件 |
| `renders/PdfRender.ts` / `PdfTextRender.ts` | PDF 渲染 / 文本化(OCR)渲染 |
| `utils/layoutUtil.ts` | `createIframe`、`handleLayout`、`handleIframeHeight`、`progressInfo` |
| `utils/navigationUtil.ts` | `handleRenderChapter`、`handleNext/PrevChapter`、`handleRecord` |
| `utils/pdfUtil.ts` | PDF 容器/iframe、滚动定位、搜索 |
| `utils/noteUtil.ts` | 高亮笔记渲染/清除 |
| `libs/cfi.ts` `libs/epub.js` `libs/pdf.js` | CFI / EPUB 解析 / PDF 分页 |

## 4. 外部依赖（单文件不是全自包含）

| 依赖 | 是否内联进 vendor | 说明 |
|---|---|---|
| foliate-js（EPUB/MOBI/AZW3/FB2） | ✅ | 主流格式靠它 |
| jszip / fflate / @zip.js | ✅ | 三重解压容错 |
| rangy | ✅ | 选区/高亮（笔记 range） |
| mammoth / marked / mhtml2html | ✅ | DOCX/MD/MHTML |
| **pdf.js（pdfjsLib）** | ❌ **外部** | `window.pdfjsLib` + `/lib/pdfjs/` 静态资源 |
| fabric | ❌ 外部 | PDF 标注（`window.fabric`） |
| PDFLib / Tesseract / onnxruntime | ❌ 外部 | PDF 文本化/OCR（走 external-engine 插槽） |
| RPC / 7z-wasm | ❌ 外部 | 漫画 CBR/CB7（v1 不支持） |

## 5. 关键硬编码契约 / 坑（违反就翻车）

> **术语 · 宿主容器**：阅读视图中承载 kookit 渲染 iframe 的滚动容器。本项目实现 = 带
> 硬编码 `id="page-area"` 的元素（`#page-area`，CSS 类 `.reader-stage`）。下文坑 §5.1/§5.8/§5.9/§5.10
> 中涉及的「宿主容器」均指它；「宿主页面」则指承载 kookit 的应用页面（CSP / 全局对象注入，见坑 §5.3/§5.5）。
> 术语锚点见 `RENDER_INTERFACE.md` §2；位置语义概念名 =「定位系统」（`CONTRACTS.md` §2.1）。

1. **`getDocument()` 硬编码 `document.getElementById("page-area")`**（GeneralRender.ts:582、
   PdfRender.ts:750）——不认 `renderTo` 传入的元素。**宿主容器必须带 `id="page-area"`**，
   否则 `renderTo` 后续流程直接 return（永不 resolve）。
2. **`renderTo` 不渲染正文** —— 必须补一次导航调用（§2 步骤 3）。
3. **blob URL 是内部通道**：正文经 `item.load()` → `fetch(blobUrl)` → `doc.body.innerHTML`；
   图片/CSS 经 `loadAsset` 转 blob。→ **宿主页面 CSP 必须放行 `blob:`**
   （connect/img/style/frame/font-src；worker-src 另需 PDF worker）。
4. **非 PDF/非移动时 iframe 带 `sandbox="allow-same-origin"`** —— 禁脚本。
5. **PDF/漫画需要外部全局**（§4 表）；vendor 必须在 `window.pdfjsLib` 注入**之后**动态 import
   （kookit 模块顶层捕获该全局，顺序不可反——适配器 `loadKookit()` 已保证）。
6. **`isElectron()` 检测**影响 `pdfjsPath` 前缀（Electron 下 `.` 开头）。
7. **`tempLocation` 初始为 `{}`** —— 首次 `getPosition()` 字段可能 undefined，适配器已兜底。
8. **scroll 模式的滚动发生在宿主容器上**：kookit 把 iframe 拉到 `doc.body.scrollHeight + 300`
   （layoutUtil.ts:99-103，仅文字类），翻页是对宿主容器 `scrollTo/scrollBy` →
   **宿主容器必须 `overflow-y: auto`，且 CSS 不得对其内 iframe 设 `height: 100%`**
   （作者样式会覆盖 kookit 设的 height 属性 → iframe 压回一屏、宿主容器不可滚、翻页退化为跳章，
   2026-09-07 定位，App 与 harness 同病同修）。single/double 分页模式走 iframe 内列滚动，无此要求。
9. **PDF scroll 模式 kookit 不拉高外层 iframe**（`handleIframeHeight` 只被文字类调用）——
   页面容器全在外层 iframe 内，宿主容器永不可滚。适配器 `renderTo` 按 `doc.body.scrollHeight + 300` 补齐。
10. **文字类渲染不监听宿主容器 scroll**：`next()` 是 smooth 滚动刚开始就 `record()` → 位置是旧值。
    消费方须**滚动停稳后补一次 `record()`**（PDF 例外，PdfRender 自带 scroll 监听）。
    另：无头隐藏窗口（show:false）会把 smooth scroll 推迟 ~2s 才执行。
11. **`record()` 有动画等待**：`animation !== "none" && isMobile !== "yes"` 时 sleep(1000)。
12. **`getPosition()` 的数值字段是 string**（`tempLocation` 原样返回）——域层一律经
    `normalizeLocation` 归一为 number（CONTRACTS §2.1）。

## 6. 位置 / 进度语义（kookit 侧）

- `tempLocation`（`getPosition()` 返回，handleRecord 写，navigationUtil.ts:703-770）：
  `{ chapterDocIndex, chapterHref, count, page, percentage, text, chapterTitle, xpath, timestamp }`
  —— `count` = 可见滚动块序号；`page` = 分页模式页码（scroll 模式为空串）；
  `percentage` = 按 chapterDoc `text.size` 加权的累计比例；`text` = 可见块前 200 字。
- `getProgress()` = `progressInfo()`（按 readerMode 算 totalPage/currentPage）+ percentage。
- **域层语义与比较规则以定位系统为权威**：`CONTRACTS.md` §2.1 + `core/domain/location.ts`。
  本节只描述 kookit 侧行为，消费方不要基于本节自行造比较逻辑。

## 7. 我们的使用（KookitRenderAdapter）

`client/src/core/adapters/render/kookitRenderAdapter.ts`（行为细则见 `RENDER_INTERFACE.md`）：

- **vendor 动态加载**：`open()` 先 `ensurePdfjs()`（`import('pdfjs-dist')` 挂全局）再
  `import('@vendor/kookit.esm')` —— 不能静态 import（坑 §5.5）。
- **renderTo**：`rendition.renderTo(el)` → PDF 时补拉高外层 iframe（坑 §5.9）→
  有 `lastLocation` 走 `goToPosition`，否则 `goToChapterIndex(0)`（坑 §5.2）。
- **目录（v0.2.3）**：`getChapter()` 返回 TOC 树，适配器把每项的 `index` 透传为
  `Chapter.chapterDocIndex`（= 起始渲染节号，与 `tempLocation.chapterDocIndex` 同标尺）；
  `goToChapter(idx)` = 透传 `goToChapterDocIndex(idx)`（直接按渲染节跳转，不依赖 flatten 顺序）。
- **宿主容器要求**（UI 侧）：带 `id="page-area"` + `overflow-y:auto` + 其内 iframe 无 `height:100%`
  （坑 §5.1/§5.8）；宿主页面 CSP 含 `blob:` + `worker-src`（坑 §5.3）。
- **滚动位置补录（v0.1.7）**：`renderTo` 在宿主容器上挂 `scroll` 监听，停稳 400ms 后补一次 `record()`
  并上报 `location-changed` —— 即坑 §5.10 的消费侧义务落到了适配器里（文字类手动滚动此前不留任何位置痕迹）。
- **PDF**：pdfjs-dist@4.8.69 注入 + `/lib/pdfjs/` 静态资源（cmaps/standard_fonts/
  text_layer_builder.css/annotation_layer_builder.css/worker）。pdfjs-dist v4.x 是匹配版本线
  （v5+ 移除 `PDFDataRangeTransport` 等 API，勿升）。**定位**：页码为主键（`chapterDocIndex` = 页码，
  每页一个 section），不依赖 OCR；笔记走页码+视口坐标。
- **扫描版 PDF**：`isScannedPDF` 走 `PdfTextRender`，OCR 是插槽（`external-engine`，
  `config.externalWorker = { recognize }`），无需改 kookit 源码；引擎实现单独立项。
- **OCR 多端一致性**（已知边界）：页码跨端稳定；count/text/笔记 range 随 OCR 引擎变化，
  同步回跳与笔记回显只在同引擎族内有效。

## 8. 独立测试工具（kookit-harness）

`client/tools/kookit-harness/`，隔离 App 环境验证单体：

- `serve.mjs`：零依赖静态服务器（root=client/），映射 `/lib/pdfjs/` → `src/renderer/public/lib/pdfjs/`。
- `index.html`：无 CSP 测试页。先动态 import pdfjs 再 import vendor（顺序不可反）；
  `?auto=<路径>` 自动跑自检（章节列表/正文量/翻页快照断言）；`&probe=<js表达式>`
  在页面上下文执行诊断（可访问 `rendition`），结果以 `[TUREAD-TEST-PROBE]` 打印。
- `electron.mjs`：无头入口（`--url` 兼容等号/空格传参，`TUREAD_HARNESS_URL` 亦可）；
  捕获 `[TUREAD-TEST-OK/FAIL/PROBE]` 退出（0/1/2）；`--verbose` 透传页面 console。
- **自检语义**：① 首章正文 <100 字时先推进到第一篇文字章节（纯图片扉页属正常书本结构，
  如《高级运动营养学》第 0 章只有一张图——innerText=0 不是 bug）② `next()` 后先 sleep(3000)
  再停稳检测 + 补 `record()`（坑 §5.10：隐藏窗口推迟 smooth scroll ~2s，停稳检测无法区分
  「未开始/已结束」）③ 位置快照（章节索引/count/percentage/scrollTop 任一变化）才算翻页生效。
- **v0.1.8 健壮性修正（App 自检 `dev/selfCheck.ts`，2026-09-08）**：书库启动即渲染封面后，
  自检时序窗口变窄，暴露出两类假阴性 ——
  ① `MobiRender`/AZW3 偶发晚于首帧才设 iframe 高度 → 加 `waitIframeSized()`（等高度落地，超时仍判可疑）；
  ② 书被"上次阅读位置"恢复到接近结尾处时 `next()` 本就无处可去 → 翻页断言**先 `goToChapter(0)` 再起跑**；
  ③ 翻页判定改为"等变化出现"（`waitForTurn`：位置或宿主 scrollTop 变化，15s 超时）而不是"停稳后再量"。
- **当前结果**：EPUB/MOBI/AZW3 全绿（App 无头自检四格式亦全绿，含 PDF）；
  harness 侧 PDF canvas 未渲染待定位（低优先级，见 TODO）。

## 9. 升级指南

1. `kookit/` 是 submodule（HEAD `6e18465`），**升级 = 子模块 pull 新 commit**
   （子模块内禁止 commit/push，见其 CLAUDE.md）。
2. 重打 vendor：`kookit/` 下 `npx rollup -c rollup.turead.config.mjs` → 覆盖
   `client/src/vendor/kookit.esm.js`（`external: []` 全内联；外部全局依赖不因内联消失）。
3. 改了导出/签名 → 同步 `client/src/vendor/kookit.esm.d.ts`（黑盒声明）。
4. 契约回归（每次升级必跑）：
   - harness 无头验证 4 格式 —— 确认"renderTo 后需导航才渲染"未变；
   - `#page-area` 硬编码未变（grep `getElementById("page-area")`）；
   - blob URL 用法未变（grep `blob:` in layoutUtil/navigationUtil）；
   - 外部全局清单未新增（grep `window\.` in renders/）。
5. 本文件 §2/§5/§4 是升级敏感区，升级后核对。
