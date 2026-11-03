# 客户端数据建模（DATA MODEL）

> **性质**：活文档。数据持久化的建模与库设计；讨论增量直接补节；结论回写 `CONTRACTS.md`。
> 阅读顺序：§1 总构 → §2 schema → §3 实体与锚点 → §4 已批复 → §5 开放问题 → §6「书的身份」定案要点。
> §1/§2 按 §6 的定案实现为 v3（全局单库 + 书库降为组织模式），D1–D12 收编进 §4.2。**权威以 §1/§2/§4 为准**。

## 1. 存储总构（v3：全局单库 + 书库降为组织模式）

> 定案与理由见 §6；本节只写结论。

**全应用一个 SQLite 库 = 一份用户数据**：作品 / 电子版 / 收录 / 书库 / 书箱 / 笔记 / 阅读状态 / 设置
**全在一个 `.db`**。JSON 只作**引导文件**——"开哪个库"是鸡生蛋问题，必须留在库外。

```
<userData>/
  store.db               ← 一切数据（下 §2）；路径由引导文件指向，可配置
                         ⚠ **不能叫 `turead.db`**（旧版默认库的文件名）——同名会静默跳过建表，见 §2
  covers/<editionId>.jpg ← 封面缩略图（随库目录；携带 = 拷目录）
  plugins/<id>/          ← 官方插件（运行时文件夹；种子 = 应用首发资源，FEATURES §13 / CONTRACTS §9）
  config.json            ← 引导文件（极小，app 级）：{ version, dbPath, 窗口状态 }
```

- **书库（Library）= 组织模式，不是物理分区**（D2）：物理上"一库一文件"的划分**取消**；
  书库只回答"**哪些书以什么分类出现**"，其成员关系 = **收录**（holdings，§2）。
- **多书库仍在**（用户定"多书库是正确的"）：但同处一个 `.db`，与"每库一个文件"无关。
- **书库两种组织模式并存**（§6.2）：**映射库**（`mode='mapped'`，跟踪唯一真实文件夹）
  ＋ **自建库**（`mode='curated'`，空库起步、用户自建书箱树）。
- **同一内容可被多个书库收录**（holdings 多行）→ **跨库共享天然成立**：同一文件 = 同一指纹
  = 同一 edition 行（**不需要 work 也成立**；work 只管"不同文件但同一本书"，§6.1）。
- **笔记与阅读状态跨书库**（D3）：挂 **edition**，不挂书库。
- **封面是 edition 级**：canvas 400px / JPEG q0.82（实测 20-40KB）→ `covers/<editionId>.jpg`。
- **设置一律全局**（D9）：**没有库级设置**。插件私有键值走全局 settings 表（键 `plugin:<id>`），
  密钥保险库走 `plugin-secret:<id>:<name>`（密文落库，明文不出主进程）；插件本体在
  `plugins/<id>/`（**非数据库数据**，同 covers/）。
- **插件（官方，v1）**：运行时 = `<userData>/plugins/<id>/`，开发 = `client/plugins/<id>/`；
  契约 = `CONTRACTS.md` §9，功能 = `FEATURES.md` §13。
- **引导文件极小**（D1+D9 的推论）：库注册表进库、"当前库"是库内设置（`settings.currentLibraryId`）
  → `config.json` 只剩 `{ version, dbPath, 窗口状态 }`。

**打包（已验证）**：better-sqlite3@**12**（v13 无 electron prebuild），
`prebuild-install -r electron -t <electron 版本>` 取 Electron ABI 二进制 + `asarUnpack` 解出 .node ——
**dev 与打包产物双重验证通过**（Electron 主进程加载/WAL 文件库/重开持久化/328 行事务批量写 2-3ms；
spike 脚本 `src/main/dev/sqliteSpike.ts`，触发 `TUREAD_DEV_SQLITE=1`）。原生路线成立，**wasm 兜底不需要**。
⚠ 换 Electron 版本时须重跑 `npm run rebuild:sqlite`（v13 若恢复 electron prebuild 可升级）。

## 2. schema v3（已实施；实现 = `src/main/store/sqliteStore.ts`；迁移 = `src/main/store/migrate.ts`）

