# client/ —— agent 子树入口

> client = Electron 33（**Chromium 130**）+ React + Tailwind v4 + SQLite，六边形架构。
> 全局红线、验证工具链、命令速查在仓库根 `AGENTS.md`（不在此复读）；状态先读 `docs/STATUS.md`。
> 本文件只放 client 域的地图、增量红线与文档导航。

## 目录地图

- `src/main` / `src/preload` —— 主进程（SQLite、封面队列、离屏解析窗）与桥（IPC 白名单见 CONTRACTS §6）。
- `src/renderer/src` —— 渲染层：`components/`（含 `focusStageEngine` 等框架无关引擎）、
  `features/`（功能组件 + ServiceContainer）、`dev/`（探针）。依赖方向 = UI → usecases → ports ← adapters。
- `docs/` —— client 域文档（下表）。`tools/` —— 样式样张（style-gallery）、蜂群（swarm）、ui-shot。
  `plugins/` —— 官方插件（契约 = `docs/CONTRACTS.md` §9）。

## client/docs 导航（读序按需）

1. [`docs/CONTRACTS.md`](docs/CONTRACTS.md) —— **契约总纲**：领域类型、定位系统（§2.1）、锚点、ports、插件（§9）。
2. [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) —— 数据建模（全局 SQLite 单库；schema 迁移规则）。
3. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) —— 六边形架构的 client 侧细化。
4. [`docs/KOOKIT.md`](docs/KOOKIT.md) + [`docs/RENDER_INTERFACE.md`](docs/RENDER_INTERFACE.md) ——
   渲染引擎逆向与接口（渲染链路改动**必读**；kookit 子模块禁提交）。
5. [`docs/FEATURES.md`](docs/FEATURES.md) —— 功能组件设计（交互语义的权威；改交互先对表）。
6. [`docs/STYLE.md`](docs/STYLE.md) —— **渲染层风格基线（渲染层开发先读）**。

## 增量红线（根 AGENTS.md 之外）

- `styleGrammar.test.ts` 守卫渲染层样式纪律：transition 行必须带 `--dur-*` token、
  z-index 只用档位 token（`--z-chrome/drawer/menu/modal/command`）、字号走白名单（STYLE §3.2）。
- dev 探针/自检一律 `TUREAD_USER_DATA=<工作区内独立目录>` 隔离，**别碰真实书库**；
  受限沙箱下探针会 EPERM（esbuild 管道 stdio / Electron 命名管道），需放宽沙箱；
  **dev 启动必须脱离沙箱**——沙箱化启动会损坏 GPU 路径（WebGL 探测失败静默回落）。
- 渲染行为断言的唯一手段 = 无头探针（根 AGENTS「无头验证」），别用截图目测替代。
- 版本滚动只动 `package.json` / `package-lock.json`（client 侧），tag 前缀 `client-v*`。
