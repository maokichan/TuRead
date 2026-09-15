# 客户端契约（Client Contracts）

> 状态：**v0.4.0**（当前）—— 修订历史见 §8。分层 = **能力服务（ports）** 与 **应用服务（用例）** 两层。
> 术语：**六边形架构（端口-适配器）为骨架，DDD 命名为层内词汇**，对照表见 `ARCHITECTURE.md` §1。
> 范围：**仅 client** 的层与接口契约；同步协议（信封/消息集/转发规范）由 server 定义，见 `../../server/docs/API.md`。
> 迁移：将 1:1 落到 `client/src/core/{domain,ports,usecases}/`。

---

## 1. 分层模型

```
UI（React 外壳）
  │ 只调用 ↓（业务流走用例；简单查询可直接调能力服务）
应用服务 / 用例层（use cases）   IRoomSession（房间会话） · IBookService（书架+导入）
  │ 编排 ↓
能力服务层（ports）              IRenderService · INetService · IBookIdentityService · ILibraryStore
  │ 实现 ↓
适配器（adapters）               kookitAdapter · wsAdapter · sqliteAdapter · ocrAdapter
  │
领域层（domain，被所有层共享）   BookLocation · BookRecord · BookFingerprint · Note · RoomMember · 业务规则
```

**依赖规则**
- 领域层：纯类型与规则，不依赖任何技术 / 服务 / UI。
- 能力服务：依赖领域类型 + 各自外部能力（kookit、网络、存储…）；彼此不互相依赖。
- 应用服务（用例）：依赖**能力服务接口**（不依赖其实现）；**一个用例可编排多个能力服务**（如 `RoomSession` = net + render + identity + store）。
- UI：只依赖应用服务与领域类型。
- kookit 不是"被直接暴露"——它被包进 `IRenderService`（能力服务），把 kookit 产物翻译成领域类型（`BookLocation`）。

## 2. 领域类型（共享词汇 = 领域层）

