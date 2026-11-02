# 客户端契约（Client Contracts）

> 状态：v0.4.8（当前），版本速览见 §8；分层 = 能力服务（ports）与应用服务（用例）两层。
> 术语：六边形架构（端口-适配器）为骨架，DDD 命名为层内词汇（对照表见 `ARCHITECTURE.md` §1）。
> 范围：仅 client 的层与接口契约；同步协议由 server 定义（`../../server/docs/API.md`）；类型 1:1 落到 `client/src/core/{domain,ports,usecases}/`。

---

## 1. 分层模型

```
UI（React 外壳）—— 只调用 ↓（业务流走用例；简单查询可直接调能力服务）
应用服务 / 用例（use cases）   IRoomSession（房间会话） · IBookService（书架+导入）—— 编排 ↓
能力服务（ports）              IRenderService · INetService · IBookIdentityService · ILibraryStore —— 实现 ↓
适配器（adapters）             kookitAdapter · wsAdapter · sqliteAdapter · ocrAdapter
领域层（domain，被所有层共享） BookLocation · EditionRecord · Holding · BookFingerprint · Note · RoomMember · 业务规则
```

**依赖规则**
- 领域层：纯类型与规则，零依赖。
- 能力服务：依赖领域类型 + 各自外部能力（kookit、网络、存储…）；彼此不依赖。
- 用例：依赖能力服务**接口**（不依赖实现）；一个用例可编排多个能力服务（如 `RoomSession` = net + render + identity + store）。
- UI：只依赖用例与领域类型。
- kookit 不直接暴露——包进 `IRenderService`，其产物翻译成领域类型（`BookLocation`）。

## 2. 领域类型（共享词汇 = 领域层）

```ts
/** 阅读位置——房间同步最小载荷，与 kookit getPosition() 对齐；字段语义与比较以 §2.1 为权威，任何组件不得自行比较/解释字段（一律走 core/domain/location.ts 原语）。 */
interface BookLocation {
  chapterDocIndex: number;  // 章节（kookit 分节）序号；PDF 下等于页码
  chapterHref: string;
  count: number;            // 可见滚动块序号（scroll 模式的"第几屏"）——文字类主键组成部分
  page: number;             // 分页模式（single/double）的页码；scroll 模式为 0
  percentage: number;       // 全局进度 0~1（display 角色：仅展示/粗粒度，不作精确锚定）
  text: string;             // 可见块前 200 字（跨端/跨版本重定位兜底）
  chapterTitle?: string;
}
/** 书籍指纹——标定"同一本书的同一电子版" */
interface BookFingerprint {
  algorithm: 'md5-sample3-v1'; // 头/中/尾三点采样（64KB×3 拼接哈希，server 已定）；预留 v2 换 sha256
  hash: string;                // 采样拼接后哈希值（hex）
  size: number;                // 文件字节数
}
type BookFormat =
  | 'EPUB' | 'PDF' | 'MOBI' | 'AZW3' | 'AZW' | 'TXT' | 'MD' | 'FB2' | 'DOCX'
  | 'HTML' | 'MHTML' | 'XML' | 'CBZ' | 'CBR' | 'CBT' | 'CB7';
/** 主题（权威 = core/domain/theme.ts）：2 主题（tone：纯色黑灰白/羊皮纸暖棕）× 2 模式（mode：深/浅）= 4 套 resolved；跟随系统只作用于模式，在所选主题内解析。 */
type ResolvedTheme = 'dark' | 'light' | 'sepia-light' | 'sepia-dark'; // dark/light = 纯色·深/浅，sepia-* = 羊皮纸·浅/深
type ThemeTone = 'solid' | 'parchment';   type ThemeMode = 'dark' | 'light';
type ThemeModeSetting = ThemeMode | 'system'; // 'system' = 跟随系统（仅作用于模式）
interface ThemePreference { tone: ThemeTone; mode: ThemeModeSetting } // 用户偏好持久化形状
/** 书籍元数据（epub/fb2 等有结构化字段，pdf/txt 可能缺省） */
interface BookMetadata {
  title: string;  author?: string;  publisher?: string;
  isbn?: string;             // 二级匹配，不强制
  language?: string;  description?: string;
  cover?: string;            // data URL 或本地路径
}

/** ⚠ 退役：`BookRecord` = `EditionRecord` 过渡别名（deprecated），只承载内容身份（阅读状态在 `ReadingState`、归属在 `Holding`，§2.2）；保留是压住渲染层爆炸半径（`IRenderService.open` 仍收它），**新代码不得用它表达"属于哪个库"**。 */
type BookRecord = EditionRecord
/** 书库视图：瀑布流因缩略图统一比例并入网格（FEATURES §10） */
type LibraryView = 'list' | 'grid';
/** 书库 = 组织模式（数据全在一个全局 .db，旧"一库一 .db"作废）；库注册表在主进程引导文件（DATA_MODEL §1）。 */
interface LibraryEntry {
  id: string;
  name: string;
  mode: 'mapped' | 'curated';  // 映射库（跟踪真实文件夹）｜自建库（空库起步、自建书箱树）
  rootPath?: string;           // `mode='mapped'`：跟踪的唯一真实文件夹
  sort: number;
}
/** 书库设置（全局 settings 表 `librarySettings` 键——设置一律全局，DATA_MODEL D9） */
interface LibrarySettings {
  view: LibraryView;
  importRecursive: boolean;    // 导入文件夹是否含子目录（false = 只此节点；true = 含所有子节点）
}
/** 阅读器设置（全局 settings 表 `readerSettings` 键）。呈现/排版参数而非阅读页控件：阅读页零控件（STYLE §5.8），
 *  参数在阅读器参数面板改、唯一写者 = 面板；运行时值可能为 null（「默認」档），读取侧 `?? 默认值` 兜底。 */
interface ReaderSettings {
  readerMode?: 'single' | 'double' | 'scroll'; // 低频参数；重开书生效
  readerWidth?: number;        // 正文列宽 px = kookit 排版宽度依据（宿主 clientWidth，KOOKIT §5），默认 760
  readerWidthPdf?: number;     // PDF 专属纸宽 px（位图页比文字列宽才舒服）
  pagePadX?: number;           // 纸内边距 px（宿主 token `--page-pad-x`，默认 44）；适配器注入 `body{padding-inline}`
  fontSize?: number;  lineHeight?: number;  paragraphSpacing?: number; // 正文排版三件套（语义同 ReaderTypography；缺省 = 不改，尊重书自带排版）
}
/** 阅读排版参数（全局 settings 表 `readerSettings` 键）。分工（STYLE §5.9）：宿主几何走 CSS 变量，本类型走 `applyTypography` 注入正文 iframe；字段缺省 = 不改，存数值不存档位名。 */
interface ReaderTypography {
  fontSize?: number;  lineHeight?: number;  // px；倍数
  paragraphSpacing?: number; // px（段落下边距）
}
/** 阅读渲染配置（适配器内部翻译为 kookit config） */
interface RenderOptions {
  readerMode: 'single' | 'double' | 'scroll';
  animation: 'sliding' | 'mimical' | 'none';
  fontSize?: number;  lineHeight?: number;  fontFamily?: string;
  theme?: ResolvedTheme;       // 适配器已消费：open 时映射 kookit isDarkMode/backgroundColor，深色下经 applyTheme 注入深色 CSS
  backgroundColor?: string;  textColor?: string;  isDarkMode?: boolean;
  convertChinese?: boolean;  password?: string;   // password = 加密 PDF/EPUB
  isScannedPDF?: boolean;  ocrEngine?: 'tesseract' | 'paddle' | 'official-ai-ocr' | 'external-engine';
  lastLocation?: BookLocation; // 首次定位目标（"回到上次读到哪"）；缺省 = 渲染初始章节
}
/** 目录（TOC）。chapterDocIndex 缺省 = 目录项无可直达渲染节（仅分组标题） */
interface Chapter {
  label: string;  href: string;
  chapterDocIndex?: number;    // 起始渲染节号（= BookLocation.chapterDocIndex 同标尺；PDF 为页码）；goToChapter 跳转参数
  subitems?: Chapter[];
}

/* ————— 选区级锚点（DATA_MODEL §3.1/§3.1.1 已批复）————— 归一化层 Norm（跨格式可比，笔记层/存储/同步只看这层）
 * + 引擎载荷层 Fragment（engine 标识 + 不透明编码串，只有适配器解释）。纯函数权威 = `core/domain/anchor.ts`，
 *  引擎侧原语（fromSelection/resolveToView/remeasure）在渲染适配器。⚠「读到哪」（进度级）≠「标在哪」（选区级）。 */
interface AnchorQuote {        // 划线时刻的书籍原文快照 —— 定位证据，不归 Note 侧（§3.1.1 ①）
  exact: string                // 选中原文（权威在此；notes 表 excerpt 列只是投影）
  prefix: string               // 选区前文（重锚消歧）→ 并入 notes 表 anchor_hint JSON
  suffix: string
}
interface AnchorNorm {
  chapterIndex: number         // 章（kookit 分节）序号；PDF = 页码（= notes 表 chapter_index）
  progression: number          // 章内进度 0~1（粗排序/粗回跳，不作精确判定）
  quote: AnchorQuote
}
interface AnchorFragment {
  engine: string               // 载荷来源（文字类 'kookit-rangy'；PDF 'kookit-pdf-rect'）
  key: string                  // 不透明编码串 = notes 表 anchor_key（逐字节原样存，不套壳）
}
interface TextAnchor {
  norm: AnchorNorm
  fragment: AnchorFragment | null   // null = 只能粗回跳 + 靠 quote 重锚
}
type AnchorMatch = 'exact' | 'strong' | 'weak' | 'unrelated'   // compareAnchor 的强弱标注
/** 笔记种类。已定：笔记/批注与划线是**同一实体**——一条笔记必带划线（锚点 = 一段正文范围），`body` 可空
 *  （有值 ≈ 批注、为空 ≈ 划线），不做无划线的"纯批注"；`kind` 是"载体类型"不是"创建来路"：
 *  `highlight` = 锚在正文范围上（当前唯一形态，带不带 body 都是它）；`bookmark` = 标位置、无文本范围（尚无 UI）；
 *  `ink` = 几何画布矢量墨迹（DATA_MODEL §3.3）；~~`note`~~ = 已定退役（与 highlight 语义重复，标签取决于历史）。
 *  ⚠ **代码尚未改**：现实现仍写 `kind='note'`（`ReaderFeature.createMark`），UI 仍有「標記」/「加批註」两命令。
 *  收敛计划（待批准）：① `NoteKind` 去 `'note'`；② 交互统一"标记 + 可选正文"；③ 呈现只按有无 `body` 区分；
 *  ④ 现存 `'note'` 行迁移为 `highlight`。 */
type NoteKind = 'highlight' | 'note' | 'bookmark' | 'ink'
type NoteColor = 'red' | 'yellow' | 'green' | 'blue' // **语义名**，UI 按主题 token 渲染，库内无 hex
/** 笔记/划线 v2（v1 退役；更名对照：key→id、location+range→anchor、text→anchor.norm.quote.exact、notes→body）。
 *  ⚠ 不含 excerpt 字段：notes 表 excerpt 列是 `anchor.norm.quote.exact` 的投影。 */
interface Note {
  id: string                  // uuid（同步主键）
  /** ⚠ `bookId` → `editionId`——笔记挂**内容（edition）**：跨库共享、不随条目消失；**各版各一份**（不自动跨版迁移，DATA_MODEL D8）。 */
  editionId: string
  owner?: string | null       // 成员 token；本地笔记 null（同步上线后回填）
  kind: NoteKind
  anchor: TextAnchor
  color?: NoteColor
  body: string                // 用户批注正文（只有这里住批注内容）
  ink?: string                // kind='ink'：InkStroke[] JSON
  createdAt: number;  updatedAt: number
}

/* ————— 笔记管理（跨书）——形态 = FEATURES §12，视觉 = STYLE §5.10 ————— */
/** 管理视图（**无列表形态**）：grid = 網格（等高行）；masonry = 瀑布流（按列装箱，**默认**） */
type NoteView = 'grid' | 'masonry';
/** 卡片文字主次（两档**可切换**，默认 `body`；只影响字号/颜色分配，不改数据——STYLE §5.10） */
type NoteTextFocus = 'body' | 'excerpt';
/** 卡片筛选（单按钮三态循环 批註→劃線→全部，默认 `annotated`）。⚠ 判据是 `body` 是否为空，不是 `kind`——
 *  二者在实现里可互相矛盾（highlight 可有 body、note 可无 body），按 kind 分组会分错；与 §2 收敛口径一致：呈现只按有无 `body` 区分。 */
type NoteFilter = 'annotated' | 'highlight' | 'all';
/** 笔记管理设置（全局 settings 表 `noteSettings` 键——设置一律全局，D9） */
interface NoteSettings {
  view: NoteView;
  filter: NoteFilter;
  textFocus: NoteTextFocus;  // 默认 `body` = 批註為主
  scope: 'library' | 'all';  // 作用域：当前库 / 全部库（**默认当前库**）
}

/** 聊天消息（追加日志模型，历史经 REST 拉取） */
interface ChatMessage {
  id: number;        // server 分配（追加序号）
  roomId: string;
  member: string;  nick: string;  // 发送者成员 token；发送时昵称快照
  text: string;  createdAt: number; // unix 秒
}
/** 房间列表项（GET /rooms 返回，见 server/docs/API.md RoomInfo） */
interface RoomInfo {
  roomId: string;  editionId: number;  // roomId = 8 位 hex
  title: string;  ext: string;         // work.title（可能缺）；小写扩展名
  ownerNick: string;  memberCount: number;  createdAt: number;  // 房主昵称（可能缺）；unix 秒
}
```

