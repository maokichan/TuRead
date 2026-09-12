# 客户端数据建模（DATA MODEL）

> **目的**：数据持久化立项（2026-09-12 用户定为主要目标）的建模底稿——笔记 / 书籍 / 索引容器
> 三实体的领域建模与库设计，与 server 表设计（`server/internal/store/schema.sql` v5）对齐。
> **性质**：设计提案，**待用户批复后实施**；批复的结论回写 `CONTRACTS.md` 并删除本文的"开放问题"节。
> **存储分层已批复（STATUS §3）**：书库/阅读状态 = 单一 JSON 文件（可携带、一份文件 = 一份书库）；
> 笔记/标注 = SQLite（预期上万条）；远期所有数据以服务器同步为准。

---

## 1. 存储物理分层（三个真相来源）

| 层 | 载体 | 内容 | 生命周期 |
|---|---|---|---|
| **库文件** | `library.json`（+ `config.json`） | 书籍索引（BookRecord）、阅读状态、**索引容器**、导入来源 | 用户可携带/手工管理；一份文件 = 一份书库 |
| **笔记库** | `notes.db`（SQLite，**新建**） | 笔记/划线/书签（预期上万） | 与库文件**成对**（同目录、同名前缀）；迁移书库 = 两个文件一起走 |
| **服务器** | server SQLite（works/editions/rooms/messages/users） | 作品/电子版登记、房间、聊天、用户档案 | 远期**一切数据同步**的最终真相；本地层是它的缓存/镜像 |

配对约定：`<name>.library.json` + `<name>.notes.db`（现名 `library.json` 迁移时保持兼容，
notes.db 放同目录）。**为什么笔记不进 JSON**：上万条 × 高频小写，全量重写扛不住（批复原文）；
**为什么容器不进 SQLite**：容器是"信息管理"（低频、结构化、要可读可携带），且用户批复明确
"一份数据对应一份书库"。

---

## 2. 实体建模

### 2.1 Book（书籍索引）——JSON 侧，现有 `BookRecord` 为主

现状已够：`id`(uuid) / `fingerprint{algorithm,hash,size}` / `metadata{title,...}` / `format` /
`filePath` / `createdAt` / `lastReadAt?` / `lastLocation?` / `coverPath?` / `coverFailed?`。

**与 server 的对齐（关键结论）**：`BookFingerprint{algorithm,hash,size} + format(ext)` 与 server
`editions` 的唯一键 `(hash_algo, ext, hash, size)` **逐字段对齐**——本地一本书 ≙ server 一条
edition（自然支持未来"加入房间时按指纹标定"，无字段改造）。缺的只有 **Work 层**：
`metadata.isbn` 字段已预留（二级匹配不强制）；"标准化"立项（TODO）补 `WorkIdentity{protocol,code}`
后，本地即可反查 server `works(protocol,code)`。**本期不改 BookRecord 结构**。

### 2.2 Note（笔记/划线/书签）——SQLite 侧，新建

领域契约已有 `Note`（`domain/types.ts`：key/bookId/location/range/color/text/notes?/createdAt/updatedAt），
建模不变，落库形状：

```sql
-- notes.db schema v1（草案）
CREATE TABLE notes (
    id          TEXT PRIMARY KEY,      -- = Note.key（客户端 uuid 生成；同步友好，不依赖自增）
    book_id     TEXT NOT NULL,         -- BookRecord.id（本地索引）；跨设备解析见 §4
    kind        TEXT NOT NULL DEFAULT 'highlight',  -- 'highlight' | 'note' | 'bookmark'
    -- 位置锚定 = 定位系统（CONTRACTS §2.1 key/hint 两级；display 不落库、呈现时算）
    loc_chapter_index INTEGER NOT NULL, -- BookLocation.chapterDocIndex
    loc_key     TEXT NOT NULL,          -- 文本锚点（按格式：EPUB→CFIRange；PDF→页+偏移；TXT→章+字符偏移）
    loc_hint    TEXT NOT NULL DEFAULT '', -- 锚点失效时的降级展示（章节名/摘句）
    color       TEXT NOT NULL DEFAULT '',
    excerpt     TEXT NOT NULL DEFAULT '', -- 划线原文（Note.text）——检索与"重锚"的依据
    body        TEXT NOT NULL DEFAULT '', -- 笔记正文（Note.notes；kookit 期望数组的转换在适配器做，见 P3）
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_notes_book ON notes(book_id, loc_chapter_index);
-- 远期：CREATE VIRTUAL TABLE notes_fts USING fts5(excerpt, body);（全文检索，v2 再说）
```

