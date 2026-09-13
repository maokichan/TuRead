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
config.json          ← 引导文件（极小，app 级）：已知库注册表 + 当前库 id（**已落地 2026-09-13**，
                       实现 = `src/main/store/libraryManager.ts`；窗口状态待补；不再存任何书库数据）
```

- **库路径可配置**（用户定）：引导文件里存路径（相对/绝对均可），给出即自动读取；
  UI 提供库管理（新建/切换/移除引用）。
- **多书库**（用户定"多书库是正确的"）：每个 .db = 独立书库，组织方式互不影响；
  每库**至少两种组织并存**——①真实路径的虚拟映射 ②纯书箱（见书箱建模）。
- 同一 filePath 可登记进多个库（引用模型，互不影响）。
- 封面现状（回答）：**走缩略图**——canvas 400px / JPEG q0.82 / 实测 20-40KB，`covers/<bookId>.jpg`，
  UI 读字节转 blob URL（内存缓存）。统一库后 covers 目录从 userData 移到**库目录**下。

**打包风险（已解，2026-09-13 spike 全绿）**：better-sqlite3@**12**（v13 无 electron prebuild），
`prebuild-install -r electron -t <electron 版本>` 取 Electron ABI 二进制 + `asarUnpack` 解出 .node ——
**dev 与打包产物双重验证通过**（Electron 主进程加载/WAL 文件库/重开持久化/328 行事务批量写 2-3ms；
spike 脚本 `src/main/dev/sqliteSpike.ts`，触发 `TUREAD_DEV_SQLITE=1`）。原生路线成立，**wasm 兜底不需要**。
⚠ 换 Electron 版本时须重跑 `npm run rebuild:sqlite`（v13 若恢复 electron prebuild 可升级）。

## 2. schema v2（统一库，**已落地 2026-09-13**，实现 = `src/main/store/sqliteStore.ts`）

> 相对初稿的两处增补（其余与批复稿一致）：books 加 `metadata` 列（完整 BookMetadata JSON，
> title 列是其规范化投影——当前元数据只有文件名推导的标题，标准化立项后可能扩字段，先无损落库）；
> 加 `meta` 表（迁移标记等库级簿记，不属于业务 schema）。

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
    created_at INTEGER NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}'                  -- 完整 BookMetadata JSON（title 列的投影来源）
);
-- 迁移/簿记标记（key-value）：migrated_v1 = 'json'|'fresh'，防"迁移后删光书 → 从留档 JSON 复活"
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
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

**3.1.1 定位转换机制（2026-09-13 用户提出并批复；原拟名"定位 IR"弃用——太编译器背景）**

动机：用户提出参考 Readium 的设计做中间表示，把各格式定位信息抽象掉，降低笔记层复杂度。
**采纳**，术语与分层（已批复）：

- **机制名：定位转换机制**。领域实体沿既定命名：进度级 = `BookLocation`（已立），
  选区级 = `TextAnchor`（统一锚点）。
- **两层结构**（关键决策：**统一信封 + 引擎原生载荷**，不做"通用定位语言"让引擎来回翻译——
  翻译有损会破坏选区 round-trip；Readium 同款取舍）：
  - **归一化层（Norm）**——跨格式可比的语义字段：`chapterIndex` / `progression`(0~1) /
    `quote{exact, prefix, suffix}`。**笔记层/存储/同步只看这层**；
  - **引擎载荷层（Fragment）**——`engine` 标识 + 不透明编码串（EPUB=CFI、PDF=页+坐标、TXT=章+偏移）。
    **只有适配器解释**；`anchor_key` 落库即本层串。
- **原语**（接口即机制，实现在适配器）：`fromSelection` / `resolveToView` / `compare` /
  `remeasure` / `display`。
- **换渲染内核的爆炸半径**：重写适配器的载荷生成/解释 + 跑一次 `remeasure` 迁移；
  **锚点实体、notes 表、笔记 UI、同步协议零改动**——"统一接口，不统一编码"的落地形态。

**已批复的三个细则（2026-09-13）**：
① **quote 的归属**：quote = 划线时刻的**书籍原文快照**（exact/prefix/suffix）——它本质是书的
   一部分，是**定位证据**，不是笔记内容 → **归锚点侧，不归 note 侧**。落库映射：quote.exact =
   notes 表 `excerpt` 列（列语义更正为"划线原文快照（锚点证据）"）；prefix/suffix 并入
   `anchor_hint`（JSON）。用户批注内容只住 `body` 列。
② **compare 次序：先 Fragment 后 Norm**——Fragment 相等 = 同一位置（同 edition 同引擎下
   权威精确、O(1) 串比较，直接判同）；Fragment 不等/缺失/跨引擎 → 降级 Norm
   （chapterIndex/progression 排序 + quote 相似度）做粗判与重锚选路，产出 strong/weak 强弱标注。
   先精确后模糊，避免文本比较的歧义成本污染精确路径。
③ 分层命名沿用 Norm / Fragment。

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

1. ~~better-sqlite3 vs sql.js~~ **已解（2026-09-13 spike 全绿，见 §1）**：走 better-sqlite3@12 原生 +
   prebuild（electron-v130）+ asarUnpack。待办收敛为一件小事：新机器 `npm install` 后须手动
   `npm run rebuild:sqlite`（脚手架已备），不做 postinstall（失败会挂安装，且需代理）。
2. ~~迁移~~ **已落地（2026-09-13）**：init 内 one-shot 迁移器（`sqliteStore.ts`）——
   books 全量（事务）+ settings（config.json；旧格式 library.json 内嵌 settings 也收）→
   meta 表写标记（防删光书后从留档复活）→ 旧文件改名 `library.json.migrated` / `config.json.migrated`
   留档（回退旧版客户端即可还原）。独立 userData 实测：327 本 + 3 设置键迁移、自检全绿、
   二次启动不重复迁移。config.json 降级引导文件（库注册表/窗口状态）随**多书库**落地再做。
3. **高亮色的语义集合**是否就这四色（红黄绿蓝）？
4. **墨迹同步体积**：存储即抽稀（~0.5px）是否可接受，还是保留原始笔迹。
5. **书箱排序交互**：拖拽排序何时做（先数组序存储、UI 后补）。
