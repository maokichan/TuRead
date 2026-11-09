# AGENTS.md —— agent 会话入口

> 本文件 = agent 的**强制注入上下文**（渐进式披露）：只放指针、红线与命令速查，
> 细节一律指向权威文档、不在这里复读 —— 读什么、读多少，按下面的顺序按需加载。
> 收编自原 `MAP.md`（导航地图，已移入 [`trash/`](trash)）与 [README](README.md) 的开发者章节（收编记录随 git）。

## 项目一句话

**多人房间共读阅读器**：几个人进同一房间共读一本书，实时同步彼此的阅读位置与聊天。
渲染/解析复用 [kookit](https://github.com/koodo-reader/kookit)（AGPL-3.0，git submodule）；
同步服务器用 Go。当前 **client v0.2.8 / server v0.2.2**（本地阅读 + 房间同步端到端可用）。

## 阅读顺序（按需加载，不要一次全读）

> **子树入口**：进入 [`docs/`](docs)、[`client/`](client) 或 [`ops/`](ops/AGENTS.md)（仓库门控：守卫链 / 路径红线 /
> 跟踪声明）工作前，先读该子树自己的 `AGENTS.md`（只放该域的地图与增量红线，全局内容不重复）。

1. [`TODO.md`](TODO.md) —— 唯一待办清单
2. [`docs/DIRECTION.md`](docs/DIRECTION.md) —— 产品方向（批次的先验；条款改动须用户明示）
3. [`client/docs/CONTRACTS.md`](client/docs/CONTRACTS.md) —— 契约（领域类型 / 定位系统 §2.1 / 锚点 / [ports](client/docs/contracts/ports.md) / 插件 §9）
4. [`client/docs/DATA_MODEL.md`](client/docs/DATA_MODEL.md) —— 数据建模（全局 SQLite 单库）
5. [`client/docs/ARCHITECTURE.md`](client/docs/ARCHITECTURE.md) —— client 六边形架构
6. [`client/docs/KOOKIT.md`](client/docs/KOOKIT.md) + [`RENDER_INTERFACE.md`](client/docs/RENDER_INTERFACE.md) —— 渲染引擎逆向与接口
7. [`client/docs/FEATURES.md`](client/docs/FEATURES.md) —— UI 功能组件设计（功能划分 + 交互语义）
8. [`client/docs/STYLE.md`](client/docs/STYLE.md) —— **渲染层风格基线（渲染层开发先读）**
9. `server/docs/{ARCHITECTURE,API,OPS}.md` —— server 架构 / 协议 / 运维
10. [`docs/TESTING.md`](docs/TESTING.md) —— **测试与验证口径（职能文档）**：单测 / typecheck / 探针全集 / 沙箱事实
11. [`client/docs/BUILD.md`](client/docs/BUILD.md) —— **打包与发版（职能文档）**：滚版本清单 / 配方 / 发行物缺件

## 红线（违反 = 事故）

- **kookit 子模块内禁止 `git commit` / `git push`**（其上游仓库的 CLAUDE 规则）
- 依赖方向：UI → usecases → [ports](client/docs/contracts/ports.md) ← adapters；**领域层零依赖**
- **渲染层开发先读 [`client/docs/STYLE.md`](client/docs/STYLE.md)**：新组件不得自创视觉语汇
- UI 不直接 import kookit / better-sqlite3 / WebSocket 实现（只走 ServiceContainer）
- 引入新依赖**先核许可证与 AGPL-3.0 兼容性**
- **打包（`npm run dist`）只在用户明确要求时做** —— "滚了版本号"不等于"该打包"，
  打包也可能由用户交给另一个 agent 做
- 通用开发纪律（提交/版本分工、文档维护、删除即移入 [`trash/`](trash)）见 `generate-swe` skill
- **提交过门控链**：pre-commit 三守卫（doc-index → repoGuard → docGuard）自动跑，报错自带修法，按修法改；`--no-verify` 是人类的绕行特权，agent 不用
- **路径一律仓库相对**：命令示例从仓库根运行；指代仓库根写 `<仓库根>` 占位；引用仓库外文件属越权（repoGuard 拦）
- **影响项目的决定写决策笔记**：[`.agents/notes/`](.agents/notes) 三态生命周期（机制见其 [README](README.md)）；写新笔记前先查旧笔记（supersession）
- **装依赖先问人**：加依赖先提 proposed 决策笔记（写清用途与替代方案）征得同意，再按声明落地

## 常用命令

### 跑起来（[README](README.md) 也有一份；打包见红线）

```bash
cd client
npm install
npm run dev            # 开发模式（Electron + 热更新）
```

### 验证工具链（口径与判据 = [`docs/TESTING.md`](docs/TESTING.md)）

```bash
npm test && npm run typecheck:all  # 单测 + 四 tsconfig（preview 覆盖样张——改数据层/组件 props 后必跑）
npm run style / npm run swarm      # 样式样张（token 基线） / 蜂群同步回归（A1-A5）
```

### 仓库门控（pre-commit 自动跑；链与口径见 [`ops/AGENTS.md`](ops/AGENTS.md)）

```bash
git config core.hooksPath .githooks       # clone 后一次性激活（hooks 配置不随仓库传播）
node ops/scripts/docGuard.mjs --report    # 文档体检：行数 / 上限 / 占用率
node ops/scripts/repoGuard.mjs --report   # 卫生体检：绝对路径 / 密钥
node ops/scripts/docIndex.mjs check       # 跟踪声明与链接方向全量校验
```

### 无头验证（真实渲染链路）

探针全集（渲染自检 / `library` / note / `room` / paged-interact / pdfWidth / room-peer）的触发方式、
判据与沙箱事实（⚠ `TUREAD_USER_DATA` 绝对路径隔离、受限沙箱必 EPERM 需放宽、dev 启动须脱沙箱
否则损坏 GPU 路径）= [`docs/TESTING.md`](docs/TESTING.md)。样张机检 = `smoke.cjs`（判据见其 [README](README.md)）。

## 版本与提交

- 两端版本独立滚动，tag 带端名前缀：`client-v0.2.x` / `server-v0.2.x`
- **一次交付 = 一次提交**；版本滚动与 push 由用户定节奏；滚版本同步清单与配方 = [`client/docs/BUILD.md`](client/docs/BUILD.md)
- ⚠ 未获指示的改动并入当前版本（"已提交但版本未滚"合法，此时不打 tag）
