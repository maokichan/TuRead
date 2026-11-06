# 契约 · 能力服务端口（ports）

> 形状权威 = `src/core/ports/*.ts`（接口 1:1，本页不复读签名）。本页 = 入口指路（端口 ↔ 适配器 ↔ 职责）+ 行为契约（应然：不级联、不静默、信任边界、节流责任）。
> 事件机制：`EventEmitter<Events>` 形状 = `src/core/ports/events.ts`（Listener / Unsubscribe / 事件映射约束，所有服务通用）；用例与适配器内部的实现基类 = `src/core/ports/emitter.ts`（TypedEmitter）。

## 端口一览

| 端口 | 端口文件 | 适配器 | 职责边界 |
|---|---|---|---|
| IRenderService | `src/core/ports/render.ts` | KookitRenderAdapter（`src/core/adapters/render/`） | 渲染 + 选区/锚点引擎侧原语；kookit 不直接暴露 |
| INetService | `src/core/ports/net.ts` | IpcNetAdapter（渲染）↔ wsNetAdapter（`src/main/net/`，真实 WS+REST） | 只搬运信封与 REST，不懂业务语义 |
| IBookIdentityService | `src/core/ports/identity.ts` | FingerprintService（`src/core/adapters/identity/`） | 指纹计算与标定校验 |
| ILibraryStore | `src/core/ports/store.ts` | IpcStoreAdapter（渲染）↔ SqliteStore（`src/main/store/`，better-sqlite3 全局单库） | 本地持久化（edition/holding/library 三层） |
| IBookPicker | `src/core/ports/picker.ts` | IpcPickerAdapter（`src/core/adapters/picker/`） | 本地文件能力（对话框/列目录/读文件/副本落盘） |
| IClipboard | `src/core/ports/clipboard.ts` | IpcClipboardAdapter（`src/core/adapters/clipboard/`） | 剪贴板写入 |
| IImageThumbnailer | `src/core/ports/image.ts` | CanvasThumbnailer（`src/core/adapters/image/`） | 封面缩略图 |
| IMetadataExtractor | `src/core/ports/metadata.ts` | OffscreenMetadataExtractor（`src/core/adapters/render/`） | 元数据/封面**离屏**解析 |

桥 = preload 注入的 `window.turead`（通道白名单与 TureadBridge = `src/shared/ipc.ts`）。

## IRenderService —— 渲染（kookit）

- **kookit 不直接暴露**：包进端口，其产物翻译成领域类型（BookLocation）。kookit 依赖 DOM（iframe 渲染）→ 外壳必须提供 DOM 环境（Electron / 浏览器 / WebView）。
- **事件**（rendered / location-changed / selection-changed / context-menu / note-clicked）：`selection-changed`、`context-menu` 必须由适配器发——选区与右键落在**书的 iframe 内文档**里，事件跨不过文档边界，宿主无法自行观测；坐标由适配器换算成宿主视口（`rect` 供色板/菜单摆放）。
- `location-changed` 是渲染端口上的**全局事件**（适配器只有一份）：上报位置前必须校验「事件属于房间的书」（与房间标定指纹比对，判据 = `identity.verify`）。
- **注入通道唯一**：`applyTheme` / `applyTypography` 共用 kookit `setStyle`（kookit 唯一样式注入口），每次调用重建整份 reader style；字段缺省 = 不注入；浅色不注入（保留书自有外观）；PDF 位图无操作（像素处理后置）。
- `getMetadata` 无状态（内部构造临时 rendition，不碰当前阅读会话；cover 为 data URL）。**批量场景一律走 IMetadataExtractor**——kookit getMetadata 是全书解析，占主窗口会把 UI 饿死。
- **锚点引擎侧原语**：`getSelectionAnchor`（fromSelection，只读不落库）/ `resolveAnchor`（resolveToView，Fragment 可解→精确、缺失→退章级；`revealNoteId` 把该笔记元素滚进视野）/ `remeasureAnchor`（**诚实降级**：kookit 搜索只给「章 + 块文本」不给字符偏移 → 产出必是弱锚点 fragment=null；找不到 → null）。纯函数部分 = `src/core/domain/anchor.ts`。
- **笔记三方法**：`createNote` 要求 anchor.fragment 就位，否则**抛错不静默**（静默 no-op 是已销案的反模式）；`removeNote` 按 Note.id（适配器内部维护 id→渲染节映射）；`renderHighlighters` 只对「当前已渲染的那一节」生效（适配器按当前节过滤），调用方须在每次 `rendered` 后重调；传入数组是拷贝（kookit 内部 `notes.reverse()` 原地改入参）；无 fragment 的笔记被跳过（合法降级）。
- `clearSelection` 必须由适配器提供（选区在书文档里，宿主清不掉）；清完广播 selection-changed = null，UI 不必自己收色板。
- **几何标注捕获（笔记 v3；PDF 专用）**：`armGeomCapture('rect' | 'stroke')` 一次性武装（拖曳完成 → 发 `geom-captured`（载荷 = 已建锚点）并自动解除；`Esc` = `disarmGeomCapture`）；武装期间适配器拦截拖曳的文字选区。**落库归 UI**（同 selection-changed 分工）。框选与文字选区同形状 `{page, coords}` 走 kookit；记号笔（`kookit-pdf-stroke`，`{page, stroke}`）kookit 不解释 → 适配器自绘 SVG 层（`kookitGeom.renderStrokeLayer`，挂页内 `.noteLayer`，与 kookit 矩形同层同定位口径）。
- `search()` 返回形状**待定**（总纲 §待定）。

