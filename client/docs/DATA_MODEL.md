# 客户端数据建模（DATA MODEL）

> **性质**：活文档。数据持久化的建模与库设计；讨论增量直接补节；结论回写 [`CONTRACTS.md`](CONTRACTS.md)。
> 阅读顺序：§1 总构 → §2 schema → §3 实体与锚点 → §4 已批复 → §5 开放问题 → §6 术语与状态转移。
> 「书的身份」定案权威 = §4.2（D1–D12）。**形状一律以代码为权威**——本文代码块只做速览与裁决注记，不复读形状。

## 1. 存储总构（v3：全局单库 + 书库降为组织模式）

> 定案与理由见 §4.2；本节只写结论。

**全应用一个 SQLite 库 = 一份用户数据**。JSON 只作**引导文件**——"开哪个库"是鸡生蛋问题，必须留在库外。

```
<userData>/
  store.db               ← 一切数据（§2）；路径由引导文件指向，可配置
                         ⚠ **不能叫 `turead.db`**（旧版默认库文件名）——同名会静默跳过建表，见 §2
  covers/<editionId>.jpg ← 封面缩略图（随库目录；携带 = 拷目录）
  plugins/<id>/          ← 官方插件（运行时文件夹；契约 = client/plugins/PLUGINS.md）
  config.json            ← 引导文件（极小）：{ version, dbPath, 窗口状态 }
```

```ts
// v3 语义速览（编号 = §4.2 定案）
Library             // 组织模式，非物理分区（D2）：mode: 'mapped'（跟踪唯一真实文件夹）| 'curated'（空库起步自建书箱树）
Holding             // "哪个书库里有这本书"（成员关系）：同一内容可被多库收录（多行）→ 跨库共享天然成立
Note                // 挂 edition，不挂库（D3/D8）：跨书库共享；各版各一份，不自动跨版迁移
ReadingState/Session// 挂 edition（D4）；"按 work 汇总"是查询口径，不是存储口径
covers/             // edition 级（canvas 400px / JPEG q0.82，实测 20-40KB）
settings            // 设置一律全局，没有库级设置（D9）；插件键 plugin:<id>、密钥 plugin-secret:<id>:<name>（密文落库，明文不出主进程）
config.json         // 极小（D1+D9 推论）：库注册表进库、当前库 = settings.currentLibraryId
```

**打包（已验证）**：better-sqlite3@**12**（v13 无 electron prebuild）：`prebuild-install -r electron
-t <electron 版本>` 取 Electron ABI 二进制 + `asarUnpack` 解出 .node；dev 与打包产物双验证通过
（主进程加载/WAL/重开持久化/328 行事务批量写 2-3ms；spike = [`src/main/dev/sqliteSpike.ts`](../src/main/dev/sqliteSpike.ts)，
`TUREAD_DEV_SQLITE=1`）。原生路线成立，**wasm 兜底不需要**；换 Electron 版本须重跑 `npm run rebuild:sqlite`
（v13 若恢复 electron prebuild 可升级）。

## 2. schema v3（DDL 权威 = `SCHEMA_SQL` @ [`src/main/store/sqliteStore.ts`](../src/main/store/sqliteStore.ts)；本文不复述 DDL）

> 实现状态：已落地——`SqliteStore` 拆表、迁移器 [`src/main/store/migrate.ts`](../src/main/store/migrate.ts)（T1/T2，§6.3）、
> `ScanService`（映射库扫描对账）、Work 活列、`edition_toc` 留位；迁移夹具 =
> [`src/main/dev/migrateFixture.ts`](../src/main/dev/migrateFixture.ts)（dev-only，`TUREAD_DEV_MIGRATE=fixture|json|verify`；
> **不给 `TUREAD_USER_DATA` 拒绝运行**，防写真实书库）。
>
> ⚠ **全局库文件名不能是 `turead.db`**（用户实测踩过的阻塞级 bug，已修）：同名会让
> `CREATE TABLE IF NOT EXISTS` **静默跳过旧表**，随后新列索引以 `no such column` 崩在启动路径上。
> 现用 **`store.db`** + 形状守卫（`looksLikeLegacyStore`，旧 schema 给可行动的报错）+
> "单库失败不阻断其余库、`failed` 可重试"；夹具用真实 `turead.db` 命名 + 变异测试钉住此坑。
> 相对 v2 的结构性变化（books→editions+works、holdings 取代每库 books、笔记挂 edition、
> 阅读状态拆出、设置全局化）过程归 git。

