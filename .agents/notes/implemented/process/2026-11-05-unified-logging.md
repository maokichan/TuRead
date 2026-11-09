# 决策：统一日志——单行 JSONL 契约、双落点与工作区清扫

Status: implemented

## Problem

生产环境完全没有日志：无 logger 模块、无文件写入；Windows 下 Electron 的 stdout 抓不到，
打包产物崩溃/异常**无声消失**——主窗口没有 render-process-gone 处理、
主进程没有 uncaughtException 兜底。测试侧 15+ 种产物散落各处（`.probe-run*.log`、根/client
`*.log`、`server/server*.log`、kookit npm 日志、smoke 报告落 %TEMP%），无任何清理机制。
renderer 的 console-message 转发只存在于 dev 探针分支。

## Decision

- **契约 = 单行 JSONL**（`client/src/shared/log.ts`）：`{t, lvl, scope, msg, err?}` 一行一事件；
  轮转与修剪判据同为纯函数（仿 shared/plugin.ts 先例）并带单测。
- **文件适配器**（`client/src/main/logFile.ts`）：`<userData>/logs/app.jsonl`；启动轮转
  （>5MB 改名 `app-<时间戳>.jsonl`）+ 修剪（归档留 7 份/14 天）；**永不抛错**——自身故障降级
  stderr。dev 与生产同格式同落点：探针用隔离 userData，日志天然随目录隔离。
- **常驻转发**（main/index.ts）：renderer `console-message` 从「仅探针分支」提升为常驻——
  生产记 warn/error（vendor info 噪音不进文件），探针态全量（自检标记/插件日志落盘）；
  `[TUREAD-TEST-*]` 标记的退出逻辑保留在探针态。主窗口补 render-process-gone 留痕；
  主进程补 unhandledRejection / uncaughtException 兜底（后者记文件后 exit(1)）。
- **工作区收拢点 = 仓库根 `logs/`**（gitignored）：smoke 报告从 %TEMP% 移入；
  历史散落由 `client/scripts/logsClean.mjs` 归拢（默认列单，`--yes` 删，白名单模式）。
- **边界**：logStore（内存环 200 条）保留给探针自检；现有 console.* 不强制迁移（新代码走
  fileLog）；Go server 保持 stderr（独立进程，`log_level` 预留字段不动）——本决策只管 client。

## Alternatives considered

- **electron-log 等日志库**：输在——装依赖先问人（红线）+ 零依赖是本项目工具链惯例；其轮转
  能力本决策用 ~60 行纯函数自持，不值得为此破例。
- **日志进 SQLite**：输在——诊断数据混进用户数据，膨胀库体积且崩溃时可能与业务库同死。
- **维持只 console**：输在——打包产物不可诊断是现状最大缺口，stdout 在 Windows 抓不到是
  既有事实；「测试日志统一标准」的原始诉求也无法由 console 满足。

## Consequences

换来的：打包产物首次可诊断（崩溃/渲染错误落文件）；测试与生产日志同格式，断言/清理/查看
一套工具；TODO「打包产物跑自检不自退」的输出侧已解（退出侧仍是独立工程项）。付出的：生产
不记 renderer info（kookit vendor 噪音考量）——插件日志在生产不落盘，只进内存 logStore，
这是已知漏检面；主进程现存 console.* 未接 fileLog（记 stderr，打包后同样丢失），迁移随触
随改不做专项；kookit submodule 的 .gitignore 缺口无法在本仓库修（上游问题，logsClean 兜底）。
