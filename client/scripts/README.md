# client/scripts/ —— 业务与验证脚本（信任分级清单）

> 本目录承载 **client 业务工具与验证探针**；仓库治理在 `ops/`（两者分治，互不混放）。
> 本目录脚本**默认不信任**：收编 = 逐个审查后在下表登记并升级状态；新脚本落此同为「不信任」。

## 信任级口径

- **不信任·待收编**：存在且被文档引用，但未经「登记用途 / 声明依赖 / 记录已知坑」的审查；
  引用它们的文档与命令以现状为准，不构成可靠性承诺。
- **已收编**：下表登记了用途、依赖、已知坑；改动须同步本表。
- 收编逐个进行（登记在仓库根 TODO.md「工程与测试设施」），顺序由开发者定。

## 清单

| 脚本/目录 | 用途 | 信任级 | 已知坑 |
|---|---|---|---|
| [kookit-harness](kookit-harness) | kookit vendor 库无头自检（`electron.mjs`，退出码 0/1/2）与可视化查看（`--show`）；`serve.mjs` = 零依赖静态服务器（根 = client/，端口 4173） | 不信任·待收编 | — |
| [style-gallery](style-gallery) | 样式样张（`npm run style`，token 与组件基线，STYLE.md §8.0 第一确认手段）；`smoke.cjs` = 无头机检，DOM 事实落盘 | 不信任·待收编 | smoke 只观测不挡提交；排版最终仍需 Electron 内复核 |
| [swarm](swarm) | 蜂群同步回归：一次性 server + N 只 roombot + 语义断言 A1–A5（`npm run swarm`，退出码 = 结论） | 不信任·待收编 | e2e 洪泛不稳已登记 TODO |
| [ui-shot](ui-shot) | 真窗口截屏/点击探针（PowerShell + user32，无新依赖；界面改动「必须看过再交付」的工具） | 不信任·待收编 | userData 必须绝对路径（主进程拒载相对路径）；窗口抓取首选 printwin.ps1 |

另有 `client/plugins/`（官方插件工作区，运行时种子）不在本目录，契约见 `client/docs/CONTRACTS.md` §9。

跟踪：[kookit-harness](kookit-harness) · [style-gallery](style-gallery) · [swarm](swarm) · [ui-shot](ui-shot)