### 2.1 定位系统（BookLocation 语义权威）

> 全项目统一称「定位系统」：让「阅读位置」可解释、可比较的机制（笔记跟随/同步落点/进度恢复/跨端回跳）；语义权威 = 本节，唯一实现 = `core/domain/location.ts`（纯函数）；任何组件不得自行比较/解释 `BookLocation` 字段，一律走下表原语：

| 原语 | 用途 |
|---|---|
| `normalizeLocation(raw)` | 归一（容错 string 数值 / 缺字段 / 越界；历史 library.json 数据兼容）。位置进入域层（适配器产出、持久化读回、网络载荷）后先过这里 |
| `locationKey(loc, format)` | 主键规范化键。**格式相关**：PDF → `page`（每页一个 section，不依赖 OCR，跨端天然稳定，见 KOOKIT §8.1/§8.2）；文字类 → `chapterDocIndex + count`（可见滚动块序号） |
| `sameLocation(a, b, format)` | 同一位置判定（主键相等；调用方保证同书同版本） |
| `compareLocation(a, b, format)` | 同书内排序（PDF 按 page；文字类按 chapterDocIndex→count）；不可比返回 null |
| `anchorStrength(loc, format)` | 锚点强度：strong（主键齐备，可精确回跳）/ weak（只有粗粒度）/ none（零位置）——笔记与恢复选路用；精确回显仍以 Fragment（引擎序列化）为准，location 是粗锚点 |
| `isZeroLocation(loc)` | 零位置（未渲染）判定：所有数值键为 0 **且 `text` / `chapterHref` 皆空**。`chapterHref` 是必要判据 —— 首章首块（`chapterDocIndex=0`、`count=0`）是有效位置，不是零位置 |
| `describeLocation(loc, format)` | 日志/调试可读形式 |

