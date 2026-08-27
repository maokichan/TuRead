# TuRead 抽象架构（共同版 v0.1）

> 状态：需求讨论期草稿 + **server v0.1.0 已落地**。**同步协议已由 server 实现定义**（消息集见 `server/docs/API.md`），client 适配。
> 原则：核心（core）与外壳（shell）分离；端口（接口）先立；传输 / UI / 存储可替换。
> 术语：本仓库中 "service" = 面向用例封装能力并提供接口的模块（koodo-reader 内部同款叫法：ConfigService / SyncHelper）。
> **本文只保留跨端共同内容**；各端专属细节已分家：
> client → `client/docs/ARCHITECTURE.md`（分层 / 平台 UI / 插件）与 `client/docs/CONTRACTS.md`（契约 v0.2）；
> server → `server/docs/ARCHITECTURE.md`（模块 / 通讯模型）与 `server/docs/API.md`（接口契约）。

---

## 1. 分层总览

```
┌──────────────────────────── 外壳层 Shell（可替换） ────────────────────────────┐
│  Desktop Shell（Electron + React）          ← v1 目标                          │
│  Web Shell（浏览器）/ Android Shell（RN + WebView） ← 未来，复用 core           │
└───────────────────────────────────────────────────────────────────────────────┘
                                  │ 只调用 ↓
┌──────────────────────────── 应用服务 / 用例层（业务逻辑，框架无关 TS） ─────────┐
│  IRoomSession（房间会话） · IBookService（书架+导入）                            │
│  编排多个能力服务；接口在 core/usecases                                          │
└───────────────────────────────────────────────────────────────────────────────┘
                                  │ 编排 ↓
┌──────────────────────────── 能力服务层 ports（包装外部能力） ──────────────────┐
│  IRenderService(kookit) · INetService(传输) · IBookIdentityService · ILibraryStore │
│  接口在 core/ports，实现（适配器）在 core/adapters                              │
└───────────────────────────────────────────────────────────────────────────────┘
                                  │ HTTP / WebSocket / 自定义（协议待定）
┌──────────────────────────── 服务端 server（Go，独立项目） ────────────────────┐
│  handler → 用例（房间操作）→ 领域（房间状态/标定规则）→ 基础设施（存储/传输）    │
└───────────────────────────────────────────────────────────────────────────────┘
```

## 2. 架构选型与术语（六边形 × DDD × Clean，不冲突）

**结论**：以**六边形架构（Ports & Adapters）为结构骨架**，以 **DDD 战术命名为层内词汇**；Clean Architecture 是二者的同心圆图示，经典三层是其简化版。三者描述同一模型的不同侧面：

| 概念 | 六边形（Cockburn） | DDD（Evans） | Clean（Martin） | 本项目 |
|---|---|---|---|---|
| 最内层 | 应用核心（core） | 领域层（实体/值对象/领域服务） | Entities | `core/domain` |
| 业务编排 | （core 内部未细分） | 应用服务（用例） | Use Cases | `core/usecases`（RoomSession / BookService） |
| 能力接缝 | 端口（driving / driven） | 仓库 / 基础设施接口 | Interface Adapters 的接口侧 | `core/ports`（IRenderService / INetService / ILibraryStore） |
| 外部实现 | 适配器 | 基础设施 | Interface Adapters / Frameworks | `core/adapters` + 外壳（Electron / React） |

**本项目统一术语（此后不再混用）：**

- **领域层 `core/domain`**：值对象（`BookLocation`、`BookFingerprint`）、实体（`BookRecord`、`Note`）、领域服务（业务规则，如 `verify` 指纹比对）。零依赖，被所有层共享。
- **应用服务 `core/usecases`**：用例编排，薄、不含业务规则判断（`RoomSession`、`BookService`）。
- **端口 `core/ports`**：核心定义的接口（六边形的 driven ports / DDD 的仓库接口），如 `IRenderService`、`INetService`、`ILibraryStore`。
- **适配器 `core/adapters`**：端口的实现（kookit / ws / sqlite）。
- **外壳（UI）**：六边形的 driving adapter（React + Electron），只调用应用服务与领域类型。

> 术语修正历史（`ISyncService` → `INetService` + `IRoomSession`）见 `client/docs/ARCHITECTURE.md` §4。

## 3. 书籍标定（Work / Edition 两层模型）

**目标**：房间内所有成员读的是同一本书的**同一电子版**（严格模式，房间绑定 Edition）。

- **Work（同一本书）**：识别协议 + 识别编码唯一确定。协议枚举：`isbn`（校验位）/ `asin` / `doi` / `open-library` / `content-hash-v1`（非标出版物兜底 = 标题+作者归一化哈希）。
- **Edition（同一电子文件）**：扩展名 + 指纹唯一确定。指纹 = **头/中/尾三点采样**（头 64KB + 中点 64KB + 尾 64KB 拼接哈希，算法 `md5-sample3-v1`）+ 文件大小；参考 koodo-reader 的 `getBookPartialMd5`，kookit 的 `Book` 模型自带 `md5` 字段但**计算是调用方职责**。
- **服务端注册表（SQLite）**：`works`（work 元数据 + 协议 + 编码）→ `editions`（指纹 + source + 分发副本路径）。
- **房间绑定 edition**；加入房间时客户端上报指纹 → 服务端比对 → 一致放行 / 不一致拒绝（`book-mismatch`）；无书成员可上报 Work 信息并从 server 下载副本。
- **客户端本地书库**同样记录指纹（导入时计算，crypto-js / Web Crypto / Node crypto）。

## 4. 文档归属（各端内容去哪）

| 内容 | 位置 |
|---|---|
| 分层总览 / 术语 / 书籍标定 / 跨端待定 | 本文（`docs/ARCHITECTURE.md`） |
| 客户端分层、平台与 UI、扩展插件 | `client/docs/ARCHITECTURE.md` |
| 客户端契约（domain / usecases / ports / adapters 接口） | `client/docs/CONTRACTS.md` |
| 服务端模块、通讯模型（token 双闸） | `server/docs/ARCHITECTURE.md` |
| REST / WS 接口契约 | `server/docs/API.md` |
| 项目状态与决策记录 | `docs/STATUS.md` |
| 第三方资源与许可证 | `借物表.md` |

## 5. 跨端待定事项

- [x] 同步协议消息集 / 传输方式 —— **已由 server v0.1.0 定义**（REST + WS 信封，见 `server/docs/API.md`）
- [ ] 书籍来源（仅本地导入 vs 服务器共享书库）
- [ ] 账号体系（游客昵称 vs 注册）—— 影响 `RoomMember.id` 语义