**表清单**（只记**代码说不出的语义与规则**；结构本身看 `SCHEMA_SQL`）：

| 表 | 代码说不出的规则 |
|---|---|
| `works` | 只留接口、不做完整标准化（D11/F9）；补录 = T3（§6.3，改一列、笔记零重写） |
| `editions` | 全局唯一键 = 指纹（采样哈希 `md5-sample3-v1`，[`src/core/adapters/identity/fingerprint.ts`](../src/core/adapters/identity/fingerprint.ts)）；两类误差与"不做自动合并"的取舍见 §4.2 注 2 |
| `libraries` | `mode` 语义见 §1 代码块（术语 §6.2） |
| `containers` | 单亲树 + 不变量见 §3.4 |
| `holdings` | 同库同版只收录一次；`missing` = **来源缺失——删的是可见性不是数据**（笔记/阅读状态不动，文件回来自动重现）；`parent_path` 写入时规范化 |
| `notes` | `excerpt` = `quote.exact` 的投影（**锚点证据，非笔记内容**，§3.1.1 ①）；`anchor_key` = Fragment 串**逐字节原样存**；`color`/`mark_style` = 语义名非字面量；批注内容只住 `body`（原生 Markdown，笔记 v3） |
| `reading_state` | `total_read_ms` 唯一写入口 = `appendReadingSession`（同事务累加）；"按 work 汇总"是**查询口径**（D4） |
| `reading_sessions` | 阅读时间口径见下注 |
| `edition_toc` | **先留位不实现**（功能见唯一待办清单） |
| `settings` / `meta` | `meta.migrated_v3` = `fresh\|from-v2\|from-json\|failed`（failed 可重试，防"迁移后删光书 → 从留档复活"） |

> **阅读时间口径（批1.24，用户定）**：写 = 渲染层 `readSessionRecorder` → `appendReadingSession`。
> **段生命周期**：阅读态开段｜blur 结段 / focus 开新段（**失焦暂停**）｜换书 / 关标签 / 退 app
> 边界落笔（pagehide + beforeunload + visibilitychange 兜底；单段 >1h 强制结段）｜**<10s 丢弃**｜
> append-only、幂等。查询 = `readMinutesByDay`（本地时区归日、稀疏）/ `topReadEditions`
> （投影倒序、含迁移旧账、limit 夹 1–50）。⚠ 接入记录器前的旧账只在投影里，画不进按日格子。

## 3. 实体与锚点

**3.1 跨格式锚点（判断：可行且必要——统一接口，不统一编码）**

```ts
// 进度级（CONTRACTS §2.1）与选区级（纯函数权威 = src/core/domain/anchor.ts）：
BookLocation { … }                                        // "读到哪"——进度语义
TextAnchor {                                              // "标在哪"——选区语义（两者是不同的物）
  norm:     { chapterIndex, progression(0~1), quote{exact, prefix, suffix} }, // 归一化层：笔记层/存储/同步只看这层
  fragment: { engine: 'kookit-rangy' | 'kookit-pdf-rect' /*文字选区+框选*/ | 'kookit-pdf-stroke' /*记号笔,适配器自绘*/, key } | null       // 引擎载荷层：只有适配器解释；anchor_key 落库即此串
}
// 原语（接口即机制，实现在适配器）：fromSelection / resolveToView / compare / remeasure / display
```

> **why（关键决策）**：**统一信封 + 引擎原生载荷**，不做"通用定位语言"让引擎来回翻译——翻译
> 有损会破坏选区 round-trip（Readium 同款取舍）；**同步不需要统一编码**（指纹标定保证对端同一
> edition → 同一解释器）。**换渲染内核的爆炸半径** = 重写适配器的载荷生成/解释 + 跑一次
> `remeasure`；锚点实体、`notes` 表、笔记 UI、同步协议**零改动**。
>
> ⚠ **文字类载荷 = rangy 字符范围，不是 CFI**（逆向核实；引擎侧细节见 [`KOOKIT.md`](KOOKIT.md) §5 #14）：
> vendored kookit 的 `libs/cfi` 存在但笔记链路**完全没用到**。字符偏移 = 同 edition 同解析器内的
> 精确键（跨解析器版本可能漂移），跨引擎/跨解析器一律靠 Norm 层重建（`remeasure`）——两层结构
> 的价值所在。PDF = 页+坐标载荷（`'kookit-pdf-rect'`，rect/stroke、quote 可空——位图载体无文本
> 层时 excerpt 诚实留空；笔记 v3 随批落地）。

