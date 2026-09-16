/**
 * 领域层（core/domain）—— 纯类型与规则，零依赖、零副作用。
 * 依据：client/docs/CONTRACTS.md §2（权威）+ server/docs/API.md「数据形状参考」（wire 形状）。
 * 共享词汇 = 领域层，被所有层共享。
 */

/**
 * 阅读位置 —— 房间同步的最小载荷，与 kookit getPosition() 对齐。
 * ⚠ 字段语义与比较规则以 §2.1 定位标准为权威（client/docs/CONTRACTS.md + ./location.ts）：
 *   任何组件不得自行比较/解释字段，一律走 domain/location.ts 原语。
 */
export interface BookLocation {
  /** 章节（kookit 分节）序号；PDF 下等于页码 */
  chapterDocIndex: number
  chapterHref: string
  /** 可见滚动块序号（scroll 模式的"第几屏"）——文字类主键的组成部分 */
  count: number
  /** 分页模式（single/double）的页码；scroll 模式为 0 */
  page: number
  /** 全局进度 0 ~ 1（display 角色：仅展示/粗粒度，不作精确锚定） */
  percentage: number
  /** 可见块前 200 字（跨端/跨版本重定位兜底） */
  text: string
  chapterTitle?: string
}

/** 书籍指纹 —— 标定"同一本书的同一电子版" */
export interface BookFingerprint {
  /** server 已定（2026-08-27）：头/中/尾三点采样（头64KB+中点64KB+尾64KB 拼接哈希）；预留演进（v2 换 sha256） */
  algorithm: 'md5-sample3-v1'
  /** 采样拼接后哈希值（hex） */
  hash: string
  /** 文件字节数 */
  size: number
}

export type BookFormat =
  | 'EPUB'
  | 'PDF'
  | 'MOBI'
  | 'AZW3'
  | 'AZW'
  | 'TXT'
  | 'MD'
  | 'FB2'
  | 'DOCX'
  | 'HTML'
  | 'MHTML'
  | 'XML'
  | 'CBZ'
  | 'CBR'
  | 'CBT'
  | 'CB7'

/** 书籍元数据（epub/fb2 等有结构化字段，pdf/txt 可能缺省） */
export interface BookMetadata {
  title: string
  author?: string
  publisher?: string
  /** 二级匹配，不强制 */
  isbn?: string
  language?: string
  description?: string
  /** data URL 或本地路径 */
  cover?: string
}

/**
 * 作品身份（Work）——"这是哪本书"：`protocol` + `code`（如 ISBN）。
 * 权威口径见 `../../docs/ARCHITECTURE.md` §1；**本次只留接口、不做完整标准化**（DATA_MODEL D11/F9）。
 * 为什么要留：**阅读时间按 work 汇总**依赖它（同一本书的不同电子版合并计时）。
 */
export interface WorkIdentity {
  protocol: 'isbn' | 'asin' | 'doi' | 'open-library' | 'content-hash-v1'
  /** 识别编码（isbn 含校验位） */
  code: string
}

/**
 * 电子版本地记录（EditionRecord）——**内容身份**，全局唯一键 = `fingerprint`。
 *
 * ⚠ **v0.4.0（2026-09-15「书的身份」定案，DATA_MODEL §4.2/§6）**：本类型取代原 `BookRecord`
 * 的"内容"部分；原 `BookRecord` 里"属于哪个库/书箱"移到 `Holding`（收录）、"阅读状态"移到
 * `ReadingState`。**跨库共享的根就是本类型**：同一文件 → 同一指纹 → 同一 edition 行
 * （**不需要 work 也成立**；work 只用于"不同文件但同一本书"的聚合）。
 *
 * ⚠ 与 `CONTRACTS.md` §2 的 wire `Edition`（server 载荷 `{id, workId, ext, hashAlgo, …}`）
 * **不是同一个类型**：本类型是**本地持久化的 edition 行**（多出 title/metadata/封面等本地字段）。
 */