```ts
/**
 * 阅读位置 —— 房间同步的最小载荷，与 kookit getPosition() 对齐。
 * ⚠ 字段语义与比较规则以 §2.1 定位系统为权威：任何组件不得自行比较/解释字段，
 *   一律走 core/domain/location.ts 原语（normalizeLocation / locationKey / sameLocation /
 *   compareLocation / anchorStrength / describeLocation / isZeroLocation）。
 */
interface BookLocation {
  chapterDocIndex: number;  // 章节（kookit 分节）序号；PDF 下等于页码
  chapterHref: string;
  count: number;            // 可见滚动块序号（scroll 模式的"第几屏"）——文字类主键组成部分
  page: number;             // 分页模式（single/double）的页码；scroll 模式为 0
  percentage: number;       // 全局进度 0~1（display 角色：仅展示/粗粒度，不作精确锚定）
  text: string;             // 可见块前 200 字（跨端/跨版本重定位兜底）
  chapterTitle?: string;
}

/** 书籍指纹 —— 标定"同一本书的同一电子版" */
interface BookFingerprint {
  algorithm: 'md5-sample3-v1'; // server 已定（2026-08-27）：头/中/尾三点采样（头64KB+中点64KB+尾64KB 拼接哈希）；预留演进（v2 换 sha256）
  hash: string;                // 采样拼接后哈希值（hex）
  size: number;                // 文件字节数
}

type BookFormat =
  | 'EPUB' | 'PDF' | 'MOBI' | 'AZW3' | 'AZW' | 'TXT' | 'MD'
  | 'FB2' | 'DOCX' | 'HTML' | 'MHTML' | 'XML'
  | 'CBZ' | 'CBR' | 'CBT' | 'CB7';

/**
 * 主题模型（v0.3.0 规正，权威 = core/domain/theme.ts）：
 * **2 主题 × 2 模式** = 4 套 resolved 取向 —— 主题（tone）表达取向：纯色（黑灰白）/ 羊皮纸（暖棕）；
 * 模式（mode）表达明暗：深 / 浅。跟随系统只作用于模式，在所选主题内解析。
 * 数据层沿用既有四值（dark=纯色·深 / light=纯色·浅 / sepia-light=羊皮纸·浅 / sepia-dark=羊皮纸·深）。
 */
type ResolvedTheme = 'dark' | 'light' | 'sepia-light' | 'sepia-dark';
type ThemeSetting = ResolvedTheme | 'system';
type ThemeTone = 'solid' | 'parchment';
type ThemeMode = 'dark' | 'light';

/** 书籍元数据（epub/fb2 等有结构化字段，pdf/txt 可能缺省） */
interface BookMetadata {
  title: string;
  author?: string;
  publisher?: string;
  isbn?: string;             // 二级匹配，不强制
  language?: string;
  description?: string;
  cover?: string;            // data URL 或本地路径
}

/** 本地书库条目
 *  ⚠ **v0.4.0 退役**：拆为 `EditionRecord`（内容身份）+ `Holding`（收录关系），见 §2.2。
 *  过渡期保留本类型以免一次改爆；但**新代码不得再用它表达"属于哪个库"**。 */
interface BookRecord {
  id: string;                // 本地唯一 id（uuid）
  fingerprint: BookFingerprint;
  metadata: BookMetadata;
  format: BookFormat;
  filePath: string;
  createdAt: number;
  lastReadAt?: number;
  lastLocation?: BookLocation;
  /** 封面缩略图文件名（相对 userData/covers/）；缺省 = 无封面（UI 回落"文字封面"）。
   *  v0.2.6：封面**字节不落 JSON**（一本 ≈200KB data URL × 全量重写会拖垮书库），只存引用 */
  coverPath?: string;
  /** v0.3.4：封面提取失败负缓存（无内嵌封面/解析失败只试一次）；重试 = 删除本字段 */
  coverFailed?: boolean;
}

/** 书库视图（v0.2.6）：瀑布流因缩略图统一比例并入网格，见 FEATURES §10 */
type LibraryView = 'list' | 'grid';

/** 书库条目（多书库 v0.3.5，2026-09-13 立项）：一个条目 = 一份书库（一个 .db + 封面目录）。
 *  注册表（有哪些库、当前是哪个）由主进程引导文件持有（config.json，DATA_MODEL §1）——
 *  引导文件不再存任何书库数据。`dbPath` 仅供展示/「所在文件夾」揭示（路径管理在主进程）。 */
/**
 * 书库（v0.4.0；**权威形状见 §2.2**）。
 * ⚠ 旧形状（`{ id, name, dbPath? }`，"一个条目 = 一份 .db 书库"）**已作废** ——
 * v0.4.0 起全部数据在一个**全局 .db** 里，书库降为**组织模式**，故 `dbPath` 去掉、
 * `mode` 术语改名（`'source' | 'virtual'` → **`'mapped' | 'curated'`**）。
 */
interface LibraryEntry {
  id: string;
  name: string;
  /** 映射库（跟踪真实文件夹）｜自建库（空库起步、自建书箱树） */
  mode: 'mapped' | 'curated';
  /** `mode='mapped'`：跟踪的唯一真实文件夹 */
  rootPath?: string;
  sort: number;
}

/** 书库设置（持久化于 config.json 的 librarySettings 键） */
interface LibrarySettings {
  view: LibraryView;
  /** 导入文件夹是否含子目录（false = 只此节点；true = 此节点及所有子节点） */
  importRecursive: boolean;
}

/**
 * 阅读器设置（持久化于 config.json 的 readerSettings 键）—— v0.3.1。
 * ⚠ 这些是**呈现/排版参数**，不是"阅读页控件"：阅读页零控件（`STYLE.md` §5.8），
 *   参数一律在阅读器**挂载线参数面板**改（2026-09-13 起：布局模式也移入面板，
 *   `readerSettings` 的唯一写者 = 面板；设置页只留沉浸全屏开关）。
 */
interface ReaderSettings {
  readerMode: 'single' | 'double' | 'scroll';
  /** 正文列宽（px）—— 即 kookit 的排版宽度依据（宿主容器 `clientWidth`，`KOOKIT.md` §5）：
   *  改它 = 改"一行多长"、图片缩放与分页宽度，**不需要新端口**。
   *  默认 760（档位 620/760/920 是控件的呈现方式）。**存数值而不是档位名**，
   *  是为远期"自由调节 + 按屏幕/字号自适应"留余地（`STYLE.md` §5.9）。 */
  readerWidth?: number;
  /** 纸内边距（px）—— 正文到纸边的距离，宿主 token `--page-pad-x`（默认 44）。
   *  适配器注入 `body{padding-inline}`；这就是"出血"的可调旋钮。 */
  pagePadX?: number;
  /** v0.3.3：正文排版参数（与 `ReaderTypography` 同形状，**缺省 = 不改**，尊重书自带排版） */
  fontSize?: number;
  lineHeight?: number;
  paragraphSpacing?: number;
}

/**
 * 阅读排版参数（v0.3.3；持久化于 config.json 的 readerSettings）。
 * 分工（`STYLE.md` §5.9）：**宿主几何**（`--read-width` / `--page-pad-x`）走 CSS 变量；
 * **正文排版**（本类型）走 `IRenderService.applyTypography` 注入正文 iframe。
 * 三态：字段**缺省 = 不改**（UI 上是「默認」档）；存数值不存档位名。
 */
interface ReaderTypography {
  fontSize?: number;         // px
  lineHeight?: number;       // 倍数
  paragraphSpacing?: number; // px（段落下边距）
}

/** 阅读渲染配置（领域层友好配置，适配器内部翻译为 kookit config） */interface RenderOptions {
  readerMode: 'single' | 'double' | 'scroll';
  animation: 'sliding' | 'mimical' | 'none';
  fontSize?: number;
  lineHeight?: number;
  fontFamily?: string;
  /** v0.3.0：**适配器已消费** —— open 时映射为 kookit config 的 isDarkMode/backgroundColor；
   *  深色下 `renderTo` 后经 `applyTheme` 注入正文深色 CSS。ResolvedTheme 见 `core/domain/theme.ts` */
  theme?: ResolvedTheme;
  backgroundColor?: string;
  textColor?: string;
  isDarkMode?: boolean;
  convertChinese?: boolean;
  password?: string;          // 加密 PDF/EPUB
  isScannedPDF?: boolean;
  ocrEngine?: 'tesseract' | 'paddle' | 'official-ai-ocr' | 'external-engine';
}

/** 目录（TOC）。chapterDocIndex 缺省 = 目录项无可直达渲染节（仅分组标题） */
interface Chapter {
  label: string;
  href: string;
  /** 目录项起始渲染节号（= BookLocation.chapterDocIndex 同标尺；PDF 下为页码）；goToChapter 的跳转参数 */
  chapterDocIndex?: number;
  subitems?: Chapter[];
}

/* ————— 定位转换机制：选区级锚点（v0.3.9；DATA_MODEL §3.1/§3.1.1 已批复）—————
 * 两层：归一化层 Norm（跨格式可比，笔记层/存储/同步**只看这层**）
 *     + 引擎载荷层 Fragment（engine 标识 + 不透明编码串，**只有适配器解释**）。
 * 纯函数权威 = `core/domain/anchor.ts`；引擎侧原语（fromSelection/resolveToView/remeasure）
 * 在渲染适配器。⚠ 与进度级 BookLocation 的分工：「读到哪」≠「标在哪」。 */
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

/**
 * 笔记种类。
 *
 * ⚠ **已定决策（2026-09-14 用户定，记录在此以防将来反复）**：
 * **「笔记/批注」与「划线」是同一个东西** —— 用户原话："即便是笔记/批注，也仍然是需要有对应的
 * 划线的啊，某一个笔记还是要关乎于某个内容的"；并判定**不做"纯批注"**（只有标记点、没有底色的
 * 那种形态）"没有太多必要"。
 * 含义：**一条笔记必然带划线**（锚点 = 一段正文范围），它的"文字内容"是**可选**的（`body` 可空）。
 * 即：`body` 有值 ≈ 俗称"批注"，`body` 为空 ≈ 俗称"划线"，**但它们是同一个实体，不是两个**。
 *
 * 因此 `kind` 的**应然语义是"载体类型"**（承载方式真正不同的东西），**不是"创建来路"**：
 * - `highlight` —— 锚在一段正文范围上（**当前唯一的笔记形态**；带不带 `body` 都是它）；
 * - `bookmark` —— 标一个位置，但**无文本范围**（"读到哪"而非"标在哪"，尚无 UI）；
 * - `ink` —— 锚在几何画布的矢量墨迹（脱离版面坐标无意义，见 DATA_MODEL §3.3）；
 * - ~~`note`~~ —— **本值已定退役**：它原本表达"批注"，但批注既然就是"带正文的划线"，
 *   再留一个值只会造成"同内容两个名字"（先划线后补正文的 = `highlight`，直接用「加批註」建的
 *   = `note`，两者内容一模一样却类型不同 —— 标签取决于**历史**而非**当前状态**，是坏模型）。
 *
 * ⚠ **代码尚未改（用户定：概念先记档，具体修改另议）**：当前实现仍会写入 `kind='note'`
 * （见 `ReaderFeature.createMark`），UI 也仍有「標記」/「加批註」两个命令。
 * **收敛计划**（待用户批准后执行）：① `NoteKind` 去掉 `'note'`；② 交互层不再有两个命令
 * （统一为"标记 + 可选正文"）；③ 呈现只按**有无 `body`** 区分（有 → 带批注图标，kookit 亦据此
 * 渲染 `isNote` 与 hover tooltip）；④ 迁移：现存 `kind='note'` 的行改判为 `highlight`。
 */
type NoteKind = 'highlight' | 'note' | 'bookmark' | 'ink'
type NoteColor = 'red' | 'yellow' | 'green' | 'blue'   // **语义名**，UI 按主题 token 渲染，库内无 hex

/**
 * 笔记/划线 v2（v0.3.9 收拢；**v1 形状退役**）。
 * v1（key/location/range/text/notes）三处错位：①「读到哪」与「标在哪」混在一个 location
 * ② 引擎载荷与语义不分层 ③ `notes` 与 kookit 同名字段撞车（kookit 的 notes = 批注正文）。
 * 更名对照：key→id、location+range→anchor、text→anchor.norm.quote.exact、notes→body。
 * ⚠ **不含 excerpt 字段**：notes 表的 excerpt 列是 `anchor.norm.quote.exact` 的投影。
 */
interface Note {
  id: string                   // uuid（同步主键）
  /** ⚠ **v0.4.0：`bookId` → `editionId`** —— 笔记挂**内容（edition）**，跨库共享、不随条目消失；
   *  且**各版各一份**（不自动跨版迁移，见 `DATA_MODEL.md` D8）。 */
  editionId: string
  owner?: string | null        // 成员 token；本地笔记 null（同步上线后回填）
  kind: NoteKind
  anchor: TextAnchor
  color?: NoteColor
  body: string                 // 用户批注正文（只有这里住批注内容）
  ink?: string                 // kind='ink'：InkStroke[] JSON
  createdAt: number
  updatedAt: number
}

/** 聊天消息（v0.1.5 起 server 支持；追加日志模型，历史经 REST 拉取） */
interface ChatMessage {
  id: number;                // server 分配（追加序号）
  roomId: string;
  member: string;            // 发送者成员 token
  nick: string;              // 发送时昵称快照
  text: string;
  createdAt: number;         // unix 秒
}

/** 房间列表项（v0.2.1：GET /rooms 返回，见 server/docs/API.md RoomInfo） */
interface RoomInfo {
  roomId: string;            // 8 位 hex
  editionId: number;
  title: string;             // work.title，可能缺
  ext: string;               // 小写扩展名
  ownerNick: string;         // 房主昵称，可能缺
  memberCount: number;
  createdAt: number;         // unix 秒
}
```

### 2.1 定位系统（BookLocation 语义权威，2026-09-07 立）

> **术语**：全项目统一称「**定位系统**」——指让「阅读位置」具有可解释、可比较语义的整套机制，
> 用途：笔记/划线对内容的跟随、同步时他人绘制/位置落到同一处、进度与恢复、跨端回跳。
> 语义权威 = 本节；唯一实现 = `core/domain/location.ts`（纯函数）。

