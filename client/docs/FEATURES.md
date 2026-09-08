# UI 功能组件设计（Feature Components）—— 讨论稿

> 状态：**讨论稿 / 未定稿（2026-09-08）**。只进文档与讨论，**不落 UI 代码**——
> 本设计是「UI 组件化」（TODO 下一里程碑）的前置标准化，且为未来的**官方插件边界**铺路。
> 已定倾向（2026-09-08 确认）：**纯 React 状态 + props 下发**；**Tailwind 与拆组件同步迁移**。
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
- ❌ 不写任何 UI 拆分代码（v0.1.5 只到讨论稿）；
- ❌ 不引入插件运行时（v1 明确排除，见 `ARCHITECTURE.md` §4）；
- ❌ 不引入 UI 状态库（纯 React；新依赖需先核许可登记借物表）。

---

## 2. 动机（现状症状）

| 症状（`src/renderer/src/App.tsx`，约 660 行） | 后果 |
|---|---|
| 连接/大厅/房间/聊天/书架/阅读/自检/日志全在一个组件 | 无法独立修改与测试任一域 |
| 状态用多个松散 `useState`（joinedRoom/members/connState…）拼凑 | “模式/状态”无显式类型，`if (joinedRoom)` 散落 |
| UI 直接订阅多个容器事件并各自 setState | Feature 边界与用例层事件一一对应关系不清晰 |
| 顶部模式靠 `tab: 'server' \| 'room' \| 'reader'` 手工切换 | 没有“进入房间才能聊天”之类的状态约束 |

用例层（`IRoomSession`/`IBookService`）与端口（net/render/store/identity）已按六边形就绪、事件契约 v0.2.4 已收敛——**缺的是 UI 侧同等的结构**。

---

## 3. 分层与目录

```
src/renderer/src/
├── AppShell.tsx          # 组合各 Feature；持有 ViewMode + 全局会话状态机
├── features/             # 功能组件：一个完整交互域，自持该域用例编排
│   ├── LibraryFeature/   # 书架 + 导入/删除 + 选中（本地）
│   ├── ReaderFeature/    # 渲染容器 + 目录跳转 + 进度/位置（本地 + 房间同位落点）
│   ├── ServerFeature/    # 连接表单 + 连接状态 + 房间大厅发现
│   ├── RoomFeature/      # 加入/离开 + 成员列表 + 他人位置 + 聊天
│   └── dev/              # dev 自检（TUREAD_DEV_BOOK 无头链路），与产品路径隔离
├── components/           # 展示组件（纯 props，无业务编排）
│   ├── BookCard.tsx  ├── TocPanel.tsx  ├── MemberList.tsx
│   ├── ChatLog.tsx   ├── StatePill.tsx ├── LocationBadge.tsx …
└── ui/                   # UI 原语 + 主题变量（Tailwind 落地后收样式）
```

**分层纪律**（对齐六边形依赖规则）
- `features/*` 只依赖：`ServiceContainer`/用例接口 + `core/domain` 类型 + `components/*`。
  不得直接 import kookit / better-sqlite3 / WebSocket 实现 / `window.turead` 桥。
- `components/*` 纯展示：props in / 回调 out，无状态编排。
- `AppShell` 是唯一的“谁在哪个模式”决策点。

---

## 4. Feature 划分与边界

| Feature | 职责（编排的用例/端口） | 对外状态 | 关键事件（订阅） |
|---|---|---|---|
| **LibraryFeature** | `books.*`（导入/去重/列表/删除/选中） | `selectedBookId` | 无（本地）；选中书 → 交 shell 打开 Reader |
| **ReaderFeature** | `render.*`（open/renderTo/翻页/goToChapter/goToPosition）+ `store`（lastLocation 恢复） | 当前书、进度、目录、阅读位置 | `render.location-changed`、`rendered`；房间侧 `location-updated` 落点（未来跟随） |
| **ServerFeature** | `net.*`（connect/disconnect）+ `room.listRooms` + 设置持久化 | 连接配置、`connPhase`、房间大厅 | `net.connection-changed` |
| **RoomFeature** | `room.*`（joinRoom/leaveRoom/createRoom/sendChat）+ presence/chat/location | `roomPhase`、成员、聊天、他人位置 | `room.presence-updated`、`chat-message`、`location-updated`、`book-mismatch` |
| **dev（自检）** | 复用 ReaderFeature 路径做无头断言 | — | — |

