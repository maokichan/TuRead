# TuRead 项目地图

> 本文件会被模型会话**自动加载**，保持精简，细节一律指向文档。

## 项目

多人房间共读阅读器：多个用户进同一房间共同阅读同一本书。
渲染/解析复用 kookit（AGPL-3.0，git submodule）；同步服务器用 Go。
**server v0.2.0 已实现；client v0.1.6（功能组件标准容器 + UI 交互流：AppShell 宿主 + Library/Reader/Room/Server 拆分 + Tailwind 落地，2026-09-08，见下）。**

## 关键文档（按阅读顺序）

1. `docs/STATUS.md` —— 项目状态与决策记录（会话交接首选，先读这个）
2. `TODO.md` —— **待办清单**（server / client / 跨端 所有未完成事项）
3. `docs/ARCHITECTURE.md` —— 共同架构：书籍标定（Work/Edition）+ 仓库布局
4. `client/docs/CONTRACTS.md` —— 客户端契约 v0.2.4（领域类型 / **定位系统 §2.1** / usecases / ports / adapters 接口）
5. `client/docs/ARCHITECTURE.md` —— client 架构（六边形选型 / 术语 / 平台与 UI / 插件）
6. `client/docs/KOOKIT.md` —— **kookit 逆向文档**（渲染生命周期 / 硬编码契约 / 外部依赖 / 升级指南）
7. `server/docs/ARCHITECTURE.md` —— server 架构（模块 / 通讯模型 token 双闸 / 数据模型）
8. `server/docs/API.md` —— REST / WS 接口契约（含「同步协议与转发规范」权威转发语义）
9. `server/docs/OPS.md` —— **运维手册**（配置 / 热重载 / 故障排查，运维同学先看这个）
10. `借物表.md` —— 第三方资源与许可证（AGPL 约束，引新依赖先登记）
11. `D:\PROJECT\NETWORK.md` —— 网络配置（git 代理+openssl 配方、Go GOPROXY、npm 直连）
12. `client/docs/FEATURES.md` —— **UI 功能组件设计（v0.1.6 已落地）**：标准容器契约 / 功能划分 / 状态继承 / 插件化 UI 边界

## 红线（不要违反）

- **kookit 子模块内禁止 `git commit` / `git push`**（其 CLAUDE.md 规则）
- 依赖方向：UI → usecases → ports ← adapters；**领域层零依赖**
- UI 不直接 import kookit / better-sqlite3 / WebSocket 实现（只走 ServiceContainer）
- 引入新依赖先核许可证再登记进借物表

## 当前状态（更新于 2026-09-08）

- **server v0.2.0 已实现并测试全绿**：书籍标定（Work/Edition）+ 房间（TTL/发现/聊天/持久化）+ token 双闸 + 配置系统（TOML + 热重载）+ 上传限制 + 转发规范 + 房主删房 + E2E 集成测试；待办见 `TODO.md`
- **client v0.1.6（2026-09-08）**：功能组件标准容器 + UI 交互流 —— AppShell（侧边栏=单色符号图标栏 + 主面板宿主，功能常驻挂载/非激活隐藏 → 状态继承，settings 钉置底）+ features/{types,registry} 容器契约（官方插件 = 追加 descriptor）+ Library/Reader/Room/Settings 拆分（**Server 并入 Room**）+ Tailwind v4 落地 + 颜色语义 token 标准化；房间流程 = 大厅→选房→`host.openReader` 自动开阅读器；**全局 UI**：无顶栏/日志栏/logo、去 Electron 菜单栏、跟随系统主题；typecheck + 四格式无头自检全绿
- **样式方案**：Tailwind CSS v4 已落地（`@tailwindcss/vite`；styles.css 仅留主题变量/kookit 契约；借物表已登记）
- **插件态度**：v1 不做插件运行时，**ports 即插件边界**（官方插件 = 注册进 ServiceContainer 的适配器 + 追加 FeatureDescriptor 进 registry）；第三方插件演进路径见 `client/docs/ARCHITECTURE.md` §4
- 下一步：vitest → 笔记实现 → 选文件收敛端口 → 更多设置项（字号/行距）；tag 约定 `client-v0.1.x` / `server-v0.2.x`
- 开发原则：v1 允许"丑但诚实"；**解释优先**；检查点——大改前写理由、不知代码放哪层就停下讨论（Rule of Three）
