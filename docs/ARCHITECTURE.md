# TuRead 抽象架构（草稿 v0.1）

> 状态：需求讨论期草稿。**同步协议尚未确定**，本阶段只定模块边界与接口（契约），实现后填。
> 原则：核心（core）与外壳（shell）分离；端口（接口）先立；传输 / UI / 存储可替换。
> 术语：本仓库中 "service" = 面向用例封装能力并提供接口的模块（koodo-reader 内部同款叫法：ConfigService / SyncHelper）。
> **开发范围：本次开发只做 client**。server 是 TuRead 计划中的**另一个独立项目**（后续单独启动），本文第 4 节仅作规划参考。

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

**修正记录**：v0.1 的 `ISyncService` 曾把"端口"与"应用服务"混为一谈，v0.2 已拆分为 `INetService`（端口）+ `IRoomSession`（应用服务）。术语以此表为准。

## 3. 书籍标定（同一本书 = 同一电子版）

**目标**：房间内所有成员读的是同一本书的**同一电子版**。

- **指纹（主）**：文件哈希 + 文件大小。大文件用**部分哈希**策略（参考 koodo-reader 的 `getBookPartialMd5`），kookit 的 `Book` 模型自带 `md5` 字段但**计算是调用方职责**。
- **元数据（次）**：ISBN / 标题 / 作者。epub、fb2 等有结构化元数据；pdf、txt 不一定有 → 作为二级匹配，不做强约束。
- **服务端 book 注册表**：`{ bookId, hash, size, isbn?, title, author, cover, createdAt }`。
- **房间绑定 bookId**；加入房间时客户端上报指纹 → 服务端比对 → 一致放行 / 不一致拒绝或警告。
- **客户端本地书库**同样记录 hash（导入时计算，crypto-js / Web Crypto / Node crypto）。

## 4. 客户端分层（权威契约见 `docs/CLIENT-CONTRACTS.md` v0.2）

**能力服务层（ports）—— 包装外部能力，单一职责，可替换：**

| 端口 | 职责 | 适配器 |
|---|---|---|
| `IRenderService` | kookit 包装：open/renderTo/翻页/goToPosition/位置事件/笔记 | kookit |
| `INetService` | 传输：connect/send/on('message')；**不理解业务语义**，只搬运消息信封 | 传输待定（WS 等） |
| `IBookIdentityService` | 算指纹（部分哈希）/ 提取元数据 / 标定比对 | 自研（crypto） |
| `ILibraryStore` | 本地书库持久化 | SQLite（better-sqlite3） |

**应用服务层（用例）—— 业务逻辑，编排能力服务：**

| 用例 | 职责 | 编排 |
|---|---|---|
| `IRoomSession` | 房间会话：加入（标定）→ 监听翻页自动广播 → 成员/位置事件 | net + render + identity |
| `IBookService` | 书架 + 导入：文件 → 指纹 → 元数据 → 入库 | identity + store（OCR 可选） |

> 术语澄清：kookit 被包装进 `IRenderService`（**能力服务**），把 kookit 产物翻译成领域类型（`BookLocation`）；
> **同步功能本体是 `IRoomSession`（用例）**，不是能力服务——它"在服务之上"编排多个能力服务，UI 调用它即可。

## 5. 服务端模块（Go，规划参考 —— 独立项目，本次不开发）

> server 不在本次开发范围，以下仅记录规划，避免后续重复设计。

| 模块 | 职责 |
|---|---|
| `room` | 房间状态机：成员、绑定书籍（bookId）、当前阅读位置；内存 + 持久化 |
| `book` | 书籍标定注册表：hash/isbn 查询、注册、比对 |
| `sync` | 同步事件分发（房间内广播）；传输层可换（WS / HTTP+SSE） |
| `store` | SQLite（modernc.org/sqlite，纯 Go 无 cgo）起步，规模上来再换 Postgres |
| `api` | REST（房间/书籍管理）+ 实时通道（同步） |

## 6. 平台与 UI（决策记录）

- **Electron = 桌面三平台**（Win/macOS/Linux），不支持移动端。
- **React(DOM) ≠ React Native**：移动端渲染层与交互逻辑不同，不是同一套代码（组件逻辑可部分共享）。
- **kookit 依赖 DOM** → 任何平台壳都必须提供 DOM/WebView；移动端方案 = RN + WebView + kookit-mobile 构建（koodo-reader 移动版同款做法）。
- **v1 只做 Desktop Shell**；core 接口为未来 Web/Android 壳预留，核心零改动。
- **多端构建**："构建时 ban 不用的" = 平台入口 + tree-shaking + 构建配置（打包期排除目标平台无关代码）。

## 7. 扩展与"官方插件"（决策记录）

- **现状**：服务端口（ports）本身就是插件边界 —— 一个"官方插件" = **实现某个 port 的适配器模块，注册进 `ServiceContainer`**（例如 OCR、翻译、词典等未来能力）。
- **v1 不引入插件运行时**（manifest / 加载器 / 热插拔 / 沙箱）。原因：使用量小、只做官方插件，动态加载的复杂度不值得。
- **演进路径**：若将来需要第三方插件，ports 模型可直接承接 —— 新增 plugin manifest + 动态加载 + IPC 通道，**端口定义不变**。
- 结论：扩展能力一律以"编译期内置适配器"承载；契约（`CLIENT-CONTRACTS.md`）保持稳定。
- 候选扩展服务：`IOcrService`（图片识别 → ISBN/封面文字；适配器可复用 OCR-buddy 的 PP-OCRv5 技术路线，MIT）——草案待契约定稿后并入。

## 8. 待定事项

- [ ] 同步协议细节（消息集 / 传输方式）
- [ ] 房间生命周期（空房间保留？房主权限？）
- [ ] 笔记 / 划线同步范围（v1 是否包含）
- [ ] 书籍来源（仅本地导入 vs 服务器共享书库）
- [ ] 账号体系（游客昵称 vs 注册）
- [ ] OCR（ISBN 提取）是否进 v1，`IOcrService` 接口草案