设计取舍：
- **id 用 uuid 不用自增**：远期服务器同步时客户端可离线创建、无主键冲突。
- **excerpt 必存**：设备/文件移动后 `loc_key` 可能失配，摘句是"重锚"（在同一本书里按文本搜索
  重新定位）与列表展示的兜底依据——Perusall 式"锚定选区"纪律（LANDSCAPE §3.3）。
- **kind 枚举收拢**：高亮/笔记/书签一张表（书签 = 无摘录无正文的 kind）。
- 依附关系：`book_id` 悬挂（书被移除索引）→ 级联删（与 server messages 随房间删除同款语义）。

**锚定抽象的现状（2026-09-12 用户问，摸底结论）**：
- **已抽象**：`BookLocation`（定位系统，CONTRACTS §2.1——key/hint/display 三级 + domain/location.ts
  归一/比较原语）+ `IRenderService` 笔记三原语（`createNote/removeNote/renderHighlighters`）
  + `search(keyword)`（**返回形状待定**，CONTRACTS §7）。控制器（UI）调用的是这些端口，**不见 kookit**。
- **未抽象**：`Note.range` / 本表 `loc_key` 的**编码格式**目前是"引擎选区产物原样存储"（EPUB→CFI 等），
  没有按格式立规范——即"CFI 有引擎内实现（kookit `libs/cfi.ts`），但没有一个跨格式的锚点接口约定"。
  **本表把 `loc_key` 定为不透明字符串（适配器生成/解释），格式规范随笔记实现时逐格式立约**
  （第一批只需要 EPUB-CFI 与 PDF 页锚两种）。
- **不同格式标记的差异**收敛在 `loc_key` 的编码差异里：EPUB=CFI（重排安全）、PDF=页码+页面内
  归一化坐标（版式固定）、TXT=章索引+字符偏移（kookit 分章后天然稳定）。上层不解释，重锚由
  适配器按各自格式实现。

**墨迹/手写（数位板画的内容，2026-09-12 用户问）——`kind='ink'` 扩展**：

```sql
ALTER TABLE notes ADD COLUMN ink TEXT;  -- 仅 kind='ink' 使用；JSON 编码：
-- { "pageKey": "<loc_key 同源>", "strokes": [
--     { "color": "red", "width": 2.0,
--       "points": [[x,y],[x,y],...] }   -- 归一化坐标（0..1，相对页/版面），与分辨率无关
-- ] }
```

- **矢量优先**：归一化点列（相对页面比例）而非位图——体积小、任意缩放重渲、主题无关；
  复杂印章/图形可回落 `kind='image'` + 字节走 covers 同款旁路存储（`inks/<noteId>.png`，行内只存引用）。
- **适用边界**：墨迹只在**版式固定**的载体上稳定（PDF/漫画/EPUB 固定版式）——重排流式正文没有
  稳定几何，EPUB 流内不做墨迹（注册为产品约束）。
- 端口：`IRenderService` 增 `renderInks(notes)`（适配器在页 canvas 之上叠一层绘制），交互层
  （笔刷选择/压感）属于阅读器功能，建模层面只关心 points 序列。

### 2.2.1 跨格式锚点：可行且必要——但统一的是**接口**，不是编码（2026-09-12 判断）

**必要性（为什么要有）**：共读同步、笔记划线、TTS、搜索跳转全都站在"位置"上，而位置有两级——
`BookLocation`（进度级：读到哪一章哪一屏，CONTRACTS §2.1 已立）解决不了**文本内选区**（划线从哪
个字到哪个字）。没有选区级抽象，每个消费方（同步对端、重锚、TTS 高亮）都要自己解释 `range` 串
= 各处自行解释的腐化（与定位系统立约前同类病）。

**可行性（能不能做到）**：能。三种格式的选区都可以表达为"章节内定序坐标"——
- EPUB：kookit 内建 CFI（`libs/cfi.ts`），CFI ↔ DOM 位置可互转，字符偏移可导出；
- PDF：文本层（pdfjs getTextContent）给选区 = 页码 + 页内归一化坐标；
- TXT：分章后字符偏移天然稳定（分章规则固定，LANDSCAPE 无关）。

