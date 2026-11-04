# 渲染封装模块 —— 公开接口清单（RENDER_INTERFACE）

> 归属：client 专属。定义 kookit 封装模块（`core/adapters/render/`）的对外接口面，供 UI 与应用服务层消费。
> UI 只依赖本清单 + 领域类型，不直接 import kookit / pdfjs。
> 随 kookit 升级需核对（`KOOKIT.md` §9 升级指南）。
> 权威契约：`CONTRACTS.md` §4.1（端口）；本文件是实施细则 + 行为语义。

---

## 1. 能力边界（什么属于封装层，什么不属于）

| 属于封装层（本模块负责） | 不属于封装层（上层负责） |
|---|---|
| 打开文件 → 解析 → 渲染进容器 | 文件选择对话框 / 读取文件（经 `readFile` 注入） |
| 翻页 / 进度 / 定位回跳 | 同步广播（RoomSession 监听 `location-changed`） |
| 位置计算与归一（`BookLocation`） | 本地持久化（store） |
| 笔记/高亮：创建 / 回显 / 删除 | 笔记存储 / 同步 / UI 交互（选中文字是 UI 意图，锚点与引擎载荷生成是适配器产物） |
| 搜索（引擎内） | 搜索 UI / 结果渲染 |
| PDF：pdfjs 注入 + 静态资源 serving | OCR 引擎（external-engine 插槽，见 §6） |

依赖注入：构造 `new KookitRenderAdapter(readFile)`，`readFile: (path) => Promise<ArrayBuffer>` —— 封装层不碰 IPC/Electron。

> **⚠ 「谁在画」边界**
>
> 渲染整体交给 kookit，我们只提供容器 + 注入样式 + 调用引擎原语。kookit 负责：
> - **正文排版**（分章、分页、滚动态、列宽）：渲染类（`GeneralRender` / `PdfRender`…）。
> - **高亮的绘制**：`highlightRange` 把命中的文本节点包成行内 `<span class="kookit-note">` ——
>   行内 span 属文档流，内容重排时自动跟随、不错位；绝对定位的覆盖层会因 `::after`、翻译、重排失准。
> - **高亮的创建/删除**：`createOneNote` / `removeOneNote` / `renderHighlighters` ——
>   我们只喂载荷（JSON 字符串 range + `"background-#hex"` 色 + 字符串批注）。
>
> 我们拥有：宿主容器 `#page-area` 与其几何、宿主 CSS token、注入书文档的样式
> （`buildReaderCss`：纸内边距 / 排版参数 / 深色配色 / `::selection`）、挂载线与各面板、
> 右键菜单、锚点的语义层（`TextAnchor` / 定位转换机制）。
>
> 需要自有覆盖层的情形（标记锚在几何而非内容流）：
> - **墨迹（`kind='ink'`）**：矢量笔画脱离版面坐标无意义，必须自铺画布
>   （`DATA_MODEL.md` §3.3 的"覆盖层位图缓存"，不是替换正文渲染）。
> - kookit 画不出的视觉（页边标记、跨页连线等）；将来换渲染内核。

---

## 2. 生命周期

```
构造 → open(record, options?) → renderTo(element) → [next/prev/goTo*] × n → close()
```

- **宿主容器**（全项目统一叫法）：阅读视图中承载 kookit 渲染 iframe 的滚动容器，
  实现 = 带 `id="page-area"` 的元素（CSS 类 `.reader-stage`）。
  宿主容器规则（自身 `overflow-y:auto`、其内 iframe 不得 `height:100%`）见 `KOOKIT.md` 坑 §5.8；
  「宿主页面」另指承载 kookit 的应用页面（CSP / 全局注入，见 KOOKIT 坑 §5.3/§5.5）。
- `open`：读文件 → 构建 rendition → 挂事件。可重复调用（内部先 `close`）。
  并发代次守卫：`close` / 后一次 `open` 推进代次，仍在读文件/解析的旧 `open` 作废并**抛错**
  （固定前缀 `[render] open superseded`），不静默 resolve。
