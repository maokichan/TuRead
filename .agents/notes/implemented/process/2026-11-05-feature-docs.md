# 决策：feature 文档机制——架构锚点先行的一页一域

Status: implemented

## Problem

大文档混层是膨胀的根源：[FEATURES](../../../../client/docs/FEATURES.md) §10–15（约 440 行）里用户裁决、组件细节、历史叙事同栖
一处；[CONTRACTS](../../../../client/docs/CONTRACTS.md) 顶格；文档上限的争论（300 还是 500）问错了问题——层分对了，上限可以宽。
参照 dsh 文档体系的分层税制（subsystems/ 一页一子系统、one home per fact、预算 = guardrail），
但 dsh 的「万物皆插件」无明确依赖方向，不能照搬分层依据——TuRead 的分层必须以六边形
架构定位为前提。

## Decision

- **[`client/docs/features/`](../../../../client/docs/features) 一页一功能域**（library/reader/notes/room/settings）：每页骨架 =
  **架构锚点表**（该域的 features 组件 / core usecases / [ports](../../../../client/docs/contracts/ports.md) / adapters / domain 文件，来自
  架构定位盘点的产物）+ 细节承载（自 [FEATURES](../../../../client/docs/FEATURES.md) 下沉）+ 验证路径（探针/单测/样张入口）+
  文末跟踪声明。上限 300。
- **[FEATURES.md](../../../../client/docs/FEATURES.md) 退为裁决权威 + 索引**：用户定案的交互语义（宪法职责）留守，细节让渡给
  feature 页；§2 动机等自标历史退役进 git。
- **跨域缝合件归 ARCHITECTURE.md**（AppShell/ServiceContainer/总线/共享投影/ILibraryStore
  等约 20 处，新节承载），不造第 7 页；feature 页链接缝合件归属。plugins 已有独立页
  （[`client/plugins/PLUGINS.md`](../../../../client/plugins/PLUGINS.md)——2026-11-05 起插件文档归属插件子树），不重复建页。
- **预算哲学换轨 dsh 口径**：上限 = guardrail 非削减目标；达标留 5% 余量，超标冻结待下沉，
  加层需理由登记。features 页 300，其余文档维持 800 待分层红利兑现后再议；入口类 80/100
  硬上限不变。
- **判定谁权威（架构定位先行的落法）**：接口形状 = [CONTRACTS](../../../../client/docs/CONTRACTS.md)；交互裁决 = [FEATURES](../../../../client/docs/FEATURES.md)；
  域参照 = features/ 页；决策论证 = 决策笔记；跨域行为 = [ARCHITECTURE](../../../../client/docs/ARCHITECTURE.md)。冲突序：[CONTRACTS](../../../../client/docs/CONTRACTS.md) >
  [FEATURES](../../../../client/docs/FEATURES.md) > feature 页 > 其余。

## Alternatives considered

- **硬切默认 300**：输在——四大文档当场超限挡死一切提交，且不分层的一刀切把裁决与细节
  一起砍，违反「裁决权威留守」。
- **照搬 dsh 万物皆插件式分层**：输在——dsh 无固定架构与依赖方向，其分层按包边界生长；
  TuRead 六边形有明确依赖方向，feature 页必须锚在架构位置上，否则会再长出与代码无关的
  叙事层。
- **维持单一 [FEATURES](../../../../client/docs/FEATURES.md) 大文档 + 只降上限**：输在——混层不解决，洗完还会长回来；数量
  不增加就必然膨胀（用户定案：文档自身不能膨胀但数量可以增加）。

## Consequences

换来的：各域有与架构同构的参照页，验证入口随页可查；[FEATURES](../../../../client/docs/FEATURES.md) 释放约 40% 体量；上限
争论终结于分层。付出的：跨域改动要同步 feature 页与 [ARCHITECTURE](../../../../client/docs/ARCHITECTURE.md) 两处（跟踪声明会提醒）；
doc-typecheck / type-equiv（dsh 的文档类型编译校验）未引入，登记 TODO 远期；feature 页与
代码的锚点漂移靠 docIndex 声明 + 人工对表，非机器强制。
