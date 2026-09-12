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