export interface EditionRecord {
  /** uuid（内部主键，稳定）—— **`Note` 与 `ReadingState` 引用它** */
  id: string
  /** 可空 = 尚未标准化（D11：接口就位，完整标准化后置；现状旧列是死列） */
  work?: WorkIdentity | null
  fingerprint: BookFingerprint
  metadata: BookMetadata
  format: BookFormat
  /** 当前用于打开的真实路径（最后已知） */
  filePath: string
  createdAt: number
  /**
   * 封面缩略图文件名（相对当前库的 covers 目录）；缺省 = 尚无封面。
   * **封面由内容决定，故是 edition 级**；只存引用、字节落盘（同 v0.2.6 口径）。
   */
  coverPath?: string
  /**
   * 封面提取失败负缓存（永久性失败只试一次）。
   * ⚠ 已知缺陷：**瞬态故障与永久故障未区分**，会把解析窗崩溃/超时也永久缓存 ——
   * 见 `TODO.md`「工程与测试设施」组的行为审查条目。重试 = 删除本字段。
   */
  coverFailed?: boolean
}

/**
 * 收录（Holding）——"**哪个书库里有这本书**"（原 `BookRecord` 的"属于某库"部分）。
 * 同一 edition 可被**多个书库**收录（多行）→ 跨库共享天然成立；库内为**单亲归属**（一个 container）。
 */
export interface Holding {
  libraryId: string
  editionId: string
  /** 属哪个书箱；`null` = 库根层 */
  containerId: string | null
  /** 来源：映射库扫到（`scan`）／导入（`import`） */
  origin: 'scan' | 'import'
  /** 该库视角下的路径（映射库对账用） */
  path?: string
  /** `path` 的规范化父目录 —— 层级浏览的 **SQL 过滤列**（写入时维护，§DATA_MODEL §2） */
  parentPath?: string
  /** 来源缺失（映射库对账产物）：**只影响可见性，不影响笔记与阅读状态**（DATA_MODEL §6.1） */
  missing: boolean
  sort: number
  addedAt: number
}

/** 层级浏览的读模型（UI 用）：一个条目 = 内容身份 + 它在当前库的收录关系 + 阅读状态 */
export interface LibraryItem {
  edition: EditionRecord
  holding: Holding
  /**
   * 阅读状态（进度/最近阅读/累计时长）。放进读模型是**为了不 N+1**：
   * 列表每行都要显示进度（`progressText`），逐行查一次阅读状态就是个 N+1；
   * 让 `listItemsAtLevel` 一次 JOIN 出来。`null` = 从未读过。
   */
  readingState: ReadingState | null
}

/** 阅读状态（v0.4.0：从书行里拆出，**逐 edition**）——"按 work 汇总"是查询口径，不是存储口径 */
export interface ReadingState {
  editionId: string
  lastReadAt?: number
  lastLocation?: BookLocation
  /** 累计阅读时长（ms）——便于展示的累计投影；权威明细在 `ReadingSession` */
  totalReadMs: number
}

/** 阅读会话（③ 阅读时间模型的落点）：逐 edition 记原始会话，便于按 work 汇总 */
export interface ReadingSession {
  id: number
  editionId: string
  /** 用户（登录后回填）；**本机默认档案 = null/缺省**（D10） */
  owner?: string | null
  startedAt: number
  endedAt: number
  durationMs: number
}

/**
 * ⚠ **过渡别名（v0.4.0）**：`BookRecord` 现等同 `EditionRecord`（只承载**内容身份**）。
 * 保留是为了**把渲染层的爆炸半径压住**（`IRenderService.open` 只需内容身份：id/指纹/格式/路径/元数据）。
 * **新代码不得用它表达"属于哪个库"**（那是 `Holding`）；收尾时删除本别名。
 * @deprecated 用 `EditionRecord`
 */
export type BookRecord = EditionRecord

/** 书库视图（列表 / 网格；瀑布流因缩略图统一比例已并入网格，见 FEATURES §10） */
export type LibraryView = 'list' | 'grid'

/** 书库视图设置（⚠ v0.4.0：持久化于**全局** `settings` 表 —— D9/F7"设置一律全局，没有库级设置"） */
export interface LibrarySettings {
  view: LibraryView
  /** 导入文件夹时是否包含子目录（false = 只导入此节点；true = 此节点及所有子节点） */
  importRecursive: boolean
}