- `renderTo(element)`：渲染到宿主容器。宿主容器必须带 `id="page-area"`（kookit 硬编码契约，KOOKIT.md §5.1）。
  - 首次定位：`options.lastLocation` 有值 → `goToPosition(JSON.stringify(lastLocation))`；
    无 → `goToChapterIndex(0)`。renderTo 只建 iframe、不渲染正文，必须补一次导航调用，否则正文空。
  - 事件：每次 `rendered`（内容加载完成）后跟随一条 `location-changed`。
  - 同有代次守卫：期间被更新的 `open`/`close` 取代 → 中止，不做注入/定位/挂监听。
  - 宿主容器自建滚动监听：停稳 400ms 后补一次 `record()`（文字类 kookit 不监听宿主 scroll，见 §4）。
- `close`：`removeContent()` + 清空宿主容器与会话状态（笔记章节映射、当前渲染节、theme、lastLocation）。
  之后可重新 `open`。

---

## 3. 方法清单（除注明同步者外全部 async）

| 方法 | 签名 | 语义 | 备注 |
|---|---|---|---|
| `open` | `(record: BookRecord, options?: RenderOptions) => Promise<void>` | 读文件 + 构建 rendition | PDF 动态注入 pdfjs（调用方不关心）；TXT 自动探测编码（MD 固定 UTF-8）；代次守卫见 §2 |
| `close` | `() => Promise<void>` | 释放渲染内容 + 清会话状态 | 幂等 |
| `renderTo` | `(element: HTMLElement) => Promise<void>` | 渲染 + 初始定位 | 宿主容器须 `id="page-area"`；须在 `open` 后（未 open 抛错） |
| `getOpenBook` | `() => BookRecord \| null`（同步） | 当前打开的书；未打开 / 已 close = null | `location-changed` 是端口级全局事件，上报位置前必须用它校验事件属于哪本书（判据 = 房间标定指纹比对） |
| `next` / `prev` | `() => Promise<void>` | 翻页/滚动前进后退 | scroll 模式滚动宿主容器（`#page-area` 须 `overflow-y:auto`）；未 open 抛错 |
| `goToPage` | `(page: number) => Promise<void>` | 跳到指定页 | 分页模式；scroll 模式语义弱 |
| `goToPercentage` | `(percentage: number) => Promise<void>` | 跳全局进度 0~1 | 跨格式通用 |
| `goToChapter` | `(chapterDocIndex: number) => Promise<void>` | 目录跳转（章节起点；PDF=页码） | 参数取 `getChapter().chapterDocIndex`；无目录/越界 no-op |
| `goToPosition` | `(location: BookLocation) => Promise<void>` | 回跳位置（同步用） | 序列化为 kookit `bookLocationStr` |
| `getPosition` | `() => BookLocation`（同步） | 当前定位 | **主定位源**（同步/持久化用它）；未 open 返回零位置 |
| `getProgress` | `() => { totalPage; currentPage }`（同步） | 页码进度 | PDF：页码/总页数；EPUB scroll：滚动估算；未 open 返回 0/0 |
| `getChapter` | `() => Chapter[]`（同步） | 目录（TOC） | 含 `label/href/chapterDocIndex/subitems`；`chapterDocIndex` 为目录项起始渲染节号、可缺省（无直达渲染节）；未 open 返回 `[]` |
| `applyTheme` | `(theme: ResolvedTheme) => Promise<void>` | 向正文注入主题色 | 每次都经 `setStyle` 重建整份 reader CSS（纸内边距/`::selection` 恒注入），**深色才追加深色配色块**（浅色不注入颜色，保留书自有外观）；与 `applyTypography` 共用 `setStyle` 通道；PDF 无操作；未 open 只记录，renderTo 时生效 |
| `applyTypography` | `(typography: ReaderTypography) => Promise<void>` | 向正文注入排版参数（字号/行距/段距） | 字段缺省 = 该项不注入；每次调用重建整份 reader style；PDF 无操作 |
| `getMetadata` | `(buffer: ArrayBuffer, format: BookFormat) => Promise<BookMetadata>` | 解析元数据 | **无状态**：内部构造临时 rendition，不碰当前阅读会话；cover 为 data URL；失败抛错，兜底在调用方 |
| `search` | `(keyword: string) => Promise<unknown>` | 引擎内搜索 | 返回形状待定（CONTRACTS §7） |
| `getSelectionAnchor` | `() => Promise<TextAnchor \| null>` | 取当前正文选区为统一锚点（`fromSelection`） | 只读、不落库；无选区 / PDF（第二批）→ null；见 §5 |
| `resolveAnchor` | `(anchor: TextAnchor, opts?: { revealNoteId?: string }) => Promise<boolean>` | 跳到锚点（`resolveToView`；笔记面板点击 / 同步回跳） | 精度 = 章级（Norm）；`revealNoteId` 给值时把该高亮元素滚进视野（弱锚点也能揭示）；未打开返回 false |
| `remeasureAnchor` | `(anchor: TextAnchor) => Promise<TextAnchor \| null>` | 按 quote 重锚（`remeasure`） | 产出必为弱锚点（`fragment = null`）；找不到 → null；见 §5 |
| `clearSelection` | `() => void`（同步） | 清掉书文档内的当前选区 | 选区在书文档，宿主 `document.getSelection()` 清不掉；清完发 `selection-changed = null` |
| `createNote` | `(note: Note) => Promise<void>` | 创建/回显一条笔记 | 要求 `note.anchor.fragment` 就位（引擎选区产物，见 §5），缺失**抛错**而非静默 |
| `removeNote` | `(noteId: string) => Promise<void>` | 删除笔记（按 `Note.id`） | 按该笔记自身所属 chapterDocIndex 定位（适配器维护 id→渲染节映射；拿"当前章节"顶替会跨章删错） |
| `renderHighlighters` | `(notes: Note[]) => Promise<void>` | 批量回显高亮 | 只对当前渲染节生效、无 fragment 的笔记跳过；每次 `rendered` 后须重调（见 §5） |

