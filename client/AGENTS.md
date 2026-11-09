# [client/](client) —— agent 子树入口

> client = Electron 33（**Chromium 130**）+ React + Tailwind v4 + SQLite，六边形架构。
> 全局红线、验证工具链、命令速查在仓库根 `AGENTS.md`（不在此复读）。
> 本文件只放 client 域的地图、增量红线与文档导航。

## 目录地图

- [`src/main`](src/main) / [`src/preload`](src/preload) —— 主进程（SQLite、封面队列、离屏解析窗）与桥（IPC 白名单见 [CONTRACTS](docs/CONTRACTS.md) §6）。
- [`src/renderer/src`](src/renderer/src) —— 渲染层：`components/`（含 `focusStageEngine` 等框架无关引擎）、
  `features/`（功能组件 + ServiceContainer）、`dev/`（探针）。依赖方向权威 = [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §2。
- [`docs/`](docs) —— client 域文档（下表）。[`scripts/`](scripts) —— 样式样张（style-gallery）、蜂群（swarm）、
  ui-shot 与业务工具（清单见其清单页）。[`plugins/`](plugins) —— 官方插件（**子树自持**：入口 [`plugins/AGENTS.md`](plugins/AGENTS.md)，规范 [`plugins/PLUGINS.md`](plugins/PLUGINS.md)）。

## [client/docs](docs) 导航（读序按需）

1.                                          —— **契约总纲**：领域类型、定位系统（§2.1）、锚点、[ports](docs/contracts/ports.md)、插件（§9）。
2.                                            —— 数据建模（全局 SQLite 单库；schema 迁移规则）。
3.                                                —— 六边形架构的 client 侧细化。
4.                                    +                                                        ——
   渲染引擎逆向与接口（渲染链路改动**必读**）。
5.                                        —— 交互裁决权威 + 索引（域参照页在 [`docs/features/`](docs/features)）。
6.                                  —— **渲染层风格基线（渲染层开发先读）**。
7.                                  —— 打包与发版（职能文档；不到打包环节不加载）。

## 增量红线（根 `AGENTS.md` 之外）

- `styleGrammar.test.ts` 守卫渲染层样式纪律：transition 行必须带 `--dur-*` token、
  z-index 只用档位 token（`--z-chrome/drawer/menu/modal/command`）、字号走白名单（[STYLE](docs/STYLE.md) §3.2）。
- dev 探针/自检的隔离与沙箱事实（`TUREAD_USER_DATA` 绝对路径、EPERM、GPU 路径）=
  [`docs/TESTING.md`](../docs/TESTING.md)「环境事实」。
- 渲染行为断言的唯一手段 = 无头探针（[`docs/TESTING.md`](../docs/TESTING.md)），别用截图目测替代。
- 版本滚动只动 [`package.json`](package.json) / [`package-lock.json`](package-lock.json)（client 侧）；清单与配方 = [`docs/BUILD.md`](docs/BUILD.md)。