/**
 * 书库（Library / 書庫）——**组织模式，不是物理分区**（v0.4.0；用户 2026-09-15 定，DATA_MODEL D2）。
 *
 * ⚠ 相对 v0.3.5 的两处变化：
 * ① **去掉 `dbPath`** —— "一库一 .db"已作废：全部数据在一个**全局 .db** 里（多书库只是同一库里的
 *    多行 `libraries` + 各自的收录关系）；库注册表本身也进库，引导文件只剩 `{version, dbPath, 窗口状态}`。
 * ② **`mode` 改名** —— 原 `'source' | 'virtual'` 反直觉（"虚拟映射"的标识是 `source`、"自建"却是
 *    `virtual`），改为 **`'mapped' | 'curated'`**（映射库 / 自建库，见 DATA_MODEL §6.2）。
 */
export interface LibraryEntry {
  id: string
  name: string
  /** 映射库（跟踪真实文件夹，层级 = 文件系统）｜自建库（空库起步，用户自建書箱树） */
  mode: 'mapped' | 'curated'
  /** `mode='mapped'`：跟踪的**唯一**真实文件夹 */
  rootPath?: string
  sort: number
}

/**
 * 書箱/容器（DATA_MODEL §2 `containers` 表的领域形状）。
 * ⚠ v0.4.0：**增 `libraryId`**（箱树在库内 —— 单库时看不出来，多库同处一个 .db 后必须）；
 * **去 `kind`**（库级 `mode` 已表达"映射/自建"；且原 `kind='source'` 的行**从未被写入过** ——
 * 映射库的层级是按 `rootPath` **派生**的，不是行）。
 */
export interface BookContainer {
  id: string
  libraryId: string
  parentId: string | null
  name: string
  sort: number
}

/**
 * 阅读排版参数（v0.3.3 新增；持久化于 config.json 的 readerSettings）。
 *
 * 与"宿主几何"分工（`STYLE.md` §5.9）：
 * - **宿主几何** = 纸宽 `--read-width` / 纸内边距 `--page-pad-x` → 走 CSS 变量（kookit 排版宽度依据）
 * - **正文排版** = 本类型 → 走 `IRenderService.applyTypography` 注入正文 iframe（`setStyle`）
 *
 * 三态约定：字段**缺省 = 不改**（尊重书自带排版，UI 上是「默認」档）；给值才覆盖。
 * 存**数值**不存档位名 —— 档位只是控件的呈现（`CONTRACTS.md` §2）。
 */
export interface ReaderTypography {
  /** 正文字号（px） */
  fontSize?: number
  /** 行距倍数（无单位） */
  lineHeight?: number
  /** 段间距（px，段落下边距） */
  paragraphSpacing?: number
}

/**
 * 阅读器持久化设置（v0.3.1 起契约在 `CONTRACTS.md` §2；2026-09-12 架构审查补立为领域类型）。
 * 此前该形状只存在于 UI（ReaderFeature 的本地 interface）——契约有、领域无，实体未提升。
 * 持久化于 config.json 的 `readerSettings` 键；字段缺省 = 不改/用默认（尊重书自带排版）。
 * ⚠ 运行时值可能为 `null`（控件三态「默認」存的就是 null），读取侧用 `?? 默认值` 兜底。
 */
export interface ReaderSettings {
  /** 布局模式（低频参数，设置页管；重开书生效） */
  readerMode?: RenderOptions['readerMode']
  /** 纸宽 px（宿主 token `--read-width`） */
  readerWidth?: number
  /** 纸内边距 px（宿主 token `--page-pad-x`） */
  pagePadX?: number
  /** 正文排版三件套（语义同 `ReaderTypography`，拍平存储） */
  fontSize?: number
  lineHeight?: number
  paragraphSpacing?: number
}

