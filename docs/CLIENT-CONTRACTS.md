# 客户端服务契约（Client Contracts v0.1）

> 状态：**契约草案**。同步协议未定，本文定义客户端核心服务的 TypeScript 接口（端口），
> 作为协议未定前的第一份代码级契约。实现（适配器）后填。
> 范围：**仅 client**（server 为独立项目，其需遵守的契约以 `SyncService` 的事件/数据形状为准，后续另行成文）。
> 迁移：本节接口将 1:1 落到 `client/src/core/ports/*.ts`，文档与代码以代码为准。

---

## 1. 共享领域类型

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

/** 阅读渲染配置（领域层友好配置，内部翻译为 kookit config） */
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
  key: string;               // 全局唯一
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

## 2. 事件机制（服务通用）

```ts
type Listener = (...args: any[]) => void;
type Unsubscribe = () => void;

/** 所有服务的事件接口统一采用该形状 */
interface EventEmitter<Events extends Record<string, Listener>> {
  on<K extends keyof Events>(event: K, listener: Events[K]): Unsubscribe;
  off<K extends keyof Events>(event: K, listener: Events[K]): void;
}
```

## 3. IRenderService —— 渲染（适配器：kookit）

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
> 依赖：`open()` 需要 `BookRecord`（由 BookService 提供）与 `BookIdentityService` 无关；配置翻译在适配器内完成。

## 4. IBookService —— 书籍管理（书架）

```ts
interface IBookService {
  importBook(file: File | ArrayBuffer, name: string): Promise<BookRecord>;
  list(): Promise<BookRecord[]>;
  get(id: string): Promise<BookRecord | null>;
  remove(id: string): Promise<void>;
  updateLastLocation(id: string, location: BookLocation): Promise<void>;
}
```

> 依赖：内部组合 `BookIdentityService`（导入时算指纹/提元数据）与 `LibraryStore`（持久化）。
> 流程：导入 → 计算指纹 → 提取元数据 → 入库 → 返回 `BookRecord`。

## 5. IBookIdentityService —— 书籍标定

```ts
interface IBookIdentityService {
  computeFingerprint(buffer: ArrayBuffer): Promise<BookFingerprint>;
  extractMetadata(buffer: ArrayBuffer, format: BookFormat): Promise<BookMetadata>;
  verify(local: BookFingerprint, room: BookFingerprint): boolean;
}
```

> 指纹策略：部分哈希（参考 koodo-reader `getBookPartialMd5`：取文件头/分段样本计算 MD5，配合 size 降低碰撞）。
> 注意：kookit 的 `Book.md5` 字段由调用方计算后传入 —— 本服务即计算方。

## 6. ISyncService —— 房间同步（传输待定）

```ts
interface SyncServiceEvents {
  'location-updated': (location: BookLocation, from: RoomMember) => void;
  'presence-updated': (members: RoomMember[]) => void;
  'system-message': (msg: SystemMessage) => void;
  'connection-changed': (state: 'connected' | 'disconnected' | 'reconnecting') => void;
  'book-mismatch': (detail: { local: BookFingerprint; room: BookFingerprint }) => void;
}

interface ISyncService extends EventEmitter<SyncServiceEvents> {
  connect(config: SyncConfig): Promise<void>;
  disconnect(): Promise<void>;
  joinRoom(roomId: string, book: BookFingerprint): Promise<JoinResult>;
  leaveRoom(): Promise<void>;
  emitLocation(location: BookLocation): Promise<void>;
  // 后续：emitNote(note) / emitCursor(...)
}

interface SyncConfig {
  serverUrl: string;         // 协议未定：ws(s):// 或 http(s):// 由传输适配器解释
  nickName: string;
  transport?: 'websocket';   // 预留多传输
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

> 关键流程（客户端视角）：
> 1. `connect(config)` 建立传输（协议未定，先有接口）。
> 2. `joinRoom(roomId, bookFingerprint)` —— 服务端据此**标定**：比对房间绑定书籍指纹；
>    通过 → `{ ok: true, room }`；不一致 → `book-mismatch` 事件 + `{ ok: false, reason: 'book-mismatch' }`。
> 3. 翻页 → `emitLocation(location)`（节流）；他人翻页 → `location-updated` 事件。
> 4. 成员进出 → `presence-updated` / `system-message`。

## 7. ILibraryStore —— 本地持久化

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

## 8. 组合与依赖（服务装配）

```ts
interface ServiceContainer {
  render: IRenderService;
  books: IBookService;
  identity: IBookIdentityService;
  sync: ISyncService;
  store: ILibraryStore;
}
```

> 规则：
> - 服务之间通过构造函数注入依赖（如 `BookService(identity, store)`）。
> - **UI 只依赖 `ServiceContainer`，不直接 import kookit / better-sqlite3 / WebSocket 实现**。
> - 适配器目录约定：`client/src/core/adapters/{kookit,storage,net}`。

## 9. 待定 / 明确排除

- [ ] 同步协议消息集与传输（server 项目定，client 适配）
- [ ] `search()` 返回形状
- [ ] 笔记同步（v1 是否包含）
- [ ] 书架导入路径（本地文件 vs 服务器共享书库）
- [ ] 账号体系（游客昵称 vs 注册）→ 影响 `RoomMember.id` 语义