> 未 `open` 的行为：导航与笔记方法（`next`/`prev`/`goTo*`/`createNote`/`removeNote`/`renderHighlighters`）
> 未 open 即**抛错**；查询（`getPosition`/`getProgress`/`getChapter`）返回零值，是文档化语义。

---

## 4. 事件清单

| 事件 | 载荷 | 触发时机 | 消费方 |
|---|---|---|---|
| `rendered` | `chapterDocIndex: number` | 章节内容加载完成（含初始定位、翻章） | UI 更新进度；重调 `renderHighlighters` |
| `location-changed` | `BookLocation` | 翻页/滚动/定位后（`page-changed`/`scroll-text` 归一）；宿主容器滚动停稳 400ms 后适配器补一次 `record()` 再上报（坑 §5.10）；未打开不上报 | RoomSession 节流广播；UI 进度；store 存 lastLocation |
| `selection-changed` | `RenderSelection \| null` = `{ anchor: TextAnchor; rect: { x, y, width, height } } \| null` | 正文选区变化；适配器在书文档上监听 mouseup/keyup（选区事件跨不过 iframe 文档边界，宿主无法自行观测）；`rect` 为适配器换算好的**宿主视口**矩形；清空/取不到 → null | UI 摆放 / 收起色板 |
| `context-menu` | `RenderContextMenuRequest` = `{ x, y, anchor: TextAnchor \| null, noteId? }`（宿主视口坐标） | 阅读区右键（书文档 `contextmenu`，由适配器换算坐标并判定命中）；`noteId` = 右键落在已有笔记高亮上时给出其 id | UI 弹右键菜单；新建高亮/批注与编辑既有笔记的**主入口** |
| `note-clicked` | `{ noteId: string; x?: number; y?: number }`（x/y = 高亮元素在宿主视口的**下沿左端**：`r.left` / `r.bottom`；量不到 = 缺省，调用方退安全位） | 点击某条已渲染高亮（kookit `handleNoteClick` 回调，从 `event.target.dataset.key` 取笔记 id，KOOKIT.md §5 #14） | 批注面板就近弹出 |

> 语义：`location-changed` 是同步的数据源。上层不得自行猜测位置，一律读事件/`getPosition()`；
> 上报前用 `getOpenBook()` 校验事件属于哪本书。

---

## 5. 笔记/高亮（位置相关能力的完整链路）

> **状态**：本节描述的链路**已落地**（文字类；PDF 第二批）。契约 = CONTRACTS §2（Note v2 +
> 选区级锚点层）与 §4.1（引擎侧原语）；建模 = `DATA_MODEL.md` §3.1/§3.1.1。
> 实现 = `domain/anchor.ts`（纯函数）+ `kookitRenderAdapter.ts`（引擎侧）。逆向事实以本节为准。

