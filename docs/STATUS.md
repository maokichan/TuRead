# 项目状态与决策记录（会话交接）

> 更新：2026-08-24（会话休整前）｜目的：让下一次会话 / 模型以最低成本恢复上下文。
> 阅读顺序：本文件 → `CLAUDE.md`（自动加载）→ `NETWORK.md` → `ARCHITECTURE.md` → `CLIENT-CONTRACTS.md` → `借物表.md`。

## 1. 一句话

TuRead = **多人房间共读阅读器**：多个用户进入同一房间，共同阅读同一本书。
渲染/解析复用 [kookit](https://github.com/koodo-reader/kookit)（AGPL-3.0，git submodule）；
同步服务器用 Go（**独立项目**）。**当前只开发 client。**

## 2. 仓库与提交（`D:\PROJECT\TuRead`）

- git 仓库：本地 `main`，`origin = https://github.com/maokichan/TuRead.git`（**未推送**，推回 fork 的时机由用户定）
- 提交历史：`aff370c` 基线骨架 → `cf58376` 契约 v0.1 → `3a72d3d` 借物表+插件决策 → `ffb4712` 契约 v0.2 → `4000db5` 术语定案 → 本次状态记录
- 结构：`client/`（空骨架，待搭）｜`server/`（独立项目占位）｜`kookit/`（submodule，HEAD `6e18465`）｜`docs/`｜`借物表.md`
- 网络配方：见 `D:\PROJECT\NETWORK.md`（git 需 `-c http.proxy=http://127.0.0.1:7897 -c http.sslBackend=openssl`；Go 需 `GOPROXY=https://goproxy.cn,direct`；npm registry 直连）

## 3. 已定决策

| 决策 | 内容 |
|---|---|
| 开发范围 | **本次只做 client**；server 是 TuRead 计划中的另一独立项目（ARCHITECTURE.md §5） |
| 架构选型 | **六边形（端口-适配器）为骨架 + DDD 命名为层内词汇**，二者不冲突（ARCHITECTURE.md §2） |
| 客户端分层 | 领域层 `core/domain`（值对象/实体/领域服务）→ 应用服务 `core/usecases`（RoomSession/BookService）→ 端口 `core/ports` → 适配器 `core/adapters` → 外壳（Electron/React） |
| 契约 v0.2 | 能力服务：`IRenderService`(kookit) / `INetService`(传输，信封 `MessageEnvelope` 语义待 server 定) / `IBookIdentityService`(指纹) / `ILibraryStore`(存储)；应用服务：`IRoomSession`(房间会话) / `IBookService`(书架+导入) |
| 书籍标定 | 指纹 = 部分哈希 + size（主），ISBN/元数据（次）；服务端 book 注册表 + 房间绑定 bookId；加入房间上报指纹比对 |
| kookit 能力 | 支持漫画 cbz/cbr/cbt/cb7（ComicRender）；扫描 PDF 内置 OCR（tesseract/paddle）；`Book.md5` 由调用方计算 |
| OCR 候选 | OCR-buddy（MIT）：本体是 Chrome 扩展不能嵌入；技术路线 `ppu-paddle-ocr` + `onnxruntime-web`（PP-OCRv5，纯本地）可在 Electron 渲染进程复用；`IOcrService` 草案未入契约 |
| 插件 | v1 **不做插件运行时**；官方插件 = 实现某 port 注册进 `ServiceContainer`（ARCHITECTURE.md §7） |
| 许可 | kookit AGPL-3.0 → TuRead 以 **AGPL-3.0** 开源；所有第三方资源登记于 `借物表.md` |
| 学习路径（护栏式） | **不暂停项目**；v1 用三层直觉 + 两个接缝（kookit 包一层、同步/传输分离）；**Rule of Three**（第一次做对，第二次做通用，第三次才抽象）；检查点：大改前写一行理由、不知道代码放哪层就停下讨论；解释优先 |

## 4. 待办 / 待确认（下次开始）

- [ ] **数据库 / 持久化设计**（用户已有想法，优先聊）→ `ILibraryStore` 的 schema（books / settings，可能 notes）
- [ ] 搭 client v1 骨架：Electron + React + `core/{domain,usecases,ports,adapters}` 落成真实 TS
- [ ] 契约 v0.2 用户评审反馈；术语定案（§2 表格）待用户最终确认
- [ ] UI 技术栈最终确认（React 倾向，未定死）
- [ ] OCR（ISBN 提取）是否进 v1
- [ ] 同步协议消息集与传输细节（归 server 项目）

## 5. 环境 / 沙箱事实

- 本地代理 `127.0.0.1:7897`（Clash Verge rev，verge-mihomo）；npm registry 直连；GitHub 直连被墙（走代理 + OpenSSL 后端）；curl.exe 不可用（仅 schannel）
- go 命令在沙箱下报 telemetry 写失败（`C:\Users\1\AppData\Roaming\go\telemetry`，噪音，不影响执行）
- kookit 子模块的 `CLAUDE.md` 规则：**禁止在其仓库内 git commit / push**