**为什么**：位置不只笔记需要 —— 房间同步回跳、进度条、`lastLocation` 恢复、将来的 TTS /
跳转引用 / 测试断言都要比较、归一、排序位置。此前 `count`/`page` 的注释语义是错的
（写了"滚动偏移/页内位置"），且 `chapterDocIndex` 混入 kookit 的 string 形态 ——
若各组件自行解释字段，腐化不可避免。故收拢为**一处权威**：

**实现**：`core/domain/location.ts`（纯函数，零依赖）。**消费规则**：任何组件
（笔记 / 同步回跳 / 进度 / 恢复 / 断言）不得自行比较或解释 `BookLocation` 字段，
一律走该模块原语：

| 原语 | 用途 |
|---|---|
| `normalizeLocation(raw)` | 归一（容错 string 数值 / 缺字段 / 越界；历史 library.json 数据兼容）。位置进入域层（适配器产出、持久化读回、网络载荷）后先过这里 |
| `locationKey(loc, format)` | 主键规范化键。**格式相关**：PDF → `page`（每页一个 section，不依赖 OCR，跨端天然稳定，见 KOOKIT §8.1/§8.2）；文字类 → `chapterDocIndex + count`（可见滚动块序号） |
| `sameLocation(a, b, format)` | 同一位置判定（主键相等；调用方保证同书同版本） |
| `compareLocation(a, b, format)` | 同书内排序（PDF 按 page；文字类按 chapterDocIndex→count）；不可比返回 null |
| `anchorStrength(loc, format)` | 锚点强度：strong（主键齐备，可精确回跳）/ weak（只有粗粒度）/ none（零位置）——笔记与恢复选路用；精确回显仍以 `Note.range`（引擎序列化）为准，location 是其粗锚点 |
| `isZeroLocation(loc)` | 零位置（未渲染）判定：所有数值键为 0 **且 `text` / `chapterHref` 皆空**。`chapterHref` 是必要判据 —— 首章首块（`chapterDocIndex=0`、`count=0`）是有效位置，不是零位置 |
| `describeLocation(loc, format)` | 日志/调试可读形式 |

**字段三级角色**（语义，不新增字段）：

| 角色 | 字段 | 规则 |
|---|---|---|
| key（主键） | PDF：`page`；文字类：`chapterDocIndex + count` | 精确回跳第一依据 |
| hint（兜底） | `text`（可见块前 200 字）、`chapterHref`、`chapterTitle` | 主键因版本/结构差异失效时的重定位线索（见 KOOKIT §8.2 多端一致性） |
| display（展示） | `percentage`、`chapterTitle` | 仅 UI 展示与粗粒度同步，**不得**作精确锚定 |

**已知时序约束**（消费方必须遵守，实测记录见 KOOKIT §9）：kookit 文字类渲染不监听宿主容器
scroll，`next()` 的 smooth 滚动刚开始就 `record()` —— **滚动/翻页停稳后须补一次
`record()` 再取位置**，否则拿到的是旧位置（PDF 例外，自带 scroll 监听）。

**修订说明**：本节为 v0.2.2 修订 —— `chapterDocIndex` 从 `number | string` 收窄为
`number`（string 形态是 kookit 适配细节，域层不收；遗留 string 数据由
`normalizeLocation` 在边界容错），并修正 `count`/`page` 的错误注释。

### 2.2 书的身份与收录（**v0.4.0，2026-09-15 批复**；定案 = `DATA_MODEL.md` §4.2/§6）

> **背景**：原 `BookRecord` 把**四种身份**揉在一个类型里（库内条目 uuid / 内容指纹 / 文件路径 /
> 可选 Work），导致"同一本书多库各持一份笔记"（详见 `DATA_MODEL.md` §6.1）。
> v0.4.0 **拆开**：**内容身份 = edition（全局唯一，键 = 指纹）**、**组织归属 = holding（收录）**、
> **作品身份 = work（可空，本次只留接口）**。
> ⚠ 实施方式：**类型改名与全量改名由 `typecheck` 驱动扫尾**（编译器会点出每一处），本文只立形状。

```ts
/** 作品身份（Work）——"这是哪本书"。本次只留接口，不做完整标准化（DATA_MODEL D11/F9）。 */
interface WorkIdentity {
  protocol: 'isbn' | 'asin' | 'doi' | 'open-library' | 'content-hash-v1'
  code: string                 // 识别编码（isbn 含校验位）
}

/**
 * 电子版本地记录（EditionRecord）——**内容身份**，全局唯一键 = `fingerprint`。
 * ⚠ 与 §2 的 wire `Edition`（server 载荷，`{id, workId, ext, hashAlgo, …}`）**不是同一个类型**：
 *   本类型是**本地持久化的 edition 行**（多出 title / metadata / coverPath 等本地字段）。
 *
 * 为什么不是 `BookRecord` 直接改名：`BookRecord` 同时承担了"收录关系"（属于哪个库/书箱）——
 * 那部分移到 `Holding`。**跨库共享的根就是这个类型**：同一文件 → 同一指纹 → 同一 edition 行。
 */
interface EditionRecord {
  id: string                   // uuid（内部主键，稳定；**Note 与阅读状态引用它**）
  work?: WorkIdentity | null   // 可空 = 尚未标准化
  fingerprint: BookFingerprint
  format: BookFormat
  metadata: BookMetadata
  filePath: string             // 当前用于打开的真实路径（最后已知）
  coverPath?: string           // 封面是 **edition 级**（由内容决定）
  coverFailed?: boolean
  createdAt: number
}

/**
 * 收录（Holding）——"**哪个书库里有这本书**"（原 `BookRecord` 的"属于某库"部分）。
 * 同一 edition 可被**多个书库**收录（多行）→ 跨库共享天然成立；库内为**单亲归属**（一个 container）。
 */
interface Holding {
  libraryId: string
  editionId: string
  containerId: string | null   // 属哪个书箱；null = 库根层
  origin: 'scan' | 'import'    // 映射库扫到 / 导入
  path?: string                // 该库视角下的路径（映射库对账用）
  parentPath?: string          // path 的规范化父目录（层级浏览的 SQL 过滤列）
  /** 来源缺失（映射库对账产物）：**只影响可见性，不影响笔记与阅读状态**（DATA_MODEL §6.1） */
  missing: boolean
  sort: number
  addedAt: number
}

/** UI 侧常用组合视图（读模型，非存储实体）：一个层级的条目 = edition + 它的收录关系 */
interface LibraryItem {
  edition: EditionRecord
  holding: Holding
  /** 该 edition 是否还被**其它**库收录（"这本书别处也有"提示；可选） */
  alsoInLibraries?: number
}
```

**连带修订**：
- `LibraryEntry`：**去掉 `dbPath`**（一库一 .db 作废），改为
  `{ id, name, mode: 'mapped' | 'curated', rootPath?: string, sort: number }`；
  **`mode` 术语改名**（原 `'source' | 'virtual'`，见 `DATA_MODEL.md` §6.2）。
- `BookContainer`：**增 `libraryId`**（书箱树在库内），去 `kind`（库级 mode 已表达）。
- `Note.bookId` → **`Note.editionId`**（笔记跨库、不随条目消失；各版各一份，DATA_MODEL D8）。
- `BookRecord`：**退役**（拆为 `EditionRecord` + `Holding`）；过渡期可用 `LibraryItem` 组合读模型。

**不变量（实现与测试的判据）**：
1. 同一指纹在 `editions` 全局**至多一行**（跨库共享的根）；
2. 同一 `(libraryId, editionId)` 在 `holdings` **至多一行**；
3. **删除收录（holding）不得级联删除 edition / notes / reading_state**（笔记是用户资产）；
4. 笔记的锚点是**在某个 edition 里量出来的** → **禁止**把笔记归属挂到 work 上（否则跨版解析必然失准）。

---

## 3. 事件机制（所有服务通用）