/** 阅读渲染配置（领域层友好配置，适配器内部翻译为 kookit config） */
export interface RenderOptions {
  readerMode: 'single' | 'double' | 'scroll'
  animation: 'sliding' | 'mimical' | 'none'
  fontSize?: number
  lineHeight?: number
  fontFamily?: string
  /**
   * v0.3.0 起**适配器已消费**：open 时映射为 kookit config 的 isDarkMode/backgroundColor；
   * 深色下 renderTo 后经 `applyTheme` 注入正文深色 CSS。类型见 ./theme.ts。
   */
  theme?: import('./theme').ResolvedTheme
  backgroundColor?: string
  textColor?: string
  isDarkMode?: boolean
  convertChinese?: boolean
  password?: string
  isScannedPDF?: boolean
  ocrEngine?: 'tesseract' | 'paddle' | 'official-ai-ocr' | 'external-engine'
  /**
   * v0.4.0：**首次定位的目标位置**（"回到上次读到哪"）。
   * ⚠ 为什么放在 options 而不是从 `record` 上读：v0.4.0 起 `EditionRecord` 只承载**内容身份**，
   * 阅读状态已拆到 `ReadingState`（DATA_MODEL §2 v3）—— 渲染层不该为了拿一个位置去依赖阅读状态表。
   * 缺省 = 无历史位置 → 渲染初始章节（`goToChapterIndex(0)`）。
   */
  lastLocation?: BookLocation
}

/** 目录（TOC）。chapterDocIndex 缺省 = 该目录项无可直达渲染节（如仅作分组标题） */
export interface Chapter {
  label: string
  href: string
  /** 目录项起始渲染节号（= BookLocation.chapterDocIndex 同标尺；PDF 下为页码）；供 goToChapter 跳转 */
  chapterDocIndex?: number
  subitems?: Chapter[]
}

/* ————— 定位转换机制：选区级锚点（DATA_MODEL §3.1 / §3.1.1，已批复）—————
 *
 * 两层结构（关键决策：**统一信封 + 引擎原生载荷**，不做"通用定位语言"让引擎来回翻译——
 * 翻译有损会破坏选区 round-trip；Readium 同款取舍）：
 *   - **归一化层（Norm）** 跨格式可比的语义字段 —— 笔记层/存储/同步**只看这层**；
 *   - **引擎载荷层（Fragment）** engine 标识 + 不透明编码串 —— **只有适配器能生成/解释**。
 * 原语（接口即机制）：纯函数在 `./anchor.ts`，引擎侧（fromSelection/resolveToView/remeasure）
 * 在渲染适配器。
 * 与进度级 `BookLocation` 的分工：**"读到哪"是进度语义、"标在哪"是选区语义，不是同一个物**。
 */

/** 划线时刻的书籍原文快照 —— **定位证据，不是笔记内容**（故归锚点侧、不归 Note 侧，§3.1.1 ①） */
export interface AnchorQuote {
  /** 选中原文（权威在本字段；notes 表 `excerpt` 列只是它的投影） */
  exact: string
  /** 选区前文（重锚消歧用；并入 notes 表 `anchor_hint` JSON） */
  prefix: string
  /** 选区后文 */
  suffix: string
}

/** 归一化层（Norm）—— 跨格式可比的语义字段 */
export interface AnchorNorm {
  /** 章（kookit 分节）序号；PDF 下 = 页码（= notes 表 `chapter_index` 列） */
  chapterIndex: number
  /** 章内相对进度 0~1（**粗**排序/粗回跳用；不参与精确位置判定） */
  progression: number
  quote: AnchorQuote
}

/** 引擎载荷层（Fragment）—— 不透明编码串，跨引擎不可解释 */
export interface AnchorFragment {
  /** 载荷来源标识（文字类 `'kookit-rangy'`；PDF `'kookit-pdf-rect'`）——换内核时据此选解释器 */
  engine: string
  /** 编码串（文字类 = rangy 序列化字符范围的 JSON；PDF = 页码+归一化坐标）。
   *  = notes 表 `anchor_key` 列，落库即本层串：**逐字节原样存**、不套壳不加前缀——
   *  适配器解码时不必先剥包装，避免转义事故 */
  key: string
}

/** 选区级统一锚点（统一信封：Norm 恒在，Fragment 可缺） */
export interface TextAnchor {
  norm: AnchorNorm
  /** null = 无引擎载荷（只能粗回跳 + 靠 quote 重锚） */
  fragment: AnchorFragment | null
}

/** 两锚点的关系强度（`compareAnchor` 的产物；§3.1.1 ② 的"强弱标注"） */
export type AnchorMatch =
  /** Fragment 相等 —— 同 edition 同引擎下权威精确（O(1) 串比较，直接判同） */
  | 'exact'
  /** 同章 + quote 高度相符（可回跳；位置可能有小幅偏移） */
  | 'strong'
  /** 仅同章/粗粒度相符（只能跳到大概位置） */
  | 'weak'
  /** 不同章（或不可比） */
  | 'unrelated'

