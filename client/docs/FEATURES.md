# UI 功能组件设计（Feature Components）

> 状态：**v0.1.6 已落地实施（2026-09-08）**：标准容器（`features/types.ts` + `registry.ts` + `AppShell`）+ 四个功能组件
> （Library/Reader/Room/Settings，Server 已并入 Room）+ Tailwind v4 迁移完成；本文为设计权威，实施细节以 `client/src/renderer/src/` 为准。
> 已定决策（2026-09-08 确认，原待定项见 §7）：**纯 React 状态 + props 下发**；**Tailwind 与拆组件同步迁移**；
> **侧边栏 = 功能组件导航，主面板 = 宿主容器**；功能组件**常驻挂载、非激活隐藏** → 状态继承。
> 归属：**client 专属**。相关权威：六边形/端口见 `ARCHITECTURE.md`；契约见 `CONTRACTS.md`；
> 插件态度见 `ARCHITECTURE.md` §4（v1 不做插件运行时，ports 即边界）。

---

## 1. 目标与不做什么

**目标**
1. 把 22KB 单体 `App.tsx` 拆成**按交互域划分的 Feature**，每域自持编排、接口显式；
2. **标准化「视图模式 / 域内状态」**，让切换（本地↔房间、连接↔会话↔阅读）是类型安全的显式转移；
3. 为未来开发立规矩：新功能 = 新 Feature 或新展示原语，追加不改动他域；
4. 为将来「官方插件」留出 UI 侧边界（与 ARCHITECTURE §4 的服务层插件观点同构）。

**不做（本轮）**
- ❌ 不引入插件运行时（v1 明确排除，见 `ARCHITECTURE.md` §4）；
- ❌ 不引入 UI 状态库（纯 React；新依赖需先核许可登记借物表）。

---

## 2. 动机（v0.1.6 拆分前的现状症状，保留作设计动机）

| 症状（拆分前 `src/renderer/src/App.tsx`，约 660 行） | 后果 |
|---|---|
| 连接/大厅/房间/聊天/书架/阅读/自检/日志全在一个组件 | 无法独立修改与测试任一域 |
| 状态用多个松散 `useState`（joinedRoom/members/connState…）拼凑 | “模式/状态”无显式类型，`if (joinedRoom)` 散落 |
| UI 直接订阅多个容器事件并各自 setState | Feature 边界与用例层事件一一对应关系不清晰 |
| 顶部模式靠 `tab: 'server' \| 'room' \| 'reader'` 手工切换 | 没有“进入房间才能聊天”之类的状态约束 |

用例层（`IRoomSession`/`IBookService`）与端口（net/render/store/identity）已按六边形就绪、事件契约 v0.2.4 已收敛——**缺的是 UI 侧同等的结构**（该缺口已由 v0.1.6 拆分填平）。

---

## 3. 分层与目录

```
src/renderer/src/
├── AppShell.tsx          # 组合各功能组件；持有 activeFeature（FeatureId）+ 跨功能共享态
├── features/             # 功能组件：一个完整交互域，自持该域用例编排
│   ├── LibraryFeature/   # 书架 + 导入/删除 + 选中（本地）
│   ├── ReaderFeature/    # 渲染容器 + 目录跳转 + 进度/位置（本地 + 房间同位落点）
│   ├── RoomFeature/      # 服务器连接 + 大厅/会话（连接是房间的一部分）
│   ├── SettingsFeature/  # 全局设置（主题[含跟随系统]/阅读模式/诊断日志）
│   ├── types.ts          # 功能组件标准容器契约（FeatureDescriptor/FeatureProps/FeatureHost）
│   ├── registry.ts       # 功能组件注册表（官方插件 = 追加一条 descriptor）
│   └── util.ts           # 共享小工具（extToFormat 等）
├── components/           # 展示组件（纯 props，无业务编排）
│   ├── BookCard.tsx  ├── TocPanel.tsx  ├── MemberList.tsx
│   └── ChatLog.tsx   ├── RoomRow.tsx   └── StatePill.tsx
└── styles.css            # 主题语义 token + kookit 契约（Tailwind 入口）
```

**分层纪律**（对齐六边形依赖规则）
- `features/*` 只依赖：`ServiceContainer`/用例接口 + `core/domain` 类型 + `components/*`。
  不得直接 import kookit / better-sqlite3 / WebSocket 实现（`window.turead` 桥例外见 §8 已知例外）。
- `components/*` 纯展示：props in / 回调 out，无状态编排。
- `AppShell` 是唯一的“谁在哪个模式”决策点。

---

## 4. Feature 划分与边界

