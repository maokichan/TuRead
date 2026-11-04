# client/docs/ —— 文档群维护规则（agent 子树入口）

> 本目录文档群的**分工与维护规则**。读序（何时读哪个）在 `client/AGENTS.md`；
> 全局红线在仓库根 `AGENTS.md`。全部文档挂 `ops/scripts/docGuard.mjs` 行数门控
> （入口类 80 硬上限，其余统一 800）。

## 分工与裁决顺序

| 文档 | 承载 | 不承载 |
|---|---|---|
| `CONTRACTS.md` | **契约总纲**：分层模型与依赖规则、定位系统语义权威（三级角色/零位置/时序约束）、锚点分层语义、待定/明确排除、子页索引 + [`contracts/`](contracts) 四子页（domain-types / ports / services-container / plugin-contract——形状密集域，类型与接口形状指认代码路径） | 接口签名现值（= `src/core/ports/`、`src/core/domain/types.ts`）；实现细节；UI 语义 |
| `DATA_MODEL.md` | 数据建模：表清单与代码说不出的语义、schema 迁移规则、数据口径（DDL 权威 = `sqliteStore.ts` 的 SCHEMA_SQL） | 访问路径（归 ARCHITECTURE）；DDL 现值复读 |
| `ARCHITECTURE.md` | 六边形架构的 client 侧细化：分层、依赖方向、跨域缝合件 | 具体接口（归 CONTRACTS） |
| `KOOKIT.md` / `RENDER_INTERFACE.md` | 渲染引擎逆向事实与适配器接口 | 阅读交互语义（归 FEATURES） |
| `FEATURES.md` | 功能组件的交互语义权威（用户定案都在这） | 接口形状（归 CONTRACTS） |
| `STYLE.md` | **渲染层视觉基线·主文件**：风格定性、空间语法词表（§1）、五条原则（§2）、子页索引、禁区（§6）、激进档（§7）+ [`style/`](style) 六子页（tokens / typography / components-shell / components-reader / components-notes / acceptance——原 § 编号在子页内不变，token 现值唯一来源 = `styles.css`） | 功能行为；令牌现值复读 |
| `features/*.md` | **功能域参照页**（一页一域，feature-docs 机制）：架构锚点表、实现细节、验证路径 | 交互裁决（归 FEATURES）；接口形状（归 CONTRACTS）；视觉（归 STYLE） |
| `BUILD.md` | **职能文档**：打包/滚版本/发版口径（不到打包环节不加载） | 测试与冒烟（归 docs/TESTING.md）；打包红线一行（常驻根 AGENTS） |

冲突裁决：**CONTRACTS（总纲 + contracts/ 子页）> FEATURES / STYLE（含 style/ 子页）> 其余**——
接口形状与交互语义打架时，先对 CONTRACTS；改契约必须连动实现与测试，改语义必须连动 FEATURES 对应节。

## 维护纪律

> 洗文方法、引用方向、单一落点、改代码必对表——**全项目文档维护准则的权威在
> `docs/AGENTS.md`**（本文件不复读）；本节只放本目录增量。

- **改代码必对表**：接口形状 → `CONTRACTS` + `contracts/` 对应子页；交互裁决 → `FEATURES`；
  域实现细节 → `features/` 对应页；视觉 → `STYLE.md`（红线/原则/禁区）+ `style/` 对应细则子页；
  数据 → `DATA_MODEL`。路径提及即 docIndex 跟踪边——代码变更会自动触发漂移提醒拉回对表。
- **决策记录的归属**：用户定案的**结论**进对应文档正文；定案过程与被放弃项 =
  `.agents/notes/`（notes 机制见其 README）；过程与讨论在 git 与 STATUS。
- 新文档先来 `ops/scripts/docGuard.mjs` 上限表登记；删除的文档移入 `trash/`。