> **实现状态**：已落地 —— `SqliteStore` 拆表、`migrate.ts`（T1 旧 JSON / T2 多 `.db` 合并）、
> `ILibraryStore` 与 IPC/适配器换语义、`ScanService`（映射库扫描对账）、Work 活列、`edition_toc` 留位。
> 迁移夹具 = `src/main/dev/migrateFixture.ts`（dev-only，`TUREAD_DEV_MIGRATE=fixture|json|verify` 开关；
> **不给 `TUREAD_USER_DATA` 拒绝运行**，防夹具写进真实书库），可随时复验 T1/T2 全链路与二次启动幂等。
>
> ⚠ **全局库文件名不能是 `turead.db`**（用户实测踩过的阻塞级 bug，已修）：那是**旧版默认库**的文件名
> （旧 schema），同名会让 `CREATE TABLE IF NOT EXISTS` **静默跳过旧表**，随后新列索引以
> `no such column: library_id` 崩在启动路径上。现用 **`store.db`**，并加了**形状守卫**与
> "单库失败不阻断其余库、`failed` 可重试"的迁移纪律。夹具用真实的 `turead.db` 命名 +
> 变异测试（把 `DEFAULT_DB_NAME` 改回去 → 夹具立刻 FAIL）钉住这个坑。

> **相对 v2 的结构性变化**（定案见 §4.2/§6）：
> ① `books` 一表拆成 **`editions`**（= 原书行，全局唯一键 = 指纹）+ **身份分层的 `works`**；
> ② 新增 **`holdings`（收录）** 取代"每库一套 books"，书箱归属进 **`libraries`**；
> ③ `notes.book_id` → **`notes.edition_id`**（笔记跨库、不随条目消失）；
> ④ 阅读状态从 books 行里拆出 **`reading_state`** + 新增 **`reading_sessions`**（③ 阅读时间模型）；
> ⑤ `containers` 增 **`library_id`**、**去掉 `kind`/`paths`**（库级 mode 已表达"映射/自建"；
>    原 `kind='source'` 的行**从未被写入过** —— 映射库的层级是派生出来的，不是行）；
> ⑥ 新增 **`edition_toc`**（自建目录存储位；先留位不实现，功能见 TODO.md）；
> ⑦ `settings` 注释改为**全局**（无库级设置）。
> 另：`holdings.parent_path` 是为**映射库层级浏览的 SQL 侧过滤**而加的维护列
> （修掉 v2 的 `SELECT * FROM books` 全量再 JS 过滤，见 `TODO.md` 工程组规模条目）。

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ── 身份 L1：作品（Work）——"这是哪本书"。本次只留接口，不做完整标准化（D11/F9）──
CREATE TABLE works (
    id TEXT PRIMARY KEY,                    -- uuid
    protocol TEXT NOT NULL,                 -- 'isbn' | 'asin' | 'doi' | 'open-library' | 'content-hash-v1'
    code TEXT NOT NULL,                     -- 识别编码（isbn 含校验位）
    title TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    UNIQUE (protocol, code)
);

-- ── 身份 L2：电子版（Edition）——"这是哪个电子文件"。全局唯一键 = 指纹 ──
CREATE TABLE editions (
    id TEXT PRIMARY KEY,                    -- uuid（内部主键，稳定；notes/reading_state 引用它）
    work_id TEXT REFERENCES works(id) ON DELETE SET NULL,   -- 可空 = 尚未标准化
    fp_algo TEXT NOT NULL, fp_hash TEXT NOT NULL, fp_size INTEGER NOT NULL,
    format TEXT NOT NULL,
    title TEXT NOT NULL,                    -- metadata.title 的规范化投影
    metadata TEXT NOT NULL DEFAULT '{}',    -- 完整 BookMetadata JSON
    file_path TEXT NOT NULL,                -- 当前用于打开的真实路径（最后已知）
    cover_path TEXT, cover_failed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    UNIQUE (fp_algo, fp_hash, fp_size)      -- ← 内容身份：跨库共享的根
);

-- ── 组织：书库（Library）——组织模式，非物理分区（D2）──
CREATE TABLE libraries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mode TEXT NOT NULL,                     -- 'mapped'（映射库：跟踪真实文件夹）| 'curated'（自建库）
    root_path TEXT,                         -- mode='mapped'：跟踪的唯一真实文件夹
    sort INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

