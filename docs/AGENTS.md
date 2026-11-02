# docs/ —— 项目级文档（agent 子树入口）

> 本目录只放**跨端的项目级文档**：方向、状态、顶层架构。client 域细节在 `client/docs/`
> （入口 `client/AGENTS.md`），server 域在 `server/docs/`。全局入口在仓库根 `AGENTS.md`，
> 全局红线与验证工具链都在那里，本文件只放本目录的导航与维护规则。

## 本目录文档（读序）

1. [`STATUS.md`](STATUS.md) —— **状态与交接快照，全项目先读它**。§2 版本分工 / §3 决策索引
   （一行一条）/ §4 版本历史 / §5-6 探针与环境事实。状态细节的唯一归属 = 这里：
   别的文档不记"现在进展到哪"，STATUS 不记"为什么这样设计"。
2. [`DIRECTION.md`](DIRECTION.md) —— 产品方向（批次的先验）。**条款改动须用户明示**，agent 不得顺手改。
3. [`ARCHITECTURE.md`](ARCHITECTURE.md) —— 顶层架构（三端关系、数据流、依赖总图；刻意保持轻）。
4. `LANDSCAPE.md` —— 本地文档，**有意不入库**（.gitignore），不进门控与交接。

`prototypes/` = 交互原型（**不进产品构建**）：`detail-orbit.html` = 聚焦舞台调参原型
（本地静态服务器打开，ESM 不走 file://；lib/ 内是 three r187 官方包原样拷贝）。

## 维护规则

- **行数门控**：全部入库文档挂 `scripts/docGuard.mjs`（pre-commit 自动跑）——上限表与
  两级口径（硬上限 / 冻结基线）见脚本头注。新文档**必须**去上限表登记；未登记的按
  保守默认 100 行门控。
- 文档纪律（入口只放指针、状态归 STATUS、细节按小节下沉）= 渐进式披露，全局口径见根 `AGENTS.md`。
- 日期与过程叙事不进文档（git 负责）；删除的文档移入 `trash/`。