```ts
type Listener = (...args: any[]) => void;
type Unsubscribe = () => void;

interface EventEmitter<Events extends Record<string, Listener>> {
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
  /** v0.3.10：正文选区变化（有选区给锚点，清空给 null）；**v0.3.11 补 `rect`**。
   *  为什么由适配器发：选区落在**书的 iframe 内文档**里，事件跨不过文档边界（同 iframeBridge 的根因），
   *  UI 无法自行观测 —— 观测必须发生在能碰到书文档的那一层。
   *  `rect` = **宿主视口坐标**下的选区矩形（适配器换算好）：色板据此摆放，
   *  UI 不必知道 iframe 的位置与内部滚动。 */
  'selection-changed': (selection: RenderSelection | null) => void;
  /** v0.3.12：阅读区右键 —— **新建标记/批注与编辑既有笔记的主入口**（用户定）。
   *  由适配器发：右键落在正文 iframe 里宿主收不到；"有没有点在笔记上"只有书文档知道。
   *  坐标已换算成宿主视口坐标；`anchor` 无选区时为 null；`noteId` 命中已有笔记时给出。 */
  'context-menu': (request: RenderContextMenuRequest) => void;
  /** v0.3.12：点击了某条高亮（= kookit `handleNoteClick`，取 `event.target.dataset.key`）。
   *  `x`/`y` 由适配器**量元素矩形**得出（kookit 该回调只给 `{target}`，没有鼠标坐标）。 */
  'note-clicked': (payload: { noteId: string; x?: number; y?: number }) => void;
}

/** v0.3.11：选区信息（锚点 + 宿主视口矩形）。 */
interface RenderSelection {
  anchor: TextAnchor;
  rect: { x: number; y: number; width: number; height: number };
}

/** v0.3.12：阅读区右键请求。 */
interface RenderContextMenuRequest {
  x: number;
  y: number;
  anchor: TextAnchor | null;
  noteId?: string;
}

interface IRenderService extends EventEmitter<RenderServiceEvents> {
  open(record: BookRecord, options?: RenderOptions): Promise<void>;
  close(): Promise<void>;
  renderTo(element: HTMLElement): Promise<void>;
  /** v0.3.0：向已打开的正文注入**颜色**（深色模式）。非 PDF 电子书正文是 HTML，走 `rendition.setStyle`
   *  （kookit 唯一样式注入口；**浅色不注入颜色**，保留书的自有外观）；PDF 是位图 → 深色走像素处理
   *  （TODO 单独立项），本方法对 PDF 无操作。颜色取自宿主语义 token `--page-bg/--page-text`。
   *  ⚠ 注入通道与"排版参数"共用（见 `applyTypography`）：每次调用重建**整份** reader style，
   *  所以"浅色不注入"只针对颜色，不代表整份样式不注入。 */
  applyTheme(theme: ResolvedTheme): Promise<void>;
  /** v0.3.3：向正文注入**排版参数**（字号/行距/段距）。
   *  与 `applyTheme` 共用同一条注入通道（kookit `setStyle`），可任意次调用；每次重建整份 reader style
   *  （换章只重写 `body`，我们的 `<style>` 留在 `head` → **一次注入全书生效**）。
   *  覆盖集合保守但有效：字号/行距打 `html,body` + 常见块级元素（书用相对单位会随之缩放），
   *  段距打 `p` 的下边距；**字段缺省 = 该项不注入**（尊重书自带排版）。PDF 无操作。 */
  applyTypography(typography: ReaderTypography): Promise<void>;
  /** v0.2.6：解析元数据（kookit 是唯一解析器，故能力挂在此端口）。
   *  **无状态** —— 内部构造临时 rendition，不 renderTo、不碰当前阅读会话；cover 为 data URL */
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
  // ————— v0.3.10：定位转换机制的**引擎侧原语**（纯函数部分在 core/domain/anchor.ts）—————
  /** `fromSelection`：取当前正文选区为统一锚点（无选区 / 本轮未支持格式 → null）。只读、不落库 */
  getSelectionAnchor(): Promise<TextAnchor | null>;
  /** `resolveToView`：跳到锚点（笔记面板点击 / 房间同步回跳）。Fragment 可解→精确，缺失→章级。
   *  revealNoteId 给值时把该条高亮元素滚进视野（面板点击的精确落点，不依赖 Fragment 解算） */
  resolveAnchor(anchor: TextAnchor, opts?: { revealNoteId?: string }): Promise<boolean>;
  /** `remeasure`：Fragment 失效后按 quote 找回。⚠ kookit 搜索只给「章 + 块文本」不给字符偏移
   *  → 产出**一定是弱锚点**（fragment=null，章级）；找不到 → null */
  remeasureAnchor(anchor: TextAnchor): Promise<TextAnchor | null>;
  /** v0.3.11：清掉正文里的选区。**必须由适配器提供** —— 选区在书文档里，
   *  宿主 `document.getSelection()` 清不掉它（不清则浏览器自带选区高亮会盖住我们画的高亮）。
   *  清完同时广播 `selection-changed = null`，UI 不必自己记得收起色板 */
  clearSelection(): void;
  createNote(note: Note): Promise<void>;      // v0.3.9：要求 anchor.fragment 就位，否则**抛错**（不静默 no-op）
  removeNote(noteId: string): Promise<void>;  // v0.3.9：按 Note.id（旧参数名 key 随 v1 退役）
  renderHighlighters(notes: Note[]): Promise<void>;
  // ⚠ v0.3.9 语义约束：**只对"当前已渲染的那一节"生效** —— kookit 文字类只有一个 iframe
  // （GeneralRender.getIframe() = #page-area 下第一个 iframe），renderHighlighters 在该 document 上
  // 按字符偏移重锚，跨节笔记会错位/抛错。故适配器按当前节过滤，调用方须在每次 `rendered` 后重调
  // （换章 = 换 document）。传入数组是拷贝（kookit 内部 notes.reverse() 原地改入参）。
}
```

> 约束：kookit 依赖 DOM（iframe 渲染）→ 外壳必须提供 DOM 环境（Electron / 浏览器 / WebView）。

### 4.2 INetService —— 传输能力（协议已定：见 `server/docs/API.md`）

> 成员 token（v0.1.6 起）由 **server 签发**：客户端带二级令牌调 `POST /auth/token` 获取（同一 IP 7 天内复用同一 token），
> 之后所有 REST / WS 请求带 `Authorization: Bearer <token>` + `X-Turead-Access: <二级令牌>` 两个头。

```ts
/** 消息信封：传输层只搬运信封，不理解语义 —— 语义由上层用例解释 */
interface MessageEnvelope {
  type: string;              // 例：'room.join' | 'room.location' | 'room.presence'
  payload: unknown;
}

interface NetServiceEvents {
  message: (envelope: MessageEnvelope) => void;
  'connection-changed': (state: 'connected' | 'disconnected' | 'reconnecting') => void;
}

interface INetService extends EventEmitter<NetServiceEvents> {
  connect(config: NetConfig): Promise<void>;
  disconnect(): Promise<void>;
  send(envelope: MessageEnvelope): Promise<void>;
  getMemberId(): Promise<string | null>;        // v0.2.1：当前成员 token（服务端签发；未连接/未取得为 null）
  request<T>(options: HttpRequestOptions): Promise<HttpResult<T>>;  // v0.2.1：REST 传输（自带 token 双闸头）
}

interface HttpRequestOptions {                  // v0.2.1
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;                                 // 以 / 开头的路径（如 /rooms、/auth/token）
  body?: unknown;                               // 自动序列化为 JSON 并带 Content-Type: application/json
  rawBody?: boolean;                            // body 为原始二进制（ArrayBuffer，文件上传用）
  responseType?: 'json' | 'text' | 'arraybuffer'; // 文件下载用 arraybuffer
}

interface HttpResult<T = unknown> {             // v0.2.1
  status: number;
  ok: boolean;
  data: T;
}

interface NetConfig {
  serverUrl: string;         // http(s)://host:port（REST 基址；WS 由此派生 ws(s)://host:port/ws）—— v0.2.1 修订：统一为 http(s) 基址
  accessToken: string;       // v0.2.1：第 2 层准入门禁（X-Turead-Access）
  memberToken?: string;      // v0.2.1：成员 token（服务端签发 POST /auth/token；缺省 = 适配器自动申请/复用）
  nickName: string;
  transport?: 'websocket';   // 预留多传输
}
```