**为什么在单体内**（详见 `KOOKIT.md` §2 讨论）：选区落在 kookit 渲染的 iframe 内部文档，
外层无法访问内部节点；载荷是格式相关序列化（文字类→**rangy 字符偏移**、PDF→页码+归一化坐标），
只有引擎能生成与回显。封装层暴露的原语（**已实现**）：

```
引擎侧（适配器）                          纯函数侧（domain/anchor.ts）
getSelectionAnchor()     ← fromSelection  normalizeAnchor / compareAnchor
resolveAnchor(a, opts?)  ← resolveToView  anchorStrengthOf / quoteSimilarity
remeasureAnchor(a)       ← remeasure      describeAnchor
                                           anchorToColumns / columnsToAnchor（落库映射）
```

完整链路（文字类）：

```
UI 选段（iframe 内用户选中，适配器在书文档上听 mouseup/keyup）
→ 适配器发 'selection-changed'（带 TextAnchor）→ UI 弹色板
→ 用例层包成 Note（id/时间戳）→ ILibraryStore.addNote（notes 表）
→ 重开书 / 每章 rendered 后 → renderHighlighters(notes 按当前节过滤) 回显
→ removeNote(id) 删除
```

**锚点三层证据**（`TextAnchor`，CONTRACTS §2）：
- `norm.chapterIndex` —— 章（PDF = 页码）；**跨格式可比层**
- `norm.progression` —— 章内进度（**按字符位置**算，与排版无关；改字号/行距不漂移）
- `norm.quote.{exact,prefix,suffix}` —— 划线原文快照 + 前后文（**锚点证据，非笔记内容**）→
  `exact` 落 `excerpt` 列，前后文并入 `anchor_hint` JSON
- `fragment.{engine,key}` —— **引擎精确载荷**：`engine='kookit-rangy'`，
  `key` = `JSON.stringify(getHightlightCoords())` 的 rangy 序列化字符范围 → 落 `anchor_key` 列

归属在 Note 层，不在锚点上：`Note.editionId`（v0.4.0 起，原 `bookId` 口径退役）——笔记挂**内容身份**
（edition），跨库共享、不随"移除收录"消失。笔记是**书外数据**，存 `ILibraryStore`
（`notes` 表；v0.4.0 起全应用一个全局 `.db`，`DATA_MODEL.md` §1/§2 v3），不写进电子书文件；
同步（v1 明确排除）将来在用例层加 `room.note` 信封广播。

**四条实测硬约束**（`note` 探针全绿验证，改动前先读）：
1. `createOneNote` / `renderHighlighters` 都做 `JSON.parse(item.range)` → **载荷必须是 JSON 字符串**。
2. kookit 颜色要 `"background-#RRGGBB"` 形态（`buildHighlightStyleForType` 按 `-` 切分）；
   传裸 hex 会 switch 无命中而**静默不显色**。⚠ 高亮 span 长在**书的 iframe** 里 →
   宿主 CSS 变量不跨文档继承，颜色必须由适配器解析成具体值再内联（不能用 `var()`）。
3. `renderHighlighters` **只对当前已渲染的那一节生效**（文字类只有一个 iframe）→ 适配器按
   `renderedChapter` 过滤，无 `fragment` 的笔记跳过（记日志，不抛错）；**调用方须在每次 `rendered` 后重调**
   （换章 = 换 document）。
4. kookit 内部 `notes.reverse()` **原地改入参** → 适配器必须传**拷贝**。

**重锚（remeasure）边界**：kookit 搜索（`getSearchResult`）返回 `{excerpt, cfi}`，`cfi` 是含
`chapterDocIndex` 的 JSON 串，**没有字符偏移** → 重锚只能重建到**章级**，产出**弱锚点**
（`fragment = null`，`progression` 记 0）；多条命中按 `quoteSimilarity` 取最相似，找不到 → null。
弱锚点仍可回跳，用户在该处重新划线即升级为强锚点。

**多端一致性（PDF 场景）**：见 `KOOKIT.md` §7「OCR 多端一致性」—— OCR 文本化的 range/text 跨引擎不一致，
PDF 笔记优先走坐标（页码+归一化坐标），text 兜底仅在同 OCR 引擎族内有效。

