# 项目状态与决策记录（会话交接）

> 目的：让下一次会话 / 模型以最低成本恢复上下文。
> 阅读顺序：本文件 → `MAP.md`（自动加载）→ `TODO.md` → 各端架构文档（见 MAP）。
> 更新：2026-08-31（server v0.2.0；client v0.1.1 kookit 渲染实装中，隔离测试定位真因：缺初始导航 + CSP blob:）

## 1. 一句话

TuRead = **多人房间共读阅读器**：多个用户进入同一房间，共同阅读同一本书。
渲染/解析复用 [kookit](https://github.com/koodo-reader/kookit)（AGPL-3.0，git submodule）；
同步服务器用 Go，**v0.2.0 已实现**（仓库内 `server/`）；**client 骨架 v0.1.0、kookit 渲染集成 v0.1.1 实装中**。

## 2. 仓库与提交（`D:\PROJECT\TuRead`）

- git 仓库：本地 `main`，`origin = https://github.com/maokichan/TuRead.git`（**已推送 2026-08-29，HEAD `f9dea3f3`**；2026-08-29 因管理原因取消原 fork（V2tin19/TuRead），重建为**独立仓库**，README 有说明）
- 结构：`client/`（仅 docs，待开发）｜`server/`（v0.2.0，独立 Go module）｜`kookit/`（submodule，HEAD `6e18465`）｜`docs/`｜`TODO.md`｜`借物表.md`
- 网络配方：见 `D:\PROJECT\NETWORK.md`（git 需 `-c http.proxy=http://127.0.0.1:7897 -c http.sslBackend=openssl`；Go 需 `GOPROXY=https://goproxy.cn,direct`；npm registry 直连）

## 3. 已定决策（要点；细节见权威文档）

| 决策 | 要点 | 权威位置 |
|---|---|---|
| 架构选型 | client = 六边形（端口-适配器）+ DDD 命名；**server = 简单分层**（cmd→transport→room→store→domain，非六边形） | `client/docs/ARCHITECTURE.md` §1；`server/docs/ARCHITECTURE.md` §5 |
| 书籍标定 | Work/Edition 两层模型；**Work 不设 author/publisher**（多作者远期复杂不做，ISBN 提供可查询性）；content-hash-v1 = **edition 内容指纹**（客户端校准算法计算）；指纹 `md5-sample3-v1` 三点采样 | `docs/ARCHITECTURE.md` §1 |
| 认证 | **token 双闸**：第 2 层二级令牌（配置 `access_token`）+ 第 3 层成员 token = 成员 ID（**服务端按 IP 签发**，`POST /auth/token`，7 天复用窗口）；无账号/密码 | `server/docs/ARCHITECTURE.md` §2；`server/docs/API.md` 认证 |
| 房间 | 定义落库（rooms 表）+ 运行时状态（成员/位置/订阅）纯内存；空房间 TTL（默认 12h，可热改）；发现 = `GET /rooms`（大厅）+ `?edition=`（按书找房）；v1 房间默认公开可见 | `server/docs/API.md`（转发规范 + REST） |
| 聊天室 | v1 进；`room.chat`/`room.message` + messages 表（追加日志，server 存）；历史 `GET /rooms/{id}/messages`；随房间删除级联清理 | `server/docs/API.md`（转发规范） |
| 配置 | TOML 文件 + 环境变量覆盖 + 文件监听热重载（策略类 2s 生效；启动类需重启） | `server/docs/OPS.md` |
| 传输基本功 | 广播背压（每连接队列 32 + 写 goroutine）+ `/healthz` + 优雅关停（10s） | `server/docs/ARCHITECTURE.md` §4 |
| 副本分发 | server 保存并分发电子版副本（内容寻址 `data/books/<hash>.<ext>`）；edition 信息由客户端计算并随副本一起上传 | `server/docs/API.md` 副本流程 |
| 插件 | v1 不做插件运行时；ports 即插件边界（官方插件 = 适配器注册进 ServiceContainer） | `client/docs/ARCHITECTURE.md` §4 |
| 许可 | kookit AGPL-3.0 → TuRead 以 **AGPL-3.0** 开源；新依赖先核许可证再登记借物表 | `借物表.md` |
| 仓库形态 | **单仓库 monorepo**（server 独立 Go module 可零成本拆出）；触发条件：独立发布节奏 / 独立 CI / 权限分离 | `docs/ARCHITECTURE.md` §2 |
| 开发原则 | v1 允许"丑但诚实"；**解释优先**；检查点——大改前写理由、不知代码放哪层就停下讨论（Rule of Three） | — |

## 4. 版本历史

### client

| 版本 | 日期 | 内容 |
|---|---|---|
| v0.1.1 | 2026-08-31 | **kookit 渲染集成（实装中）**：render 适配器从桩换真实实现——vendor 单文件 ESM（全依赖内联 `client/src/vendor/kookit.esm.js`，定制构建 `kookit/rollup.turead.config.mjs` 不受 kookit 版本控制）；容器注入 `readFile`；导入改主进程对话框（`dialog:pick-book` + `fs:read-file`）拿真实路径；阅读视图（打开→renderTo→翻页→进度）；dev 无头验证 `TUREAD_DEV_BOOK=<path>`（启动即导入打开 + 渲染自检 + `TUREAD-TEST-*` 标记自动退出）。**关键契约：kookit `getDocument()` 硬编码查 `#page-area`**（不认传入元素）→ reader-stage 必须带该 id，否则 `renderTo` 永不 resolve（已修）。**隔离测试已定位真因（见 `client/docs/KOOKIT.md` + `client/tools/kookit-harness/`）**：无 CSP 独立测试页 + 无头验证 → **EPUB/MOBI/AZW3 渲染 OK**（98/13/7 章，正文/滚动正常）；**正文空根因 = 适配器 `renderTo` 后只调 `record()`、缺一次导航调用**（kookit `renderTo` 只建 iframe 不渲染正文，须 `goToChapterIndex(0)`/`goToPosition`）；CSP 拦 `blob:` 为次因（影响 iframe 内图/CSS）；**PDF 超时 = mono 单文件未内联 `window.pdfjsLib`**（外部全局 + `/lib/pdfjs/` 静态资源，另依赖 fabric/PDFLib/ort 等）非 CSP。修复方向：适配器补初始导航 + CSP 放行 `blob:` 后重跑 4 格式 + 真机交互 |
| v0.1.0 | 2026-08-31 | **骨架**：electron-vite + React + TS；`core/{domain,ports,usecases,adapters}` 落成真实 TS（CONTRACTS v0.2.1）；`ServiceContainer` 装配；最小可运行窗口（书架/服务器/房间/日志）。适配器：net=主进程 ws+REST（token 双闸、自动签 token、断线重连）+ IPC 桥，identity=md5-sample3-v1 指纹（spark-md5，头/中/尾三点采样），storage=主进程 JSON 文件（userData/library.json），render=kookit 桩。**契约 v0.2.1**：INetService 补 `request()`/`getMemberId()`，NetConfig 补 accessToken/memberToken，IRoomSession 补 createRoom/uploadBookCopy/listRooms（REST 缺口，只增不改）。技术栈定案：electron-vite + React（未定死 → 已定）；Electron 33.4.11（复用 TagHit 本地二进制，避开 GitHub 下载）。类型检查 + build + 冒烟全绿 |

### server

| 版本 | 日期 | 内容 |
|---|---|---|
| v0.2.0 | 2026-08-31 | 房主删房（`DELETE /rooms/{id}` 开放给房主：资源级 vs admin 全局级；`rooms.owner_token` 判定）+ 测试组织（E2E 集成测试独立到 `server/test/e2e/` 黑盒包，白盒单测留源码旁）+ HTTP 服务模型文档（ARCHITECTURE §4.4） |
| v0.1.0 | 2026-08-27 | 房间同步（REST + WS）+ 书籍标定（Work/Edition）+ 电子版分发；schema v2 |
| v0.1.1 | 2026-08-27 | token 双闸认证（二级令牌 + 成员 token）+ users 档案 + 管理接口（admin） |
| v0.1.2 | 2026-08-27 | 传输基本功（背压 / healthz / 优雅关停）+ 文件级整理；已推送 |
| v0.1.3 | 2026-08-27 | Work 去 author/publisher；content-hash-v1 重定义为 edition 内容指纹（schema v3） |
| v0.1.4 | 2026-08-27 | 空房间 TTL（12h）+ 房间发现（GET /rooms / ?edition=） |
| v0.1.5 | 2026-08-29 | TOML 配置 + 热重载 + 上传限制 + 聊天室（rooms/messages 落库，schema v4）+ 转发规范定稿 + 离开广播补丁 + E2E 冒烟固化 + OPS 运维手册 |
| v0.1.6 | 2026-08-29 | rooms.owner_token（房主身份 token 化）+ 成员 token 改**服务端按 IP 签发**（schema v5）；数字 id 不引入 |

## 5. 环境 / 沙箱事实

- 本地代理 `127.0.0.1:7897`（Clash Verge rev）；npm registry 直连；GitHub 直连被墙（走代理 + OpenSSL 后端）；curl.exe 不可用（仅 schannel）
- go 命令在沙箱下报 telemetry 写失败（噪音，不影响执行）；`GOPROXY=https://goproxy.cn,direct`；`go build` 需把 `GOCACHE` 指到工作区
- 测试路径：`go test ./...`（白盒单测留在源码旁 `internal/*`；E2E 集成测试独立在 `server/test/e2e/`，黑盒走公开 HTTP/WS）；真实部署冒烟用 `cmd/smoke`（待部署形态确定后补）
- kookit 子模块的 `CLAUDE.md` 规则：**禁止在其仓库内 git commit / push**