**细则（已批复）**：
① **quote 的归属**：quote = 划线时刻的**书籍原文快照**——**定位证据，不是笔记内容** → 归锚点侧；
  落库 = exact→`excerpt`（投影）、prefix/suffix→`anchor_hint`（JSON）。批注内容只住 `body` 列。
② **compare 次序：先 Fragment 后 Norm**——Fragment 相等 = 同一位置（同 edition 同引擎下权威
  精确、O(1) 直接判同）；不等/缺失/跨引擎 → 降级 Norm（章/进度排序 + quote 相似度）做粗判与
  重锚选路，产出 strong/weak 强弱标注。先精确后模糊，别让文本比较污染精确路径。
③ 分层命名沿用 Norm / Fragment。

**3.2 Note 实体**（形状权威 = [`src/core/domain/types.ts`](../src/core/domain/types.ts)；表列同名 snake_case）

```ts
{ kind: 'highlight'|'bookmark'|'ink' /*v3 收敛*/, anchor /*"标在哪"*/, color? /*语义名,库内无 hex*/,
  markStyle? /*线样,与色正交,缺省 background*/, body /*批注正文·原生 Markdown(v3)*/, ink?, owner? }
// ⚠ 领域类型无 excerpt 字段——notes 表 excerpt 列是 anchor.norm.quote.exact 的投影（细则①）
```

**3.2.1 「笔记/批注」=「划线」（用户定，记档防反复）**

批注必然要有关联的划线（"某一个笔记还是要关乎于某个内容的"），不做"纯批注"——
**一条笔记 = 锚点（必然有）+ 可选文字（`body`）**：`body` 有值 ≈ 俗称"批注"，空 ≈ "划线"，
**同一个实体**。推论（笔记 v3 **已执行**：kind 收敛、写侧统一「标记 + 可选正文」、存量行迁移）：

```ts
kind = 载体类型（承载方式真正不同者），不是创建来路
// 'note' 退役：与 'highlight' 的唯一差别是"怎么被创建的"（先划线后补正文 vs 直接写批注）——
// 同内容两个名字，标签取决于历史而非当前状态
NoteKind = 'highlight'（锚在正文范围）| 'bookmark'（标位置无文本范围）| 'ink'（几何画布墨迹）
呈现判据 = body 是否为空，不是 kind
```

裁决细节 = [`client/docs/contracts/domain-types.md`](contracts/domain-types.md)。

**3.3 墨迹（kind='ink'）**：矢量笔画（归一化点列 + 语义色 + 相对笔宽）。与划线的本质差异：
划线锚**内容流**（重排安全、渲染由布局引擎做）；墨迹锚**几何画布**（脱离版面坐标无意义）→ 只进
版式固定载体。真开销在渲染（连续滚动/缩放全量重绘）→ 按页懒取 + **覆盖层位图缓存** + 写入抽稀。

> ⚠ **"覆盖层" = 墨迹的渲染优化手段**（矢量笔画→位图缓存层），**不是**自建一层覆盖渲染接管正文。
> 架构分工（[`RENDER_INTERFACE.md`](RENDER_INTERFACE.md) §1/§5）：正文排版与高亮的绘制都是 **kookit 的**（高亮 = 行内
> span，随重排自然对齐），我们只提供宿主容器 + 注入样式 + 调用引擎原语；**只有墨迹/几何标记
> 将来需要我们自己画**（几何锚点，布局引擎管不了）——那时才轮到覆盖层。

**3.4 书箱（Container）不变量**（`SqliteStore` 强制）：