## INetService —— 传输

- **connect 的语义收窄**：只做身份与准入（带二级令牌调 `POST /auth/token` 申请/复用成员 token + 记住服务器地址），**不建立 WebSocket**——服务器在 WS 握手时就要求 `room` 与 `nick`，「先连通用连接」走不到 room.join。**连接粒度 = 房间**：`openRoom` 之前 `send` 必然失败；大厅/建房/聊天历史全走 REST（`request`，不需要 WS）。
- token 双闸：所有请求带 `Authorization: Bearer <成员token>` + `X-Turead-Access: <二级令牌>`；成员 token server 签发（同一 IP 7 天内复用）。
- 同一成员 token 的新连接**踢掉旧连接**（单设备登录）→ 换房前必须先 `closeRoom()`。
- 断线重连由适配器负责；重连后服务器侧成员/订阅是**瞬态的** → 用例层必须重发 room.join（否则是「在房间里却不是成员」的幽灵，收不到 presence 与广播）。
- `failed` = 重连耗尽（可预期终点），用例层据此自动离开房间并告知。
- **协议词汇唯一解释处** = `src/core/domain/protocol.ts`（type 常量 / reason 归一 / 昵称 ≤12 字 / 握手地址 / 历史路径与合并，含单测），适配器与用例不得再自行解释字符串。

## IBookIdentityService —— 标定

- 指纹策略：头/中/尾三点采样（各 64KB 拼接哈希 + size），算法 `md5-sample3-v1`（server 已注册，**两端必须一致**）。kookit 的 `Book.md5` 由调用方计算后传入——本服务即计算方。
- `verify` = algorithm + hash + size 全等（房间标定与位置上报归属校验共用此判据）。

## ILibraryStore —— 持久化

