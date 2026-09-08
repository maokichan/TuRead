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
│   └── coverCache.ts     # 封面 objectURL 缓存（模块级）
├── components/           # 展示组件（纯 props，无业务编排）
│   ├── BookRow.tsx   ├── BookTile.tsx  ├── BookDetailPanel.tsx  ├── LibraryToolbar.tsx
│   ├── TocPanel.tsx  ├── MemberList.tsx
│   └── ChatLog.tsx   ├── RoomRow.tsx   └── StatePill.tsx
├── dev/                  # 开发工具（非产品代码）
│   └── selfCheck.ts      # TUREAD_DEV_BOOK 无头渲染自检（v0.1.7 从 AppShell 抽出）
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
| **LibraryFeature** | `books.*`（导入/去重/列表/删除/选中）+ `picker.*`（选文件/选目录/扫描/读文件）+ `covers.*`（封面异步提取） | `selectedBookId`（= 详情抽屉显示的书） | `covers` 的 progress/cover-ready/cover-failed/done |
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
   主题实现为 `styles.css` 的**语义 token**（:root 默认暗色 + `[data-theme=light|sepia-light|sepia-dark]`），另有 `system` 跟随系统（`matchMedia` 解析）。
5. **目录/文件命名** ✅ 定案：`features/*/index.tsx`；跨功能共享类型收敛在 `features/types.ts`（FeatureProps/Host）；
   展示组件收在 `components/`。
6. **功能组件标准容器** ✅ 定案：`FeatureDescriptor{id,label,component}` + `registry.ts` + `AppShell` 宿主；
   **官方插件 = 追加 descriptor 进 registry**（未来挂载点/权限再做 manifest）。
7. **状态继承机制** ✅ 定案：功能组件**常驻挂载、非激活 `display:none`** —— 房间会话/阅读位置不因侧边栏切换丢失；
   跨功能跳转统一走 `FeatureHost`（`navigate` / `openReader` / `closeReader` / `selectBook` / `pushLog`）。
8. **侧边栏符号与字体** ✅ 定案：**繁体汉字单字**（書/閱/房/設）以「源流明体」显示（`styles.css` `.feature-icon`），
   **禁用带彩色 emoji**；设置钉在最下角（`pinned`）。字体已于 v0.1.8 **打包进资源**（SIL OFL 1.1，见 §10）。

## 8. 实施落地（v0.1.6，2026-09-08）

- **容器**：`AppShell.tsx`（侧边栏 + 主面板宿主 + 跨功能共享态；**dev 无头自检已于 v0.1.7 移入 `dev/selfCheck.ts`**，shell 只做组合与共享态）。
  - **无顶栏 / 无日志栏 / 无品牌 logo**：Electron 自带菜单栏已移除（`Menu.setApplicationMenu(null)` + `autoHideMenuBar` + `win.removeMenu()` 双保险）；诊断日志移入 SettingsFeature。
  - **侧边栏 = 单色符号图标栏**（宽 56px）：只显示 `FeatureDescriptor.icon`（**繁体汉字单字：書/閱/房/設**），
    以「源流明体」字体栈显示（`.feature-icon`），label 作悬停提示；**禁用带彩色 emoji**。
  - **settings 钉在侧边栏最下角**（`FeatureDescriptor.pinned`，AppShell 单独渲染）。
- **功能组件**：`LibraryFeature`（书架/导入/去重/删除/选中/打开）、`ReaderFeature`（受 `readerBookId` 驱动打开/关闭，
  翻页/目录/进度/位置保存；布局模式读 `readerSettings`，重开书生效）、`RoomFeature`（**服务器连接 + 大厅 + 会话**——
  **连接是房间组件的一部分**，顶部可折叠「服务器连接」卡片 + 大厅[列表/创建/选房] + 会话[成员/聊天]；进入后 `host.openReader` 状态继承）、
  `SettingsFeature`（**全局设置**：外观主题 **四套色彩取向**（`dark` / `light` / `sepia-light` / `sepia-dark`，
  `data-theme` 应用到 `<html>`）+ `system` 跟随系统（`matchMedia` 解析并监听，只在暗色/亮色之间切换）
  + 阅读器布局模式 scroll/single/double 持久化 + **导入（含子文件夹）** + 诊断日志页）。
- **颜色标准化（设计 token）**：所有颜色一律走 `styles.css` 的语义 token
  （`--bg/--panel/--panel-2/--border/--border-soft/--text/--muted/--accent(-soft/-strong/-ring)/--on-accent/`
  `--ok/--warn/--err(+ -border)/--input-bg/--badge-bg/--log-bg/--log-text/--page-bg/--page-text/`
  `--scrollbar/--flash-bg/--flash-text/--mono/--font-serif-cn`）；
  组件内**禁止写死 hex/rgba**。第三方自定义主题 = 覆盖整套 token（`:root` 为默认暗色，其余三套为样例）。