> 本服务**不假设任何业务语义**：不发"加入房间"命令、不懂"标定"——它只负责连接与收发信封。业务语义在用例层（§5.1）。

### 4.3 IBookIdentityService —— 书籍标定（指纹/元数据）

```ts
interface IBookIdentityService {
  computeFingerprint(buffer: ArrayBuffer): Promise<BookFingerprint>;
  /** name = 文件名（骨架实现用它推导 title；结构化解析见 TODO「书籍元数据」） */
  extractMetadata(buffer: ArrayBuffer, format: BookFormat, name: string): Promise<BookMetadata>;
  verify(local: BookFingerprint, room: BookFingerprint): boolean;
}
```

> 指纹策略：**头/中/尾三点采样**（取头 64KB、中点 64KB、尾 64KB 拼接后计算哈希，配合 size 降低碰撞），算法 `md5-sample3-v1`（server 侧已按此注册，client 计算必须一致）。
> 注意：kookit 的 `Book.md5` 字段由调用方计算后传入 —— 本服务即计算方。

### 4.4 ILibraryStore —— 本地持久化

> 形状 = **v0.4.0（edition / holding / library 三层）**。三层与身份的关系见 §2.2；
> 存储实现与 schema 见 `client/docs/DATA_MODEL.md` §2。

```ts
interface ILibraryStore {
  // —— 内容身份（edition）：全局唯一键 = 指纹 ——
  /** 按指纹 upsert（全局去重）—— **导入去重的唯一入口** */
  upsertEdition(record: EditionRecord): Promise<EditionRecord>;
  getEdition(id: string): Promise<EditionRecord | null>;
  findEditionByFingerprint(fp: BookFingerprint): Promise<EditionRecord | null>;
  updateEdition(id: string, patch: Partial<EditionRecord>): Promise<void>;
  /** **彻底删除内容**（连带 notes/reading_state）；只在显式维护动作里用，**不是"移除书"** */
  removeEdition(id: string): Promise<void>;

  // —— 收录（holding）："哪个书库里有这本书"（键 = libraryId + editionId）——
  addHolding(holding: Holding): Promise<void>;
  /** 取消收录。⚠ **不得级联删除 edition / notes / reading_state**（§2.2 不变量③） */
  removeHolding(libraryId: string, editionId: string): Promise<void>;
  getHolding(libraryId: string, editionId: string): Promise<Holding | null>;
  /** 某库全部收录（跨层级）—— 扫描对账算差集用 */
  listHoldings(libraryId: string): Promise<Holding[]>;
  /** 层级取书（读模型）。**缺省不含"来源缺失"**；映射库走 `parent_path` 的 SQL 侧过滤 */
  listItemsAtLevel(query: LibraryLevelQuery): Promise<LibraryItem[]>;
  listAllHeldEditions(): Promise<EditionRecord[]>;
  /** 移动收录到书箱（单亲归属；containerId=null = 移回库根层）—— **唯一的"移动"入口** */
  moveHolding(editionId: string, libraryId: string, containerId: string | null): Promise<void>;
  setHoldingMissing(libraryId: string, editionId: string, missing: boolean): Promise<void>;

  // —— 书库（组织模式；库注册表在库内，不在引导文件）——
  listLibraries(): Promise<LibraryListResult>;
  createLibrary(input: { name?: string; mode: 'mapped' | 'curated'; rootPath?: string }): Promise<LibraryEntry>;
  switchLibrary(id: string): Promise<void>;
  renameLibrary(id: string, name: string): Promise<LibraryEntry>;
  /** 移除书库（连带 containers/holdings）；**edition/notes 不删**；最后一个库不可移除 */
  removeLibrary(id: string): Promise<void>;
  getLibrary(id: string): Promise<LibraryEntry | null>;

  // —— 书箱（树在库内）——
  listContainers(libraryId: string, parentId: string | null): Promise<BookContainer[]>;
  createContainer(params: { libraryId: string; parentId: string | null; name: string }): Promise<BookContainer>;
  renameContainer(id: string, name: string): Promise<void>;
  removeContainer(id: string): Promise<void>;
  moveContainer(id: string, parentId: string | null): Promise<void>;

  // —— 阅读状态 / 阅读时间（逐 edition 记，按 work 汇总）——
  getReadingState(editionId: string): Promise<ReadingState | null>;
  putReadingState(state: ReadingState): Promise<void>;
  appendReadingSession(session: Omit<ReadingSession, 'id'>): Promise<void>;
  totalReadMsByWork(work: WorkIdentity): Promise<number>;
  getLastReadEdition(): Promise<EditionRecord | null>;

  // —— 封面（**edition 级**：封面由内容决定）——
  setCover(editionId: string, bytes: ArrayBuffer, ext: string): Promise<string>;
  getCover(editionId: string): Promise<ArrayBuffer | null>;
  removeCover(editionId: string): Promise<void>;

  // —— 设置（**一律全局**，无库级设置）——
  getSetting<T>(key: string, fallback: T): Promise<T>;
  setSetting(key: string, value: unknown): Promise<void>;
  patchSetting(key: string, patch: Record<string, unknown>): Promise<void>;

  // —— 笔记 / 划线（**挂 edition**）——
  listNotes(editionId: string, chapterIndex?: number): Promise<Note[]>;
  addNote(note: Note): Promise<void>;
  updateNote(id: string, patch: NotePatch): Promise<void>;
  removeNote(id: string): Promise<void>;
}
```

> **v0.4.0 相对 v0.3.x 的签名变更**（`typecheck` 是扫尾手段）：
> - `BookRecord` → 拆成 `EditionRecord`（内容）+ `Holding`（收录）；`listBooks*` → `listItemsAtLevel`；
> - `createLibrary` 由位置参数改**对象参数**（避免 `mode`/`rootPath` 错位这类经典 bug）；`LibraryEntry` 去 `dbPath`；
> - 笔记与封面方法的 `bookId` 参数 → **`editionId`**；
> - `moveBookToContainer` → **`moveHolding(editionId, libraryId, containerId)`**（归属长在收录关系上）；
> - **库管理职责**从 `main/store/libraryManager.ts` 收敛进 `SqliteStore`；`LibraryManager` 退化为"引导文件 + store 句柄"。
>
> **新增领域类型**（`core/domain/types.ts`）：
> ```ts
> interface ReadingState  { editionId: string; lastReadAt?: number; lastLocation?: BookLocation; totalReadMs: number }
> interface ReadingSession{ id: number; editionId: string; owner?: string | null
>                           startedAt: number; endedAt: number; durationMs: number }
> ```

> 实现建议：`better-sqlite3`（接口保持存储无关）。
> **存储布局见 `client/docs/DATA_MODEL.md` §1/§2**（全应用一个 SQLite 库 + 极小的 JSON 引导文件；
> 封面是跟内容走的缩略图 `covers/<editionId>.<ext>`）—— 本节不重复。

### 4.5 IBookPicker —— 本地文件能力（v0.2.6 新增；适配器：Electron 对话框 + fs）

```ts
interface IBookPicker {
  pickFiles(): Promise<string[]>;             // 系统对话框选多个文件；取消 → []
  pickDirectory(): Promise<string | null>;    // 系统对话框选一个目录；取消 → null
  /** 列目录电子书：recursive=false 只此节点；true 则此节点及所有子节点（可配置选项） */
  listEbooks(dir: string, recursive: boolean): Promise<string[]>;
  readFile(path: string): Promise<ArrayBuffer>; // 导入读取
}
```

> **为什么新增**：此前书库 UI 直接调 `window.turead` 桥并 import IPC 通道名（FEATURES §8 已知例外）。
> 导入文件夹还需要目录扫描 —— 两者同属"本地文件能力"，收敛为端口后 UI 只依赖 `ServiceContainer`。
> **平台约束**：Electron 同一对话框**不能既选文件又选目录**（Windows 下 `openFile`+`openDirectory`
> 只会给出目录，electron#26885）→ 因此是 `pickFiles` / `pickDirectory` 两个方法，UI 侧表现为导入小菜单。

