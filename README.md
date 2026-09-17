# TuRead

**多人房间共读阅读器**：几个人进同一个房间，共读同一本书，实时同步彼此的阅读位置与聊天。
渲染/解析复用 [kookit](https://github.com/koodo-reader/kookit)（AGPL-3.0）；同步服务器用 Go。

> **现在的状态**：**本地阅读侧已经能用**（导入 / 书架与书库 / 四格式渲染 / 沉浸式阅读器 /
> 笔记与划线 / 跨书笔记管理 / 主题与阅读参数），**房间功能已落地**：客户端与真实服务器**已经打通**
> （建房 / 进房 / 成员与位置快照 / 聊天），阅读器右抽屉多了「聊天」一格 —— 只在**经房间进入的那本书**上出现。
> 逐版本明细见 [`docs/STATUS.md`](docs/STATUS.md) §4；当前版本 **client v0.1.19 / server v0.2.0**
> （房间这一轮**等用户验收后再滚 0.2.0**）。

---

## 一、给使用者

### 它是什么

一个**不搬动你的书**的阅读器：导入 = 在库里建一条索引（**不拷贝文件**），移除 = 只删索引
（**源文件不动**）。书库只是"组织方式"，同一本书可以出现在多个书库里；笔记与阅读进度跟着
**书的内容**走，不跟着库走。

### 现在能做什么

| 能力 | 说明 |
|---|---|
| **导入与书库** | 导入单个文件或整个文件夹（含子目录）；**映射库**跟踪真实文件夹（改动靠"掃描"对账）、**自建書箱**由你手工组织；书籍与書箱支持拖拽、右键「移動到」、层级后退/前进 |
| **渲染格式** | EPUB / MOBI / AZW3 / PDF / TXT / MD / FB2 / DOCX / HTML …（整体交给 kookit；TXT 自动检测编码） |
| **沉浸式阅读** | 全屏的是"桌"，正文是居中的"纸"；阅读页零控件（退出 `Esc`）；一条**挂载线**贯穿页面：左段垂挂**目录 / 笔记**、右段垂挂**阅读参数 / 聊天**（聊天只在经房间进入的书上出现） |
| **阅读参数** | 字号 / 行距 / 段距 / 纸宽 / 纸内边距 / 佈局（滾動·單頁·雙頁）；改动即时生效（PDF 改纸宽会原地重开以重新填充） |
| **笔记与划线** | 正文里选中 → 右键挂载线菜单：四色**標記** + **加批註**；底部居中输入栏写字（`Enter` 保存、`Shift+Enter` 换行、`Esc` 取消，两行起步、最多五行）；左栏「筆記」列出本书笔记（带批注的标「註」），可跳转 / 編輯 / 移除 |
| **跨书笔记管理** | 侧栏「筆」：網格 / 瀑布流两态、按批注或划线筛、检索、双击跳回原书原处 |
| **主题** | 四套取向：纯色·深 / 纯色·亮 / 羊皮纸·亮 / 羊皮纸·暗（跟随系统的只是"模式"） |
| **窗口** | 无边框窗口 + 自绘标题栏（标题栏内嵌全局搜索栏：书库作用域可搜书，笔记作用域可搜笔记） |
| **房间与共读** | 侧栏「房」：填服务器地址与昵称 → **連接**（领成员凭证）→ 大厅刷新/进房/建房；进房后**自动打开那本书**，阅读器右抽屉出现「**聊天**」一格（与「閱讀參數」共处一根挂载线，`c` 键切换）；成员与位置走 `room.presence` 全量快照、聊天走 `room.message` 广播（含自己的回执）；**离开房间 = 断开连接**，聊天历史留在服务器并随房间级联清理 |
| **房间的限制（还在收尾）** | 多人同时在线的手感未做真机复核；服务器侧两处与文档不一致（失败原因字符串、建房昵称无长度校验）已登记 [`TODO.md`](TODO.md) |

**快捷键**（阅读器内）：`←/→`、`PgUp/PgDn`、`Space`（分页模式）、`t` 目录、`p` 阅读参数、
`c` 聊天室（仅房间内的那本书）、`F11` **进入**全屏（退出全屏用 `Esc`）、鼠标侧键翻页、
分页模式下点击左右区域翻页。

### 怎么拿到 / 怎么跑

- **免安装便携版**（Windows x64）：`client/release/TuRead-<版本>-win-x64-portable.exe`，双击即用。
  ⚠ 这个目录**不进仓库**，需要本机打包（见下）；仓库里最新已打包的是 **v0.1.15**。
- **从源码跑**（需要 Node 20+）：

```bash
cd client
npm install
npm run dev            # 开发模式（Electron + 热更新）
npm run dist           # 打包免安装便携版 → client/release/（需代理，见 NETWORK.md）
```

- 数据都在本地：一个 SQLite 库 + 一个极小的 JSON 引导文件；封面是跟内容走的缩略图。
  换机器时把数据目录整体搬走即可。

---

## 二、给开发者

### 仓库结构

| 目录 | 是什么 |
|---|---|
| `client/` | Electron + React 桌面客户端（六边形架构：`core/{domain,ports,usecases,adapters}` + `renderer/`） |
| `server/` | Go 同步服务器（房间 / 书籍标定 / 副本分发 / 位置广播 / 聊天），独立 module |
| `kookit/` | 渲染引擎（Koodo Reader 的核心，**git submodule**，AGPL-3.0） |
| `docs/` | 项目级文档：状态与交接、共同架构、竞品landscape |
| `client/docs/` | 客户端文档：契约 / 数据模型 / 架构 / 风格基线 / 功能组件 / 渲染接口 / kookit 逆向 |

### 常用命令（`client/`）

```bash
npm run dev            # 跑起来（Electron + HMR）
npm test               # 纯逻辑单测（vitest，秒级，不需要书）
npm run typecheck:all  # 四个 tsconfig（node / web / test / preview）
npm run style          # 样式样张（浏览器里看 token 与组件，不用起 Electron）
npm run build          # 只构建产物（不打包发行版）
npm run dist           # 打包便携版（Windows x64；需代理）—— ⚠ 打包由仓库负责人决定何时做
npm run rebuild:sqlite # 换 Electron 大版本后重建原生模块
```

服务端：

```bash
cd server
cp turead.toml.example turead.toml
go test ./...
go build -o turead-server ./cmd/server
```

无头验证（真实渲染链路，需要一本真实的书）：

```bash
# 渲染自检；TUREAD_USER_DATA 用独立目录，别碰真实书库
TUREAD_USER_DATA=./.probe TUREAD_DEV_BOOK="<书的绝对路径>" npm run dev
# 笔记/划线全链路探针（选区→锚点→引擎回显→导航→重锚→删除）
TUREAD_USER_DATA=./.probe TUREAD_DEV_PROBE=note TUREAD_DEV_BOOK="<文字类书>" npm run dev
# 样式样张的几何机检（另开一个终端先跑 npm run style）
node_modules/electron/dist/electron.exe tools/style-gallery/smoke.cjs
```

⚠ 沙箱/无网环境下：`npm test` 与任何探针都经 esbuild 管道 stdio，**受限文件沙箱下会 `EPERM`**，
需放宽沙箱；打包要走本地代理（见 [`NETWORK.md`](NETWORK.md)）。

### 读代码前请先知道这几条红线

1. **依赖方向**：UI → usecases → ports ← adapters；**领域层零依赖**（有分层守卫测试盯着）。
2. **UI 不直接 import** kookit / better-sqlite3 / WebSocket —— 只走 `ServiceContainer` 里的端口。
3. **渲染层（视觉）改动先读** [`client/docs/STYLE.md`](client/docs/STYLE.md)：新组件不得自创视觉语汇。
4. **kookit 子模块内禁止 `git commit` / `git push`**（其自身规则）。
5. **引入新依赖先核许可证与 AGPL-3.0 兼容性**。
6. **解释优先**：大改前先写理由；不知代码该放哪层就停下来讨论。

### 文档从哪读

从 [`MAP.md`](MAP.md) 出发（导航地图 + 红线，含各文档的**阅读顺序**）。三句话版本：

- **状态与交接** → [`docs/STATUS.md`](docs/STATUS.md)
- **待办（唯一一份）** → [`TODO.md`](TODO.md)
- **契约与基线** → `client/docs/`：`CONTRACTS.md`（契约）、`DATA_MODEL.md`（数据建模）、
  `STYLE.md`（视觉基线）、`FEATURES.md`（功能组件）、`ARCHITECTURE.md`（架构）、
  `KOOKIT.md` + `RENDER_INTERFACE.md`（渲染引擎逆向与接口）

### 版本与提交约定

- 两端版本号独立滚动：server `v0.2.x` / client `v0.1.x`；tag 带端名前缀（`client-v0.1.19`）。
- **提交与 tag 由 agent 执行；版本号是否滚动由用户决定**（详见 `docs/STATUS.md` §2）。

---

## 关于源项目

TuRead 的原型是 [V2tin19/TuRead](https://github.com/V2tin19/TuRead)（早期 Express/socket.io 原型，已弃用）。
本仓库是重新实现（渲染基于 kookit、同步服务器用 Go），与原型的代码与提交历史**无继承关系**。

## 许可证

TuRead 以 **AGPL-3.0** 开源（核心依赖 kookit 为 AGPL-3.0）。

> ⚠ **发行物缺件（对外发行前必修）**：仓库尚无 `LICENSE` 文件，源流明体的 OFL 全文也未随包。
> 引入新依赖请**先核许可证与 AGPL-3.0 兼容性**。登记在 [`TODO.md`](TODO.md)。