| Feature | 职责（编排的用例/端口） | 对外状态 | 关键事件（订阅） |
|---|---|---|---|
| **LibraryFeature** | `books.*`（导入/去重/列表/删除/选中） | `selectedBookId` | 无（本地）；选中书 → 交 shell 打开 Reader |
| **ReaderFeature** | `render.*`（open/renderTo/翻页/goToChapter/goToPosition）+ `store`（lastLocation 恢复） | 当前书、进度、目录、阅读位置 | `render.location-changed`、`rendered`；房间侧 `location-updated` 落点（未来跟随） |
| **RoomFeature** | `net.*`（连接服务器）+ `room.*`（joinRoom/leaveRoom/createRoom/sendChat/listRooms）+ presence/chat | 连接配置/状态、`roomPhase`、成员、聊天 | `net.connection-changed`、`room.presence-updated`、`chat-message`、`book-mismatch` |
| **SettingsFeature** | `store`（appearance/readerSettings 持久化）+ 主题应用 | 主题、阅读模式、诊断日志 | 无（启动载入 + 系统主题监听） |

> 房间与阅读是**两个独立 Feature**：翻页（ReaderFeature 内部）只是 RoomFeature 位置的来源——通过用例层 `emitLocation`/`location-updated` 解耦，不互相 import。
> 服务器连接是**房间的一部分**（非独立 Feature）：连接配置/状态由 RoomFeature 自持。

---

## 5. 模式与状态标准化（核心）

### 5.1 视图模式（Shell 层）

```ts
/** 视图模式：UI 顶层的“我现在在做什么”（= FeatureId，见 features/types.ts） */
type FeatureId = 'library' | 'reader' | 'room' | 'settings'
```

切换规则：
- `reader` 需要先有 `selectedBook`（Library 产出）；
- `room` 里的聊天/位置操作需要 `connState === 'connected'`（连接由 RoomFeature 自持）；
- `room` 的“同位显示”需要同时在 `reader`（future：多面板布局由 Shell 组合决定，模式仍归一）。

### 5.2 域内子状态机（类型联合 + 显式转移）

每 Feature 内部用**局部状态机**取代“多个布尔/字符串拼凑”：

```ts
// 连接状态（net 适配器 emit，RoomFeature 消费）
type ConnectionState = 'connected' | 'disconnected' | 'reconnecting'
type RoomView = 'lobby' | 'session'
type JoinFailure = 'book-mismatch' | 'room-not-found' | 'room-full' | 'server-error'
```

转移示例：
- `RoomView`: `lobby → session`（加入成功，随 `host.openReader` 状态继承）；离开 `session → lobby`。
- 连接：`disconnected → connected`；断线自动 `disconnected`（net 适配器重连 2s×5 语义在端口内）。

**纪律**：UI 不得自己拼装状态；状态只随用例结果/端口事件转移；`phase` 与 `error reason` 分开字段（错误保留上次 phase 的上下文可查）。

### 5.3 事件→状态 的唯一接线点

每个 Feature 在 mount 时**一次性**订阅它职责内的事件并映射到自己的 reducer/props，
卸载时解绑。杜绝多个 Feature 同时听同一事件、各写各的 setState（拆分前 App.tsx 的主要腐化点）。

---

## 6. 与插件系统的关系（只讨论）

- 服务侧插件态度（`ARCHITECTURE.md` §4）：ports 即边界，官方插件 = 注册进 `ServiceContainer` 的适配器，v1 无运行时。
- UI 侧同构推论：**Feature 即 UI 边界**。一个“功能插件”（如未来的 OCR/翻译/词典面板）=
  实现某端口的适配器（进 `ServiceContainer`）+ 一个可选 Feature（进 Shell 的挂载点/视图模式）。
  届时新增：挂载点注册表 + Feature manifest，**不修改既有 Feature**。
- 因此本设计刻意要求：Feature 只依赖用例接口与容器，互不 import——这为将来“插件化接入”保留形状。

---

## 7. 待定 / 已定案记录（2026-09-08 全部定案）

1. **ViewMode / 复合面板** ✅ 定案：**单面板 + 侧边栏导航**。左侧栏 = 功能组件列表（registry 自动发现），
   主面板 = 宿主容器。房间为例：大厅（列表/创建/选房）→ 进入 → `host.openReader` 状态继承自动切阅读器。
   复合面板（阅读+房间同屏）后置评估。
2. **roomPhase.error 携带 JoinFailure** ✅ 定案：需要，UI 直接显示 reason（当前 RoomFeature join 失败 pushLog reason）。
3. **ReaderFeature 布局模式放哪** ✅ 定案：ReaderFeature 内部 + 持久化到 setting（`readerMode` 未来随主题同处理）。
4. **Tailwind 迁移方式** ✅ 定案：**同步引入**（`@tailwindcss/vite` v4）+ **纯 utility 优先**；
   主题实现为 `styles.css` 的**语义 token**（:root 默认暗色 + `[data-theme=sepia|light]`），另有 `system` 跟随系统（`matchMedia` 解析）。
5. **目录/文件命名** ✅ 定案：`features/*/index.tsx`；跨功能共享类型收敛在 `features/types.ts`（FeatureProps/Host）；
   展示组件收在 `components/`。
6. **功能组件标准容器** ✅ 定案：`FeatureDescriptor{id,label,component}` + `registry.ts` + `AppShell` 宿主；
   **官方插件 = 追加 descriptor 进 registry**（未来挂载点/权限再做 manifest）。
