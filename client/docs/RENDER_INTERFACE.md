# 渲染封装模块 —— 公开接口清单（RENDER_INTERFACE）

> 归属：**client 专属**。本文定义 kookit 封装模块（`core/adapters/render/`）对外暴露的**稳定接口面**，
> 供 UI（React 外壳，重设计后）与应用服务层消费。UI 只依赖本清单 + 领域类型，**不直接 import kookit / pdfjs**。
> 状态：2026-09-01 定稿（随 kookit 升级需核对，见 `KOOKIT.md` §10）。
> 权威契约：`CONTRACTS.md` §4.1（端口）；本文件是其实施细则 + 行为语义。

---

## 1. 能力边界（什么属于封装层，什么不属于）

| 属于封装层（本模块负责） | 不属于封装层（上层负责） |
|---|---|
| 打开文件 → 解析 → 渲染进容器 | 文件选择对话框 / 读取文件（经 `readFile` 注入） |
| 翻页 / 进度 / 定位回跳 | 同步广播（RoomSession 监听 `location-changed`） |
| 位置计算与归一（`BookLocation`） | 本地持久化（store） |
| 笔记/高亮：创建 / 回显 / 删除 | 笔记存储 / 同步 / UI 交互（选中文字是 UI 意图，range 生成是引擎产物） |
| 搜索（引擎内） | 搜索 UI / 结果渲染 |
| PDF：pdfjs 注入 + 静态资源 serving | OCR 引擎（external-engine 插槽，见 §6） |

依赖注入：构造 `new KookitRenderAdapter(readFile)`，`readFile: (path) => Promise<ArrayBuffer>` —— 封装层不碰 IPC/Electron。

---

## 2. 生命周期

```
构造 → open(record, options?) → renderTo(element) → [next/prev/goTo*] × n → close()
```

- `open`：读文件 → `getRendition` → 挂事件。**可重复调用**（内部先 `close`）。
- `renderTo(element)`：渲染到容器。**必须带 `id="page-area"`**（kookit 硬编码契约，KOOKIT.md §5.1）。
  - 首次定位：无 `lastLocation` → `goToChapterIndex(0)`（渲染初始章节，**必须的导航调用**，否则正文空）；
    有历史位置 → `goToPosition(JSON.stringify(lastLocation))`。
  - 事件序列：`rendered`（内容加载完成）→ 期间多次 `location-changed`。
- `close`：`removeContent()` + 清空容器。之后可重新 `open`。

---

## 3. 方法清单（全部 async 除 get*）

| 方法 | 签名 | 语义 | 备注 |
|---|---|---|---|
| `open` | `(record: BookRecord, options?: RenderOptions) => Promise<void>` | 读文件 + 构建 rendition | PDF 时内部已注入 pdfjs（动态加载，无需调用方关心） |
| `close` | `() => Promise<void>` | 释放渲染内容 | 幂等 |
| `renderTo` | `(element: HTMLElement) => Promise<void>` | 渲染 + 初始定位 | 容器须 `id="page-area"`；须在 `open` 后 |
| `next` / `prev` | `() => Promise<void>` | 翻页/滚动前进后退 | scroll 模式滚动宿主元素（`#page-area` 须 `overflow-y:auto`） |
| `goToPage` | `(page: number) => Promise<void>` | 跳到指定页 | 分页模式；scroll 模式语义弱 |
| `goToPercentage` | `(percentage: number) => Promise<void>` | 跳全局进度 0~1 | 跨格式通用 |
| `goToPosition` | `(location: BookLocation) => Promise<void>` | 回跳位置（同步用） | 序列化为 kookit `bookLocationStr` |
| `getPosition` | `() => BookLocation` | 当前定位 | 同步；**主定位源**（同步/持久化用它） |
| `getProgress` | `() => { totalPage; currentPage }` | 页码进度 | PDF：页码/总页数；EPUB scroll：滚动估算 |
| `getChapter` | `() => Chapter[]` | 目录（TOC） | 含 `label/href/subitems` |
| `search` | `(keyword: string) => Promise<unknown>` | 引擎内搜索 | 返回形状待定（CONTRACTS §7） |
| `createNote` | `(note: Note) => Promise<void>` | 创建/回显一条笔记 | `note.range` 由调用方提供（引擎选区产物，见 §5） |
| `removeNote` | `(key: string) => Promise<void>` | 删除笔记 | 按当前 chapterDocIndex 定位 |
| `renderHighlighters` | `(notes: Note[]) => Promise<void>` | 批量回显高亮 | 重开书时用持久化的 notes |

---

## 4. 事件清单

| 事件 | 载荷 | 触发时机 | 消费方 |
|---|---|---|---|
| `rendered` | `chapterDocIndex: number` | 章节内容加载完成（含初始定位、翻章） | UI 更新进度 |
| `location-changed` | `BookLocation` | 翻页/滚动/定位后（`page-changed`/`scroll-text` 归一） | **RoomSession 节流广播**；UI 进度；store 存 lastLocation |