**但统一的边界要划清楚（关键判断）**：
- **统一 = 抽象接口**：`TextAnchor` 原语集——`fromSelection()`（选区→锚）/ `resolveToView()`（锚→
  高亮位置）/ `compare()`（锚间排序，同步冲突合并与"跳到下一条笔记"需要）/ `remeasure()`（重锚：
  文件变化后按 excerpt 找新位置）/ `display()`（降级展示）。接口立在上层可依赖的契约里。
- **不统一 = 编码**：锚点串是**不透明字符串，适配器生成/解释**（EPUB 存 CFI、PDF 存页+坐标、
  TXT 存偏移）。强行统一编码（比如全用 CFI）对 PDF/TXT 毫无意义且丢失信息；强行全用字符偏移
  则 EPUB 重排下漂移。**同步场景不需要统一编码**：对端拿到的是**同一 edition**（指纹标定保证），
  同一解释器解同一串——同步传的只是串 + fingerprint。

**落点**：`core/domain/anchor.ts`（接口 + 语义类型）——定位系统 §2.1 的姊妹篇；实现散在适配器
（第一批只做 EPUB-CFI 与 PDF 页锚）。UI/同步/笔记只认 `TextAnchor` 接口。

### 2.2.2 Note 领域实体 v2 提案（2026-09-12：实体在领域层补齐讨论）

现有 `domain/types.ts` 的 `Note` 是**存储形状**（key/location/range/color/text/notes?），不是
讨论过的实体——kind 缺失、`notes?: string` 形状未决（P3：kookit 要数组）、墨迹无处安放。提案：

```ts
export type NoteKind = 'highlight' | 'note' | 'bookmark' | 'ink'
/** 选区锚（原 location + range 两字段收敛；key = 不透明锚串，见 §2.2.1） */
export interface NoteAnchor {
  chapterIndex: number      // = BookLocation.chapterDocIndex
  key: string               // 不透明锚串（适配器编码/解释）
  hint?: string             // 降级展示（章节名/摘句）
}
/** 语义色名（不是 hex！UI 按当前主题 token 渲染——四主题下都可读，开放问题 3 的答案） */
export type NoteColorName = 'red' | 'yellow' | 'green' | 'blue'
/** 墨迹笔画：归一化坐标（0..1 相对页面），与分辨率/缩放无关 */
export interface InkStroke {
  color: NoteColorName
  width: number             // 相对笔宽（页面宽度的千分比）
  points: [number, number][]// 已抽稀（写入时 ~0.5px 精度简化，开放问题 6）
}
export interface Note {
  id: string                // uuid（原 key 改名；尚未落库，无迁移成本；同步主键）
  bookId: string
  kind: NoteKind
  anchor: NoteAnchor
  color?: NoteColorName
  excerpt?: string          // kind=highlight 的划线原文（重锚依据，必存）
  body?: string             // kind=note 的正文
  ink?: InkStroke[]         // kind=ink 的笔画序列
  createdAt: number
  updatedAt: number
}
```

讨论记录：
- **`location` 与 `anchor` 是两个语义**："读到哪"（进度，BookLocation）vs "标在哪"（选区，
  NoteAnchor）——同族不同物；Note 只要后者。此前 Note 里放完整 `BookLocation` 是过度建模
  （把进度字段摊进笔记）。
- **书签 = kind 枚举一员**（无摘录无正文），不再单列存储（开放问题 4 的答案）。
- **颜色存语义名**：把"四主题下都可读"的责任交给渲染层映射，数据库里没有 hex。
- **SQLite 列与实体映射**：kind/anchor(loc_chapter_index+loc_key+loc_hint)/color/excerpt/body/ink
  （ink 列存 InkStroke[] 的 JSON）——§2.2 的 DDL 微调：color 存语义名，ink 列类型不变。
- `key→id` 改名 + `notes?:string→body?` + `location/range→anchor` 是**破坏性形状变更**：
  笔记尚未落库、`createNote` 适配器尚未实装（三原语只有签名），现在改零成本——**趁没有数据，先定对**。

