# 客户端数据建模（DATA MODEL）

> **性质**：活文档。数据持久化（2026-09-12 立为当前主目标）的建模与库设计；
> 讨论增量直接补节，**实施待批复**；结论回写 `CONTRACTS.md`。
> 阅读顺序：§1 总构 → §2 schema → §3 实体与锚点 → §4 已批复 → §5 开放问题。

## 1. 存储总构（v2，2026-09-12 二次批复：统一 SQLite）

**单一 SQLite 库文件 = 一份书库**：书籍索引、阅读状态、书箱、笔记全在**一个 .db** 里。
JSON 的"单文件可携带"理由不成立——SQLite 本身就是单文件。JSON **退役为引导文件**。

```
<库目录>/
  <库名>.db          ← 一切书库数据（下 §2）
  covers/<bookId>.jpg ← 封面缩略图（跟随库目录，携带书库 = 拷目录）
config.json          ← 引导文件（极小，app 级）：已知库注册表 + 当前库路径 + 窗口状态
```

- **库路径可配置**（用户定）：引导文件里存路径（相对/绝对均可），给出即自动读取；
  UI 提供库管理（新建/切换/移除引用）。
- **多书库**（用户定"多书库是正确的"）：每个 .db = 独立书库，组织方式互不影响；
  每库**至少两种组织并存**——①真实路径的虚拟映射 ②纯书箱（见书箱建模）。
- 同一 filePath 可登记进多个库（引用模型，互不影响）。
- 封面现状（回答）：**走缩略图**——canvas 400px / JPEG q0.82 / 实测 20-40KB，`covers/<bookId>.jpg`，
  UI 读字节转 blob URL（内存缓存）。统一库后 covers 目录从 userData 移到**库目录**下。

**打包风险（实施前必解）**：better-sqlite3 是原生模块，`electron-builder.yml` 现 `npmRebuild: false`
——要么 per-ABI 预编译二进制随包，要么退 sql.js(wasm)。见开放问题 1。

## 2. schema v2（统一库，草案）

```sql
PRAGMA journal_mode = WAL;
-- 书（原 BookRecord 全量入表；阅读状态并入行）
CREATE TABLE books (
    id TEXT PRIMARY KEY,              -- uuid
    title TEXT NOT NULL, format TEXT NOT NULL,
    fp_algo TEXT NOT NULL, fp_hash TEXT NOT NULL, fp_size INTEGER NOT NULL,  -- ≙ editions 唯一键
    file_path TEXT NOT NULL,
    cover_path TEXT, cover_failed INTEGER NOT NULL DEFAULT 0,
    work_protocol TEXT, work_code TEXT,                  -- 标准化产出（可空）
    last_read_at INTEGER, last_location TEXT,            -- BookLocation JSON
    created_at INTEGER NOT NULL
);
-- 书箱（Collection 的产品标准名，用户定）——两种组织并存
CREATE TABLE containers (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES containers(id),  -- NULL = 根；单亲树
    kind TEXT NOT NULL,            -- 'source'（真实路径虚拟映射）| 'virtual'（纯书箱）
    name TEXT NOT NULL,
    paths TEXT,                    -- kind=source：JSON 数组
    collapsed INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE container_books (     -- 虚拟书箱的成员（引用非拷贝；数组序 = 用户排序）
    container_id TEXT NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    sort INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (container_id, book_id)
);
-- 笔记（kind 四枚举；书签入本表已批复）
CREATE TABLE notes (
    id TEXT PRIMARY KEY,           -- uuid（同步主键）
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    owner TEXT,                    -- 成员 token；本地笔记 NULL（同步上线后回填）——预留，功能后置
    kind TEXT NOT NULL,            -- 'highlight' | 'note' | 'bookmark' | 'ink'
    chapter_index INTEGER NOT NULL,
    anchor_key TEXT NOT NULL,      -- 不透明锚串（适配器编码/解释，§3.1）
    anchor_hint TEXT NOT NULL DEFAULT '',
    color TEXT,                    -- 语义名（red/yellow/green/blue），不是 hex
    excerpt TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    ink TEXT,                      -- kind=ink：InkStroke[] JSON
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX idx_notes_book ON notes(book_id, chapter_index);
CREATE INDEX idx_container_books_book ON container_books(book_id);
-- 库级设置（主题/阅读器参数随库走 → 携带书库 = 数据+外观全带）
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```