## 5. 应用服务（用例层）

### 5.1 IRoomSession —— 房间会话（同步业务逻辑本体）

```ts
interface RoomSessionEvents {
  'location-updated': (location: BookLocation, from: RoomMember) => void;
  'presence-updated': (members: RoomMember[]) => void;
  'chat-message': (msg: ChatMessage) => void;       // v0.1.5：聊天广播（含自己发的 = server 回执）
  'system-message': (msg: SystemMessage) => void;
  'connection-changed': (state: 'connected' | 'disconnected' | 'reconnecting') => void;
  'book-mismatch': (detail: { local: BookFingerprint; room: BookFingerprint }) => void;
}

interface IRoomSession extends EventEmitter<RoomSessionEvents> {
  /** 加入房间并完成标定：上报本地指纹 → 通过则订阅房间状态 */
  joinRoom(roomId: string, book: BookRecord): Promise<JoinResult>;
  leaveRoom(): Promise<void>;
  /** 手动广播当前位置（通常不需要：翻页由内部监听 render 自动广播） */
  emitLocation(location?: BookLocation): Promise<void>;
  /** 发送聊天消息：server 落库后广播 room.message 回执（含发送者）；历史经 REST GET /rooms/{id}/messages 拉取 */
  sendChat(text: string): Promise<void>;
  getRoomState(): RoomState | null;
  getMyMemberId(): string | null;                                     // v0.2.1
  /** v0.2.1：创建房间并注册 work/edition（POST /rooms；协议固定 content-hash-v1） */
  createRoom(book: BookRecord, owner: string): Promise<{ roomId: string; editionId: number }>;
  /** v0.2.1：上传电子版副本（POST /books/{editionID}/file，幂等去重，分发源） */
  uploadBookCopy(editionId: number, buffer: ArrayBuffer): Promise<void>;
  /** v0.2.1：房间发现（GET /rooms，可按 edition 找房） */
  listRooms(editionId?: number): Promise<RoomInfo[]>;
}

interface RoomMember {
  id: string;
  nickName: string;
  location?: BookLocation;
  isMe?: boolean;
}

interface RoomState {
  roomId: string;
  bookId?: string;           // 服务端书籍注册表 id（标定通过后返回）
  members: RoomMember[];
  currentLocation: BookLocation | null;
}

interface SystemMessage {
  text: string;
  type: 'join' | 'leave' | 'info' | 'error';
}

type JoinResult =
  | { ok: true; room: RoomState }
  | { ok: false; reason: 'book-mismatch' | 'room-not-found' | 'room-full' | 'server-error' };
```

**内部编排（举例，说明"用例 = 编排多个能力服务"）：**
1. `joinRoom()` → 用 `IBookIdentityService.computeFingerprint` 算指纹 → 经 `INetService.send` 发 `room.join` 信封 → 服务端标定。
2. 标定失败 → 发 `book-mismatch` 事件；成功 → 缓存 `RoomState`，并把 `IRenderService` 的 `location-changed` 监听接上（节流 → `INetService.send` 广播 `room.location`）。
3. **远端位置派生（v0.2.4）**：server 不单独下发 `room.location` 信封，而是广播 **`room.presence` 全量成员快照**（含每人位置，见 `server/docs/API.md` 转发规则）→ `RoomSession` 以 join-ack members 为基线、逐次 presence diff，**成员位置变化才 `emit location-updated`**（位置先归一、比较走 `sameLocation`）；`IRoomSession` 不自己翻页，翻页是 UI 的事（可将来加"跟随模式"开关）。
4. **订阅生命周期（v0.2.4）**：`net` 订阅属构造期随实例存活；`joinRoom` 期只挂 `render.location-changed`（`joinUnsubs`），`leaveRoom` 只解绑 join 期订阅 → 离开后可重新 join（修 v0.1.3 遗留 P1 误解绑）。

### 5.2 IBookService —— 书架 + 导入（应用服务）

```ts
interface IBookService {
  /** 导入：文件 → 指纹 → 元数据 → 入库。去重（v0.2.3）：同指纹（algorithm+hash+size 全等）复用已有记录并更新 filePath。
   *  v0.2.5：返回 `{ book, reused }` —— 「是否复用」由用例给出，UI 不再用 list() 前后快照反推 */
  importBook(file: ArrayBuffer, name: string, format: BookFormat, filePath: string): Promise<ImportResult>;
  list(): Promise<BookRecord[]>;
  get(id: string): Promise<BookRecord | null>;
  remove(id: string): Promise<void>;
  updateLastLocation(id: string, location: BookLocation): Promise<void>;
  /** v0.2.8：最近阅读的书（无阅读记录 → 回退最近导入）；供"进入阅读器恢复上次内容" */
  getLastRead(): Promise<BookRecord | null>;
}

interface ImportResult {
  book: BookRecord;
  reused: boolean;   // true = 指纹命中已有条目（未新增）
}
```

> `importBook` 是导入**用例**：编排 `IBookIdentityService`（指纹+元数据）与 `ILibraryStore`（持久化）；
> OCR 提 ISBN 是**可插拔步骤**（候选 `IOcrService`，适配器可复用 PP-OCRv5 技术路线，MIT）。

### 5.3 IImportQueue —— 批量导入编排（v0.2.8 新增）

```ts
interface ImportQueueEvents {
  progress: (done: number, total: number) => void;
  imported: (book: BookRecord, reused: boolean) => void;
  'import-failed': (path: string, message: string) => void;
  done: (summary: ImportSummary) => void;
}
interface ImportSummary {
  total: number; imported: number; reused: number; failed: number; cancelled: boolean;
}
interface IImportQueue extends EventEmitter<ImportQueueEvents> {
  enqueue(paths: string[]): void;   // 同一路径只入队一次；运行中可继续入队
  cancel(): void;                   // 取消剩余队列（正在处理的那本跑完）
  isRunning(): boolean;
}
```

> **为什么是用例**：串行、进度、取消、失败逐条上报属于**编排**，不是 UI 展示 ——
> 此前写在 `LibraryFeature` 里，与同构的 `CoverQueue` 位置不一致（UI 应是 driving adapter）。
> 编排：`IBookPicker.readFile` → `IBookService.importBook`（含指纹去重）。
> `extToFormat` 也随之从 UI 层移到 `core/domain/format.ts`（领域词汇映射，用例可依赖）。

## 6. 服务装配（ServiceContainer）

```ts
interface ServiceContainer {
  // 能力服务
  render: IRenderService;
  net: INetService;
  identity: IBookIdentityService;
  store: ILibraryStore;
  picker: IBookPicker;
  // 应用服务（用例）
  room: IRoomSession;
  books: IBookService;
  covers: ICoverQueue;
  imports: IImportQueue;
}
```

> 规则：
> - 构造函数注入依赖（如 `RoomSession(net, render, identity, store)`）。
> - **UI 只依赖 `ServiceContainer`，不直接 import kookit / better-sqlite3 / WebSocket 实现**。
> - 适配器目录约定：`client/src/core/adapters/{kookit,net,storage}`。

## 7. 待定 / 明确排除

- [x] **同步协议消息集与传输细节** —— **已定**（server 定义：信封 / 消息集 / 转发规范见 `../../server/docs/API.md`），client 适配（INetService 信封已为此预留）
- [ ] 笔记 / 划线同步：**明确排除在 v1 假设之外**（Note 类型先立，同步后续加）
- [ ] 光标在场（他人选中/阅读进度热区）：**明确排除在 v1 假设之外**
- [ ] 账号体系（游客昵称 vs 注册）→ 影响 `RoomMember.id` 语义（见根 `TODO.md`）
- [ ] `IRenderService.search()` 返回形状
- [ ] OCR（ISBN 提取）是否进 v1、`IOcrService` 接口草案（见根 `TODO.md`）