7. **状态继承机制** ✅ 定案：功能组件**常驻挂载、非激活 `display:none`** —— 房间会话/阅读位置不因侧边栏切换丢失；
   跨功能跳转统一走 `FeatureHost`（`navigate` / `openReader` / `closeReader` / `selectBook` / `pushLog`）。
8. **侧边栏符号与字体** ✅ 定案：**繁体汉字单字**（書/閱/房/設）以「源流明体」字体栈显示（`styles.css` `.feature-icon`，
   未安装时回退系统中文字体），**禁用带彩色 emoji**；设置钉在最下角（`pinned`）。

## 8. 实施落地（v0.1.6，2026-09-08）

- **容器**：`AppShell.tsx`（侧边栏 + 主面板宿主 + 跨功能共享态 + dev 无头自检）。
  - **无顶栏 / 无日志栏 / 无品牌 logo**：Electron 自带菜单栏已移除（`Menu.setApplicationMenu(null)` + `autoHideMenuBar` + `win.removeMenu()` 双保险）；诊断日志移入 SettingsFeature。
  - **侧边栏 = 单色符号图标栏**（宽 56px）：只显示 `FeatureDescriptor.icon`（**繁体汉字单字：書/閱/房/設**），
    以「源流明体」字体栈显示（`.feature-icon`），label 作悬停提示；**禁用带彩色 emoji**。
  - **settings 钉在侧边栏最下角**（`FeatureDescriptor.pinned`，AppShell 单独渲染）。
  - **settings 钉在侧边栏最下角**（`FeatureDescriptor.pinned`，AppShell 单独渲染）。
- **功能组件**：`LibraryFeature`（书架/导入/去重/删除/选中/打开）、`ReaderFeature`（受 `readerBookId` 驱动打开/关闭，
  翻页/目录/进度/位置保存；布局模式读 `readerSettings`，重开书生效）、`RoomFeature`（**服务器连接 + 大厅 + 会话**——
  **连接是房间组件的一部分**，顶部可折叠「服务器连接」卡片 + 大厅[列表/创建/选房] + 会话[成员/聊天]；进入后 `host.openReader` 状态继承）、
  `SettingsFeature`（**全局设置**：外观主题 **system/跟随系统 + dark/sepia/light**（`data-theme` 应用到 `<html>`，
  system 经 `matchMedia` 解析并监听切换）+ 阅读器布局模式 scroll/single/double 持久化 + 诊断日志页）。
- **颜色标准化（设计 token）**：所有颜色一律走 `styles.css` 的语义 token（`--bg/--panel/--border/--text/--muted/--accent(-soft/-strong/-ring)/--on-accent/--ok/--warn/--err(+ -border)/--input-bg/--badge-bg/--log-bg/--log-text/--page-bg/--page-text/--brand-to`）；
  组件内**禁止写死 hex/rgba**。第三方自定义主题 = 覆盖整套 token（:root 为默认暗色，`[data-theme=sepia|light]` 为样例）。
- **展示组件**：`components/{StatePill,BookCard,TocPanel,ChatLog,RoomRow,MemberList}`（纯 props，无编排）。
- **Tailwind**：`@tailwindcss/vite` v4 接入；`styles.css` 保留主题 token / 全局 base / 滚动条 + **kookit 硬编码契约**
  （`.reader-stage` overflow + iframe 不设 height，见 KOOKIT.md §5）——这两条不能用 utility 替代。
- **已知例外（记录在案）**：`LibraryFeature` 的文件对话框/读文件仍直接走 `window.turead` 桥（IPC）——
  「选文件」目前只有桥暴露；将来应收敛为端口（如 `IBookPicker`）再进 ServiceContainer。dev 自检同样直接用桥。
- **验证**：`typecheck` 全绿；App 无头自检四格式（EPUB/MOBI/AZW3/PDF）全绿（走真实 `openReader` 链路）；
  已知无头时序抖动（读取时刻渲染未完全停稳）偶发 `渲染可疑`，重跑即绿——与 KOOKIT.md §8 记录的 harness 时序问题同类。

## 9. 后续里程碑（非承诺）

- **已交付（v0.1.6，2026-09-08）**：标准容器 + Library/Reader/Room/Settings 全部分拆 + Tailwind 落地（Server 并入 Room）。
- **下一步候选**：
  - 更多设置项：文字大小/行距/字体（需先扩 kookit config 映射）；
  - 打包「源流明体」字体文件进资源，保证各机器渲染一致（先核许可登记借物表）；
  - `location-updated` 同位 UI（RoomFeature 消费 ReaderFeature 的跳转回调，跟随模式）；
  - 「选文件」收敛为端口（`IBookPicker`）消除 `window.turead` 直用例外（§8 已知例外）；
  - 官方插件首个样例（如 OCR/翻译面板）验证容器扩展性。

> 本文为设计权威：任何改动先更新此处再动代码；新决策追加进 §7 并同步 `STATUS.md` 决策表。