## 3. 实体与锚点（收束版）

**3.1 跨格式锚点（判断：可行且必要——统一接口，不统一编码）**
两级抽象：`BookLocation`（进度级，已立 §2.1 CONTRACTS）+ `TextAnchor`（选区级，**待立**
`core/domain/anchor.ts`）：接口 = fromSelection / resolveToView / **compare**（同步合并与跳转）
/ **remeasure**（重锚：按 excerpt 找新位置）/ display。编码是不透明字符串（EPUB=CFI、
PDF=页+归一化坐标、TXT=章+偏移），适配器生成/解释；**同步不需要统一编码**（指纹标定保证
对端同一 edition → 同一解释器）。kookit 有 CFI 实现（`libs/cfi.ts`），第一批只做 EPUB-CFI + PDF 页锚。

**3.2 Note 实体 v2（趁未落库定稿）**
`kind`('highlight'|'note'|'bookmark'|'ink') / `anchor{chapterIndex,key,hint}`（取代原
location+range——"读到哪"是进度语义、"标在哪"是选区语义，不同物）/ `color` 语义名
（UI 按主题 token 渲染，库内无 hex）/ `excerpt`（划线原文，重锚兜底）/ `body` / `ink` /
`owner`（可空预留）。`key→id` 改名、`notes?:string→body?`：破坏性变更零成本（无数据）。

**3.3 墨迹（kind='ink'）**
矢量笔画（归一化点列 + 语义色 + 相对笔宽）。**与划线的本质差异**：划线锚在内容流（重排安全、
渲染由布局引擎做）；墨迹锚在几何画布（脱离版面坐标无意义）→ 只进版式固定载体。
开销：存储一笔 3-6KB（抽稀后 -60%），整书 10-20MB 封面级体积，**SQLite 无压力**；
真开销在渲染（连续滚动/缩放全量重绘）→ 按页懒取 + 覆盖层位图缓存 + 写入抽稀，<5ms/页可达。

**3.4 书箱领域建模（原"容器"）**
`SourceContainer{paths[]}`（按路径前缀动态派生，永不悬挂）｜`VirtualContainer{parentId 单亲树,
bookRefs[] 引用（数组序=用户排序）}`。不变量：无环 / 悬挂引用静默清理 / 路径缺失标记。
原语（纯函数）：`resolveCollectionBooks`（source 前缀匹配；virtual 递归子树并集）、`validateTree`。
现有列表/网格 = 全库视图恒存，书箱是其上的过滤器；房间选书流程不变。

## 4. 已批复决定（2026-09-12）

| # | 决定 |
|---|---|
| 1 | 统一 SQLite 单库文件；JSON 退役为引导文件（库注册表/当前库路径/窗口状态） |
| 2 | 容器标准名 = **书箱**（代码标识 Collection 暂留，UI 文案用"书箱"） |
| 3 | 多书库：多 .db 文件 + 库管理（新建/切换/移除引用）；库路径可配置（引导文件指向即读） |
| 4 | 每库两种组织并存：真实路径虚拟映射 + 纯书箱 |
| 5 | 笔记带 `owner` 字段（建模预留，功能随同步上线；本地 NULL） |
| 6 | 书签进 note 表（kind='bookmark'） |
| 7 | 封面走缩略图（现状已实现），统一库后 covers 跟随库目录 |

## 5. 开放问题（待批复）

1. **better-sqlite3 vs sql.js**：打包链路验证（npmRebuild 特判 / 预编译 ABI 对齐）不成则退 wasm。
   建议先做"最小连通性 spike"（主进程开库 + 一张表 + 打包产物跑通）再全面铺开。
2. **迁移**：现有 userData 的 `library.json` → 新库 one-shot 迁移器（books/lastLocation/covers 平移）；
   config.json 降级为引导文件的字段取舍。
3. **高亮色的语义集合**是否就这四色（红黄绿蓝）？
4. **墨迹同步体积**：存储即抽稀（~0.5px）是否可接受，还是保留原始笔迹。
5. **书箱排序交互**：拖拽排序何时做（先数组序存储、UI 后补）。