**字段三级角色**（语义，不新增字段）：

| 角色 | 字段 | 规则 |
|---|---|---|
| key（主键） | PDF：`page`；文字类：`chapterDocIndex + count` | 精确回跳第一依据 |
| hint（兜底） | `text`（可见块前 200 字）、`chapterHref`、`chapterTitle` | 主键因版本/结构差异失效时的重定位线索（见 KOOKIT §8.2 多端一致性） |
| display（展示） | `percentage`、`chapterTitle` | 仅 UI 展示与粗粒度同步，**不得**作精确锚定 |

**已知时序约束**（消费方必须遵守，实测见 KOOKIT §9）：kookit 文字类渲染不监听宿主容器 scroll，`next()` 的 smooth 滚动
刚开始就 `record()`——**滚动/翻页停稳后须补一次 `record()` 再取位置**，否则拿到旧位置（PDF 例外，自带 scroll 监听）。

### 2.2 书的身份与收录（v0.4.0；定案 = `DATA_MODEL.md` §4.2/§6）

> 原 `BookRecord` 把四种身份（库内条目/内容指纹/文件路径/可选 Work）揉在一个类型里，导致"同一本书多库各持一份笔记"（DATA_MODEL §6.1）。
> v0.4.0 拆开：**内容身份 = edition**（全局唯一，键 = 指纹）、**组织归属 = holding（收录）**、**作品身份 = work**（可空，只留接口）。

```ts
/** 作品身份——"这是哪本书"。只留接口，不做完整标准化（DATA_MODEL D11/F9）。 */
interface WorkIdentity {
  protocol: 'isbn' | 'asin' | 'doi' | 'open-library' | 'content-hash-v1'
  code: string                 // 识别编码（isbn 含校验位）
}
/** 电子版本地记录（EditionRecord）——**内容身份**，全局唯一键 = `fingerprint`。同一文件 → 同一指纹 → 同一 edition 行
 *  = 跨库共享的根；原 `BookRecord` 的收录关系移到 `Holding`。⚠ 与 wire `Edition`（server 载荷，见 server/docs/API.md）
 *  不是同一类型：本类型是本地持久化的 edition 行。 */
interface EditionRecord {
  id: string                 // uuid（内部主键，稳定；**Note 与阅读状态引用它**）
  work?: WorkIdentity | null // 可空 = 尚未标准化
  fingerprint: BookFingerprint;  format: BookFormat;  metadata: BookMetadata
  filePath: string           // 当前用于打开的真实路径（最后已知）
  coverPath?: string         // 封面缩略图文件名；**edition 级**（由内容决定）；字节落盘不进 JSON；缺省 = 无封面（UI 回落文字封面）
  coverFailed?: boolean      // 封面提取失败负缓存（无内嵌封面/解析失败只试一次）；重试 = 删除本字段
  createdAt: number
}
/** 收录（Holding）——"**哪个书库里有这本书**"。同一 edition 可被**多个书库**收录（多行）→ 跨库共享天然成立；库内为**单亲归属**。 */
interface Holding {
  libraryId: string;  editionId: string;
  containerId: string | null // 属哪个书箱；null = 库根层
  origin: 'scan' | 'import'  // 映射库扫到 / 导入
  path?: string              // 该库视角下的路径（映射库对账用）
  parentPath?: string        // path 的规范化父目录（层级浏览的 SQL 过滤列）
  missing: boolean           // 来源缺失（映射库对账产物）：**只影响可见性，不影响笔记与阅读状态**（DATA_MODEL §6.1）
  sort: number;  addedAt: number
}
/** UI 侧读模型（非存储实体）：一个层级的条目 = edition + 收录关系 + 阅读状态（`listItemsAtLevel` 一次 JOIN 出，避免 N+1） */
interface LibraryItem {
  edition: EditionRecord
  holding: Holding
  readingState: ReadingState | null // null = 从未读过
}
```

**不变量（实现与测试的判据）**：
1. 同一指纹在 `editions` 全局**至多一行**（跨库共享的根）；
2. 同一 `(libraryId, editionId)` 在 `holdings` **至多一行**；
3. **删除收录（holding）不得级联删除 edition / notes / reading_state**（笔记是用户资产）；
4. 笔记的锚点是**在某个 edition 里量出来的** → **禁止**把笔记归属挂到 work 上（否则跨版解析必然失准）。

---

## 3. 事件机制（所有服务通用）

```ts
type Listener = (...args: any[]) => void; type Unsubscribe = () => void;

/** 事件映射约束：每个键都必须是 Listener 函数 */
interface EventEmitter<Events extends { [K in keyof Events]: Listener }> {
  on<K extends keyof Events>(event: K, listener: Events[K]): Unsubscribe;
  off<K extends keyof Events>(event: K, listener: Events[K]): void;
}
```

## 4. 能力服务（ports）

### 4.1 IRenderService —— 渲染（适配器：kookit）

```ts
interface RenderServiceEvents {
  rendered: (chapterDocIndex: number) => void;
  'location-changed': (location: BookLocation) => void;
  /** 正文选区变化：有选区给锚点，清空给 null。由适配器发——选区在书的 iframe 内文档里，事件跨不过文档边界，UI 无法自行观测；`rect` = 适配器换算好的宿主视口矩形，色板据此摆放。 */
  'selection-changed': (selection: RenderSelection | null) => void;
  /** 阅读区右键——新建标记/批注与编辑既有笔记的主入口。由适配器发（右键落在正文 iframe，宿主收不到）；坐标已换算成宿主视口坐标；`anchor` 无选区时为 null，`noteId` 命中已有笔记时给出。 */
  'context-menu': (request: RenderContextMenuRequest) => void;
  /** 点击了某条高亮（= kookit `handleNoteClick`，取 `event.target.dataset.key`）；`x`/`y` 由适配器量元素矩形得出（kookit 该回调只给 `{target}`，没有鼠标坐标）。 */
  'note-clicked': (payload: { noteId: string; x?: number; y?: number }) => void;
}

/** 选区信息（锚点 + 宿主视口矩形）。 */
interface RenderSelection { anchor: TextAnchor; rect: { x: number; y: number; width: number; height: number } }

/** 阅读区右键请求。 */
interface RenderContextMenuRequest { x: number; y: number; anchor: TextAnchor | null; noteId?: string }

interface IRenderService extends EventEmitter<RenderServiceEvents> {
  open(record: BookRecord, options?: RenderOptions): Promise<void>;
  close(): Promise<void>;
  renderTo(element: HTMLElement): Promise<void>;
  /** 当前打开的书（未打开 / 已 close = null）。`location-changed` 是渲染端口的全局事件（适配器只有一份），上报位置前必须校验"事件属于房间的书"（审计 B-2）；判据 = 与房间标定指纹比对。 */
  getOpenBook(): BookRecord | null;
  /** 向正文注入颜色（深色模式）。非 PDF 走 `rendition.setStyle`（kookit 唯一样式注入口；浅色不注入，保留书的自有外观）；PDF 是位图 → 无操作（像素烘焙另立项）。⚠ 注入通道与排版参数共用：每次调用重建整份 reader style。 */
  applyTheme(theme: ResolvedTheme): Promise<void>;
  /** 向正文注入排版参数（字号/行距/段距），与 `applyTheme` 同通道（kookit `setStyle`）；每次重建整份 reader style（`<style>` 留在 head，一次注入全书生效）；字段缺省 = 不注入；PDF 无操作。 */
  applyTypography(typography: ReaderTypography): Promise<void>;
  /** 解析元数据（kookit 是唯一解析器，故能力挂在此端口）。无状态——内部构造临时 rendition，不 renderTo、不碰当前阅读会话；cover 为 data URL。 */
  getMetadata(buffer: ArrayBuffer, format: BookFormat): Promise<BookMetadata>;
  next(): Promise<void>;
  prev(): Promise<void>;
  goToPage(page: number): Promise<void>;
  goToPercentage(percentage: number): Promise<void>;
  /** 目录跳转：跳转到 chapterDocIndex 对应章节起点（PDF=页码；越界/无章节时 no-op） */
  goToChapter(chapterDocIndex: number): Promise<void>;
  goToPosition(location: BookLocation): Promise<void>;
  getPosition(): BookLocation;
  getProgress(): { totalPage: number; currentPage: number };
  getChapter(): Chapter[];
  search(keyword: string): Promise<unknown>;       // 形状待定
  /** `fromSelection`：取当前正文选区为统一锚点（无选区 / 本轮未支持格式 → null）。定位转换原语的引擎侧入口（纯函数部分在 core/domain/anchor.ts）；只读、不落库 */
  getSelectionAnchor(): Promise<TextAnchor | null>;
  /** `resolveToView`：跳到锚点（笔记面板点击 / 房间同步回跳）。Fragment 可解→精确，缺失→章级；`revealNoteId` 给值时把该条高亮元素滚进视野（面板点击的精确落点，不依赖 Fragment 解算）。 */
  resolveAnchor(anchor: TextAnchor, opts?: { revealNoteId?: string }): Promise<boolean>;
  /** `remeasure`：Fragment 失效后按 quote 找回。⚠ kookit 搜索只给「章 + 块文本」不给字符偏移 → 产出一定是弱锚点（fragment=null，章级）；找不到 → null。 */
  remeasureAnchor(anchor: TextAnchor): Promise<TextAnchor | null>;
  /** 清掉正文里的选区。必须由适配器提供——选区在书文档里，宿主清不掉；清完广播 `selection-changed = null`，UI 不必自己收色板。 */
  clearSelection(): void;
  createNote(note: Note): Promise<void>;      // 要求 anchor.fragment 就位，否则抛错（不静默 no-op）
  removeNote(noteId: string): Promise<void>;  // 按 Note.id（旧参数名 key 随 v1 退役）
  renderHighlighters(notes: Note[]): Promise<void>;
  // ⚠ 只对"当前已渲染的那一节"生效——kookit 文字类只有一个 iframe，跨节笔记会错位/抛错；适配器按当前节过滤，调用方须在每次 `rendered` 后重调；传入数组是拷贝（kookit 内部 notes.reverse() 原地改入参）。
}
```