- 三层：**edition**（内容身份，全局唯一键 = 指纹）/ **holding**（收录）/ **library**（组织模式）；书箱树在库内。schema = `DATA_MODEL.md` §2。接口保持存储无关；真实实现 = 主进程 SqliteStore（`src/main/store/sqliteStore.ts`）。
- `upsertEdition` 是**导入去重的唯一入口**（全局按指纹）；`removeEdition`（连带 notes / reading_state / reading_sessions）只在显式维护动作「清理未收录内容」里用——「移除书」走 `removeHolding`，**不是**这个。
- `removeHolding` / `removeLibrary` **不得级联** edition / notes / reading_state（用户资产；总纲不变量③）。`removeLibrary` 连带 containers/holdings，最后一个库不可移除。
- **阅读时长写入纪律**：`updateReadingLocation` 只动 `lastReadAt` / `lastLocation`，**绝不动 `totalReadMs`**——时长唯一写入口 = `appendReadingSession`（事务内累加；整行覆盖会与累加路径竞态丢会话时长）。
- `readMinutesByDay`（贡献图：本地时区归日、稀疏、分钟可为小数）与 `topReadEditions`（投影倒序、含迁移旧账、书名随行）——批 1.24 数据源。
- 层级与检索读模型：`listItemsAtLevel`（一次 JOIN 出阅读状态，避免 N+1；映射库走 `parent_path` 的 SQL 侧过滤）、`searchHoldings`（跨書箱/层级**整库**子串检索，SQL 侧完成）、`listHoldings`（全量收录含 missing——扫描对账算差集用）。
- **笔记读模型口径**：`listAllNotes` / `countAllNotes` + `NoteQuery` / `NoteListItem`（留在端口层：`editionTitle` 是展示投影，不是领域概念）——Note 实体不变，读模型是派生视图，藏在端口后面（领域层与 usecase 看不见）。`text` 只搜笔记（excerpt + body），不搜书的全文；`libraryId` 过滤经 holdings 连接（笔记挂 edition、不挂库）；不含章标题（列表显示「書名 · 節 N」，章标题冗余存列已定不做）；不设独立 `searchNotes`——关键词是 `NoteQuery.text` 的筛选维度（LIKE→FTS5 不动签名，不给两个语义重叠的入口）。
- **设置**：`getSetting` / `setSetting` / `patchSetting`（patch = 主进程**原子合并**，避免两个 Feature 读-改-写互相覆盖）；一律全局键（D9）。
- **封面**：edition 级，字节落盘 `covers/<editionId>.<ext>`，JSON 只存引用；`removeCover` 文件不存在不报错。
- **笔记写入**：**整条 Note 由调用方给全**（含 id / createdAt / updatedAt）——id 是同步主键，由用例层一次生成、跨端稳定；存储层不代生成。`updateNote` 的可改字段白名单（NotePatch）：anchor/color/body/ink——身份与种类是既成事实不可改；`updatedAt` 由本方法统一写入。

## IBookPicker —— 本地文件能力

- 平台约束：Electron 同一对话框不能既选文件又选目录（Windows 下 `openFile`+`openDirectory` 只会给出目录，electron#26885）→ `pickFiles` / `pickDirectory` 两个方法，UI 侧表现为导入小菜单。
- `saveBookCopy` 的**信任边界**：目录由 main 决定（userData/downloads），调用方只给文件名（通道 `fs:save-book-copy`）；main 剥目录成分 + 重名加序号，不开「任意路径写」的口子。房间副本下载的字节必须落盘才能被渲染适配器按路径打开。
- `listSubdirectories` 供映射库层级浏览；`listEbooks` 的 recursive 开关对应导入设置 `importRecursive`。

## IClipboard —— 剪贴板

- 只写纯文本（笔记管理「複製批註」，只複製批注正文）。立端口而不让 UI 直调 `navigator.clipboard`：① 纪律一致——UI 只依赖 ServiceContainer、不直接摸桥；② `navigator.clipboard` 依赖安全上下文 + 权限，Electron 加载协议下行为随版本变，不宜作契约前提；Electron 的 `clipboard.writeText` 同步可靠。
- 桥 = **具名方法**（`writeClipboardText`），不用泛化 `invoke(channel,…)`——具名方法天然是白名单。

## IMetadataExtractor / IImageThumbnailer —— 解析与缩略

- `IMetadataExtractor` 独立于 IRenderService 的 why：kookit getMetadata 是全书解析（EPUB 读 zip / PDF 走 pdfjs），计算密集且必须在**非主窗口进程**跑——离屏解析窗口（独立进程、DOM 齐全）是真实实现；IRenderService.getMetadata 保留（同进程小开销），批量场景一律走本端口。
- `IImageThumbnailer` 立端口的 why：CoverQueue（用例）此前直接 import 适配器——依赖方向倒置；「怎么缩」（canvas/尺寸策略）是适配器能力，须藏在端口后。
