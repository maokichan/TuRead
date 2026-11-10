# client 架构（分层 / 术语 / 平台 / 插件）

> 归属：**client 专属**。跨端共同内容（书籍标定 / 仓库布局）见 [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)；
> 客户端接口契约（权威）见 [`CONTRACTS.md`](CONTRACTS.md)；待办见唯一待办清单。
> 状态：本文的**分层 / 术语 / 插件态度**为设计定案（不随版本滚动）；视觉语汇以 [`STYLE.md`](STYLE.md) 为准，
> 代码落地与接口形状以 [`CONTRACTS.md`](CONTRACTS.md) 为准。

## 1. 架构选型与术语（六边形 × DDD × Clean，不冲突）

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
- **端口 `core/ports`**：核心定义的接口（六边形的 driven [ports](contracts/ports.md) / DDD 的仓库接口），如 `IRenderService`、`INetService`、`ILibraryStore`。
- **适配器 `core/adapters`**：端口的实现（kookit / ws / sqlite）。
- **外壳（UI）**：六边形的 driving adapter（React + Electron），只调用应用服务与领域类型。

**分层总览**（server 不是六边形 —— 它是独立的分层服务，模块见 [`../../server/docs/ARCHITECTURE.md`](../../server/docs/ARCHITECTURE.md)）：

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
                                  │ HTTP / WebSocket（信封，见 server/docs/API.md）