> 约束：kookit 依赖 DOM（iframe 渲染）→ 外壳必须提供 DOM 环境（Electron / 浏览器 / WebView）。

### 4.2 INetService —— 传输能力（协议已定：见 `server/docs/API.md`）

> 成员 token 由 server 签发：带二级令牌调 `POST /auth/token` 获取（同一 IP 7 天内复用同一 token）；之后所有 REST / WS 请求带 `Authorization: Bearer <token>` + `X-Turead-Access: <二级令牌>` 两个头。

```ts
/** 消息信封：传输层只搬运信封，不理解语义 —— 语义由上层用例解释 */
interface MessageEnvelope { type: string; payload: unknown }   // type 例：'room.join' | 'room.location' | 'room.presence'

interface NetServiceEvents {
  message: (envelope: MessageEnvelope) => void;
  /** `failed` = 断线自动重连耗尽（重试上限仍失败），区别于 `disconnected`（安静未连接）——可预期的终点，用例层据此自动离开房间并告知原因（审计 B-4）。 */
  'connection-changed': (state: 'connected' | 'disconnected' | 'reconnecting' | 'failed') => void;
}

interface INetService extends EventEmitter<NetServiceEvents> {
  /** 建立会话：只做身份与准入——带二级令牌调 `POST /auth/token` 申请/复用成员 token，并记住服务器地址；不建立 WebSocket（服务器在 WS 握手时就要求 `room` 与 `nick`，先连通用连接走不到 `room.join`）。 */
  connect(config: NetConfig): Promise<void>;
  /** 按房间建立 WebSocket（握手 = `GET /ws?room=<id>&nick=<name>`，token 双闸走 header；缺 room/nick 或昵称 >12 字 → 服务器直接关连接）。⚠ 同一成员 token 的新连接会踢掉旧连接（单设备登录）→ 换房前必须先 `closeRoom()`。 */
  openRoom(roomId: string): Promise<void>;
  /** 关闭房间连接。聊天的生命周期归属于房间——离开房间即断开（历史留在服务器，随房间级联清理）；断线重连由适配器负责，重连后用例层须重发 `room.join`（服务器侧成员/订阅是瞬态的）。 */
  closeRoom(): Promise<void>;
  disconnect(): Promise<void>;
  send(envelope: MessageEnvelope): Promise<void>;   // 只在 openRoom 之后有效
  getMemberId(): Promise<string | null>;        // 当前成员 token（服务端签发；未连接/未取得为 null）
  request<T>(options: HttpRequestOptions): Promise<HttpResult<T>>;  // REST 传输（自带 token 双闸头；不需要 WS）
}

interface HttpRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;                                 // 以 / 开头的路径（如 /rooms、/auth/token）
  body?: unknown;                               // 自动序列化为 JSON 并带 Content-Type: application/json
  rawBody?: boolean;                            // body 为原始二进制（ArrayBuffer，文件上传用）
  responseType?: 'json' | 'text' | 'arraybuffer'; // 文件下载用 arraybuffer
}

interface HttpResult<T = unknown> { status: number; ok: boolean; data: T }

interface NetConfig {
  serverUrl: string;         // http(s)://host:port（REST 基址；WS 由此派生 ws(s)://host:port/ws）
  accessToken: string;       // 第 2 层准入门禁（X-Turead-Access）
  memberToken?: string;      // 成员 token（服务端签发 POST /auth/token；缺省 = 适配器自动申请/复用）
  nickName: string;
  transport?: 'websocket';   // 预留多传输
}
```

> 本服务不假设任何业务语义：不发"加入房间"命令、不懂"标定"——只负责连接与收发信封，业务语义在用例层（§5.1）。
> ⚠ 连接粒度 = 房间（不是进程/会话）：`openRoom` 之前 `send` 必然失败（探针有专门负向断言）；大厅/建房/聊天历史全走 REST，"没进房间"时也能用。
> 协议词汇（type 常量 / 失败 reason 归一 / 昵称约束 / 握手地址 / 历史路径与合并）唯一解释处 = `core/domain/protocol.ts`（含单测），适配器与用例层都不得再自行解释字符串。

### 4.3 IBookIdentityService —— 书籍标定（指纹/元数据）

```ts
interface IBookIdentityService {
  computeFingerprint(buffer: ArrayBuffer): Promise<BookFingerprint>;
  /** name = 文件名（骨架实现用它推导 title；结构化解析见 TODO「书籍元数据」） */
  extractMetadata(buffer: ArrayBuffer, format: BookFormat, name: string): Promise<BookMetadata>;
  verify(local: BookFingerprint, room: BookFingerprint): boolean;
}
```

> 指纹策略：头/中/尾三点采样（头 64KB、中点 64KB、尾 64KB 拼接后计算哈希，配合 size 降低碰撞），算法 `md5-sample3-v1`（server 侧已按此注册，client 计算必须一致）；kookit 的 `Book.md5` 由调用方计算后传入——本服务即计算方。

### 4.4 ILibraryStore —— 本地持久化

> 形状 = edition / holding / library 三层（与身份的关系见 §2.2）；存储实现与 schema 见 `client/docs/DATA_MODEL.md` §2。

