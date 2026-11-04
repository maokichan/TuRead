# AGENTS.md —— agent 会话入口

> 本文件 = agent 的**强制注入上下文**（渐进式披露）：只放指针、红线与命令速查，
> 细节一律指向权威文档、不在这里复读 —— 读什么、读多少，按下面的顺序按需加载。
> 收编自原 `MAP.md`（导航地图，已移入 `trash/`）与 README 的开发者章节（收编记录随 git）。
> **状态细节的唯一归属是 `docs/STATUS.md`**。

## 项目一句话

**多人房间共读阅读器**：几个人进同一房间共读一本书，实时同步彼此的阅读位置与聊天。
渲染/解析复用 [kookit](https://github.com/koodo-reader/kookit)（AGPL-3.0，git submodule）；
同步服务器用 Go。当前 **client v0.2.7 / server v0.2.2**（本地阅读 + 房间同步端到端可用；
未滚版本的批次与决策见 `docs/STATUS.md` §3/§4）。

## 阅读顺序（按需加载，不要一次全读）

> **子树入口**：进入 `docs/`、`client/` 或 [`ops/`](ops/AGENTS.md)（仓库门控：守卫链 / 路径红线 /
> 跟踪声明）工作前，先读该子树自己的 `AGENTS.md`（只放该域的地图与增量红线，全局内容不重复）。

1. [`docs/STATUS.md`](docs/STATUS.md) —— **状态与交接快照，先读这个**（§3 = 决策索引，一行一条）
2. [`TODO.md`](TODO.md) —— 唯一待办清单
3. [`docs/DIRECTION.md`](docs/DIRECTION.md) —— 产品方向（批次的先验；条款改动须用户明示）
4. [`client/docs/CONTRACTS.md`](client/docs/CONTRACTS.md) —— 契约（领域类型 / 定位系统 §2.1 / 锚点 / ports / 插件 §9）
5. [`client/docs/DATA_MODEL.md`](client/docs/DATA_MODEL.md) —— 数据建模（全局 SQLite 单库）
6. [`client/docs/ARCHITECTURE.md`](client/docs/ARCHITECTURE.md) —— client 六边形架构
7. [`client/docs/KOOKIT.md`](client/docs/KOOKIT.md) + [`RENDER_INTERFACE.md`](client/docs/RENDER_INTERFACE.md) —— 渲染引擎逆向与接口
8. [`client/docs/FEATURES.md`](client/docs/FEATURES.md) —— UI 功能组件设计（功能划分 + 交互语义）
9. [`client/docs/STYLE.md`](client/docs/STYLE.md) —— **渲染层风格基线（渲染层开发先读）**
10. `server/docs/{ARCHITECTURE,API,OPS}.md` —— server 架构 / 协议 / 运维
11. **网络配方**收编在 `docs/STATUS.md` §5（git 代理、GOPROXY、打包代理；原仓库外 NETWORK.md 已删）

## 红线（违反 = 事故）

- **kookit 子模块内禁止 `git commit` / `git push`**（其 CLAUDE.md 规则）
- 依赖方向：UI → usecases → ports ← adapters；**领域层零依赖**
- **渲染层开发先读 `client/docs/STYLE.md`**：新组件不得自创视觉语汇
- UI 不直接 import kookit / better-sqlite3 / WebSocket 实现（只走 ServiceContainer）
- 引入新依赖**先核许可证与 AGPL-3.0 兼容性**
- **打包（`npm run dist`）只在用户明确要求时做** —— "滚了版本号"不等于"该打包"，
  打包也可能由用户交给另一个 agent 做
- 通用开发纪律（提交/版本分工、文档维护、删除即移入 `trash/`）见 `generate-swe` skill
- **提交过门控链**：pre-commit 三守卫（doc-index → repoGuard → docGuard）自动跑，报错自带修法，按修法改；`--no-verify` 是人类的绕行特权，agent 不用
- **路径一律仓库相对**：命令示例从仓库根运行；指代仓库根写 `<仓库根>` 占位；引用仓库外文件属越权（repoGuard 拦）
- **影响项目的决定写决策笔记**：`.agents/notes/` 三态生命周期（机制见其 README）；写新笔记前先查旧笔记（supersession）
- **装依赖先问人**：加依赖先提 proposed 决策笔记（写清用途与替代方案）征得同意，再按声明落地

## 常用命令

### 跑起来（README 也有一份；打包见红线）

```bash
cd client
npm install
npm run dev            # 开发模式（Electron + 热更新）
```

### 验证工具链（回归全靠它们；判据口径详见 `docs/STATUS.md` §6）

```bash
npm test               # 纯逻辑单测（vitest，秒级，不需要书）
npm run typecheck:all  # 四个 tsconfig（node/web/test/preview）—— ⚠ 改数据层或组件 props 后必跑
npm run style          # 样式样张（浏览器里看 token 与组件，不起 Electron）
npm run swarm          # 蜂群同步回归（一次性 server + N 只 roombot，语义断言 A1-A5）
npm run rebuild:sqlite # 换 Electron 大版本后重建原生模块
```

### 仓库门控（pre-commit 自动跑；链与口径见 `ops/AGENTS.md`）

```bash
git config core.hooksPath .githooks       # clone 后一次性激活（hooks 配置不随仓库传播）
node ops/scripts/docGuard.mjs --report    # 文档体检：行数 / 上限 / 占用率
node ops/scripts/repoGuard.mjs --report   # 卫生体检：绝对路径 / 密钥
node ops/scripts/docIndex.mjs check       # 跟踪声明与链接方向全量校验
```

### 无头验证（真实渲染链路，需要一本真实的书）

```bash
# ⚠ 都要 TUREAD_USER_DATA=<工作区内独立目录>，别碰真实书库；
# ⚠ 受限文件沙箱下这些都会 EPERM（esbuild 管道 stdio / Electron 命名管道），需放宽沙箱
TUREAD_USER_DATA=./.probe TUREAD_DEV_BOOK="<书的绝对路径>" npm run dev                     # 渲染自检
TUREAD_USER_DATA=./.probe TUREAD_DEV_PROBE=library npm run dev                            # 多库/書箱读模型
TUREAD_USER_DATA=./.probe TUREAD_DEV_PROBE=note TUREAD_DEV_BOOK="<文字类书>" npm run dev   # 笔记/划线全链路
TUREAD_USER_DATA=./.probe TUREAD_DEV_PROBE=room TUREAD_DEV_BOOK="<任意书>" \
  TUREAD_DEV_SERVER="http://127.0.0.1:8080" TUREAD_DEV_ACCESS="<二级令牌，可空>" npm run dev  # 房间链路（唯一要真 server）

# 样式样张的几何机检（另开终端先跑 npm run style）
node_modules/electron/dist/electron.exe scripts/style-gallery/smoke.cjs
```

更多探针（pdfWidth / paged-interact / room-peer / ui-shot）与环境事实（沙箱、Electron stdout、
假数字教训）见 `docs/STATUS.md` §5/§6。

## 版本与提交

- 两端版本独立滚动，tag 带端名前缀：`client-v0.2.x` / `server-v0.2.x`
- **一次交付 = 一次提交**；版本滚动（改版本号 + 打 annotated tag）与 push 由用户定节奏；
  滚版本时同步 `package.json` / `package-lock.json` / `docs/STATUS.md` §4 / `README.md`
- ⚠ 未获指示的改动并入当前版本（"已提交但版本未滚"合法，此时不打 tag）
- 详细分工与发版节奏：`docs/STATUS.md` §2