```ts
// 树在库内：containers.parent_id 单亲（NULL = 库根层）；成员长在收录上（holdings.container_id，单亲；NULL = 库根层）
move(箱, 目标)   : 目标 ∈ 自己 ∪ 后代 → 拒（防成环）
remove(箱)       : 有子箱 → 拒删（先清空子级，防误删整棵子树）；删箱 → 成员收录 SET NULL 归回库根层
remove(库)       : 级联箱与收录（edition / notes / reading_state 不动——用户资产）
addHolding(container_id = null) = 未指定归属 → 保持原值（不覆盖）；"移回根层"唯一入口 = moveHolding(..., null)
```

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

### 4.2 「书的身份」批复（**权威表** D1–D12）

> 定案以本表为准；两个关键取舍的理由见表后注。术语 = §6.2，状态转移 = §6.3。

| # | 决定 |
|---|---|
| D1 | **物理上不再按书库分库**：全局一个统一数据库 + JSON 驱动的引导配置 |
| D2 | **书库 = 一种组织模式**（组织管理书的分类），进领域层；与书箱同级 |
| D3 | **笔记与用户产生的信息跨书库** |
| D4 | 身份规则：有 work 按 work、否则按指纹 —— ⚠ **经 D8/D11 细化**：**笔记挂 edition（各版一份）**；**阅读时间逐 edition 记录、按 work 汇总** |
| D5 | **虚拟映射**：移除 = 移除可见性；**不能在映射库"添加"书**；需要扫描/同步机制（**监听不作首选**） |
| D6 | **登录前应用必须可用**；登录是**升级**动作，带来状态转移，须显式设计 |
| D7 | **词汇标准化**（§6.2：收录 / 映射库 / 自建库；`mode: 'mapped' \| 'curated'`） |
| D8 | **笔记按 edition 各一份，不做自动迁移**；跨版搬运 = **用户主动动作**（Pro 候选，见唯一待办清单） |
| D9 | **设置一律全局**（无库级设置） |
| D10 | **不假设多用户共用一台机器** → 本地数据 = 本机默认档案；登录 = **认领**；退出登录**不删**本地数据 |
| D11 | **本次不做完整标准化，但必须留出 Work 接口**（阅读时间按 work 汇总的前提） |
| D12 | **Pro 版 = 功能分层、非订阅**（捐赠走爱发电；服务器开源可自建）—— 见唯一待办清单「产品与发行」 |

**两个关键取舍的理由**（防反复，别处不再重复）：

1. **笔记物理挂 edition，而不是挂 work**：锚点是在**某个 edition 里**量出来的（rangy 字符偏移），
   挂 work 会让异版锚点必然失准；挂 edition 还有个副作用好处 —— **补录 work 时零重写**
   （T3 退化成"改一列"，§6.3）。
2. **指纹是采样哈希**（`md5-sample3-v1`：头/中/尾各 64KB + size，[`src/core/adapters/identity/fingerprint.ts`](../src/core/adapters/identity/fingerprint.ts)），
   所以它当主身份有两类误差：只改中段未触及采样窗 → **假同一**；EPUB 重存/换封面 → **假不同**。
   承认误差，不做自动合并。

**登记待议（不阻塞实施）**：F3 孤儿 edition 的清理动作 · F5「全部书」顶层视角 · F6「导出库包」 ·
F10 Pro 功能边界（详见 §6.4）。

## 5. 开放问题（待批复）

> 第 6 条**已批复**（用户定）：v1 检索用 `LIKE` 子串、不引入 FTS5，范围 = 只搜笔记；
> 契约 = [`CONTRACTS.md`](CONTRACTS.md) §4.4 + 形态 = [`FEATURES.md`](FEATURES.md) §12。详见该条末尾。

1. ~~better-sqlite3 vs sql.js~~ **已解（spike 全绿，见 §1）**：走 better-sqlite3@12 原生 +
   prebuild（electron-v130 = Electron 33）+ asarUnpack。待办收敛为一件小事：新机器 `npm install`
   后须手动 `npm run rebuild:sqlite`（脚手架已备），不做 postinstall（失败会挂安装，且需代理）。
2. ~~迁移~~ **已落地**：`migrate.ts` 的 `runMigrations`（T1/T2，§6.3）——**尽力而为**：坏文件跳过、
   单个旧库失败不阻断其余库；标记写 `meta.migrated_v3`（`failed` 可重试，成功前不覆盖旧引导文件）；
   旧文件改名 `*.migrated` 留档（回退旧版客户端即可还原）。
