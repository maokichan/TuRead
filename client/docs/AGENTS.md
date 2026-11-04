# client/docs/ —— 文档群维护规则（agent 子树入口）

> 本目录文档群的**分工与维护规则**。读序（何时读哪个）在 `client/AGENTS.md`；
> 全局红线在仓库根 `AGENTS.md`。全部文档挂 `ops/scripts/docGuard.mjs` 行数门控
> （入口类 80 硬上限，其余统一 800）。

## 分工与裁决顺序

| 文档 | 承载 | 不承载 |
|---|---|---|
| `CONTRACTS.md` | **契约总纲**：领域类型、定位系统、锚点、IPC 白名单、插件契约——代码接口的应然口径 | 实现细节、UI 语义 |
| `DATA_MODEL.md` | 数据建模：表结构、schema 迁移、数据口径 | 访问路径（归 ARCHITECTURE） |
| `ARCHITECTURE.md` | 六边形架构的 client 侧细化：分层、依赖方向 | 具体接口（归 CONTRACTS） |
| `KOOKIT.md` / `RENDER_INTERFACE.md` | 渲染引擎逆向事实与适配器接口 | 阅读交互语义（归 FEATURES） |
| `FEATURES.md` | 功能组件的交互语义权威（用户定案都在这） | 接口形状（归 CONTRACTS） |
| `STYLE.md` | 渲染层视觉基线：token、字号白名单、交互状态语言 | 功能行为 |
| `PLUGINS.md` | 插件的能力边界、开发标准、生命周期（装载/启停/卸载方案） | 接口形状（归 CONTRACTS §9） |
| `features/*.md` | **功能域参照页**（一页一域，feature-docs 机制）：架构锚点表、实现细节、验证路径——细节自 FEATURES §10–15 下沉 | 交互裁决（归 FEATURES）；接口形状（归 CONTRACTS）；视觉（归 STYLE） |

冲突裁决：**CONTRACTS > FEATURES / STYLE > 其余**——接口形状与交互语义打架时，先对 CONTRACTS；
改契约必须连动实现与测试，改语义必须连动 FEATURES 对应节。

## 维护纪律

- **改代码必对表**：接口形状变了改 CONTRACTS，交互变了改 FEATURES，视觉变了改 STYLE——
  文档与代码不一致要主动报给用户（generate-swe 纪律）。
- **洗文档**（超限或定期）：按纪律结合程序事实——对照代码现状，删没必要的形容词与
  不必要的推演过程，只留判定、事实、接口形状；被取代的口径直接退役（git 历史为准，
  不留"旧版注记"堆叠）。
- **决策记录的归属**：用户定案的**结论**进对应文档正文；定案过程与讨论在 git 与 STATUS。
- 新文档先来 `ops/scripts/docGuard.mjs` 上限表登记；删除的文档移入 `trash/`。

跟踪：[ARCHITECTURE](ARCHITECTURE.md) · [CONTRACTS](CONTRACTS.md) · [DATA_MODEL](DATA_MODEL.md) · [FEATURES](FEATURES.md) · [KOOKIT](KOOKIT.md) · [PLUGINS](PLUGINS.md) · [RENDER_INTERFACE](RENDER_INTERFACE.md) · [STYLE](STYLE.md) · [features/](features)