-- ── 组织：书箱（Container）——树在库内（v3 新增 library_id）──
CREATE TABLE containers (
    id TEXT PRIMARY KEY,
    library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES containers(id) ON DELETE CASCADE,   -- NULL = 库根
    name TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    collapsed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_containers_library ON containers(library_id, parent_id);

-- ── 收录（Holding）——"哪个书库里有这本书"（取代 v2 的"每库一套 books"）──
CREATE TABLE holdings (
    library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
    container_id TEXT REFERENCES containers(id) ON DELETE SET NULL,  -- NULL = 库根层（单亲归属）
    origin TEXT NOT NULL,                   -- 'scan'（映射库扫到）| 'import'（导入）
    path TEXT,                              -- 该库视角下的路径（映射库对账用）
    parent_path TEXT,                       -- path 的规范化父目录（层级浏览的 SQL 过滤列，写入时维护）
    missing INTEGER NOT NULL DEFAULT 0,      -- 来源缺失（映射库对账产物；不影响笔记）
    sort INTEGER NOT NULL DEFAULT 0,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (library_id, edition_id)     -- 同一库内同一电子版只收录一次
);
CREATE INDEX idx_holdings_level ON holdings(library_id, parent_path);
CREATE INDEX idx_holdings_edition ON holdings(edition_id);

-- ── 笔记（物理挂 edition；跨库共享、不随条目消失）──
CREATE TABLE notes (
    id TEXT PRIMARY KEY,                    -- uuid（同步主键）
    edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
    owner TEXT,                             -- 用户（登录后回填）；本机默认档案 = NULL（D10）
    kind TEXT NOT NULL,                     -- 'highlight' | 'note' | 'bookmark' | 'ink'
    chapter_index INTEGER NOT NULL,
    anchor_key TEXT NOT NULL,               -- 不透明锚串（适配器编码/解释，§3.1）
    anchor_hint TEXT NOT NULL DEFAULT '',
    color TEXT,                             -- 语义名（red/yellow/green/blue），不是 hex
    excerpt TEXT NOT NULL DEFAULT '',       -- = anchor.norm.quote.exact 的投影
    body TEXT NOT NULL DEFAULT '',          -- 用户批注正文（只有这里住批注内容）
    ink TEXT,                               -- kind=ink：InkStroke[] JSON
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX idx_notes_edition ON notes(edition_id, chapter_index);
CREATE INDEX idx_notes_updated ON notes(updated_at);   -- 跨书按时间列（§5 开放问题 6）
CREATE INDEX idx_notes_owner ON notes(owner);

-- ── 阅读状态（逐 edition；"按 work 汇总"是查询口径，不是存储口径，§6.1）──
CREATE TABLE reading_state (
    edition_id TEXT PRIMARY KEY REFERENCES editions(id) ON DELETE CASCADE,
    last_read_at INTEGER,
    last_location TEXT,                     -- BookLocation JSON（读回先过 normalizeLocation）
    total_read_ms INTEGER NOT NULL DEFAULT 0   -- 唯一写入口 = appendReadingSession（事务内累加）
);

-- ── 阅读会话（③ 阅读时间模型的落点：逐 edition 记原始会话；写入口径见下方注）──
CREATE TABLE reading_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
    owner TEXT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL
);
CREATE INDEX idx_sessions_edition ON reading_sessions(edition_id, started_at);

-- ── 自建目录存储位（目录是 edition 级数据，先留位不实现）──
CREATE TABLE edition_toc (
    edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
    origin TEXT NOT NULL,                   -- 'builtin'（引擎算出的快照）| 'user'（用户自建）
    payload TEXT NOT NULL,                  -- Chapter[] JSON（含 chapterDocIndex）
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (edition_id, origin)
);

-- ── 全局设置（D9：一律全局，没有库级设置）──
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- 迁移标记（key-value）：migrated_v3 = fresh | from-v2 | from-json | failed（failed 可重试），
-- 防"迁移后删光书 → 从留档复活"
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```

> **阅读时间口径（批1.24，用户定）**：写入路径 = 渲染层 `readSessionRecorder` → `appendReadingSession`
> （`total_read_ms` 的唯一写入口，同事务累加）。累计范围 = 阅读态（阅读器激活且开着书）；
> **失焦暂停**（blur 结段 / focus 开新段）、**边界落笔**（换书 / 关标签退阅读器 / 退 app：
> pagehide + beforeunload + visibilitychange 兜底；单段超 1h 强制结段）、**<10s 丢弃**（误开不算）；
> append-only、幂等。查询口径：`readMinutesByDay`（贡献图：本地时区归日、稀疏只含有会话的日子）/
> `topReadEditions`（Top 榜：`reading_state` 投影倒序、含迁移旧账、limit 夹在 1–50）。
> ⚠ 两口径不同：接入记录器前的旧账只在 `reading_state` 投影里，画不进按日格子。

## 3. 实体与锚点（收束版）

**3.1 跨格式锚点（判断：可行且必要——统一接口，不统一编码）**
两级抽象：`BookLocation`（进度级，CONTRACTS §2.1）+ `TextAnchor`（选区级 =
`core/domain/anchor.ts` + 领域类型；契约 CONTRACTS v0.3.9）：接口 =
fromSelection / resolveToView / **compare**（同步合并与跳转）/ **remeasure**（重锚：按 quote 找
新位置）/ display。编码是不透明字符串，适配器生成/解释；**同步不需要统一编码**（指纹标定保证
对端同一 edition → 同一解释器）。

> ⚠ **kookit 笔记链路的载荷 = rangy 字符范围，不是 CFI**（逆向核实；勿写成"EPUB=CFI"）：
> `getHightlightCoords()` = `rangy.getSelection(iframe).saveCharacterRanges(doc.body)[0]`，
> `createOneNote` / `renderHighlighters` 两条路径都做 `JSON.parse(item.range)`；
> vendored kookit 的 `libs/cfi` 存在但**笔记链路完全没用到**。故文字类载荷
> `engine='kookit-rangy'`（rangy 序列化的字符范围 JSON，doc.body 字符偏移）。
> 影响：字符偏移是**同 edition 同解析器内**的精确键（跨解析器版本可能漂移），
> 跨引擎/跨解析器一律靠 Norm 层重建（`remeasure`）——这正是两层结构的价值所在，不是缺陷。
> 首批范围（用户定）：**文字类优先，PDF 第二批**（PDF 是页+坐标的另一套载荷）。

**3.1.1 定位转换机制（已批复）**

参考 Readium 的中间表示思路：把各格式定位信息抽象掉，降低笔记层复杂度。
机制名 = **定位转换机制**；领域实体沿既定命名：进度级 = `BookLocation`，
选区级 = `TextAnchor`（统一锚点）。

- **两层结构**（关键决策：**统一信封 + 引擎原生载荷**，不做"通用定位语言"让引擎来回翻译——
  翻译有损会破坏选区 round-trip；Readium 同款取舍）：
  - **归一化层（Norm）**——跨格式可比的语义字段：`chapterIndex` / `progression`(0~1) /
    `quote{exact, prefix, suffix}`。**笔记层/存储/同步只看这层**；
  - **引擎载荷层（Fragment）**——`engine` 标识 + 不透明编码串（文字类 = kookit-rangy 串、
    PDF = 页+坐标一类；kookit 实际载荷见 §3.1 ⚠）。
    **只有适配器解释**；`anchor_key` 落库即本层串。
- **原语**（接口即机制，实现在适配器）：`fromSelection` / `resolveToView` / `compare` /
  `remeasure` / `display`。
- **换渲染内核的爆炸半径**：重写适配器的载荷生成/解释 + 跑一次 `remeasure` 迁移；
  **锚点实体、notes 表、笔记 UI、同步协议零改动**——"统一接口，不统一编码"的落地形态。

**已批复的三个细则**：
① **quote 的归属**：quote = 划线时刻的**书籍原文快照**（exact/prefix/suffix）——它本质是书的
   一部分，是**定位证据**，不是笔记内容 → **归锚点侧，不归 note 侧**。落库映射：quote.exact =
   notes 表 `excerpt` 列（列语义更正为"划线原文快照（锚点证据）"）；prefix/suffix 并入
   `anchor_hint`（JSON）。用户批注内容只住 `body` 列。
② **compare 次序：先 Fragment 后 Norm**——Fragment 相等 = 同一位置（同 edition 同引擎下
   权威精确、O(1) 串比较，直接判同）；Fragment 不等/缺失/跨引擎 → 降级 Norm
   （chapterIndex/progression 排序 + quote 相似度）做粗判与重锚选路，产出 strong/weak 强弱标注。
   先精确后模糊，避免文本比较的歧义成本污染精确路径。
③ 分层命名沿用 Norm / Fragment。

**3.2 Note 实体**
`kind`('highlight'|'note'|'bookmark'|'ink') / `anchor{chapterIndex,key,hint}`（"读到哪"是进度
语义、"标在哪"是选区语义，不同物）/ `color` 语义名（UI 按主题 token 渲染，库内无 hex）/
`body`（批注正文，只有这里住批注内容）/ `ink` / `owner`（可空预留）。
⚠ 领域类型**无 `excerpt` 字段**——notes 表 `excerpt` 列是 `anchor.norm.quote.exact` 的投影（§3.1.1 ①）。

**3.2.1 已定决策：「笔记/批注」= 「划线」（用户定，记档防反复）**

用户判定：**批注必然要有关联的划线**（"某一个笔记还是要关乎于某个内容的"），
并且**不做"纯批注"**（只有标记点、没有底色的形态）——"没有太多必要"。

**结论：它们不是两个东西。** 一条笔记 = **锚点（一段正文范围，必然有）+ 可选文字（`body`）**：
`body` 有值 ≈ 俗称"批注"，`body` 为空 ≈ 俗称"划线"，**同一个实体**。

由此推出两条本建模的修正方向（**代码尚未改**，用户定"概念先记档、具体修改另议"）：
① `kind` 的应然语义 = **载体类型**（承载方式真正不同者），**不是创建来路**；
② `'note'` 值**退役** —— 它与 `'highlight'` 的唯一差别是"怎么被创建的"，会造成
"先划线后补正文 = `highlight`、直接写批注 = `note`"这种**同内容两个名字**（标签取决于历史
而非当前状态）。`NoteKind` 收敛为 `highlight`（锚在正文范围——**当前唯一形态**）/
`bookmark`（标位置无文本范围）/ `ink`（几何画布墨迹）；呈现只按**有无 `body`** 区分。
详见 `CONTRACTS.md` §2 `NoteKind`（含收敛计划与迁移口径）。

**3.3 墨迹（kind='ink'）**
矢量笔画（归一化点列 + 语义色 + 相对笔宽）。**与划线的本质差异**：划线锚在内容流（重排安全、
渲染由布局引擎做）；墨迹锚在几何画布（脱离版面坐标无意义）→ 只进版式固定载体。
真开销在渲染（连续滚动/缩放全量重绘）→ 按页懒取 + **覆盖层位图缓存** + 写入抽稀。

> ⚠ **"覆盖层" = 墨迹的渲染优化手段**（把矢量笔画渲染成位图缓存层），**不是**自建一层覆盖渲染
> 来替换/接管正文渲染。架构分工见 `RENDER_INTERFACE.md` §1/§5：**正文排版与高亮的绘制都是
> kookit 的**（高亮 = **行内 span**，随重排自然对齐），我们只提供宿主容器 + 注入样式 + 调用
> 引擎原语。**只有墨迹将来需要我们自己画**（几何锚点，布局引擎管不了）——那时才轮到覆盖层。

**3.4 书箱（Container）**
树在库内：`containers.parent_id` 单亲（NULL = 库根层）；成员关系长在**收录**上
（`holdings.container_id`，单亲归属；NULL = 库根层）。不变量（`SqliteStore` 强制）：
移动目标是自己或自己的后代时拒绝（防成环）；有子书箱时拒删（先清空子级，防误删整棵子树）；
删箱后成员收录 `SET NULL` 归回库根层；删库级联箱与收录（edition / notes / reading_state 不动）。
⚠ `addHolding` 的 `container_id = null` = **未指定归属**（保持原值，不覆盖）——"移回根层"的
唯一入口是显式的 `moveHolding(..., null)`。

## 4. 已批复决定

### 4.1 数据持久化地基（已批复）

| # | 决定 | 状态 |
|---|---|---|
| 1 | 统一 SQLite 单库文件；JSON 退役为引导文件（库注册表/当前库路径/窗口状态） | ✅ 仍有效（v3 起**更进一步**：库注册表也进库，见 §4.2 D1/D9） |
| 2 | 容器标准名 = **书箱**（代码标识 = `containers` / `BookContainer`，UI 文案用"书箱"） | ✅ 仍有效 |
| 3 | 多书库：多 .db 文件 + 库管理（新建/切换/移除引用）；库路径可配置（引导文件指向即读） | ❌ **已废止**：物理分库取消，多书库同处一库 —— 见 §4.2 D1 |
| 4 | 每库两种组织并存：真实路径虚拟映射 + 纯书箱 | ✅ 语义不变，**术语改名**（映射库 `mapped` / 自建库 `curated`，§6.2） |
| 5 | 笔记带 `owner` 字段（建模预留，功能随同步上线；本地 NULL） | ✅ 仍有效（本地 NULL = **本机默认档案**，D10） |
| 6 | 书签进 note 表（kind='bookmark'） | ✅ 仍有效 |
| 7 | 封面走缩略图（现状已实现），统一库后 covers 跟随库目录 | ✅ 仍有效（v3 起封面是 **edition 级**） |

### 4.2 「书的身份」批复（完整理由与讨论见 §6）

> 本表是「书的身份」的**权威批复表**；§6 只留结论要点与待议项。

| # | 决定 |
|---|---|
| D1 | **物理上不再按书库分库**：全局一个统一数据库 + JSON 驱动的引导配置 |
| D2 | **书库 = 一种组织模式**（组织管理书的分类），进领域层；与书箱同级 |
| D3 | **笔记与用户产生的信息跨书库** |
| D4 | 身份规则：有 work 按 work、否则按指纹 —— ⚠ **经 D8/D11 细化**：**笔记挂 edition（各版一份）**；**阅读时间逐 edition 记录、按 work 汇总** |
| D5 | **虚拟映射**：移除 = 移除可见性；**不能在映射库"添加"书**；需要扫描/同步机制（**监听不作首选**） |
| D6 | **登录前应用必须可用**；登录是**升级**动作，带来状态转移，须显式设计 |
| D7 | **词汇标准化**（§6.2：收录 / 映射库 / 自建库；`mode: 'mapped' \| 'curated'`） |
| D8 | **笔记按 edition 各一份，不做自动迁移**；跨版搬运 = **用户主动动作**（Pro 候选，见 TODO.md） |
| D9 | **设置一律全局**（无库级设置） |
| D10 | **不假设多用户共用一台机器** → 本地数据 = 本机默认档案；登录 = **认领**；退出登录**不删**本地数据 |
| D11 | **本次不做完整标准化，但必须留出 Work 接口**（阅读时间按 work 汇总的前提） |
| D12 | **Pro 版 = 功能分层、非订阅**（捐赠走爱发电；服务器开源可自建）—— 见 TODO.md「产品与发行」 |

**登记待议（不阻塞实施）**：F3 孤儿 edition 的清理动作 · F5「全部书」顶层视角 · F6「导出库包」 ·
F10 Pro 功能边界（详见 §6.4）。

## 5. 开放问题（待批复）

> 第 6 条**已批复**（用户定）：v1 检索用 `LIKE` 子串、不引入 FTS5，范围 = 只搜笔记；
> 契约 = `CONTRACTS.md` §4.4 + 形态 = `FEATURES.md` §12。详见该条末尾。

1. ~~better-sqlite3 vs sql.js~~ **已解（spike 全绿，见 §1）**：走 better-sqlite3@12 原生 +
   prebuild（electron-v130 = Electron 33）+ asarUnpack。待办收敛为一件小事：新机器 `npm install`
   后须手动 `npm run rebuild:sqlite`（脚手架已备），不做 postinstall（失败会挂安装，且需代理）。
2. ~~迁移~~ **已落地**：`migrate.ts` 的 `runMigrations`（T1 旧 JSON / T2 多 `.db` 合并，§6.3）——
   **尽力而为**：坏文件跳过、单个旧库失败不阻断其余库；标记写 `meta.migrated_v3`
   （`failed` 可重试，成功前不覆盖旧引导文件）；旧文件改名 `*.migrated` 留档
   （回退旧版客户端即可还原）。
3. **高亮色的语义集合**是否就这四色（红黄绿蓝）？
4. **墨迹同步体积**：存储即抽稀（~0.5px）是否可接受，还是保留原始笔迹。
5. **书箱排序交互**：拖拽排序何时做（先数组序存储、UI 后补）。
6. **库级「笔记索引与管理」要不要引入倒查表？会影响实体层吗？**
   —— **不影响实体层**：`Note` 实体不变；倒查表/FTS5 属于**派生结构**（存储实现，
   藏在 `ILibraryStore` 后面，领域层与 usecase 看不见）。

   ---

   **✅ 批复（用户定；契约 = `CONTRACTS.md` §4.4 + 形态 = `FEATURES.md` §12）**

   - **范围 = 只搜笔记**：`excerpt`（划线的**书籍原文快照**）+ `body`（**批注正文**）。
     ⚠ **不搜书的全文** —— "书内搜索"归 `IRenderService.search`（「全局搜索接线」那条待办），
     "跨书库全文搜索"是另一个专题（要抽全书文本；**扫描版 PDF 没有文本层**，注定有一块搜不到）。
   - **机制 = v1 `LIKE '%q%'` 子串匹配**（`NoteQuery.text`），**不引入 FTS5**；
     检索是 `NoteQuery` 的一个筛选维度，**不另立 `searchNotes`** —— 将来换实现**签名与语义都不变**。
   - **读模型（已实现）**：`listAllNotes(NoteQuery)` / `countAllNotes(NoteQuery)`（同口径筛选与
     计数）。库作用域 = 该库**收录**范围内的 edition（`holdings` 的 EXISTS——笔记挂 edition、
     不挂库，同一 edition 被多库收录不重复出行）；「划线 / 批注」筛选判据 = `body` 是否为空，
     **不是 `kind`**（二者在实现里可矛盾，`NoteQuery.hasBody` / `NoteFilter`）。
   - **实测（Electron 的 better-sqlite3，SQLite 3.53.2，2000 条中文笔记）**：

     | 方案 | 中文子串命中 | 单次耗时 | 额外体积 | 落地成本 |
     |---|---|---|---|---|
     | `LIKE '%q%'` | ✅ 正确（句中也能中） | **0.32 ms** | 0 | **0**（无 schema、无迁移） |
     | FTS5 默认 `unicode61` | ❌ 同一批词**全 0 命中** | — | 比原文小 | 虚表 + 触发器 + 迁移 |
     | FTS5 `trigram` | ⚠ **≥3 字才中**（双字词落空） | 0.048 ms | **372 KB > 原文 312 KB**（索引比原文大） | 同上 + 分词器选择 |

     为什么默认分词器失效：`unicode61` 按"非字母数字"切词，而**汉字属字母类且中文无空格**
     → 一整串汉字被当成**一个 token**（`高级运动营养学第三章` 是一个词），查词中间的子串永不命中；
     连原样查也要写前缀 `高级运动营养学*` 才可能中。`trigram`（每 3 字符一项）恢复正确，
     但**查询串须 ≥3 字符** —— 中文双字词（营养/睡眠/训练）太常见，故**上了 FTS5 仍要保留 LIKE 兜底**。
   - **FTS5 换装条件**（满足其一再上，且**换装不动契约**；better-sqlite3 原生模块已含 FTS5 符号，
     换装不需新依赖）：① 笔记达到**万条量级**；② 需要**相关度排序**（`bm25`）或**片段高亮**
     （`snippet`）；③ 检索成为**主路径**而非附属筛选。换装时**必须**：用 `trigram` 分词器
     （默认分词器对中文失效）、对 <3 字查询**回落 LIKE**、给 `notes` 补增删改**同步触发器**
     （漏了 = 静默陈旧）。
   - ⚠ **两个会静默通过的坑（探针实测踩到，防重踩）**：
     ① `'rebuild'` 特殊命令**只对外部内容表（`content=`）生效** —— 对普通 FTS5 表执行**不报错、留下一张空表**，
     表现为"命中恒 0 + 耗时极低"，看着像"语法不支持"；
     ② 建 FTS 表之后**必须自检行数**（与 `notes` 行数相等）—— 否则上述空表**无人发现**。
   - **章标题**：**v1 不冗余存** —— 列表显示「**書名 · 節 N**」（跨书列表里书名才是有用的标签）；
     要显示章名时再定列（`notes.chapter_title`）与写入时机（打开书时从目录快照取），**存量行为空**。

---

## 6. 「书的身份」定案与沿革（要点）

> 三问（可见性与追踪 / 笔记身份 / 阅读时间模型）**本质同一问**：「虚拟映射下什么算同一本书」。
> **结论已全部落进 §1/§2/§4.2**，本节只留**结论要点 + 为什么这么定 + 已登记的待议项**。

### 6.1 定案要点（权威在 §4.2）

| 问题 | 结论 |
|---|---|
| 书库是什么 | **组织模式，不是物理分区** → 全应用**一个** SQLite 库；成员关系 = **收录**（`holdings`） |
| 笔记挂哪 | 挂 **edition**（= 内容指纹）。**同一文件跨库共享**（同一指纹 → 同一 edition 行，**不需要 work**） |
| 笔记要不要跨版合并 | **不要**：**各 edition 各一份**。共读会让用户**自然选出最好的那一版**，长期看不需要迁移 |
| 阅读时间挂哪 | **逐 edition 记录**，**按 work 汇总**（有 work 才跨版合并计时；无 work 退化为按文件） |
| 映射库的"移除" | **只移除可见性**：删收录，**不动真实文件、不动笔记与阅读状态**；文件回来书自动重现 |
| 映射库能不能加书 | **不能**（只能在真实路径上加）→ 入口是**扫描对账**，不是导入；**不做 `fs.watch`**（开销不更低，且与"不管理源文件"张力最大） |
| 设置作用域 | **一律全局**（"使用者是用户，而不是库"），**没有库级设置** |
| 登录边界 | **登录前必须可用**；不假设多用户共用一台机器 → 本地数据即"本机默认档案"，登录 = **认领** |
| 标准化 | 本次**只把 Work 做成可写的活列**（阅读时间按 work 汇总的前提），完整标准化后置 |

**两个关键取舍的理由**（防反复，别处不再重复）：

1. **笔记物理挂 edition，而不是挂 work**：锚点是在**某个 edition 里**量出来的（rangy 字符偏移），
   挂 work 会让异版锚点必然失准；挂 edition 还有个副作用好处 —— **补录 work 时零重写**
   （T3 退化成"改一列"）。
2. **指纹是采样哈希**（`md5-sample3-v1`：头/中/尾各 64KB + size），所以它当主身份有两类误差：
   只改中段未触及采样窗 → **假同一**；EPUB 重存/换封面 → **假不同**。承认误差，不做自动合并。

### 6.2 术语（开发时说同一件事）

| 术语 | 含义 | 代码标识 |
|---|---|---|
| **收录**（Holding） | 「哪个书库里有这本书」这条关系 | `holdings` |
| **映射库** | 跟踪**唯一真实文件夹**，层级 = 文件系统 | `mode: 'mapped'`（旧库 `'source'` 由迁移器映射为它） |
| **自建库** | 空库起步，用户自建书箱树 | `mode: 'curated'`（旧库 `'virtual'` 同） |
| **来源缺失** | 真实路径上找不到该文件 | `holdings.missing` |

### 6.3 状态转移（实现时最容易出事的地方）

| # | 转移 | 触发 | 口径 |
|---|---|---|---|
| T1 | 旧 JSON → 全局单库 | 老版本升级 | `migrate.ts` 的 `migrateFromJson` |
| T2 | **多 `.db` → 全局单库** | v2 → v3 升级 | `migrateFromV2`：**同指纹归并到第一条 edition**、笔记重挂、旧文件留档可回退 |
| T3 | `fp:…` → `work:…` | 补 ISBN / 远期 OCR | **只改 `editions.work_id` 一列，笔记零重写** |
| T4 | 匿名本地 → 已登录 | 用户主动登录 | 认领（回填 `owner`）；退出登录**不删**本地数据 |
| T5 | 跨设备同步 | 登录 + server | v1 明确排除笔记同步 |

### 6.4 已登记、尚未拍板的项

**不在本节重复展开**，见 `TODO.md` 文首 ★ 块末尾「以后再说」：
F3 孤儿 edition 清理 · F5「全部书」顶层视角 · F6「导出库包」 · F10 Pro 功能边界 ·
F11 同库多路径的收录键 · F12 迁移器两条口径（位置 vs 时间戳的优先级、同库同指纹两行静默丢一条）。