### 2.2.3 墨迹 vs 划线：差异在哪、开销多大（2026-09-12 用户问）

**本质差异**：划线锚在**内容流**上——重排安全的文字区间，摘句可重锚，渲染由布局引擎完成
（DOM 高亮 span，零额外几何存储）。墨迹锚在**几何画布**上——脱离版式坐标就无意义，几何自己
就是数据。所以"为什么划线能进流式正文而墨迹不能"：划线的地址是**文字**（文字怎么排版都能找到），
墨迹的地址是**版面**（只有版式固定的载体才有稳定版面）。

**开销核算（版式固定载体上）**：
- **存储**：数位板采样 ~120-200Hz；一笔 2 秒 ≈ 240-400 点，每点 `[x,y]` 归一化后 JSON ≈ 12-16 字节
  → 一笔 3-6KB；一页十笔 30-60KB；一本书 300 页画满 ≈ 10-20MB（SQLite 单行几十 KB 无压力，
  全书规模也就一张封面的位图体积）。**抽稀后（写入时 RDP 简化到 ~0.5px）再降 60-70%**。
- **渲染（真正的开销所在）**：翻到某页 = 底图（pdf.js）+ 墨迹覆盖层重绘 N 笔 × 数百点的
  canvas path——实测经验量级 <5ms/页，无感；**风险在连续滚动/缩放时全量重绘** → 对策三件套：
  按页懒加载（翻到才取）+ 覆盖层位图缓存（缩放失效重建）+ 写入抽稀。存储侧 SQLite 按
  `(book_id, loc_chapter_index)` 索引天然支持"取本页墨迹"。
- **同步体积**：一笔几 KB 的 JSON 随 note 信封走完全没问题（对比：一张截图位图 500KB 起）。

### 2.3 Collection（索引容器）——JSON 侧，新建（双索引形态，2026-09-12 用户定）

```jsonc
// library.json 顶层新增（version 1 → 2，JsonStore 已有 version + 迁移惯例）
{
  "version": 2,
  "books": [ /* BookRecord 不变 */ ],
  "containers": [
    // ① 真实路径总容器：承载用户配置的所有文件夹路径（= 导入来源的显式化）
    { "id": "u1", "kind": "source", "name": "導入來源",
      "paths": ["D:\\Books", "E:\\Papers"] },
    // ② 虚拟映射容器：用户自建层级树；条目 = bookId 引用（不是拷贝）
    { "id": "v1", "parentId": null, "kind": "virtual", "name": "哲學",
      "bookRefs": ["b1", "b7"] },
    { "id": "v2", "parentId": "v1", "kind": "virtual", "name": "德國觀念論",
      "bookRefs": ["b3"] }
  ]
}
```

建模要点：
- **树用 `parentId` 单亲**（一对多足够；多亲 = 一本书挂多个容器，用 bookRefs 天然满足，不需要 DAG）。
- **一本书可同时入多个虚拟容器**（引用模型）；未入任何容器的书仍出现在书库全览（现有视图 = 全集）。
- **真实路径容器不存书的清单**——它按路径动态派生（filePath 前缀匹配），路径即索引，永不悬挂。
- 虚拟容器的 `bookRefs` 悬挂（书被移除）→ 载入时静默清理 + 去重。
- 排序：容器内 `bookRefs` 数组序即用户排序（拖拽排序的存储零成本）；容器间靠数组序。

**领域层建模（2026-09-12 补齐讨论——此前只有存储形状，没有实体与不变量）**：

```ts
// core/domain/collection.ts（提案，随容器功能落地时建文件）
export type CollectionKind = 'source' | 'virtual'

/** 真实路径容器：按路径前缀**动态派生**成员，永不悬挂（§2.3 第一条） */
export interface SourceContainer {
  id: string
  name: string
  paths: readonly string[]
}
/** 虚拟映射容器：用户自建树；成员 = bookId 引用（数组序 = 用户排序） */
export interface VirtualContainer {
  id: string
  parentId: string | null     // null = 根；单亲树（多亲需求由 bookRefs 多挂满足，不做 DAG）
  name: string
  bookRefs: string[]
  collapsed?: boolean         // UI 折叠态随数据走（跨设备一致）
}
export type Collection = SourceContainer | VirtualContainer

/** 领域原语（纯函数）：
 * resolveCollectionBooks(collections, books, id): BookRecord[]
 *   —— source = filePath 前缀匹配；virtual = bookRefs 并**递归子树**（点父容器看全集）
 * validateTree(collections): 拒环（parentId 链）、孤儿挂根（引用不存在的父）、引用去重
 */
```