/** 笔记种类（DATA_MODEL §2 `notes.kind` 四枚举；书签入本表已批复 §4 决定 6） */
export type NoteKind = 'highlight' | 'note' | 'bookmark' | 'ink'

/** 高亮色**语义名**（不是 hex）：UI 按主题 token 渲染，库内不存颜色字面量（`STYLE.md` 视觉语汇纪律） */
export type NoteColor = 'red' | 'yellow' | 'green' | 'blue'

/**
 * 笔记/划线 v2（2026-09-14 按 DATA_MODEL §3.1.1/§3.2 收拢，**v1 形状退役**）。
 *
 * v1（`key`/`location`/`range`/`text`/`notes`）的三处错位：
 * ① "读到哪"与"标在哪"混在一个 `location`；② 引擎载荷与语义不分层（`range` 裸挂）；
 * ③ `notes` 与 kookit 的同名字段撞车（kookit 的 `notes` 语义是**批注正文**）。
 * 更名对照：`key→id`、`location`+`range`→`anchor`、`text→anchor.norm.quote.exact`、`notes→body`。
 *
 * ⚠ **本类型不含 `excerpt` 字段**：notes 表的 `excerpt` 列是 `anchor.norm.quote.exact` 的
 * **投影**（§3.1.1 ①：quote 归锚点侧），领域层只留一处权威，避免两处同值漂移。
 */
export interface Note {
  /** uuid（同步主键） */
  id: string
  /**
   * ⚠ **v0.4.0：原 `bookId` → `editionId`**（DATA_MODEL D8）——
   * 笔记挂**内容（edition）**：跨库共享、不随"移除收录"消失；且**各版各一份**、
   * **不做自动跨版迁移**（跨版搬运是用户的主动动作，Pro 候选，见 TODO.md）。
   */
  editionId: string
  /** 成员 token；**本地笔记为 null/缺省**（同步上线后回填，DATA_MODEL §4 决定 5 预留） */
  owner?: string | null
  kind: NoteKind
  /** 选区级锚点（"标在哪"） */
  anchor: TextAnchor
  /** 语义色名；bookmark/ink 可缺省 */
  color?: NoteColor
  /** 用户批注正文（**只有这里住批注内容**）—— v1 的 `notes` 更名而来。
   *  ⚠ kookit `createOneNote` 用它判定"是否带批注"且当字符串用（`item.notes !== ""`）：
   *  传给引擎时必须是 **string**（2026-09-14 逆向核实，见 `KOOKIT.md`） */
  body: string
  /** `kind='ink'`：InkStroke[] JSON；其余缺省（墨迹与划线的本质差异见 DATA_MODEL §3.3） */
  ink?: string
  createdAt: number
  updatedAt: number
}

/* ————— 笔记管理（跨书）—— CONTRACTS v0.4.2；视觉 = STYLE §5.10，形态 = FEATURES §12 ————— */

/** 笔记管理的视图：`grid` = 網格（等高行）；`masonry` = 瀑布流（按列装箱，**默认**）。
 *  ⚠ **没有列表形态**（用户 2026-09-16 定）。 */
export type NoteView = 'grid' | 'masonry'

/** 卡片内文字主次（用户 2026-09-16 定：两档**可切换**，默认 `body`）。只改字号/颜色的分配，不改数据。 */
export type NoteTextFocus = 'body' | 'excerpt'

/**
 * 卡片筛选（用户 2026-09-16 定：**单按钮三态循环** 批註 → 劃線 → 全部，默认 `annotated`）。
 *
 * ⚠ **判据是 `body` 是否为空，不是 `kind`** —— 二者在实现里**可以互相矛盾**，两个方向都有真实路径：
 * - `kind='highlight'` **可能带 body**：划完线再点它补写批注 → `updateNote(id, { body })`
 *   （`ReaderFeature` 的 `saveAnnotation`）→ 用户 2026-09-16 明确："**画完线后补 body，那这就是批注，很显然**"；
 * - `kind='note'` **可能 body 为空**：「加批註」后没写字就回车 —— `NoteComposer` 明确允许空串
 *   （"空串 = 清空批注正文，允许"）→ `createMark(..., 'note', '')`。
 * 按 `kind` 分组会把这两类都分错（正是 `NoteKind` 已记档的"标签取决于历史"坏模型）；
 * 与已记档的收敛口径一致：**呈现只按有无 `body` 区分**。
 */