```ts
interface ILibraryStore {
  // —— 内容身份（edition）：全局唯一键 = 指纹 ——
  /** 按指纹 upsert（全局去重）—— 导入去重的唯一入口 */
  upsertEdition(record: EditionRecord): Promise<EditionRecord>;
  getEdition(id: string): Promise<EditionRecord | null>;
  findEditionByFingerprint(fp: BookFingerprint): Promise<EditionRecord | null>;
  updateEdition(id: string, patch: Partial<EditionRecord>): Promise<void>;
  /** 彻底删除内容（连带 notes/reading_state）；只在显式维护动作里用，不是"移除书"（那走 removeHolding） */
  removeEdition(id: string): Promise<void>;
  // —— 收录（holding）："哪个书库里有这本书"（键 = libraryId + editionId）——
  addHolding(holding: Holding): Promise<void>;
  /** 取消收录。⚠ 不得级联删除 edition / notes / reading_state（§2.2 不变量③） */
  removeHolding(libraryId: string, editionId: string): Promise<void>;
  getHolding(libraryId: string, editionId: string): Promise<Holding | null>;
  /** 某库全部收录（跨层级，含 missing）—— 扫描对账算差集用 */
  listHoldings(libraryId: string): Promise<Holding[]>;
  /** 层级取书（读模型）。缺省不含"来源缺失"；映射库走 `parent_path` 的 SQL 侧过滤 */
  listItemsAtLevel(query: LibraryLevelQuery): Promise<LibraryItem[]>;
  /** 全库检索（读模型）：跨書箱/文件夹层级按 标题/来源路径/收录路径 子串匹配某库收录的书（大小写不敏感；不含 missing；LIKE 通配符转义在实现内做，调用方传原文）。不看当前层、看整库；SQL 侧完成，不走 N+1。 */
  searchHoldings(libraryId: string, text: string): Promise<LibraryItem[]>;
  listAllHeldEditions(): Promise<EditionRecord[]>;
  /** 移动收录到书箱（单亲归属；containerId=null = 移回库根层）—— 唯一的"移动"入口 */
  moveHolding(editionId: string, libraryId: string, containerId: string | null): Promise<void>;
  setHoldingMissing(libraryId: string, editionId: string, missing: boolean): Promise<void>;
  // —— 书库（组织模式；库注册表在库内，不在引导文件）——
  listLibraries(): Promise<LibraryListResult>;
  createLibrary(input: { name?: string; mode: 'mapped' | 'curated'; rootPath?: string }): Promise<LibraryEntry>;
  switchLibrary(id: string): Promise<void>;
  renameLibrary(id: string, name: string): Promise<LibraryEntry>;
  /** 移除书库（连带 containers/holdings）；edition/notes 不删；最后一个库不可移除 */
  removeLibrary(id: string): Promise<void>;
  getLibrary(id: string): Promise<LibraryEntry | null>;
  // —— 书箱（树在库内）——
  listContainers(libraryId: string, parentId: string | null): Promise<BookContainer[]>;
  createContainer(params: { libraryId: string; parentId: string | null; name: string }): Promise<BookContainer>;
  renameContainer(id: string, name: string): Promise<void>;
  /** 移除书箱：有子书箱时拒绝（先清空子级，防误删整棵子树） */
  removeContainer(id: string): Promise<void>;
  /** 移动书箱（parentId=null = 移回库根层）；目标是自己或自己的后代时拒绝（防成环） */
  moveContainer(id: string, parentId: string | null): Promise<void>;
  // —— 阅读状态 / 阅读时间（逐 edition 记，按 work 汇总）——
  getReadingState(editionId: string): Promise<ReadingState | null>;
  /** ⚠ 只动 `lastReadAt` / `lastLocation`，绝不动 `totalReadMs`——时长的唯一写入口是 `appendReadingSession` */
  updateReadingLocation(editionId: string, location: BookLocation, lastReadAt: number): Promise<void>;
  appendReadingSession(session: Omit<ReadingSession, 'id'>): Promise<void>;
  totalReadMsByWork(work: WorkIdentity): Promise<number>;
  getLastReadEdition(): Promise<EditionRecord | null>;
  // —— 封面（edition 级：封面由内容决定）——
  setCover(editionId: string, bytes: ArrayBuffer, ext: string): Promise<string>;
  getCover(editionId: string): Promise<ArrayBuffer | null>;
  removeCover(editionId: string): Promise<void>;
  // —— 设置（一律全局，无库级设置）——
  getSetting<T>(key: string, fallback: T): Promise<T>;
  setSetting(key: string, value: unknown): Promise<void>;
  patchSetting(key: string, patch: Record<string, unknown>): Promise<void>;
  // —— 笔记 / 划线（挂 edition）——
  listNotes(editionId: string, chapterIndex?: number): Promise<Note[]>;
  addNote(note: Note): Promise<void>;
  updateNote(id: string, patch: NotePatch): Promise<void>;
  removeNote(id: string): Promise<void>;
  // —— 笔记读模型（跨书管理；形态定案 = FEATURES.md §12）——
  /** 跨书列笔记：库作用域 / 按书 / 按色 / 有无批注 / 关键词子串 —— 笔记管理工具的数据口 */
  listAllNotes(query?: NoteQuery): Promise<NoteListItem[]>;
  /** 与 listAllNotes 同口径的计数（筛选器要显示"多少条"，不必取回全量再数） */
  countAllNotes(query?: NoteQuery): Promise<number>;
}

/** 笔记管理的查询口径。读模型类型，留在端口层（`editionTitle` 是展示投影，不是领域概念）。 */
interface NoteQuery {
  /** 库作用域：缺省 / null = 全部库；给值 = 该库收录范围内的 edition（UI 默认传当前库） */
  libraryId?: string | null
  editionId?: string | null
  color?: NoteColor | null
  /** 有无批注正文（`body` 非空）：true / false；缺省 = 不限 */
  hasBody?: boolean | null
  /** 关键词：对 `excerpt`（摘录）+ `body`（批注）做子串匹配（语义 = "包含"，不是错别字容错）；v1 = `LIKE '%q%'`，将来换 FTS5 时签名与语义都不变。 */
  text?: string | null
  orderBy?: 'updated' | 'created' | 'edition'   // 默认 updated（最近改动在前）；`edition` = 书内阅读序
  limit?: number                                // 分页（近千条列表的窗口化取数）；缺省 = 全量
  offset?: number
}

/** 跨书列表项 = 笔记本体 + 展示投影（列表要显示书名，而笔记自己不存书名）；`libraryNames` = 该 edition 被哪些库收录（全局视角下标注来源）。 */
interface NoteListItem {
  note: Note
  editionTitle: string
  editionFormat: BookFormat
  libraryNames: string[]
}
```

> 笔记读模型口径：
> - `Note` 实体不变，读模型是派生视图，藏在端口后面——领域层与 usecase 看不见（`DATA_MODEL.md` §5 问题 6）；`text` 只搜笔记（`excerpt` 划线的书籍原文快照 + `body` 批注正文），不搜书的全文。
> - `libraryId` 过滤经 `holdings` 连接：笔记挂 edition、不挂库——"当前库的笔记" = 该库收录的那些 edition 的笔记。
> - 不含章标题：列表显示「書名 · 節 N」（`note.anchor.norm.chapterIndex`）；章标题冗余存列已定不做。
> - 索引已备（v3 schema）：`idx_notes_updated`（跨书按时间）、`idx_notes_edition`（按书）、`idx_notes_owner`；不做独立 `searchNotes` 方法——关键词是 `NoteQuery.text` 的筛选维度（LIKE→FTS5 不动签名），不给两个语义重叠的入口。

> 阅读状态/会话的领域类型（`core/domain/types.ts`）：
> ```ts
> interface ReadingState  { editionId: string; lastReadAt?: number; lastLocation?: BookLocation; totalReadMs: number }
> interface ReadingSession{ id: number; editionId: string; owner?: string | null; startedAt: number; endedAt: number; durationMs: number }
> ```

