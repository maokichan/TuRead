# 项目状态与决策记录（会话交接）

> 更新：2026-08-27（server v0.1.0 落地）｜目的：让下一次会话 / 模型以最低成本恢复上下文。
> 阅读顺序：本文件 → `MAP.md`（自动加载）→ `NETWORK.md` → `ARCHITECTURE.md` → `CLIENT-CONTRACTS.md` → `借物表.md`。

## 1. 一句话

TuRead = **多人房间共读阅读器**：多个用户进入同一房间，共同阅读同一本书。
渲染/解析复用 [kookit](https://github.com/koodo-reader/kookit)（AGPL-3.0，git submodule）；
同步服务器用 Go，**v0.1.0 已实现**（仓库内 `server/`）；**client 尚未开发**。

## 2. 仓库与提交（`D:\PROJECT\TuRead`）

- git 仓库：本地 `main`，`origin = https://github.com/maokichan/TuRead.git`（**未推送**，推回 fork 的时机由用户定）
- 提交历史：`aff370c` 基线骨架 → `cf58376` 契约 v0.1 → `3a72d3d` 借物表+插件决策 → `ffb4712` 契约 v0.2 → `4000db5` 术语定案 → `8a8b46a` 会话交接 → 本次（server v0.1.0）
- 结构：`client/`（空骨架，待搭）｜`server/`（v0.1.0，Go module）｜`kookit/`（submodule，HEAD `6e18465`）｜`docs/`｜`借物表.md`
- 网络配方：见 `D:\PROJECT\NETWORK.md`（git 需 `-c http.proxy=http://127.0.0.1:7897 -c http.sslBackend=openssl`；Go 需 `GOPROXY=https://goproxy.cn,direct`；npm registry 直连）

## 3. 已定决策

| 决策 | 内容 |
|---|---|
| 开发范围 | **server v0.1.0 已实现**；client 尚未开发（ARCHITECTURE.md §5） |
| 架构选型 | **六边形（端口-适配器）为骨架 + DDD 命名为层内词汇**，二者不冲突（ARCHITECTURE.md §2） |
| server 分层 | `cmd/server` 入口 → `internal/transport`(REST+WS) → `internal/room`(用例,内存) → `internal/store`(SQLite+文件) → `internal/domain`(领域) |
| 客户端契约 v0.2 | 能力服务：`IRenderService` / `INetService` / `IBookIdentityService` / `ILibraryStore`；应用服务：`IRoomSession` / `IBookService` |
| 书籍标定 | **两层模型**：Work（同一本书 = 识别协议+编码：isbn/asin/doi/open-library/content-hash-v1）+ Edition（同一电子版 = 扩展名+指纹+size）；server 只持久化 works/editions，**房间/成员/位置纯内存** |
| 版本指纹 | **头/中/尾三点采样**（头64KB+中点64KB+尾64KB 拼接哈希），算法 `md5-sample3-v1`（client 侧 `IBookIdentityService` 待同步） |
| 认证 | **v1 不认证**：昵称+随机后缀标识成员，学习期接受冒充风险 |
| 副本分发 | **server 保存并分发电子版副本**：内容寻址存储 `data/books/<hash>.<ext>`（按 hash 去重）；无书成员加入时可下载 |
| 房间同步 | WS 消息信封：`room.join` / `room.join-ack` / `room.location` / `room.presence`（server 定义，client 适配） |
| kookit 能力 | 支持漫画 cbz/cbr/cbt/cb7（ComicRender）；扫描 PDF 内置 OCR（tesseract/paddle）；`Book.md5` 由调用方计算 |
| OCR 候选 | OCR-buddy（MIT）技术路线 `ppu-paddle-ocr` + `onnxruntime-web`（PP-OCRv5，纯本地）可在 Electron 渲染进程复用；`IOcrService` 草案未入契约 |
| 插件 | v1 **不做插件运行时**；官方插件 = 实现某 port 注册进 `ServiceContainer`（ARCHITECTURE.md §7） |
| 许可 | kookit AGPL-3.0 → TuRead 以 **AGPL-3.0** 开源；所有第三方资源登记于 `借物表.md` |
| 学习路径（护栏式） | **不暂停项目**；v1 用三层直觉 + 两个接缝（kookit 包一层、同步/传输分离）；**Rule of Three**；检查点：大改前写一行理由、不知道代码放哪层就停下讨论；解释优先 |

## 4. 待办 / 待确认（下次开始）

- [ ] server **冒烟测试 / WS 联调**（模拟两个客户端 join → 广播位置，验证整条链路）
- [ ] client v1 骨架：Electron + React + `core/{domain,usecases,ports,adapters}` 落成真实 TS
- [ ] 契约 v0.2 用户评审反馈；`BookFingerprint.algorithm` 需同步为 `md5-sample3-v1`
- [ ] UI 技术栈最终确认（React 倾向，未定死）
- [ ] OCR（ISBN 提取）是否进 v1
- [ ] server 部署形态（VPS/Docker）——不影响代码，仅配置（`TUREAD_ADDR` / `TUREAD_DATA_DIR`）

## 5. 2026-08-27 会话记录（server 数据库设计与 v0.1.0）

- 确认 server 服务形态：单进程 Go web 服务（HTTP REST + WebSocket + SQLite），部署形态未知不影响开发（数据目录/端口可配置）
- 数据库设计讨论并定案：Work/Edition 两层模型；协议枚举含 content-hash 兜底；指纹三点采样；房间纯内存；要分发副本
- 实现 `server/` v0.1.0：domain（标定/ISBN 校验/信封）+ store（SQLite 注册表 + 内容寻址文件）+ room（内存房间管理）+ transport（REST + WS）；已 `go build ./...` 通过
- 新依赖（已登记借物表）：`gorilla/websocket` v1.5.3（BSD-3-Clause）、`modernc.org/sqlite` v1.57.0（BSD-3-Clause）

## 6. 环境 / 沙箱事实

- 本地代理 `127.0.0.1:7897`（Clash Verge rev，verge-mihomo）；npm registry 直连；GitHub 直连被墙（走代理 + OpenSSL 后端）；curl.exe 不可用（仅 schannel）
- go 命令在沙箱下报 telemetry 写失败（`C:\Users\1\AppData\Roaming\go\telemetry`，噪音，不影响执行）；已 `go env -w GOPROXY=https://goproxy.cn,direct`
- kookit 子模块的 `CLAUDE.md` 规则：**禁止在其仓库内 git commit / push**