- **展示组件**：`components/{BookRow,BookTile,BookDetailPanel,LibraryToolbar,FittedTitle,ConfirmDialog,`
  `TocPanel,ChatLog,RoomRow,MemberList,StatePill}`（纯 props，无编排）。
- **Tailwind**：`@tailwindcss/vite` v4 接入；`styles.css` 保留主题 token / 全局 base / 滚动条 + **kookit 硬编码契约**
  （`.reader-stage` overflow + iframe 不设 height，见 KOOKIT.md §5）——这两条不能用 utility 替代。
- **已知例外（记录在案）**：`LibraryFeature` 的文件对话框/读文件曾在 UI 层直用 `window.turead` 桥 ——
  **v0.1.8 已消除**（收敛为 `IBookPicker` 端口，见 §10 与 `CONTRACTS.md` §4.5）。
  仅剩 `dev/selfCheck.ts`（开发工具，非产品代码）直接用桥。
- **验证**：`typecheck` 全绿；四格式无头自检（EPUB/MOBI/AZW3/PDF）全绿，含**封面管线断言**
  （异步提取 → 缩略图落盘 → `coverPath` 回写 → 字节读回，实测 157KB→38KB；四种格式封面 9~38KB）。
  自检本身累计修了五类假阴性（iframe 高度落地、翻页起点、阅读器可见性、图片页判定、
  断言须走真实用户路径），见 `KOOKIT.md` §8。
- **已知无头时序抖动**：书库启动即渲染封面后，自检时序窗口变窄，仍可能偶发 `渲染可疑`（重跑即绿）——
  与 `KOOKIT.md` §8 记录的 harness 时序问题同类。

## 9. 后续里程碑（非承诺）

- **已交付（v0.1.6，2026-09-08）**：标准容器 + Library/Reader/Room/Settings 全部分拆 + Tailwind 落地（Server 并入 Room）。
- **已交付（v0.1.7，2026-09-08）**：本地阅读器修复批 —— 滚动停稳补 `record()` / 关闭与切书落位置 /
  `open` 并发守卫 / `removeNote` 按笔记章节定位 / `isZeroLocation` 判据 / JsonStore 写盘串行化与损坏备份；
  dev 自检从 `AppShell` 移入 `dev/selfCheck.ts`。
- **已交付（v0.1.8 / v0.1.9 / v0.1.10，2026-09-08）**：书库重做（§10）—— 两视图 + 底部状态栏 + 详情抽屉 +
  导入（文件/文件夹菜单 + 目录扫描）+ 封面缩略图落盘 + `IBookPicker` 端口收敛 + 设置拆 `config.json` +
  `library.json` 版本与迁移；随后审查修复（导入编排下沉 / 设置原子写）+ 阅读器恢复上次内容 +
  打包源流明体 + 四套色彩取向 + 视图切换单按钮。
- **下一步候选**：
  - **「标准化」落地**：`WorkIdentity`（`protocol` + `code`）+ ISBN 校验 + 房间功能内的入口（§10 待定 4）；
  - 详情抽屉操作清单定稿（§10 待定 1）；
  - **文字封面的艺术化**（§10 待定 7）—— 与"列表行标题重复"一并考虑；
  - 更多设置项：文字大小/行距/字体 —— ⚠ **不是"扩 config 映射"就能做**：`KookitConfig` 里没有
    fontSize/lineHeight/fontFamily（`kookit.esm.d.ts` 仅 13 个字段），kookit 走的是
    `StyleHelper.getDefaultCss(ConfigService)` 由**宿主注入 CSS**（`kookit.esm.js` 内 `StyleHelper`
    无任何调用点，client 侧也未接），需先定注入方案；
  - `location-updated` 同位 UI（RoomFeature 消费 ReaderFeature 的跳转回调，跟随模式）；
  - 官方插件首个样例（如 OCR/翻译面板）验证容器扩展性。

## 10. 书库重做（v0.1.8 起，含 v0.1.9 / v0.1.10 细化；2026-09-08）

> 状态：**已落地并发版**。发版由用户决定（见 `STATUS.md` §2）。
> 契约：`CONTRACTS.md` v0.2.6~v0.2.8（`IBookPicker` / `IRenderService.getMetadata` / `ILibraryStore` 封面与
> `patchSetting` / `IImportQueue` / `BookRecord.coverPath` / `LibraryView` / `IBookService.getLastRead`）。

