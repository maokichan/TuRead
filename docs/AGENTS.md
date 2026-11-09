# docs/ —— 项目级文档（agent 子树入口）

> 本目录只放**跨端的项目级文档**：方向、状态、顶层架构。client 域细节在 [`client/docs/`](../client/docs)
> （域入口 [`client/AGENTS.md`](../client/AGENTS.md)，文档群分工在 [`client/docs/AGENTS.md`](../client/docs/AGENTS.md)），server 域在 [`server/docs/`](../server/docs)。
> 全局入口在仓库根 `AGENTS.md`；本文件放本目录导航与**全项目的文档维护准则**。

## 本目录文档（读序）

1. [`TESTING.md`](TESTING.md) —— **测试与验证口径（职能文档）**：单测/typecheck/探针/样张/蜂群/
   server 测试；不到验证环节不加载。
2. [`DIRECTION.md`](DIRECTION.md) —— 产品方向（批次的先验）。**条款改动须用户明示**。
3. [`ARCHITECTURE.md`](ARCHITECTURE.md) —— 顶层架构（三端关系、数据流；刻意保持轻）。

[`prototypes/`](prototypes) = 交互原型（**不进产品构建**；本地静态服务器打开，ESM 不走 file://）：
`detail-orbit.html` = 聚焦舞台调参原型；`toc-final-home.html` = 内嵌目录 + 权重模型样张（批1.20）。

## 文档维护准则（全项目；纪律源 = generate-swe skill + 门控与洗稿实践）

**归属**

- 文档 = 共享记忆，两路读者：下一个 agent（要指针与事实）、人（要整体与关系）——
  技术细节留在代码与小节里，不淹没正文。
- 决策的**结论**进对应文档正文，**过程与讨论**归 git；
  日期与过程叙事不进文档（版本控制提供回溯）；无元解释；删除的文档移入 [`trash/`](../trash)。

**结构（渐进式披露）**

- 入口文档只放指针、红线与命令速查；子树入口（`docs/`、[`client/`](../client)、[`client/docs/`](../client/docs) 各一份
  AGENTS.md）只放该域的地图与增量规则，全局内容不重复——读什么、读多少按需加载。
- 新文档**必须**先到 [`ops/scripts/docGuard.mjs`](../ops/scripts/docGuard.mjs) 上限表登记级别，再动笔。

**门控（可执行化）**

- 提交门控链挂 pre-commit：链的构成、口径与激活细则归 [`ops/AGENTS.md`](../ops/AGENTS.md)（本文件不复读）。
  行数口径：入口/索引类硬上限（AGENTS 族 80~100 行），其余文档按 docGuard 头注的
  guardrail 预算（入口类 + features 页登记档，其余默认 300）；体检 = `node [ops/scripts/docGuard.mjs](../ops/scripts/docGuard.mjs) --report`。
- 引用纪律（机检，机制 = [`ops/scripts/docIndex.mjs`](../ops/scripts/docIndex.mjs)）：引用必须 `[]()` 链接
  （反引号壳 / 裸路径 / 裸文档名皆违规；目录形态自由）；**向上引用无合法形态**——解析到祖先目录
  （含仓库根）的目标一律删除或改写为不含路径的中文表述（渐进式披露：内容只向下流，竖直导航由
  入口链承担）；死链与散文日期同被拦截（日期归 git 历史与笔记文件名，`.agents/notes/` 事件日志放行）。
  终裁记录 = 笔记 [`2026-11-10-reference-law`](../.agents/notes/implemented/process/2026-11-10-reference-law.md)。

**洗（超限或定期）**

- **目的 = 与事实同步、防模型幻觉**：文档是 agent 的按需加载上下文，修辞与推演是幻觉的
  燃料，退役特性的残留叙事会被后续 agent 读入当真——删形容词的收益不在行数在这里。
- 方法：**按纪律结合程序事实**——对照代码现状核对每一处描述，删没必要的形容词与
  不必要的推演过程，只留判定、事实、接口形状；被取代的口径直接退役（git 历史为准，
  不堆"旧版注记"）。代码可证伪「是否已实现」，不可证伪「是否应然」——用户定案的
  交互语义是文档权威，代码只能更新其实现状态。
- **slop 清单**（洗时逐项排查，源自 dsh 文档标准）：重复规则（搜特征句留一处）、层外历史、
  实现状态注记（"已实现！/future:"——状态归代码）、手抄目录/清单（源或生成器
  权威时）、推理过程转写、比喻性生造词、段落墙、强调通胀。
- 粒度：单文档在 800 内时**一个代理吃一个文档即可，不拆片**；并发洗多文档时**文档
  粒度天然无写冲突**——各自成稿、互不合并。
- 修代码必对表：接口形状 → [CONTRACTS](../client/docs/CONTRACTS.md)，交互裁决 → [FEATURES](../client/docs/FEATURES.md)，域实现细节 → `features/`
  对应页，视觉 → [STYLE](../client/docs/STYLE.md)；文档与代码不一致要主动报给用户。