> 实现建议：`better-sqlite3`（接口保持存储无关）。存储布局见 `client/docs/DATA_MODEL.md` §1/§2（全应用一个 SQLite 库 + 极小的 JSON 引导文件；封面是跟内容走的缩略图 `covers/<editionId>.<ext>`）。

### 4.5 IBookPicker —— 本地文件能力（适配器：Electron 对话框 + fs）

```ts
interface IBookPicker {
  pickFiles(): Promise<string[]>;             // 系统对话框选多个文件；取消 → []
  pickDirectory(): Promise<string | null>;    // 系统对话框选一个目录；取消 → null
  /** 列目录电子书：recursive=false 只此节点；true 则此节点及所有子节点（可配置选项） */
  listEbooks(dir: string, recursive: boolean): Promise<string[]>;
  readFile(path: string): Promise<ArrayBuffer>; // 导入读取
  /** 列子目录（不递归，名称 + 绝对路径）；虚拟映射模式层级浏览用 */
  listSubdirectories(dir: string): Promise<Array<{ name: string; path: string }>>;
  /** 字节写进应用托管的下载目录（userData/downloads），返回可打开的绝对路径——房间副本下载用（字节必须落盘才能被渲染适配器按路径打开）。信任边界：目录由 main 决定，调用方只给文件名（IPC 通道 `fs:save-book-copy`；main 剥目录成分 + 重名加序号，不开"任意路径写"的口子）。 */
  saveBookCopy(bytes: ArrayBuffer, fileName: string): Promise<string>;
}
```

> 立端口缘由：书库 UI 此前直接调 `window.turead` 桥并 import IPC 通道名（FEATURES §8 已知例外），导入文件夹又需目录扫描——两者同属"本地文件能力"，收敛为端口后 UI 只依赖 `ServiceContainer`。
> 平台约束：Electron 同一对话框不能既选文件又选目录（Windows 下 `openFile`+`openDirectory` 只会给出目录，electron#26885）→ 因此是 `pickFiles` / `pickDirectory` 两个方法，UI 侧表现为导入小菜单。

### 4.6 IClipboard —— 剪贴板写入（适配器：Electron `clipboard`）

```ts
interface IClipboard {
  /** 写纯文本到系统剪贴板 —— 笔记管理的「複製批註」（FEATURES §12 / STYLE §5.10） */
  writeText(text: string): Promise<void>;
}
```

> 立端口而不让 UI 直接调 `navigator.clipboard`：① 纪律一致——UI 只依赖 `ServiceContainer`、不直接摸桥（`IBookPicker` 是先例，§4.5）；② `navigator.clipboard` 依赖"安全上下文 + 权限"，在 Electron 加载协议下行为随版本变，不宜作为契约前提；Electron 的 `clipboard.writeText` 同步且可靠。
> 桥的形状：preload 暴露具名方法（`writeClipboardText`），不用泛化 `invoke(channel, …)`——与 `TODO.md`「IPC 桥信任边界过宽」的收敛方向一致（具名方法天然是白名单）。

## 5. 应用服务（用例层）

### 5.1 IRoomSession —— 房间会话（同步业务逻辑本体）

```ts
interface RoomSessionEvents {
  'location-updated': (location: BookLocation, from: RoomMember) => void;
  'presence-updated': (members: RoomMember[]) => void;
  'chat-message': (msg: ChatMessage) => void;      // 聊天广播（含自己发的 = server 回执）
  /** 聊天历史（加入房间 = 最近一页全量；断线重连 = `after=<最后一条 id>` 增量）。与广播来源不同（REST 追加日志 vs WS 广播），同一 id 会两头来 → 消费者一律走 `protocol.mergeChatMessages`（按 id 去重、升序）。 */
  'chat-history': (messages: ChatMessage[]) => void;
  'system-message': (msg: SystemMessage) => void;
  /** `failed` = 重连耗尽：会话即将自动复位（自动 leaveRoom + system-message 告知）——消费方不必也不应再对半死态的会话做操作。 */
  'connection-changed': (state: 'connected' | 'disconnected' | 'reconnecting' | 'failed') => void;
  'book-mismatch': (detail: { local: BookFingerprint; room: BookFingerprint }) => void;
}

interface IRoomSession extends EventEmitter<RoomSessionEvents> {
  /** 加入房间并完成标定：**按房间建连**（`net.openRoom`，握手带 room+nick）→ 上报指纹 → 等 join-ack（10s 超时归 `server-error`，不挂死；并发 join 旧的那次立即作废为 `superseded`——单槽 + 代次，不覆盖式挂赋值）；成功后**预载聊天历史**（`chat-history`）。
   *  `book` 允许 `null` = 无书成员（服务器 `API.md`「room.join」本就定义 `fingerprint: null`：允许加入并返回 edition 供下载），位置比较的格式键退化为按 join-ack 的 edition 扩展名推；UI 补书入口已做（进房后下载副本 → 落盘 → 导入）。`lastLocation` 由调用方给（阅读状态在 `ReadingState`）。 */
  joinRoom(roomId: string, book: BookRecord | null, lastLocation?: BookLocation | null): Promise<JoinResult>;
  /** 离开房间：解绑 join 期订阅 + **断开房间连接**（`net.closeRoom`，聊天生命周期随房间结束） */
  leaveRoom(): Promise<void>;
  /** 手动广播当前位置（通常不需要：翻页由内部监听 render 自动广播；**与自动路径同一节流出口**） */
  emitLocation(location?: BookLocation): Promise<void>;
  /** 发送聊天：server 落库后广播 `room.message` 回执（含发送者）；空文本（全空白）不发 */
  sendChat(text: string): Promise<void>;
  /** 拉取聊天历史（`GET /rooms/{roomID}/messages?after=&limit=`，追加日志；after 缺省 = 从头、limit 默认 50 / 上限 500——越界服务器返回 400，故客户端先夹取） */
  listMessages(roomId: string, opts?: { after?: number; limit?: number }): Promise<ChatMessage[]>;
  getRoomState(): RoomState | null;
  getMyMemberId(): string | null;
  /** 创建房间并注册 work/edition（POST /rooms；协议固定 content-hash-v1） */
  createRoom(book: BookRecord, owner: string): Promise<{ roomId: string; editionId: number }>;
  /** 上传电子版副本（POST /books/{editionID}/file，幂等去重，分发源） */
  uploadBookCopy(editionId: number, buffer: ArrayBuffer): Promise<void>;
  /** 下载电子版副本（GET /books/{editionID}/file → ArrayBuffer）：无书成员的获取路径（服务器 `localCopy = 1` 时可用；404 = 副本未上传）。字节回来后由调用方落盘（`picker.saveBookCopy`）→ 导入（`books.importBook`）→ 打开。 */
  downloadBookCopy(editionId: number): Promise<ArrayBuffer>;
  /** 房间发现（GET /rooms，可按 edition 找房） */
  listRooms(editionId?: number): Promise<RoomInfo[]>;
}

interface RoomMember { id: string; nickName: string; location?: BookLocation; isMe?: boolean; }

interface RoomState {
  roomId: string;
  bookId?: string;           // 服务端书籍注册表 id（标定通过后返回）
  /** 房间绑定的电子版（join-ack 透传）。无书成员的补书流程靠它：指纹找本地书 / `localCopy` 决定能否下载 / `ext` 定文件名。 */
  edition?: Edition;
  members: RoomMember[];
  currentLocation: BookLocation | null;
}

interface SystemMessage { text: string; type: 'join' | 'leave' | 'info' | 'error'; }

/** reason 归一判据 = `domain/protocol.ts` 的 `normalizeJoinReason`（容错服务器的空格分词）。`superseded` = **并发 join 的落败方**：旧的那次在 await 恢复点发现已有更新的 join 在进行，立即作废自己——它不是服务器的失败，UI 应**静默**处理（用户要的是新房间）。 */
type JoinFailureReason = 'book-mismatch' | 'room-not-found' | 'room-full' | 'server-error' | 'superseded';
type JoinResult =
  | { ok: true; room: RoomState }
  | { ok: false; reason: JoinFailureReason };
```