**已实施**

- **去容器外壳**：书库主体铺满 + 滚动，无边框面板、无顶部标题栏。
- **两视图**：`列表` / `网格`（**瀑布流已并入网格** —— 缩略图由我方生成、统一按 2:3 显示，比例可控后两者视觉等同）。
  网格**不显示指纹**，只显示封面 + 标题（**不显示作者**）。
- **列表行**：左侧是**封面槽**（宽 2/5），槽内可以是封面图或**文字封面**（两者同等对待，见下），
  槽整体套 `.book-row-cover` 渐隐（mask 在 18%→82% 之间淡出，2026-09-08 调得更靠左）；
  右侧内容层（标题 + 详情）从 **30%** 处起排 —— 自然压住封面右缘（"适当覆盖封面"）。
- **底部状态栏**：**左** = 视图切换 + 书目数 + 封面提取进度；**右** = 导入 + 进度/取消。
  两者都是**文字按钮**（18px 加粗源流明体、无边框）。
  **视图切换是单个按钮**：显示**当前**视图名（`列表` / `網格`，繁体），点击后视图与文字同时切换；
  动画节奏 ① 判定区域变**深色**（旧文字被"吞没"）② 浅色**新**文字从深色块里浮出（文字在动画 42% 处替换）
  ③ 区域与文字**同时**复原。实现：`.view-switch-flash` 关键帧（620ms）+ 四主题各自的 `--flash-bg/--flash-text`。
- **列表标题**（2026-09-08 定）：行内标题用**源流明体、放大到 17px、不加粗**（此前 13.5px 无衬线）。
- **阅读器恢复上次内容**（2026-09-08 定）：从侧边栏进入阅读器时若还没打开书，自动恢复
  **上次阅读**的那本（`IBookService.getLastRead()`；无阅读记录则回退最近导入），不再每次都空白。
  导航策略在 `AppShell`（唯一模式决策点），口径在用例层。
  ⚠ **首版没生效**：侧边栏按钮当时直接调 `setActiveFeature`，绕过了承载恢复逻辑的 `host.navigate`；
  现已改为侧边栏统一走 `host.navigate`，且自检断言改为**点击真实侧边栏按钮**（此前直接调 API，
  测了接口没测用户路径 —— 见 `KOOKIT.md` §8）。
