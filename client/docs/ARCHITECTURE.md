# client 架构（分层 / 平台 / 插件）

> 归属：**client 专属**文档。共同架构与术语见 `../../docs/ARCHITECTURE.md`；
> 客户端接口契约（权威）见 `CONTRACTS.md`（v0.2）。
> 状态：client 尚未开发；本文为契约先行的设计定案。

## 1. 客户端分层（权威契约见 `CONTRACTS.md` v0.2）

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

## 2. 平台与 UI（决策记录）

- **Electron = 桌面三平台**（Win/macOS/Linux），不支持移动端。
- **React(DOM) ≠ React Native**：移动端渲染层与交互逻辑不同，不是同一套代码（组件逻辑可部分共享）。
- **kookit 依赖 DOM** → 任何平台壳都必须提供 DOM/WebView；移动端方案 = RN + WebView + kookit-mobile 构建（koodo-reader 移动版同款做法）。
- **v1 只做 Desktop Shell**；core 接口为未来 Web/Android 壳预留，核心零改动。
- **多端构建**："构建时 ban 不用的" = 平台入口 + tree-shaking + 构建配置（打包期排除目标平台无关代码）。

## 3. 扩展与"官方插件"（决策记录）

- **现状**：服务端口（ports）本身就是插件边界 —— 一个"官方插件" = **实现某个 port 的适配器模块，注册进 `ServiceContainer`**（例如 OCR、翻译、词典等未来能力）。
- **v1 不引入插件运行时**（manifest / 加载器 / 热插拔 / 沙箱）。原因：使用量小、只做官方插件，动态加载的复杂度不值得。
- **演进路径**：若将来需要第三方插件，ports 模型可直接承接 —— 新增 plugin manifest + 动态加载 + IPC 通道，**端口定义不变**。
- 结论：扩展能力一律以"编译期内置适配器"承载；契约（`CONTRACTS.md`）保持稳定。
- 候选扩展服务：`IOcrService`（图片识别 → ISBN/封面文字；适配器可复用 OCR-buddy 的 PP-OCRv5 技术路线，MIT）——草案待契约定稿后并入。

## 4. 术语修正记录

v0.1 的 `ISyncService` 曾把"端口"与"应用服务"混为一谈，v0.2 已拆分为 `INetService`（端口）+ `IRoomSession`（应用服务）。
统一术语以根 `../../docs/ARCHITECTURE.md` §2 表为准，此后不再混用。

## 5. 待定事项（client）

- [ ] 笔记 / 划线同步范围（v1 是否包含）
- [ ] `IRenderService.search()` 返回形状
- [ ] OCR（ISBN 提取）是否进 v1，`IOcrService` 接口草案
- [ ] UI 技术栈最终确认（React 倾向，未定死）
