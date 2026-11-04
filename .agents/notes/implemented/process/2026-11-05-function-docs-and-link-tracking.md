# 决策：职能文档层与引用即跟踪——渐进披露的职能维度

Status: implemented

## Problem

① 渐进披露只做进了「入口 → 子树」，没做进「职能」：打包知识散在 STATUS §2/§6/README/electron-builder
语境四处，测试口径大面积住在 STATUS §6（约 70 行）且与根 AGENTS、client/AGENTS 近逐字三遍——
读交接的人被强制吞下全部测试口径。② 「引用即跟踪」（CP 原则：文档单向引用，引用即跟踪；被引
文件一改，事实源被拉回处理）没有贯彻：docIndex 漂移检查只扫声明边，39 个入库 md 仅 10 个声明，
CONTRACTS/FEATURES/STATUS 等全部裸奔。③ 入口层重复（R-AGENTS ↔ STATUS §6 ↔ README ↔
client/AGENTS）在上一轮治理中未清。

## Decision

- **职能文档层**：`docs/TESTING.md`（测试与验证口径，跨端）+ `client/docs/BUILD.md`（打包与
  发版）。职能文档收编散落口径并成为该职能唯一权威；不到对应环节不加载。专项细节不夺位
  （swarm/smoke/kookit-harness/ui-shot 各自 README 仍是专项权威，TESTING/BUILD 只做总口径 + 指针）。
- **引用即跟踪**：docIndex 的漂移检查面从「声明边」扩为「全部链接边」（85 条真实边全量生效；
  目录边按前缀命中；目标不存在的行文示例不入边）。`跟踪：` 声明保留为**加严层**（存在性/
  不入库/方向校验），漂移职责统一归链接边。
- **单向引用语义**（用户补充确认）：禁止向上（祖先）、允许平级或子一级——职能文档的链接与
  声明全按此设计；BUILD.md 的对象（electron-builder.yml 等）处于上级语境，一律反引号指称。
- 入口层去重按簇执行（依赖方向/kookit 禁令/许可证/版本清单/打包红线/沙箱/隔离/typecheck/smoke），
  每簇定唯一权威：常驻指令在根 AGENTS（一行式合法层），职能口径在 TESTING/BUILD，其余指针化。

## Alternatives considered

- **维持声明制、逐文档补声明**：输在——覆盖率恒低（10/39），且让每个文档为跟踪而声明是
  重复记账；引用本身就是跟踪意图，机器应当直接读它。
- **反引号路径提及也入机器跟踪**（CONTRACTS 里大量 `core/ports/…` 文字引用）：输在——噪音面
  不可控（示例/占位/泛指都会误命中）；文本引用靠职能文档声明制与人工对表补位。
- **职能文档放 client/docs/BUILD + docs/TESTING 之外再立 COOKBOOK**：输在——TuRead 规模暂无
  多步骤操作指南簇，先立两类，出现第三职能再扩（加层需理由，guardrail 口径）。

## Consequences

换来的：STATUS §6 验证段退役（交接快照回归交接职能）；85 条链接边全量生效——feature 页对
代码锚点的声明从此真正驱动漂移提醒；入口层重复线清除。付出的：文档链一处坏链即多一条提醒
（非拦截，噪音可控）；职能文档自身成为新的对表义务面（改动打包/测试口径必须同步）；跨职能
改动（如改 smoke 判据）要同步两处（TESTING 概要 + style-gallery/README 权威）。