## 8. 修订记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.4.0 | 2026-09-15 | **书的身份：全局单库 + 书库降为组织模式**（定案 = `DATA_MODEL.md` §4.2/§6，D1–D12）。新增 **§2.2**：`WorkIdentity`（作品身份，**只留接口**）/ `EditionRecord`（内容身份，**全局唯一键 = 指纹**）/ `Holding`（**收录**："哪个书库里有这本书"）/ `LibraryItem`（读模型组合）+ **四条不变量**。连带：`LibraryEntry` **去 `dbPath`**、`mode` 改 **`'mapped' \| 'curated'`**；`BookContainer` **增 `libraryId`**（树在库内）；`Note.bookId` → **`editionId`**（各版一份、不自动跨版迁移）；**`BookRecord` 退役**（拆 `EditionRecord` + `Holding`）。§4.4 增 `upsertEdition`/`findEditionByFingerprint`/`addHolding`/`removeHolding`/`listItemsAtLevel`/`reading_state`/`reading_sessions` 方法，并给出**签名变更清单**（`moveBookToContainer` → `moveHolding`；封面方法参数改 `editionId`；库管理职责收敛进 `SqliteStore`） |
| v0.3.12 | 2026-09-14 | **右键成为标记/批注主入口（用户定）+ 批注落地**：① §4.1 增 `'context-menu'`（`RenderContextMenuRequest{x,y,anchor,noteId}` —— 适配器换算坐标并判定"是否点在笔记上"）与 `'note-clicked'`（点击高亮回调；`x/y` 由**量元素矩形**得出，因 kookit 该回调只给 `{target}` 无鼠标坐标）。两个事件都**必须**在适配器发（右键/点击若落在正文 iframe 内，宿主收不到，同 iframeBridge 根因）。② **UI 形态**（用户定）：右键菜单与批注面板统一为**"挂载线形态"** —— 光标处弹一条横向 1px 线、功能项自线下方生长，**摒弃圆角/阴影/卡片底**；**形态全站统一、语义按域不同**（书库 = 文件管理／阅读器 = 标记·批注）。③ **删 `SelectionPalette`**：选色板被右键菜单取代（"新建无论是高亮还是批注，最好的方法还是右键"），避免两个入口语义重叠；`selection-changed` 保留（决定菜单「新建」是否可用 + 键盘流程定位）。④ **批注**：`NoteComposer` 为**受控组件**（正文 state 由 ReaderFeature 持有 —— 以便键盘意图能**从外部提交当前输入**）；`kind` 记录**创建来路**（选色 → `highlight`／写批注 → `note`），编辑正文不改 kind。⑤ **键盘接口预留**：`DEFAULT_BINDINGS` 增 `reader.markSelection` / `annotateSelection` / `composerCommit` / `composerCancel` —— **键位故意留空**，行为已就位，待配键方案定下后只填表。⑥ **侧键**：阅读器内 `XButton1/2` = 翻页（与书库域的后退/前进**按功能态分工**；同一物理键跨域语义不同是用户明确要求）。⑦ **逆向补充**（KOOKIT §5 #14/#15）：`handleNoteClick` 是 `doc.body` 上的 capture 委托且**要求 `mousedown` 与 `click` 坐标相差 ≤ 5px**（防拖选误触）→ 只在"点"而非"拖"时触发；桌面端**无任何 kookit 右键处理**（触屏/右键接线是死代码），右键槽位自由 |
| v0.3.11 | 2026-09-14 | **笔记 UI 接线（Stage 4 收口）+ 一处 kookit 逆向更正**：① §4.1 `selection-changed` 载荷改为 `RenderSelection`（锚点 + **宿主视口坐标矩形**，适配器换算好 —— UI 不必知道 iframe 位置与内部滚动）；新增 `clearSelection()`（选区在书文档里，宿主清不掉；清完同时广播 null 让 UI 收起色板）。② **逆向事实更正（重要，坑号 KOOKIT §5#13）**：kookit **文字类**（`GeneralRender`）触发的是 `this.trigger("rendered")` —— **不带章号**；只有 `PdfRender` 带 `[chapterDocIndex]`。此前按"事件带章号"实现 → 文字类得到 `undefined`，而 `undefined === null` 为假、又不触发任何告警 → `renderHighlighters` 的章节过滤**静默 0 命中**（高亮永不出现、日志干净）。现改为以**位置**为权威（`getPosition().chapterDocIndex`，见 `resolveRenderedChapter`），并在 `location-changed` 时自愈纠正 |
| v0.3.10 | 2026-09-14 | **笔记引擎侧原语 + notes 存储接通**：§4.1 增 `RenderServiceEvents['selection-changed']`（选区事件由适配器发 —— 选区在书的 iframe 内文档里，事件跨不过文档边界，UI 无法自行观测）与三个引擎侧原语 `getSelectionAnchor`（`fromSelection`）/ `resolveAnchor(anchor, {revealNoteId})`（`resolveToView`）/ `remeasureAnchor`（`remeasure`）。**口径**：① `resolveToView` 本轮精度 = **章级**（`chapterDocIndex`，PDF 即页码），`revealNoteId` 再补"滚到该高亮元素"的精确落点（不依赖 Fragment 解算 → 弱锚点笔记也能看到落点）；② `remeasure` **只能产弱锚点** —— kookit 搜索（`getSearchResult`）返回 `{excerpt, cfi}`，`cfi` 是含 `chapterDocIndex` 的 JSON 串，**没有字符偏移**，故 `fragment=null`、`progression=0`（不假装精确）；③ §4.4 `ILibraryStore` 增笔记 CRUD（`listNotes(bookId, chapterIndex?)` / `addNote` / `updateNote(id, patch)` / `removeNote(id)`，`NotePatch` 白名单式），**`anchor` 更新时三列 + `excerpt` 必须一起重写**（`excerpt` 是 `quote.exact` 的投影，不许两处各写各的），`updatedAt` 由存储层统一盖戳；④ `id`/`createdAt`/`updatedAt` 由**调用方**给全（`id` 是同步主键，须跨端稳定，存储层不代生成） |
| v0.3.9 | 2026-09-14 | **笔记/划线契约收拢（Note v2 + 选区级锚点层）**：§2 增 `TextAnchor`（两层：Norm `chapterIndex`/`progression`/`quote{exact,prefix,suffix}` + Fragment `engine`/`key`）、`AnchorQuote`/`AnchorNorm`/`AnchorFragment`/`AnchorMatch`/`NoteKind`/`NoteColor`；`Note` 收拢为 v2（`id`/`owner`/`kind`/`anchor`/`color`/`body`/`ink`），**v1 形状（key/location/range/text/notes）退役**，更名对照见 §2。纯函数权威 = 新增 `core/domain/anchor.ts`。§4.1 `removeNote(key)`→`removeNote(noteId)`，并补三条语义约束（`createNote` 无载荷抛错 / `renderHighlighters` 只对当前已渲染节生效 / 传拷贝因 kookit 原地 reverse）。**逆向事实更正**：kookit 文字类笔记载荷**不是 CFI 而是 rangy 字符范围**（`getHightlightCoords()` = `rangy.getSelection(iframe).saveCharacterRanges(doc.body)[0]`，`createOneNote`/`renderHighlighters` 均 `JSON.parse(item.range)`）—— `DATA_MODEL.md` §3.1 原写"EPUB=CFI"与实现不符，已按实现记为 `engine='kookit-rangy'`。颜色契约更正：kookit 要 `"<styleType>-#RRGGBB"` 串（`buildHighlightStyleForType` 按 `-` 切分），传裸 hex 会让 switch 无命中而**静默不显色** |
| v0.3.7 | 2026-09-13 | **书库双模式 + 层级浏览**：§2 `LibraryEntry` 增 `mode?`('source'\|'virtual'，**建库二选一**)与 `rootPath?`（虚拟映射跟踪的唯一真实文件夹）、增 `BookContainer`；§4.4 增書箱 CRUD（`listContainers`/`createContainer`/`renameContainer`/`removeContainer`）与 `listBooksAtLevel`（层级取书：containerId=null=根层未入箱书 / folder=虚拟映射当前文件夹）；§4.5 `IBookPicker` 增 `listSubdirectories`；桥增 `getPathForFile`（拖拽导入取真实路径，Electron ≥29 移除 File.path）。口径：**资源管理器式层级**——書箱/文件夹与书籍外观相似、单击进入，当前层级 = 状态栏右端面包屑；虚拟映射不落 containers 行（按 rootPath 动态派生） |
| v0.3.8 | 2026-09-13 | **書箱移动**：§4.4 增 `moveContainer(id, parentId)`（资源管理器"剪切文件夹"语义；parentId=null = 移回根层；目标是自己或自己的后代时拒绝防成环）——支撑拖箱入箱 / 拖到面包屑段 / 右键「移動到」。§4.4 代码块补齐 v0.3.7 漏登的書箱方法（文档债务） |
| v0.3.6 | 2026-09-13 | **書庫管理弹窗**：§2 `LibraryEntry` 增 `dbPath?`（仅供展示/揭示）；§4.4 增 `renameLibrary(id, name)`（显示名，路径不变，不切库不广播）。UI 入口 = 状态栏「書庫」→ 管理弹窗（Obsidian 仓库管理页风格：列表/切换/新建/更名/所在文件夾），替换原下拉菜单 |
| v0.3.5 | 2026-09-13 | **多书库契约**：§2 增 `LibraryEntry`；§4.4 `ILibraryStore` 增 `listLibraries` / `createLibrary` / `switchLibrary`。口径：一个条目 = 一份 .db 书库；`config.json` 降级为**引导文件**（库注册表 + 当前库 id，DATA_MODEL §1）；切换/新建成功后 main 广播 `library-changed`，渲染层各 Feature 以广播为"当前库已变"信号重载自己的状态（选中/阅读器由 AppShell 清理）。设置（主题/阅读参数）**随库走**（存于各库 settings 表） |
| v0.3.4 | 2026-09-12 | **封面失败负缓存**：§2 `BookRecord` 增 `coverFailed?`（永久性失败只试一次，不随启动「存量补封面」重试）。背景：书库 328 本实测，启动补封面把渲染主线程整个饿死（kookit getMetadata 在主线程解析全书）且失败书每次启动反复重解析 | 
| v0.3.3 | 2026-09-11 | **阅读排版参数契约 + 右侧控件**：§2 增 `ReaderTypography`（fontSize/lineHeight/paragraphSpacing，**缺省 = 不改**）、`ReaderSettings` 扩 `pagePadX/fontSize/lineHeight/paragraphSpacing`；§4.1 `IRenderService` 增 `applyTypography`（与 `applyTheme` 共用同一条 `setStyle` 注入通道，每次重建整份 reader style）。口径：**宿主几何走 CSS 变量（纸宽/内边距），正文排版走注入（字号/行距/段距）**；高频参数入口 = 阅读页**右侧可召唤面板**（`STYLE.md` §5.8/§5.9） |
| v0.3.2 | 2026-09-11 | **`applyTheme` 语义澄清 + 首个排版参数**：`IRenderService.applyTheme` 的注入内容 = **排版参数（始终）+ 颜色（仅深色）** —— "浅色不注入"只针对颜色；新增纸内边距注入 `body{padding-inline: var(--page-pad-x)}`（注入 body 而非宿主容器：kookit 排版宽度读宿主 `clientWidth`，且 `handleImageSize.getContentWidth` 会扣掉父容器 padding）。可调参数清单见 `STYLE.md` §5.9 |
| v0.3.1 | 2026-09-11 | **阅读器设置契约（沉浸态二次修订）**：§2 增 `ReaderSettings`（`readerMode` + `readerWidth` —— 正文列宽存 **px 数值**，档位只是设置页呈现，为远期自由调节/按屏幕·字号自适应留余地）；口径见 `STYLE.md` §5.8（全屏的是"纸"不是"正文"、阅读页零控件、目录挂载线）+ §5.9（预留登记）+ `FEATURES.md` §11 |
| v0.3.0 | 2026-09-11 | **阅读器 MVP（夜间模式·非 PDF）**：① 主题模型规正 —— §2 增 `ResolvedTheme`/`ThemeSetting`/`ThemeTone`/`ThemeMode`（2 主题 × 2 模式，权威 `core/domain/theme.ts`）② `IRenderService` 增 `applyTheme(theme)`（向正文 iframe 注入深色 CSS，kookit `setStyle` 注入口；PDF 无操作）③ `RenderOptions.theme` 转正为适配器消费（→ kookit isDarkMode/backgroundColor）|
| v0.2.9 | 2026-09-08 | **文档校订（v0.1.10）**：`RenderOptions.theme` 枚举与四套主题对齐（`dark`/`light`/`sepia-light`/`sepia-dark`/`custom`）并标注**当前未被适配器消费**（主题经 CSS token + `data-theme` 生效）—— 原文枚举 `sepia` 已不存在 |
| v0.2.8 | 2026-09-08 | **审查修复（v0.1.9）**：① 批量导入编排下沉为用例 `IImportQueue`（与 `CoverQueue` 同构；`extToFormat` 随之移入 `core/domain/format.ts`）② `ILibraryStore.patchSetting`（主进程原子合并，消除两个 Feature 对同一设置键"读-改-写"的覆盖竞态）③ `IBookService.getLastRead()`（进入阅读器恢复上次内容的口径）④ `ServiceContainer` 增加 `imports` |
| v0.2.7 | 2026-09-08 | **书库重做补约（v0.1.8 第二段）**：`IBookPicker.listEbooks` 增 `recursive` 参数（文件夹导入可配置"仅此节点 / 含所有子节点"）；`LibrarySettings` 增 `importRecursive`；设置新增 `deleteNotice`（删除确认"下次不再提示"）。删除语义澄清：**只删书库索引，不删源文件**（弹窗首次说明） |
| v0.2.5 | 2026-09-08 | **本地阅读器修复批（v0.1.7）**：`IBookService.importBook` 返回 `ImportResult{book,reused}`（去重用例自述结果，删除 UI 侧 id 快照反推）；`isZeroLocation` 判据补 `chapterHref`（首章首块不再被误判为零位置，compare/anchor 对"书的开头"恢复有效）；`extractMetadata` 签名补 `name`（文档与实现对齐） |
| v0.2.4 | 2026-09-08 | **远端位置派生修约**：`location-updated` 事件由 `room.presence` 全量快照 diff 派生（此前声明但从不触发 = 死端口）；网络载荷位置进域层先归一、比较走 `sameLocation`；订阅生命周期分构造期(net)/join 期(render)，`leaveRoom` 只解绑 join 期 → 修 leaveRoom 误解绑 P1（v0.1.3 遗留） |
| v0.2.3 | 2026-09-08 | **目录跳转（本地阅读 MVP）**：领域 `Chapter` 增加 `chapterDocIndex`（目录项起始渲染节号，= BookLocation.chapterDocIndex 同标尺，PDF=页码）；`IRenderService` 增加 `goToChapter(chapterDocIndex)`（目录跳转原语） |
| v0.2.2 | 2026-09-07 | **定位系统立约（§2.1）**：`BookLocation` 字段三级角色（key/hint/display）+ 标准原语收拢进 `core/domain/location.ts`；`chapterDocIndex` 收窄为 `number`（kookit string 形态止步适配层，遗留数据由 `normalizeLocation` 边界容错）；修正 `count`/`page` 错误注释。配套领域新增 `location.ts`（纯函数，零依赖） |
| v0.2.1 | 2026-08-31 | 契约先行补 REST 传输缺口（client v1 骨架落地时）：`INetService` 增加 `request()`（REST，自带 token 双闸头）与 `getMemberId()`；`NetConfig` 增加 `accessToken` / `memberToken`（token 双闸，见 `server/docs/API.md` 认证），`serverUrl` 统一为 http(s) 基址；`IRoomSession` 增加 `createRoom` / `uploadBookCopy` / `listRooms`（对应 REST：POST /rooms、POST /books/{id}/file、GET /rooms）；领域层增加 `RoomInfo`（GET /rooms 列表项，wire 形状见 `server/docs/API.md`）。变更方向：只增不改，端口仍"只搬运不解语义" |