- **导入**：文字按钮「導入」→ 小菜单「导入文件…」/「导入文件夹…」（⚠ Electron 不允许文件与目录同框选择，[issue #26885](https://github.com/electron/electron/issues/26885)）；
  **「含子文件夹」在设置界面配置**（2026-09-08 改：设置 → 导入），持久化 `librarySettings.importRecursive`；
  批量**串行** + 进度 + **可取消**；失败逐条进诊断日志；指纹去重继续生效；递归扫描有上限（2000 本 / 12 层）。
- **交互语义**：单击 → 右侧**详情抽屉**；双击 → 打开；键盘 Enter 打开、Space 详情、Delete 移除；
  抽屉显示的书 = `selectedBookId`（单一真相，Room 标定 / Reader 打开不变）。
- **抽屉位置纪律**（2026-09-08 定）：**状态栏之上是内容区，抽屉只在内容区弹出** —— 抽屉由内容区容器
  `relative` 定位为 `absolute inset-y-0 right-0`（宽 **280px**），**不覆盖底部状态栏**；被它盖住的内容不显示也不可点。
  关闭 = Esc / 点击抽屉外任意位置（document mousedown，**不用全屏遮罩** —— 全屏遮罩会吞掉列表项的
  第二次点击，双击打开会失效）。
- **移除语义**（2026-09-08 定）：所有"删除"都是**从书库索引移除，不删源文件**。首次点击弹确认弹窗说明
  这一点，并提供**「下次不再提示」**（持久化 `deleteNotice.skip`）；确认后才移除（封面缓存一并清理）。
- **封面：缩略图落盘**。canvas 生成（目标宽 400px、JPEG q0.82，实测 157KB 原图 → **38KB**）→ `userData/covers/<bookId>.jpg`，
  `BookRecord.coverPath` 只存文件名 —— **字节绝不进 JSON**（一本 data URL ≈ 210KB，书库全量重写会被拖垮）。
  渲染侧经 IPC 取字节 → `Blob` → `objectURL`（CSP 已放行 `blob:`），模块级缓存避免重复分配。
- **封面提取时机**：**导入后异步**（`CoverQueue` 用例：串行、进度、可取消、单本失败不影响其余）；存量老书在启动时后台补齐
  （dev 无头自检跳过，保持渲染验证确定性）。
- **无封面 → 文字封面**：`FittedTitle` **二分搜索不溢出的最大字号**（只按高度拟合 —— 宽度由容器约束 +
  `overflow-wrap: anywhere` 自动换行），字号定下后把剩余垂直空间分给行距（上限 2.4）以铺满；
  `ResizeObserver` + `requestAnimationFrame` + `document.fonts.ready` 三重重新拟合（打包字体加载后字形度量会变）。
  字体为**打包的源流明體**（`--font-serif-cn`），**加粗**。**文字封面按"封面"处理**：填进**同一个封面槽**、套**同一套渐隐**。
- **打包字体（源流明體）**：`GenRyuMin2 TW Bold` 切面子集化（BMP CJK + 拉丁 + 标点，去提示指令），
  18.8MB → **10.95MB**，经 Vite 资源管线打包（`assets/fonts/`），`@font-face` 定义在 `styles.css`。
  许可 **SIL OFL 1.1**（已登记借物表；来源/子集/复现见 `assets/fonts/NOTICE.md`）。
  极生僻字（Ext-A/B）不在子集内，回退到字栈下一个明体。
- **主题色取向**（2026-09-08 定，**四套**）：**暗色 / 亮色**（一律黑灰白，不引入色相；高亮=灰阶两端，
  暗色已调暗、亮色整体压暗一档）；**羊皮纸·亮 / 羊皮纸·暗**（同一暖棕取向下的明暗两版，高亮用深棕/浅棕）。
  另有"跟随系统"（只在中性的暗色/亮色之间切换）。状态色（ok/warn/err）保留语义色相；
  暗色主题阅读页仍为白纸，羊皮纸·暗用深棕纸面。
- **元数据范围**：本地**不采集、不显示** author / publisher（与 server Work 模型一致）。作品身份（ISBN 等）由**标准化**补齐，
  入口在房间功能（短期手填、远期 OCR）。`getMetadata()` 仍会带回 author/publisher/language（kookit 白送），仅作本地数据备用。
- **持久化拆分**：设置移入 `config.json`（`appearance` / `readerSettings` / `librarySettings`），书库留 `library.json`（带 `version`）；
  旧版合并文件**自动迁移**（实测已生效）。
- **端口收敛**：新增 `IBookPicker`（选文件/选目录/扫描/读文件）—— **UI 层不再直用 `window.turead` 桥**（§8 旧例外已消除）。
- **编排职责归位（v0.1.9，审查修复）**：批量导入从 `LibraryFeature` 下沉为用例 `IImportQueue`
  （串行/进度/取消/失败上报，与 `CoverQueue` 同构）；`LibraryFeature` 只订阅事件显示进度。
  设置写入改走 `ILibraryStore.patchSetting`（主进程原子合并），消除两个 Feature 对
  `librarySettings` 的"读-改-写"覆盖竞态。`extToFormat` 从 UI 层移入 `core/domain/format.ts`。

**待定（下个 request 确认）**

1. 详情抽屉的「其他更改选项」清单（当前只放了「打开阅读 + 移除」）—— 候选：重命名标题、重新定位文件、在文件夹中显示；
2. 网格卡片下方标题的截断规则（当前 `line-clamp-2`）；
3. 封面维护动作（重建/清理/手工指定）；
4. 「标准化」的 UI 形态（房间功能内）与 `WorkIdentity` 领域落地；
5. 网格模式下抽屉覆盖右侧卡片时的进一步处理（当前按"内容区抽屉 + 被盖住即不显示"统一处理，未做避让）；
6. **多书架**（考虑中，2026-09-08 记录）：当前只有单一书库。将来可支持多个书架（分组/来源/设备），
   但会影响 `ILibraryStore` 与 `BookRecord`（bookId → shelfId 归属）、导入目标、视图状态与房间标定选书流程 ——
   动手前先定模型（见根 `TODO.md`）。
7. **文字封面的艺术化**（后话，2026-09-08 记录）：无封面时"文字封面"本身就是标题，而列表行右侧还会再显示
   一遍标题 —— **同一串字出现两次**。除"是否隐藏右侧标题"外，更想做的是让封面文字具备**艺术效果**
   （字号/字距/行距的构成感、可能的竖排或字面造型），使"文字封面"真正像一张封面而不是放大的标题。
   与 §10 的 `FittedTitle` 同一处演进（见根 `TODO.md`）。

> 本文为设计权威：任何改动先更新此处再动代码；新决策追加进 §7 并同步 `STATUS.md` 决策表。