**内部编排（用例 = 编排多个能力服务）：**
1. `joinRoom()` → `net.openRoom(roomId)`（**握手带 `?room=&nick=`**，服务器要求）→ 用 `IBookIdentityService` 给出的本地指纹经 `INetService.send` 发 `room.join` 信封 → 服务端标定（`join-ack`）。标定失败 → 归一 reason（`normalizeJoinReason`）→ `book-mismatch` 事件 + `JoinResult.reason`；成功后 **`GET /rooms/{id}/messages` 预载一页历史**（`chat-history`）。
2. 成功 → 缓存 `RoomState`，把 `IRenderService` 的 `location-changed` 监听接上（节流 → `INetService.send` 广播 `room.location`；上报前校验「打开的书 ≡ 房间的书」）。
3. **远端位置派生**：server 不单独下发 `room.location` 信封，而是广播 **`room.presence` 全量成员快照**（含每人位置，见 `server/docs/API.md` 转发规则）→ 以 join-ack members 为基线、逐次 presence diff，**成员位置变化才 `emit location-updated`**（位置先归一、比较走 `sameLocation`）；`IRoomSession` 不自己翻页，翻页是 UI 的事（跟随模式开关也在 UI）。
4. **订阅生命周期**：`net` 订阅属构造期随实例存活；`joinRoom` 期只挂 `render.location-changed`（`joinUnsubs`），`leaveRoom` 只解绑 join 期订阅 → 离开后可重新 join。
5. **断线重连**：适配器按房间自动重连（握手地址不变），但服务器侧**成员/订阅是瞬态的** → 用例层在 `connection-changed === 'connected'` 且已入房时**重发 `room.join`**，随后 `after=<最后一条 id>` **增量补拉**聊天。不重发的后果是"在房间里却不是成员"的幽灵（收不到 presence 与广播）。

### 5.2 IBookService —— 书架 + 导入（应用服务）

```ts
interface IBookService {
  /** 导入：文件 → 指纹 → 元数据 → 入库。去重：同指纹（algorithm+hash+size 全等）复用已有记录并更新 filePath，返回 `{ edition, holding, reused }`——「是否复用」由用例给出，UI 不用快照反推。
   *  ⚠ 映射库（`mode='mapped'`）不得调这个——映射库的书只能靠扫描真实文件夹进来（DATA_MODEL D5/F4），由调用方（UI）按库模式把关，用例层不替它判断。 */
  importBook(file: ArrayBuffer, name: string, format: BookFormat, filePath: string, libraryId: string, origin?: 'scan' | 'import'): Promise<ImportResult>;
  /** 全部被收录的内容（"全部书"顶层视角） */
  listAll(): Promise<EditionRecord[]>;
  get(id: string): Promise<EditionRecord | null>;
  /** 从书库移除（**只删收录**）：真实文件、笔记与阅读状态都不动（DATA_MODEL §6.1 / §2.2 不变量 ③） */
  remove(editionId: string, libraryId: string): Promise<void>;
  /** 记录阅读位置（同时刷新 `lastReadAt`）；`totalReadMs` 由会话接口累加，这里不动 */
  updateLastLocation(editionId: string, location: BookLocation): Promise<void>;
  /** 最近阅读的书（无阅读记录 → 回退最近导入）；供"进入阅读器恢复上次内容" */
  getLastRead(): Promise<EditionRecord | null>;
  /** 读阅读状态（UI 常用查询的便捷口径：避免 UI 直接碰存储端口） */
  getReadingState(editionId: string): Promise<ReadingState | null>;
}

interface ImportResult {
  edition: EditionRecord; holding: Holding;   // 内容身份（指纹命中时是既有那一行）；本次建立的收录关系
  reused: boolean;         // true = 指纹命中已有内容（未新增）
}
```

> `importBook` 是导入**用例**：编排 `IBookIdentityService`（指纹+元数据）与 `ILibraryStore`（持久化）；OCR 提 ISBN 是**可插拔步骤**（候选 `IOcrService`，适配器可复用 PP-OCRv5 技术路线，MIT）。

### 5.3 IImportQueue —— 批量导入编排（v0.2.8 新增）

```ts
interface ImportQueueEvents {
  progress: (done: number, total: number) => void;   // done/total 随队列增长而更新
  imported: (edition: EditionRecord, reused: boolean) => void;
  'import-failed': (path: string, message: string) => void;
  done: (summary: ImportSummary) => void;
}
interface ImportSummary { total: number; imported: number; reused: number; failed: number; cancelled: boolean; }
interface IImportQueue extends EventEmitter<ImportQueueEvents> {
  /** 入队导入到指定书库（同一路径只入队一次；运行中可继续入队；同一批次只进一个库） */
  enqueue(paths: string[], libraryId: string): void;
  cancel(): void;                   // 取消剩余队列（正在处理的那本跑完）
  isRunning(): boolean;
}
```

> **为什么是用例**：串行、进度、取消、失败逐条上报属于**编排**，不是 UI 展示——此前写在 `LibraryFeature` 里，与同构的 `CoverQueue` 位置不一致（UI 应是 driving adapter）。编排：`IBookPicker.readFile` → `IBookService.importBook`（含指纹去重）；`extToFormat` 随之从 UI 层移到 `core/domain/format.ts`（领域词汇映射，用例可依赖）。

## 6. 服务装配（ServiceContainer）

```ts
interface ServiceContainer {
  // 能力服务
  render: IRenderService;
  net: INetService;
  identity: IBookIdentityService;
  store: ILibraryStore;
  picker: IBookPicker;
  clipboard: IClipboard;
  // 应用服务（用例）
  room: IRoomSession;
  books: IBookService;
  covers: ICoverQueue;
  imports: IImportQueue;
  scan: IScanService;      // 扫描对账：映射库不能导入、只能扫描（DATA_MODEL D5）
}
```

> 规则：构造函数注入依赖（如 `RoomSession(net, render, identity)`）；**UI 只依赖 `ServiceContainer`，不直接 import kookit / better-sqlite3 / WebSocket 实现**；适配器目录约定：`client/src/core/adapters/{render,net,storage,identity,picker,clipboard,image}`。

## 7. 待定 / 明确排除

- [x] **同步协议消息集与传输细节** —— **已定**（server 定义：信封 / 消息集 / 转发规范见 `../../server/docs/API.md`），client 适配（INetService 信封已为此预留）
- [ ] 笔记 / 划线同步：**明确排除在 v1 假设之外**（Note 类型先立，同步后续加）
- [ ] 光标在场（他人选中/阅读进度热区）：**明确排除在 v1 假设之外**
- [ ] 账号体系（游客昵称 vs 注册）→ 影响 `RoomMember.id` 语义（见根 `TODO.md`）
- [ ] `IRenderService.search()` 返回形状
- [ ] OCR（ISBN 提取）是否进 v1、`IOcrService` 接口草案（见根 `TODO.md`）

## 8. 修订记录（版本速览）

> 逐版变更明细随 git 历史（提交消息与 tag）留存；本表只标「哪一版动了哪片」供定位。