export type NoteFilter = 'annotated' | 'highlight' | 'all'

/** 笔记管理设置（持久化于**全局** `settings` 表的 `noteSettings` 键 —— 设置一律全局，D9） */
export interface NoteSettings {
  view: NoteView
  filter: NoteFilter
  /** 卡片文字主次（默认 `body` = 批註為主） */
  textFocus: NoteTextFocus
  /** 作用域：当前库 / 全部库（**默认当前库**，用户 2026-09-16 定） */
  scope: 'library' | 'all'
}

/** 聊天消息（v0.1.5 起 server 支持；追加日志模型，历史经 REST 拉取） */
export interface ChatMessage {
  /** server 分配（追加序号） */
  id: number
  roomId: string
  /** 发送者成员 token */
  member: string
  /** 发送时昵称快照 */
  nick: string
  text: string
  /** unix 秒 */
  createdAt: number
}

/** 房间成员（presence / join-ack 内；location 缺省 = 尚无位置） */
export interface RoomMember {
  id: string
  nickName: string
  location?: BookLocation
  isMe?: boolean
}

export interface RoomState {
  roomId: string
  /** 服务端书籍注册表 id（标定通过后返回） */
  bookId?: string
  members: RoomMember[]
  currentLocation: BookLocation | null
}

export interface SystemMessage {
  text: string
  type: 'join' | 'leave' | 'info' | 'error'
}

export type JoinResult =
  | { ok: true; room: RoomState }
  | { ok: false; reason: 'book-mismatch' | 'room-not-found' | 'room-full' | 'server-error' }

/**
 * 消息信封：传输层只搬运信封，不理解语义 —— 语义由上层用例解释。
 * type 枚举见 server/docs/API.md（消息类型清单）。
 */
export interface MessageEnvelope {
  type: string
  payload: unknown
}

export type ConnectionState = 'connected' | 'disconnected' | 'reconnecting'

/** 服务器连接配置（客户端 → 服务器）。v0.2.1 修订：补 accessToken / memberToken（token 双闸）。 */
export interface NetConfig {
  /** http(s)://host:port（REST 基址；WS 由此派生 ws(s)://host:port/ws） */
  serverUrl: string
  /** 第 2 层准入门禁（X-Turead-Access） */
  accessToken: string
  /** 成员 token（服务端签发，POST /auth/token 获取；缺省 = 由适配器申请/复用） */
  memberToken?: string
  nickName: string
  transport?: 'websocket'
}

/** 房间列表项（GET /rooms，server/docs/API.md RoomInfo） */
export interface RoomInfo {
  roomId: string
  editionId: number
  title: string
  ext: string
  ownerNick: string
  memberCount: number
  /** unix 秒 */
  createdAt: number
}

/** 电子版（server/docs/API.md Edition 完整字段；source/url 可选；createdAt 为 RFC3339 字符串） */
export interface Edition {
  id: number
  workId: number
  ext: string
  hashAlgo: string
  hash: string
  size: number
  source?: string
  url?: string
  localCopy: boolean
  filePath: string
  /** RFC3339 字符串（注意：与 RoomInfo/ChatMessage 的 unix 秒不同） */
  createdAt: string
}

/** room.join-ack 的 payload（reason 仅失败时有；edition/members 成功时有） */
export interface JoinAck {
  ok: boolean
  reason?: 'book-mismatch' | 'room-not-found' | 'room-full' | 'bad payload'
  roomId?: string
  edition?: Edition
  members?: RoomMember[]
}

/** POST /auth/token 响应（v0.1.6 服务端签发成员 token） */
export interface TokenResponse {
  token: string
  /** true=新签发，false=复用 */
  issued: boolean
}

/** 统一错误响应（所有非 2xx） */
export interface ApiError {
  error: string
}
