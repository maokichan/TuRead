# 客户端契约（Client Contracts v0.2）

> 状态：契约草案 v0.2（根据评审重构：区分 **能力服务** 与 **应用服务（用例）** 两层）。
> 范围：**仅 client**。同步**协议**未定；本文定的是"层与接口"契约。
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
/** 阅读位置 —— 房间同步的最小载荷，与 kookit getPosition() 对齐 */
interface BookLocation {
  chapterDocIndex: number | string;
  chapterHref: string;
  count: number;            // scroll 模式下的滚动偏移
  page: number;             // 单页模式下的页内位置
  percentage: number;       // 全局进度 0 ~ 1
  text: string;             // 所在段落文本（跨端/跨版本定位兜底）
  chapterTitle?: string;
}

/** 书籍指纹 —— 标定"同一本书的同一电子版" */
interface BookFingerprint {
  algorithm: 'md5-partial-v1'; // 预留算法演进（如 v2 换 sha256）
  hash: string;                // 部分哈希值（hex）
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
}

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

/** 目录（TOC） */
interface Chapter {
  label: string;
  href: string;
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
```

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
  next(): Promise<void>;
  prev(): Promise<void>;
  goToPage(page: number): Promise<void>;
  goToPercentage(percentage: number): Promise<void>;
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

### 4.2 INetService —— 传输能力（**协议待定**，消息集由 server 项目定）

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
}

interface NetConfig {
  serverUrl: string;         // ws(s):// 或 http(s):// —— 由传输适配器解释
  nickName: string;
  transport?: 'websocket';   // 预留多传输
}
```

> 本服务**不假设任何业务语义**：不发"加入房间"命令、不懂"标定"——它只负责连接与收发信封。业务语义在用例层（§5.1）。

### 4.3 IBookIdentityService —— 书籍标定（指纹/元数据）

```ts
interface IBookIdentityService {
  computeFingerprint(buffer: ArrayBuffer): Promise<BookFingerprint>;
  extractMetadata(buffer: ArrayBuffer, format: BookFormat): Promise<BookMetadata>;
  verify(local: BookFingerprint, room: BookFingerprint): boolean;
}
```

> 指纹策略：部分哈希（参考 koodo-reader `getBookPartialMd5`：取文件头/分段样本计算 MD5，配合 size 降低碰撞）。
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
}
```

> 实现建议：Electron 下 `better-sqlite3`（koodo-reader 同款）；接口保持存储无关。

## 5. 应用服务（用例层）

### 5.1 IRoomSession —— 房间会话（同步业务逻辑本体）

```ts
interface RoomSessionEvents {
  'location-updated': (location: BookLocation, from: RoomMember) => void;
  'presence-updated': (members: RoomMember[]) => void;
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
  getRoomState(): RoomState | null;
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
3. 收到他人位置信封 → 解释为 `location-updated` 事件；`IRoomSession` 不自己翻页，翻页是 UI 的事（可将来加"跟随模式"开关）。

### 5.2 IBookService —— 书架 + 导入（应用服务）

```ts
interface IBookService {
  /** 导入：文件 → 指纹 → 元数据 → 入库（内部编排 identity + store；OCR 可选） */
  importBook(file: File | ArrayBuffer, name: string): Promise<BookRecord>;
  list(): Promise<BookRecord[]>;
  get(id: string): Promise<BookRecord | null>;
  remove(id: string): Promise<void>;
  updateLastLocation(id: string, location: BookLocation): Promise<void>;
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

- [ ] **同步协议消息集与传输细节**：`MessageEnvelope.type` 的具体值、标定流程的请求/响应 —— 由 server 项目定，client 适配（INetService 信封已为此预留）
- [ ] 笔记 / 划线同步：**明确排除在 v1 假设之外**（Note 类型先立，同步后续加）
- [ ] 光标在场（他人选中/阅读进度热区）：**明确排除在 v1 假设之外**
- [ ] 账号体系（游客昵称 vs 注册）→ 影响 `RoomMember.id` 语义
- [ ] `IRenderService.search()` 返回形状
- [ ] OCR（ISBN 提取）是否进 v1、`IOcrService` 接口草案