┌──────────────────────────── 服务端 server（Go，独立项目，非六边形） ────────────┐
│  cmd → transport → room → store → domain（依赖单向，见 server/docs/ARCHITECTURE.md） │
└───────────────────────────────────────────────────────────────────────────────┘
```

## 2. 分层模型与依赖规则（权威契约见 [`CONTRACTS.md`](CONTRACTS.md) v0.2）

**能力服务层（[ports](contracts/ports.md)）—— 包装外部能力，单一职责，可替换：**

| 端口 | 职责 | 适配器 |
|---|---|---|
| `IRenderService` | kookit 包装：open/renderTo/翻页/goToPosition/位置事件/笔记 | kookit |
| `INetService` | 传输：connect/send/on('message')；**不理解业务语义**，只搬运消息信封 | 主进程 WS + REST（`adapters/net/ipcNetAdapter` → `main/net/wsNetAdapter`） |
| `IBookIdentityService` | 算指纹（部分哈希）/ 提取元数据 / 标定比对 | 自研（spark-md5，crypto） |
| `ILibraryStore` | 本地书库持久化 | 主进程 SQLite（store.db，全局单库）+ JSON 引导文件（库注册表/窗口状态） |

**应用服务层（用例）—— 业务逻辑，编排能力服务：**

| 用例 | 职责 | 编排 |
|---|---|---|
| `IRoomSession` | 房间会话：加入（标定）→ 监听翻页自动广播 → 成员/位置/聊天事件 | net + render + identity |
| `IBookService` | 书架 + 导入：文件 → 指纹 → 元数据 → 入库 | identity + store（OCR 可选） |

**依赖规则**
- 领域层：纯类型与规则，不依赖任何技术 / 服务 / UI。
- 能力服务：依赖领域类型 + 各自外部能力（kookit、网络、存储…）；彼此不互相依赖。
- 应用服务（用例）：依赖**能力服务接口**（不依赖其实现）；一个用例可编排多个能力服务（如 `RoomSession` = net + render + identity + store）。
- UI：只依赖应用服务与领域类型。
- kookit 不是"被直接暴露"——它被包进 `IRenderService`（能力服务），把 kookit 产物翻译成领域类型（`BookLocation`）。

> 术语澄清：**同步功能本体是 `IRoomSession`（用例）**，不是能力服务——它"在服务之上"编排多个能力服务，UI 调用它即可。

## 3. 平台与 UI（决策记录）

- **Electron = 桌面三平台**（Win/macOS/Linux），不支持移动端。
- **React(DOM) ≠ React Native**：移动端渲染层与交互逻辑不同，不是同一套代码（组件逻辑可部分共享）。
- **kookit 依赖 DOM** → 任何平台壳都必须提供 DOM/WebView；移动端方案 = RN + WebView + kookit-mobile 构建（koodo-reader 移动版同款做法）。
- **v1 只做 Desktop Shell**；core 接口为未来 Web/Android 壳预留，核心零改动。
- **多端构建**："构建时 ban 不用的" = 平台入口 + tree-shaking + 构建配置（打包期排除目标平台无关代码）。

## 4. 扩展与"官方插件"（现状）

- **插件运行时已上线**（v0.2.x）：manifest 校验 + 渲染层动态 import + 右欄卡片页插件格（[src/renderer/src/plugins/runtime.ts](../src/renderer/src/plugins/runtime.ts) + [src/main/plugins.ts](../src/main/plugins.ts)）；获取 = 手动安装（GitHub Release zip 走设置页导入，无自动补齐），规范权威 = [`plugins/PLUGINS.md`](../plugins/PLUGINS.md)。
- **服务端口（[ports](contracts/ports.md)）仍是能力接缝**：一个"官方能力" = 实现某个 port 的适配器模块，注册进 `ServiceContainer`（例如 OCR、翻译、词典等未来能力）；第三方 UI 扩展走插件面板格（契约 = 插件 `API`），不动六边形内核。
- 候选扩展服务：`IOcrService`（图片识别 → ISBN/封面文字；适配器可复用 PP-OCRv5 技术路线，MIT）——见唯一待办清单。

## 5. 跨域缝合件（不属于任何单一 feature 域的构件）

> feature 页（`features/*.md`）只锚本域构件；以下是**跨域**构件的归属索引——它们不在任何
> feature 页内复读，改到这里对表。功能域 → 架构锚点的完整映射见各 feature 页。

| 缝合件 | 位置 | 跨什么 |
|---|---|---|
| `AppShell` | [`src/renderer/src/AppShell.tsx`](../src/renderer/src/AppShell.tsx) | 唯一模式决策点；activeFeature/readerTabs/readerTarget/selectedBookId；装配全部 dev 探针 |
| `ServiceContainer` | [`src/core/container.ts`](../src/core/container.ts) | 装配全部 [ports](contracts/ports.md)+usecases；UI 只依赖它 |
| Feature 契约/注册表 | `features/types.ts` / `registry.ts` | 五 Feature 共享的 FeatureId/FeatureHost/Descriptor |
| `ILibraryStore` + 存储适配器 | `core/ports/store.ts`（245 行）/ `adapters/storage/ipcStoreAdapter`（253 行） | 全域读写通道（library/reader/notes/settings） |
| `identity`（指纹） | `core/ports/identity.ts` + `adapters/identity/fingerprint` | [library](features/library.md) 导入去重 + [room](features/room.md) 进房标定 |
| `logStore` | `features/logStore.ts` | 全域 pushLog 入口；自检读尾部 |
| `chromeSearchBus` | `features/chromeSearchBus.ts` | library/notes 注册绑定，ChromeControls 消费 |
| `libraryNavBus` | `features/libraryNavBus.ts` | LibraryFeature 历史 ↔ ChromeControls 后退/前进 |
| `readerCardBus` | `features/readerCardBus.ts` | ReaderFeature 卡片页族 ↔ AppShell 命令面板 |
| `roomSession` 共享投影 | `features/roomSession.ts` | RoomFeature 会话视图 + ReaderFeature 聊天页同一份 |
| 插件运行时 | [`src/renderer/src/plugins/runtime.ts`](../src/renderer/src/plugins/runtime.ts)（模块单例）+ [`src/main/plugins.ts`](../src/main/plugins.ts) | [settings](features/settings.md) 启停 + [reader](features/reader.md) 卡片页插槽 + main 扫描/zip 安装/卸载（dev 同步政策住装配点；规范 = [`client/plugins/PLUGINS.md`](../plugins/PLUGINS.md)，插件侧子树自持） |
| 离屏解析窗 | [`src/renderer/src/parse/index.ts`](../src/renderer/src/parse/index.ts) | [library](features/library.md) 域元数据/封面提取的独立进程；与 [reader](features/reader.md) 共享 kookitLoader |
| `veil` / `Marquee` / `ContextMenu` / `ConfirmDialog` | `components/` | 多域共用的展示原语（距离遮罩/滚动题/右键/确认） |
| `useKeyIntents` + `core/domain/input.ts` | `components/` / `core/domain/` | 全域键意图层（绑定表 = 唯一键义源） |
| 事件基座 | `core/ports/{events,emitter}.ts` | render/net/room/covers/imports 的事件基类 |
| `ChromeControls` / `TagRail` | `components/` | 域无关底面镶边（窗控/后退前进/搜索）；[reader](features/reader.md) 标签栏但挂在 shell 侧栏 |

## 6. 术语修正记录

v0.1 的 `ISyncService` 曾把"端口"与"应用服务"混为一谈，v0.2 已拆分为 `INetService`（端口）+ `IRoomSession`（应用服务）。
统一术语以本文 §1 为准，此后不再混用。