> 语义：`location-changed` 是**同步的数据源**。上层不得自行猜测位置，一律读事件/`getPosition()`。

---

## 5. 笔记/高亮（位置相关能力的完整链路）

**为什么在单体内**（详见 `KOOKIT.md` §2 讨论）：选区落在 kookit 渲染的 iframe 内部文档，
外层无法访问内部节点；`range` 是格式相关序列化（EPUB→rangy 字符偏移、PDF→页码+视口坐标），
只有引擎能生成与回显。封装层暴露三个原语：

```
UI 选段（iframe 内用户选中）→ 引擎生成 range（createOneNote 前，内部 getNotePosition/getHightlightCoords）
→ Note 落库（外层 store，含 location + range）
→ 重开书 renderHighlighters(notes) 回显
→ removeNote(key) 删除
```

**Note 字段语义**（领域类型 `Note`，CONTRACTS §2）：
- `location: BookLocation` —— 位置锚点（跨版本兜底 + 同步用）
- `range: string` —— 引擎内部序列化（EPUB：rangy 字符偏移；PDF：页码+坐标）—— **重开回显的精确依据**
- `bookId` —— 关联本地 BookRecord；书可重下/替换，笔记不丢

**持久化**：笔记是**书外数据**，存 `ILibraryStore`（JSON 起步，未来 sqlite），
不写进电子书文件；同步（v1 明确排除）将来在用例层加 `room.note` 信封广播。

**多端一致性警告（PDF 场景）**：见 `KOOKIT.md` §8.2 —— OCR 文本化的 range/text 跨引擎不一致，
PDF 笔记优先走坐标（页码+视口坐标），text 兜底仅在同 OCR 引擎族内有效。

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
- 缓存：内存 `cache[index]` + IndexedDB（`ocrCacheUtil`，按 URL）；持久化方案与笔记同构（按 BookFingerprint）

**TuRead 定位**：OCR 引擎实现（如 PP-OCRv5 纯本地）**单独立项**，本模块只认 `externalWorker` 接口。

---

## 7. 格式支持矩阵（2026-09-01 实测）

| 格式 | 渲染 | 定位 | 笔记 | 说明 |
|---|---|---|---|---|
| EPUB / MOBI / AZW3 / AZW / FB2 | ✅ | ✅ 章节+块+进度 | ✅ rangy 字符偏移 | 单文件即用 |
| TXT / MD / HTML / DOCX | ✅ | ✅ | ✅ | marked/mammoth 内联 |
| **PDF（文本）** | ✅（已实装 pdfjs 注入） | ✅ **页码为主** | ✅ 页码+坐标 | 需 `/lib/pdfjs/` 静态资源 |
| **PDF（扫描版）** | ✅（需 external-engine） | ✅ 页码 | ✅ 坐标 | OCR 引擎单独立项 |
| CBZ | ⚠️ | ⚠️ | ⚠️ | 依赖内联 zip；未验证 |
| CBR / CB7 | ❌ | ❌ | ❌ | 需 SevenZip wasm（外部），未支持 |

**已排除**（v1 不承诺）：CBR/CB7（需 RPC/7z-wasm 注入）、PDF 文本化内置引擎（Tesseract/paddle 本地 worker 过重，走 external-engine 更干净）。

---

## 8. 已知问题（2026-09-01）

- **App 集成侧 EPUB 正文仍空（定位中）**：harness（无 CSP 独立页）同调用序渲染正常（1111 字），
  App 内 `renderTo → record() → goToChapterIndex(0)` 后 iframe 内 `bodyHtml=764`（布局壳）但正文空、无报错。
  已排除：初始导航顺序、StrictMode 双调用（改模块级防重入）。当前怀疑 `getDocument()` 硬编码
  `#page-area` 在 App 里定位的元素与渲染目标不一致（探针 `pageAreaSame` 待跑）。
  影响：EPUB 正文渲染链路在 App 内未闭环；PDF 已 OK（本文件 §7）。
- PDF `next()` 无头验证翻页后位置仍第0页（异步 canvas 渲染时序，真机交互待验）。

---

## 9. 消费指引（UI 重设计时）

1. UI 只 import：`ServiceContainer.render`（或直接 `KookitRenderAdapter`）+ 领域类型。
2. 打开：`render.open(book)` → `<div id="page-area">`（**必须此 id** + `overflow-y:auto`）→ `render.renderTo(el)`。
3. 进度/同步：订阅 `location-changed`（节流后广播）；进度条用 `getProgress()`。
4. 笔记：监听 iframe 内选区 → 生成 range → `createNote` → 落库；重开 `renderHighlighters`。
5. CSP（index.html）需含：`blob:`（connect/img/style/frame/font）+ `worker-src 'self' blob:`（PDF worker）。