> 房间与阅读是**两个独立 Feature**：翻页（ReaderFeature 内部）只是 RoomFeature 位置的来源——通过用例层 `emitLocation`/`location-updated` 解耦，不互相 import。

---

## 5. 模式与状态标准化（核心）

### 5.1 视图模式（Shell 层）

```ts
/** 视图模式：UI 顶层的“我现在在做什么” */
type ViewMode = 'library' | 'reader' | 'server' | 'room'
```

切换规则（示例约束，定稿时可增删）：
- `reader` 需要先有 `selectedBook`（Library 产出）；
- `room` 里的聊天/位置操作需要 `connPhase === 'connected'`；
- `room` 的“同位显示”需要同时在 `reader`（future：多面板布局由 Shell 组合决定，模式仍归一）。

### 5.2 域内子状态机（类型联合 + 显式转移）

每 Feature 内部用**局部状态机**取代“多个布尔/字符串拼凑”：

```ts
type ConnPhase = 'disconnected' | 'connecting' | 'connected' | 'error'
type RoomPhase = 'idle' | 'joining' | 'joined' | 'leaving' | 'error'
type ReaderPhase = 'closed' | 'opening' | 'ready' | 'error'
type JoinFailure = 'book-mismatch' | 'room-not-found' | 'room-full' | 'server-error' | 'timeout'
```

转移示例（写入代码前先在本文 §7 确认）：
- `roomPhase`: `idle → joining → joined`；任何转移失败 → `error(reason)`；离开 `joined → leaving → idle`。
- `connPhase`: `disconnected → connecting → connected`；断开自动 → `disconnected`（net 适配器重连 2s×5 语义在端口内）。

**纪律**：UI 不得自己拼装状态；状态只随用例结果/端口事件转移；`phase` 与 `error reason` 分开字段（错误保留上次 phase 的上下文可查）。

### 5.3 事件→状态 的唯一接线点

每个 Feature 在 mount 时**一次性**订阅它职责内的事件并映射到自己的 reducer/props，
卸载时解绑。杜绝多个 Feature 同时听同一事件、各写各的 setState（当前 App.tsx 的主要腐化点）。

---

## 6. 与插件系统的关系（只讨论）

- 服务侧插件态度（`ARCHITECTURE.md` §4）：ports 即边界，官方插件 = 注册进 `ServiceContainer` 的适配器，v1 无运行时。
- UI 侧同构推论：**Feature 即 UI 边界**。一个“功能插件”（如未来的 OCR/翻译/词典面板）=
  实现某端口的适配器（进 `ServiceContainer`）+ 一个可选 Feature（进 Shell 的挂载点/视图模式）。
  届时新增：挂载点注册表 + Feature manifest，**不修改既有 Feature**。
- 因此本设计刻意要求：Feature 只依赖用例接口与容器，互不 import——这为将来“插件化接入”保留形状。

---

## 7. 待定 / 需讨论确认

1. `ViewMode` 是否覆盖全部场景，还是需要“复合面板”（阅读 + 房间同屏）？复合时状态机如何归一？
2. `roomPhase` 的 `error` 是否需要携带 `JoinFailure`（倾向：要，UI 直接显示原因）。
3. `ReaderFeature` 的“阅读器布局模式”（`scroll | single | double`，RenderOptions.readerMode）放 Feature 内部还是 Shell 层？（倾向：ReaderFeature 内部 + 持久化到 setting，未来加主题同理）
4. Tailwind 同步迁移时：样式按 `ui/` 主题变量（light/sepia/dark 变量预留）拆分，还是先纯 utility？
5. 目录/文件命名：`features/*/index.tsx` + 每个 Feature 一个 `*.types.ts`（导出其对外 state/event 接口），可否？

---

## 8. 里程碑建议（非承诺）

- **v0.1.6**：UI 组件化起步——拆 `AppShell` + `LibraryFeature`/`ReaderFeature`（本地阅读域），Tailwind 落地；
- **v0.1.7+**：`ServerFeature`/`RoomFeature` 拆分 + `location-updated` 同位 UI（RoomFeature 消费 ReaderFeature 的跳转回调）；
- 独立小步：`components/*` 纯展示件随拆分逐个抽出。

> 本文为讨论稿：上面任何“倾向”都未定案，确认一项即在此更新并移入 `STATUS.md` 决策表。