3. **高亮色的语义集合**是否就这四色（红黄绿蓝）？
4. **墨迹同步体积**：存储即抽稀（~0.5px）是否可接受，还是保留原始笔迹。
5. **书箱排序交互**：拖拽排序何时做（先数组序存储、UI 后补）。
6. **库级「笔记索引与管理」要不要引入倒查表？** —— **已批复**：

   - **范围 = 只搜笔记**：`excerpt`（划线的**书籍原文快照**）+ `body`（**批注正文**）。
     ⚠ **不搜书的全文**——书内搜索归 `IRenderService.search`；跨书库全文搜索是另一个专题
     （扫描版 PDF 没有文本层，注定有一块搜不到）。
   - **机制 = v1 `LIKE '%q%'` 子串匹配**（`NoteQuery.text`），**不引入 FTS5**；检索是 `NoteQuery`
     的一个筛选维度，不另立 `searchNotes`——将来换实现**签名与语义都不变**。
   - **读模型（已实现）**：`listAllNotes(NoteQuery)` / `countAllNotes(NoteQuery)`；库作用域 =
     该库**收录**范围内的 edition（`holdings` EXISTS，多库收录不重复出行）。
   - **实测**（Electron 的 better-sqlite3，SQLite 3.53.2，2000 条中文笔记）：

     | 方案 | 中文子串命中 | 单次耗时 | 额外体积 | 落地成本 |
     |---|---|---|---|---|
     | `LIKE '%q%'` | ✅ 正确（句中也能中） | **0.32 ms** | 0 | **0** |
     | FTS5 `unicode61` | ❌ 同一批词**全 0 命中** | — | 比原文小 | 虚表+触发器+迁移 |
     | FTS5 `trigram` | ⚠ **≥3 字才中**（双字词落空） | 0.048 ms | **372 KB > 原文 312 KB** | 同上+分词器选择 |

     `unicode61` 失效根因：按"非字母数字"切词，汉字属字母类且中文无空格 → 一整串汉字一个 token，
     词中间的子串永不命中；`trigram` 恢复正确但查询须 ≥3 字——中文双字词太常见。
   - **FTS5 换装条件**（满足其一，且**换装不动契约**；better-sqlite3 已含 FTS5 符号）：① 笔记达
     **万条量级**；② 需要**相关度排序**（`bm25`）或**片段高亮**（`snippet`）；③ 检索成为**主路径**。
     换装时**必须**：`trigram` 分词器、<3 字查询**回落 LIKE**、给 `notes` 补增删改**同步触发器**
     （漏了 = 静默陈旧）。
   - ⚠ **两个会静默通过的坑（探针实测踩到）**：`'rebuild'` 特殊命令**只对外部内容表**（`content=`）
     生效，普通 FTS5 表不报错、留空表（"命中恒 0 + 耗时极低"）；建 FTS 表后**必须自检行数**。
   - **章标题**：**v1 不冗余存**——列表显示「**書名 · 節 N**」；要显示章名时再定列
     （`notes.chapter_title`）与写入时机，存量行为空。

## 6. 「书的身份」——术语、状态转移与待议

> 三问（可见性与追踪 / 笔记身份 / 阅读时间模型）**本质同一问**：「虚拟映射下什么算同一本书」。
> **定案与理由已全部收编 §4.2（权威表 D1–D12 + 两个取舍注），本节不复述定案。**
> 小节编号沿用 6.2/6.3/6.4 —— [`src/main/store/migrate.ts`](../src/main/store/migrate.ts) 等代码注释按节号引用此文件。

### 6.1 定案要点

已收编 §4.2：批复表 D1–D12；虚拟映射的写入语义 = D5；阅读时间口径 = D4 + §2 注。

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

见唯一待办清单文首 ★ 块末尾「以后再说」：F3 孤儿 edition 清理 · F5「全部书」顶层视角 · F6「导出库包」 ·
F10 Pro 功能边界 · F11 同库多路径的收录键 · F12 迁移器两条口径（位置 vs 时间戳优先级、同库同指纹两行静默丢一条）。
