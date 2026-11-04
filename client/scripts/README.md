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
| [kookit-harness](kookit-harness) | kookit vendor 库无头自检（`electron.mjs`：依赖仅 electron，载 4173 页、按 `TUREAD-TEST-*` 标记退出，0=OK/SKIP、1=FAIL、2=超时 120s；`--show` 可视化，`--verbose`/`--probe` 排障）；`serve.mjs` = 零依赖静态服务器（仅 node:http/fs/path/url，根 = client/，端口 4173 可 `PORT` 覆盖）；`index.html` = 无 CSP 隔离页（浏览器直开） | 已收编 | 本页**有意无 CSP**（区分「kookit 问题 vs App 的 CSP 拦 blob:」）；pdfjs 必须先于 vendor import 注入（顺序不可反），`/lib/pdfjs/` 靠 serve.mjs 映射到 App public；宿主容器必须可滚、**不得设 iframe height:100%**（kookit 会拉高 iframe 属性，CSS 100% 把正文裁成一屏）；无头隐藏窗口把 smooth scroll 推迟 ~2s（自检内建 3s 最小等待）；首章纯图片扉页 innerText=0 属正常（自动扫到文字章节再断言）；2026-11-05 实跑 epub 自检通过（exit 0） |
| [style-gallery](style-gallery) | 样式样张（`npm run style` → vite dev server :5199，token 与真实组件基线，STYLE.md §8.0 第一确认手段；**只导入真实件不复制实现**，`typecheck:preview` 为第一道防线）；`smoke.cjs` = Electron 无头机检（DOM 事实 + 几何判据 + 控制台抓取，落盘仓库根 `logs/gallery-smoke.json`，退出码 0/1，只观测不挡提交） | 已收编 | 排版最终仍需 Electron 内复核（Chromium 版本差）；smoke 须放宽沙箱跑（Mojo 命名管道在受限沙箱必 FATAL），userData 由脚本自设 `.smoke-user-data`（工作区内可写）+ no-sandbox/disable-gpu；隐藏窗口不出帧 → rAF 指标虚高（脚本量 rafGapMs 自检，>60ms 判不可信）；受控组件须样张自持 state（smoke 用原生 setter+input 事件喂值）；量法坑：DPR 1.25 下 1px 描边报 0.8px、居中要比 `documentElement.clientWidth`；vite `root` 必须保持 client/（Tailwind 内容探测），否则整页无样式；⚠ 迁移残留：`index.html` 仍引 `/tools/style-gallery/main.tsx`（404）→ 当前 `npm run style` 黑屏、smoke 必 FAIL（2026-11-05 实查；main.tsx/smoke.cjs 头注的用法路径同为旧 /tools/，待一行修复） |
| [swarm](swarm) | 蜂群同步回归：一次性 server + N 只 roombot + 语义断言 A1–A5（`npm run swarm`，退出码 = 结论） | 不信任·待收编 | e2e 洪泛不稳已登记 TODO |
| [ui-shot](ui-shot) | 真窗口截屏/点击探针（PowerShell + user32，无新依赖；界面改动「必须看过再交付」的工具） | 不信任·待收编 | userData 必须绝对路径（主进程拒载相对路径）；窗口抓取首选 printwin.ps1 |
| logsClean.mjs | 工作区日志清扫：扫 `logs/` 与历史散落模式，默认列单、`--yes` 删（白名单收口在本脚本内）；统一日志的配套件（决策笔记 unified-logging） | 不信任·待收编 | 白名单外的散落物不命中（宁可漏列不误删） |

另有 `client/plugins/`（官方插件工作区，运行时种子）不在本目录，规范与子树入口见 `client/plugins/AGENTS.md` / `client/plugins/PLUGINS.md`。
