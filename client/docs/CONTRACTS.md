# 客户端契约（Client Contracts v0.2）

> 状态：契约 v0.2（区分 **能力服务** 与 **应用服务（用例）** 两层）。
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

/** 本地书库条目 */
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
}

/** 书库视图（v0.2.6）：瀑布流因缩略图统一比例并入网格，见 FEATURES §10 */
type LibraryView = 'list' | 'grid';

/** 书库设置（持久化于 config.json 的 librarySettings 键） */
interface LibrarySettings { view: LibraryView }

/** 阅读渲染配置（领域层友好配置，适配器内部翻译为 kookit config） */
interface RenderOptions {
  readerMode: 'single' | 'double' | 'scroll';
  animation: 'sliding' | 'mimical' | 'none';
  fontSize?: number;
  lineHeight?: number;
  fontFamily?: string;
  theme?: 'light' | 'sepia' | 'dark' | 'custom';
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

/** 笔记/划线（v1 可选实现，接口先立；range 为格式相关序列化，与 kookit 对齐） */
interface Note {
  key: string;
  bookId: string;
  location: BookLocation;
  range: string;             // 格式相关：EPUB→CFI，PDF→页码+坐标，等
  color: string;
  text: string;              // 选中文本
  notes?: string;
  createdAt: number;
  updatedAt: number;
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
}

interface IRenderService extends EventEmitter<RenderServiceEvents> {
  open(record: BookRecord, options?: RenderOptions): Promise<void>;
  close(): Promise<void>;
  renderTo(element: HTMLElement): Promise<void>;
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
  createNote(note: Note): Promise<void>;
  removeNote(key: string): Promise<void>;
  renderHighlighters(notes: Note[]): Promise<void>;
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

```ts
interface ILibraryStore {
  addBook(record: BookRecord): Promise<void>;
  updateBook(id: string, patch: Partial<BookRecord>): Promise<void>;
  getBook(id: string): Promise<BookRecord | null>;
  listBooks(): Promise<BookRecord[]>;
  removeBook(id: string): Promise<void>;
  getSetting<T>(key: string, fallback: T): Promise<T>;
  setSetting(key: string, value: unknown): Promise<void>;
  /** v0.2.6：封面缩略图落盘（返回文件名 → 存入 BookRecord.coverPath）；字节不进 library.json */
  setCover(bookId: string, bytes: ArrayBuffer, ext: string): Promise<string>;
  getCover(bookId: string): Promise<ArrayBuffer | null>;
  removeCover(bookId: string): Promise<void>;
}
```

> 实现建议：Electron 下 `better-sqlite3`（koodo-reader 同款）；接口保持存储无关。
> **v0.2.6 存储布局**：主进程实现把数据拆成两个 JSON —— `library.json`（只放书，带 `version`）与
> `config.json`（只放设置）—— 因为两者写频率差三个数量级（阅读中每 2s 写位置 vs 用户偶尔改设置）。
> 封面字节写 `userData/covers/<bookId>.<ext>`（缩略图，渲染进程 canvas 生成，见 §4.1）。

### 4.5 IBookPicker —— 本地文件能力（v0.2.6 新增；适配器：Electron 对话框 + fs）

```ts
interface IBookPicker {
  pickFiles(): Promise<string[]>;             // 系统对话框选多个文件；取消 → []
  pickDirectory(): Promise<string | null>;    // 系统对话框选一个目录；取消 → null
  listEbooks(dir: string): Promise<string[]>; // 目录下**直接**子项的电子书（不递归，扩展名过滤）
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
}

interface ImportResult {
  book: BookRecord;
  reused: boolean;   // true = 指纹命中已有条目（未新增）
}
```

> `importBook` 是导入**用例**：编排 `IBookIdentityService`（指纹+元数据）与 `ILibraryStore`（持久化）；
> OCR 提 ISBN 是**可插拔步骤**（候选 `IOcrService`，适配器可复用 PP-OCRv5 技术路线，MIT）。

## 6. 服务装配（ServiceContainer）

```ts
interface ServiceContainer {
  // 能力服务
  render: IRenderService;
  net: INetService;
  identity: IBookIdentityService;
  store: ILibraryStore;
  // 应用服务（用例）
  room: IRoomSession;
  books: IBookService;
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
| v0.2.5 | 2026-09-08 | **本地阅读器修复批（v0.1.7）**：`IBookService.importBook` 返回 `ImportResult{book,reused}`（去重用例自述结果，删除 UI 侧 id 快照反推）；`isZeroLocation` 判据补 `chapterHref`（首章首块不再被误判为零位置，compare/anchor 对"书的开头"恢复有效）；`extractMetadata` 签名补 `name`（文档与实现对齐） |
| v0.2.4 | 2026-09-08 | **远端位置派生修约**：`location-updated` 事件由 `room.presence` 全量快照 diff 派生（此前声明但从不触发 = 死端口）；网络载荷位置进域层先归一、比较走 `sameLocation`；订阅生命周期分构造期(net)/join 期(render)，`leaveRoom` 只解绑 join 期 → 修 leaveRoom 误解绑 P1（v0.1.3 遗留） |
| v0.2.3 | 2026-09-08 | **目录跳转（本地阅读 MVP）**：领域 `Chapter` 增加 `chapterDocIndex`（目录项起始渲染节号，= BookLocation.chapterDocIndex 同标尺，PDF=页码）；`IRenderService` 增加 `goToChapter(chapterDocIndex)`（目录跳转原语） |
| v0.2.2 | 2026-09-07 | **定位系统立约（§2.1）**：`BookLocation` 字段三级角色（key/hint/display）+ 标准原语收拢进 `core/domain/location.ts`；`chapterDocIndex` 收窄为 `number`（kookit string 形态止步适配层，遗留数据由 `normalizeLocation` 边界容错）；修正 `count`/`page` 错误注释。配套领域新增 `location.ts`（纯函数，零依赖） |
| v0.2.1 | 2026-08-31 | 契约先行补 REST 传输缺口（client v1 骨架落地时）：`INetService` 增加 `request()`（REST，自带 token 双闸头）与 `getMemberId()`；`NetConfig` 增加 `accessToken` / `memberToken`（token 双闸，见 `server/docs/API.md` 认证），`serverUrl` 统一为 http(s) 基址；`IRoomSession` 增加 `createRoom` / `uploadBookCopy` / `listRooms`（对应 REST：POST /rooms、POST /books/{id}/file、GET /rooms）；领域层增加 `RoomInfo`（GET /rooms 列表项，wire 形状见 `server/docs/API.md`）。变更方向：只增不改，端口仍"只搬运不解语义" |