| 版本 | 主题 |
|---|---|
| **v0.4.8** | presence 载荷形状钉死 `{members:[...]}`（server v0.2.2 前发裸数组 → 真客户端成员快照恒空，蜂群首跑抓出）+ `normalizePresenceMembers` 双形状归一 + `WsNetAdapter.getMemberId` 对齐端口 Promise 签名（蜂群直连适配器时暴露） |
| **v0.4.7** | 房间同步正确性批：`IRenderService.getOpenBook()`（位置上报前校验"事件属于房间的书"，审计 B-2）+ `JoinFailureReason` 补 `superseded`（并发 join 落败方，审计 C-2）+ `ConnectionState` 补 `failed`（重连耗尽可预期复位，审计 B-4）+ 聊天消息守卫补 `createdAt`（审计 C-5） |
| **v0.4.6** | 插件契约 v1.1：通用能力 `net.fetch`（https 代理）与 `secrets`（safeStorage 保险库）+ 面板 `hideWhenInRoom`（AI 問格与聊天互斥用）+ `ctx.reader` 阅读上下文句柄（快照 + 溯源跳回） |
| **v0.4.5** | 插件契约（§9）：manifest / `activate(api)` / 挂载线右段面板格注册点（v1 官方专用） |
| v0.4.4 | 无书成员加入：`joinRoom` 的 `book` 放宽为 `null`（`fingerprint: null`，服务器本就支持） |
| v0.4.3 | 按房间建连（`connect` 收窄 + `openRoom`/`closeRoom`）+ 聊天历史（`chat-history`/`listMessages`）+ `core/domain/protocol.ts` 协议词汇收拢 |
| v0.4.2 | 笔记管理视图/筛选/主次/设置类型（`NoteView`/`NoteFilter`/`NoteTextFocus`/`NoteSettings`）+ `IClipboard` |
| v0.4.1 | 笔记读模型：`listAllNotes`/`countAllNotes` + `NoteQuery`/`NoteListItem` |
| v0.4.0 | 书的身份：`EditionRecord`/`Holding`/`WorkIdentity`（§2.2）+ 全局单库 + `BookRecord` 退役 |
| v0.3.9~12 | 笔记/划线契约：Note v2 + 选区级锚点层（§2）+ 引擎侧原语 + 右键主入口（`context-menu`/`note-clicked`）+ `RenderSelection` |
| v0.3.5~8 | 多书库 + 書庫管理 + 书箱 + 层级浏览 + 書箱移动 |
| v0.3.0~4 | 主题模型规正 + `applyTheme` + `ReaderSettings`/`ReaderTypography` + 排版注入 + 封面负缓存 |
| v0.2.1~9 | REST 传输 + 目录跳转 + 远端位置派生（presence diff）+ 导入去重/队列 + `IBookPicker` + 封面落盘 + 定位系统修订 |
| v0.2.0 及前 | 骨架契约 + 定位系统立约（§2.1） |

## 9. 插件契约（v1：官方插件专用；功能划分 = FEATURES §13，视觉 = STYLE §5.8）

> 插件**不是**六边形端口——它运行在**渲染层外壳**（同 `roomSession`/`logStore` 一族），经宿主 API 注册 UI 位面；内核（domain/ports/usecases/adapters）零改动，`ServiceContainer` 不收插件。**信任模型 v1 = 只装官方插件**（随应用首发种进运行时插件文件夹，加载不做沙箱；第三方开放远期）。

### 9.1 manifest（`plugin.json`，插件文件夹根）

```ts
interface PluginManifest {
  id: string      // /^[a-z0-9][a-z0-9-]*$/；= 文件夹名；运行时目录与设置键的命名空间
  name: string    // 展示名
  version: string // semver 形态字符串（v1 种子策略 = "缺则种"，版本比较后置）
  entry: string   // 入口 ESM 相对路径（必须在插件目录内；禁止绝对路径与 `..`）
  description?: string
}
```

校验与错误口径 = `shared/plugin.ts` 的 `validatePluginManifest`（**纯函数 + 单测**）：缺字段 / 坏 id / 越界 entry 一律拒绝并进诊断日志，**不静默**。

### 9.2 插件模块（入口 ESM 的导出）

```ts
export function activate(api: PluginHostApi): void

interface PluginHostApi {
  /** 注册右欄卡片页面板格（v1 唯一的 UI 注册点；可注册多个，页签按注册序追加在「參數/筆記/聊天」之后） */
  registerPanel(panel: {
    id: string      // 插件内唯一；页签 key = `plugin:<manifest.id>:<panel.id>`
    label: string   // 页签文字（2~3 个汉字为宜，与「參數 / 聊天」同语汇）
    title?: string  // 悬停提示；缺省用 label
    /** true = 进房间时让位（该格被房间聊天占用——AI 的「問」与聊天互斥） */
    hideWhenInRoom?: boolean
    /** 挂载：宿主给出**内容区元素**（几何/页签/开合/滚动外壳都归宿主）；返回清理函数（面板卸载时调用）。`ctx.signal` 在面板被收起/卸载/插件禁用时 abort；`ctx.reader` = 阅读上下文句柄（书未打开时缺省），见 §9.3。 */
    mount(el: HTMLElement, ctx: { signal: AbortSignal; reader?: PluginReaderContext }): void | (() => void)
  }): void
  /** 联网代理——**只许 https**（主进程校验 + 120s 超时 + 20MB 上限）。走主进程而不是渲染层直连，CSP 不为此开口；LLM/搜索类 API 全是文本响应。 */
  net: {
    fetch(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<{ status: number; ok: boolean; contentType: string; body: string }>
  }
  /** 密钥保险库——safeStorage 系统级加密（Windows = DPAPI），**落库是密文**；明文只在取用瞬间回到插件手里（渲染层内存），不落盘、不进日志。 */
  secrets: {
    set(name: string, value: string): Promise<void>
    get(name: string): Promise<string>   // 未设置时抛错
    delete(name: string): Promise<void>
  }
  /** 插件私有键值（持久化于全局 settings 表的 `plugin:<manifest.id>` 键，原子合并；D9 设置一律全局） */
  storage: {
    get<T>(key: string, fallback: T): Promise<T>
    set(key: string, value: unknown): Promise<void>
  }
  /** 诊断日志（进设置页日志块） */
  log(line: string): void
}
```

### 9.3 宿主义务（**渲染权在宿主**）

- 插件只能落在**程序定义的位置**上：v1 唯一 UI 位置 = **右欄卡片页面板格**。几何、页签、开合、滚动外壳全部宿主提供，插件只拿内容区元素；插件内容**不得自创视觉语汇**（STYLE §5.8 红线同样约束插件）。
- 页签序 = 參數 → 筆記 → 聊天（仅房间态）→ 插件格。AI 共读插件的「問」与「聊天」**互斥**（`hideWhenInRoom: true`）；其他插件格不受影响。
- **阅读上下文句柄（`ctx.reader`）**：`snapshot()` = 拉取式快照（editionId/标题/格式/章数/目录[章节标题 ↔ chapterDocIndex 对照]/当前位置[章号 + 可见文本前 200 字]）——**请求发出前调用**，保证是此刻位置；`jumpToQuote(exact, chapterIndex?)` = 溯源跳回（按引文重锚成弱锚点 → 章级尽力，同笔记面板路径）。宿主实现 = `ReaderFeature`（快照）+ 适配器 `remeasureAnchor`/`resolveAnchor`（跳转）。
- **IPC**（`shared/ipc.ts`）：`plugins:list`（种子后扫描 + 校验，回清单）、`plugins:read-entry({id})`（回入口源码文本）、`plugins:net-fetch`（https 代理）、`plugins:secret-{set,get,delete}`（保险库）。⚠ 渲染层**不传路径**——入口路径由主进程按自己的扫描结果解析（信任边界收在主进程）；插件代码经 Blob URL 动态 import，故 CSP `script-src` 放行 `blob:`（边界 = v1 只装官方插件）；联网走主进程代理，**CSP 的 connect-src 不为此开口**。
- **运行时目录** = `<userData>/plugins/<id>/`；**开发工作区** = `client/plugins/<id>/`（dev 启动时主进程把缺的插件种进运行时目录；打包经 `extraResources` 进发行物）。数据落点见 `DATA_MODEL.md` §1。