---

## 6. 扫描版 PDF：external-engine 插槽（本地 OCR 接入点）

kookit `PdfTextRender` 的 OCR 引擎是插槽式（`ocrEngine` 配置字段）：

```ts
interface RenderOptions {
  // ...
  isScannedPDF?: boolean          // true → 走 PdfTextRender（文本化）
  ocrEngine?: 'tesseract' | 'paddle' | 'official-ai-ocr' | 'external-engine'
}
```

**external-engine 契约**（kookit 源码核实，PdfTextRender.ts）：
```ts
// 构造时注入：
config.externalWorker = {
  recognize: (chapterDocIndex: number, _?: string) => Promise<string>  // 返回该页 OCR 文本
}
```
- 每页一章（chapterDocIndex = 页码）；`text.load()` 返回 OCR 文本 → 渲染为正文
- **不文本化也能页码定位**（PdfRender 每页一 section，`getProgress` = 页码/总页数）—— OCR 是增强层
- 缓存：页级 OCR 文本只进**内存** `cache[index]`（**不持久化**，重开书即重 OCR）；IndexedDB
  （`OCRCacheUtil`，按 URL）缓存的是 **OCR 引擎资源文件**（fetch 拦截器），不是 OCR 结果

**TuRead 定位**：OCR 引擎实现（如 PP-OCRv5 纯本地）**单独立项**，本模块只认 `externalWorker` 接口。

---

## 7. 格式支持矩阵（App 无头复测：EPUB/MOBI/AZW3/PDF 全过）

| 格式 | 渲染 | 定位 | 笔记 | 说明 |
|---|---|---|---|---|
| EPUB / MOBI / AZW3 / AZW / FB2 | ✅ | ✅ 章节+块+进度 | ✅ rangy 字符偏移 | 单文件即用 |
| TXT / MD / HTML / DOCX | ✅ | ✅ | ✅ | marked/mammoth 内联 |
| **PDF（文本）** | ✅（已实装 pdfjs 注入） | ✅ 页码为主 | ✅ 页码+坐标 | 需 `/lib/pdfjs/` 静态资源 |
| **PDF（扫描版）** | ✅（需 external-engine） | ✅ 页码 | ✅ 坐标 | OCR 引擎单独立项 |
| CBZ / CBT | ⚠️ | ⚠️ | ⚠️ | 走 kookit `ComicRender`；CBZ 依赖内联 zip；未验证 |
| CBR / CB7 | ❌ | ❌ | ❌ | 需外部注入：CBR = `window.RPC`（libunrar worker）、CB7 = `window.SevenZip`；未支持 |

**已排除**（v1 不承诺）：CBR/CB7（需外部注入，见上表）、PDF 文本化内置引擎（Tesseract/paddle 本地 worker 过重，走 external-engine）。

---

## 8. 遗留事项

- 待办统一在根 `TODO.md`（涉及本模块的如：「PDF 可见窗口交互抽查」「阅读器内搜索接线」——
  后者卡在 `search` 返回形状，CONTRACTS §7 待定）。

---

## 9. 消费指引（UI 重设计时）

1. UI 只 import：`ServiceContainer.render`（或直接 `KookitRenderAdapter`）+ 领域类型。
2. 打开：`render.open(book)` → 宿主容器 `<div id="page-area">`（**必须此 id**；宿主容器自身 `overflow-y:auto`，
   **不得**对其内 iframe 设 `height:100%`，见 `KOOKIT.md` §5.8）→ `render.renderTo(el)`；
   恢复阅读位置经 `options.lastLocation` 传入。
3. 进度/同步：订阅 `location-changed`（节流后广播）；进度条用 `getProgress()`；
   上报位置前用 `getOpenBook()` 校验事件属于哪本书。
4. 笔记：新建/编辑走 `context-menu` 右键事件；选区跟随 `selection-changed`（锚点与引擎载荷由适配器生成，
   UI 不碰书文档）→ 用例层包成 Note → `createNote` 落库；重开/切章后 `renderHighlighters`。
5. CSP（index.html）需含：`blob:`（script/connect/img/style/frame/font）+ `worker-src 'self' blob:`（PDF worker）。