**不变量（载入时校验/修复，存盘时保证）**：
1. parentId 链无环（校验失败 = 拒绝载入该 containers 块并备份，同 JsonStore 损坏惯例）；
2. bookRefs 悬挂（书已移除）→ 静默清理；同一容器内去重；
3. source 容器 paths 至少一条有效（无效路径保留但标记，UI 显示"来源缺失"）。

**与既有流程的关系（不新增概念）**：
- 现有列表/网格视图 = **全库视图**，永远存在，容器视图是它上面的过滤器——书不被容器"收容"也可见；
- 房间选书 = 从全览或容器视图选一本（选书流程不变，容器只是组织方式）；
- 视图状态（上次浏览的容器 / 折叠态）随数据走（virtual.collapsed）或进 config.json（上次位置）。

### 2.4 存取端口（六边形落点）

| 新端口 | 实现 | 备注 |
|---|---|---|
| `INoteStore` | 主进程 `SqliteNoteStore`（**better-sqlite3 需新引入**，MIT，同步 API，主进程单写者） | 事件：`notes-changed`（批量）供 UI 订阅 |
| `ILibraryStore` 扩展 | JsonStore 增 containers CRUD + version 2 迁移 | 悬挂清理在载入时做 |
| 既有 `IRenderService` 三原语 | 不变（createNote/renderHighlighters 按 RENDER_INTERFACE §5） | 适配器负责 Note↔kookit 形状转换（含 notes 数组问题，P3） |

打包注意：better-sqlite3 是原生模块 → `electron-builder.yml` 的 `npmRebuild: false` 需要重审
（发行包要带预编译二进制或改用 sql.js/wasm——**开放问题**，见 §4）。

---

## 3. 与 server 的同步对齐（远期，建模已预留）

| 本地 | server | 对齐方式 |
|---|---|---|
| `BookFingerprint+format` | `editions(hash_algo,ext,hash,size)` | 已逐字段对齐（§2.1） |
| `WorkIdentity{protocol,code}`（标准化立项） | `works(protocol,code)` | 已预留（metadata.isbn） |
| `Note`（uuid） | 未来 `notes` 表（**server 未建**） | 同步信封预留（`room.note`，API 转发规范）；server 立表时以 uuid 为主键合并 |
| 阅读状态 `lastLocation` | 房间 BookLocation 转发 | 已同构（定位系统） |

---

## 4. 开放问题（待用户批复后实施）

1. **notes.db 文件命名与配对**：`library.notes.db`（跟随库文件改名）？还是固定 `notes.db`？
   迁移书库 = 两个文件一起拷贝——需要隐式约定还是导出/导入功能把两件打包？
2. **better-sqlite3 vs sql.js（wasm）**：前者快、原生（但 `npmRebuild:false` 的发行包要带预编译
   二进制 + 逐 Electron 版本对齐）；后者零原生依赖、慢 5-10 倍（笔记场景大概率够用）。
   建议：**better-sqlite3 + 打包时单独特判 rebuild**，不行再退 sql.js。
3. **高亮颜色的建模**：自由色值 vs 预设枚举（与主题 token 联动，四主题下都可读）？建议预设枚举
   存语义名（'red'|'yellow'|'green'|'blue'），映射进各主题 token——避免把浅色 hex 写进深色主题。
4. **书签要不要进 notes 表**（kind=bookmark）还是独立轻量存储？建议进（同一套锚定与同步）。
5. **容器是否要支持"智能容器"**（按规则动态收录，如"未读 + 标签=哲学"）——远期，本期只做
   手动引用。
6. **墨迹的同步体积**：矢量点列可大（数位板高频采样）——同步前是否做抽稀（RDP 简化）？
   建议存储即抽稀（写入时简化到 ~0.5px 精度），原始笔迹不留。
7. **节拍（2026-09-12 用户定）**：数据持久化值得讨论的内容还很多，**不急于实施**——本文保持
   活文档，讨论增量直接补节；实施等建模讨论收敛、开放问题逐条批复后开工。
