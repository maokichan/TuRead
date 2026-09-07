# 项目状态与决策记录（会话交接）

> 目的：让下一次会话/模型以最低成本恢复上下文。
> 阅读顺序：本文件 → `MAP.md`（自动加载）→ `TODO.md` → 各端架构文档（见 MAP）。
> 更新：2026-09-07（client v0.1.3：定位标准立约 + 渲染链路闭环 + 文档收紧）
> 原则：本文件只记**当前事实与决策**；过程叙事在 git log 与各专项文档，不在此复述。

## 1. 一句话

TuRead = **多人房间共读阅读器**：多个用户进入同一房间，共同阅读同一本书。
渲染/解析复用 [kookit](https://github.com/koodo-reader/kookit)（AGPL-3.0，git submodule）；
同步服务器用 Go，**v0.2.0 已实现**（仓库内 `server/`）；**client v0.1.3**。

## 2. 仓库与提交（`D:\PROJECT\TuRead`）

- git 仓库：本地 `main`，`origin = https://github.com/maokichan/TuRead.git`（独立仓库，非 fork）
- 结构：`client/`（Electron 客户端）｜`server/`（独立 Go module）｜`kookit/`（submodule，HEAD `6e18465`）｜`docs/`｜`TODO.md`｜`借物表.md`
- 网络配方：见 `D:\PROJECT\NETWORK.md`（git 需代理 + OpenSSL；Go `GOPROXY=goproxy.cn`；npm 直连）

## 3. 已定决策（要点；细节见权威文档）

| 决策 | 要点 | 权威位置 |
|---|---|---|
| 架构选型 | client = 六边形（端口-适配器）+ DDD 命名；**server = 简单分层**（cmd→transport→room→store→domain，非六边形） | `client/docs/ARCHITECTURE.md` §1；`server/docs/ARCHITECTURE.md` §5 |
| 定位标准 | BookLocation 字段三级角色（key/hint/display）+ 标准原语收拢进 `core/domain/location.ts`；**任何组件不得自行比较/解释位置字段**（笔记/同步回跳/进度/恢复共用） | `client/docs/CONTRACTS.md` §2.1 |
| 书籍标定 | Work/Edition 两层模型；Work 不设 author/publisher；content-hash-v1 = edition 内容指纹；指纹 `md5-sample3-v1` 三点采样 | `docs/ARCHITECTURE.md` §1 |
| 认证 | **token 双闸**：二级令牌 + 成员 token（服务端按 IP 签发，7 天复用窗口）；无账号/密码 | `server/docs/ARCHITECTURE.md` §2；`server/docs/API.md` |
| 房间 | 定义落库 + 运行时纯内存；空房间 TTL 12h（可热改）；发现 = `GET /rooms`；v1 默认公开可见 | `server/docs/API.md` |
| 聊天室 | `room.chat`/`room.message` + messages 表（追加日志）；随房间删除级联清理 | `server/docs/API.md` |
| 同步边界 | 状态转发而非操作转发（只同步 BookLocation 与聊天）；笔记/划线/光标在场 v1 明确排除（信封预留扩展） | `server/docs/API.md` 转发规范 |
| 配置 | TOML + 环境变量覆盖 + 热重载（策略类 2s 生效） | `server/docs/OPS.md` |
| 副本分发 | server 保存并分发电子版副本（内容寻址）；edition 信息由客户端计算随副本上传 | `server/docs/API.md` |
| 客户端样式 | **Tailwind CSS 采纳（2026-09-07）**：随「UI 组件化」引入，替换手写 styles.css；MIT 已核 | 借物表；TODO |
| 插件 | v1 不做插件运行时；ports 即插件边界（官方插件 = 适配器注册进 ServiceContainer） | `client/docs/ARCHITECTURE.md` §4 |
| 许可 | kookit AGPL-3.0 → TuRead 以 **AGPL-3.0** 开源；新依赖先核许可证再登记借物表 | `借物表.md` |
| 仓库形态 | 单仓库 monorepo（server 可零成本拆出） | `docs/ARCHITECTURE.md` §2 |
| 开发原则 | v1 允许"丑但诚实"；**解释优先**；大改前写理由（Rule of Three） | — |

## 4. 版本历史

### client

| 版本 | 日期 | 内容 |
|---|---|---|
| v0.1.3 | 2026-09-07 | **定位标准立约**（CONTRACTS §2.1 + `domain/location.ts`：key/hint/display 三级角色 + normalize/same/compare/anchorStrength 原语；chapterDocIndex 收窄为 number）+ **渲染链路闭环**（EPUB"正文空"销案=测量假象；修宿主 CSS 压扁 iframe、PDF scroll iframe 不拉高两真 bug；App 无头自检 EPUB/MOBI/AZW3/PDF 全绿）+ **Tailwind 采纳定案** + 文档全面收紧 |
| v0.1.2 | 2026-09-01 | kookit 遗留修复（初始导航/CSP blob:/overflow）+ PDF 支持实装（pdfjs 注入 + /lib/pdfjs/ 静态资源）+ 封装接口定型（RENDER_INTERFACE.md） |
| v0.1.1 | 2026-08-31 | render 适配器实装（vendor 单文件 ESM + readFile 注入 + 阅读视图 + 无头验证）；harness 隔离测试定位"缺初始导航"根因 |
| v0.1.0 | 2026-08-31 | 骨架：electron-vite + React + `core/{domain,ports,usecases,adapters}`（CONTRACTS v0.2.1）；net/identity/storage 适配器做实；最小可运行窗口 |

### server

| 版本 | 日期 | 内容 |
|---|---|---|
| v0.2.0 | 2026-08-31 | 房主删房 + 测试组织（E2E 独立 `server/test/e2e/` 黑盒）+ HTTP 服务模型文档 |
| v0.1.0–v0.1.6 | 2026-08-27~29 | 房间同步 + Work/Edition 标定（schema v3）+ token 双闸 + 传输基本功（背压/healthz/优雅关停）+ 空房间 TTL + 房间发现 + TOML 配置/热重载 + 聊天室（schema v4）+ 转发规范定稿 + owner_token / 按 IP 签发成员 token（schema v5）+ OPS 手册 |

## 5. 环境 / 沙箱事实

- 本地代理 `127.0.0.1:7897`（Clash Verge rev）；npm registry 直连；GitHub 直连被墙（走代理 + OpenSSL）；curl.exe 不可用
- go 沙箱下 telemetry 报错是噪音；`GOPROXY=https://goproxy.cn,direct`；`go build` 把 GOCACHE 指到工作区
- 测试：`go test ./...`（白盒在源码旁）+ `server/test/e2e/`（黑盒走 HTTP/WS）
- kookit 子模块的 `CLAUDE.md` 规则：**禁止在其仓库内 git commit / push**
