# 决策：治理机制移植——ops 守卫链、决策日志与治理/业务分治

Status: implemented

## Problem

文档健康靠一次性人工大洗维持，机制不在持续供货；门控脚本（初版在根 [`scripts/`](../../../../client/scripts)，现 [`ops/scripts/docGuard.mjs`](../../../../ops/scripts/docGuard.mjs)）与业务/
验证脚本（[`client/scripts/`](../../../../client/scripts)）边界含混；被放弃的方案与理由
无处落——换届 agent 无从防翻案。参照 Cross-Patch 项目的成套机制（其行数门控本就移植自
本项目 docGuard），反向移植补齐。

## Decision

- 新建 [`ops/`](../../../../ops)：治理与业务分治。docGuard 迁入 [`ops/scripts/`](../../../../ops/scripts)；新建 repoGuard（绝对路径三形态
  只扫文档/配置扩展、密钥八类扫全部文本源、排除 vendored 与 trash、`<占位符>` 豁免）与
  docIndex（文末「跟踪：」声明；check 全量 / hook 拦截 + 漂移提醒）。
- [`.githooks/pre-commit`](../../../../.githooks/pre-commit) 三连：docIndex hook → repoGuard → docGuard（set -e，任一失败即中止）。
- 新建 [`.agents/notes/`](../..) 决策日志：三态生命周期、路径即元数据、Alternatives considered 强制；
  类别闭集 = process / arch / product。
- [`client/scripts/`](../../../../client/scripts) 现有业务与验证脚本标记「不信任·待收编」，收编通道见其 [README](../../README.md)；逐个处理
  另行进行，不在本决策内。

## Alternatives considered

- **identity 门控（Cross-Patch 的 Worked-by 溯源）**：输在——单人项目提交史已有 attribution，
  机械加尾注只有成本没有增量信息（用户裁定：没有必要）。
- **Probe/回归族（ui-shot、smoke、swarm）一并迁入 ops/**：输在——它们依赖 client 的
  node_modules（Electron），搬进治理目录会让 ops 反向依赖业务安装；且「验证应用」与
  「守护仓库」职能不同（用户裁定：ops 只放门控三件套，业务脚本标记不信任待逐个处理）。
- **不建独立笔记目录、升级既有决策索引承担放弃项**：输在——三态生命周期与 Alternatives
  强制需要目录结构与格式骨架承载；索引不是论证层，塞进索引破坏「一行一条」且造双重记账。
- **AGENT-CONCURRENCY 迁入 docs/**：输在——它归属用户的符号锁长期项目线索，TuRead 只留
  实验结论；[docs/AGENTS.md](../../../../docs/AGENTS.md) 的引用已移除，不再跟踪（用户裁定）。

## Consequences

换来的：卫生由机制持续供货（存量 7 处卫生命中与 3 处祖先链已洗清）；向上链接与出仓引用被
机器拦截；决策的放弃项有了防翻案载体。付出的：新文档动笔前需登记上限表；声明文档对被跟踪
路径负同批更新义务；repoGuard 的占位符豁免与扩展集是人工口径，存在漏检面——宁可窄报不误报，
扩面走 process 笔记。
