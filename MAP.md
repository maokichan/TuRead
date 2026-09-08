# TuRead 项目地图

> 本文件会被模型会话**自动加载**，保持精简，细节一律指向文档。

## 项目

多人房间共读阅读器：多个用户进同一房间共同阅读同一本书。
渲染/解析复用 kookit（AGPL-3.0，git submodule）；同步服务器用 Go。
**server v0.2.0 已实现；client v0.1.7（本地阅读器修复批：位置正确性/并发竞态/存储安全 + dev 自检出 AppShell，2026-09-08，见下）。**

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
- **提交/打 tag 由 agent 执行；版本号滚动由用户决定**（agent 不自行发版，规则见 `docs/STATUS.md` §2）

## 当前状态（更新于 2026-09-08）

- **server v0.2.0 已实现并测试全绿**：书籍标定（Work/Edition）+ 房间（TTL/发现/聊天/持久化）+ token 双闸 + 配置系统（TOML + 热重载）+ 上传限制 + 转发规范 + 房主删房 + E2E 集成测试；待办见 `TODO.md`
- **client 分两半开发**：**本地阅读器**（书架/渲染/设置/本地持久化）与**云端同步**（net + RoomSession + 房间 UI）。当前专注**本地阅读器**
- **client v0.1.10（2026-09-08）**：**书库重做 + 交互收口**（v0.1.8→v0.1.10）—— 两视图（列表/網格，**单按钮**切换带"吞没→浮字→复原"动画）+ 底部状态栏文字按钮（導入）+ 详情抽屉（**只覆盖内容区**）+ 移除只删索引不删源文件 + 封面**缩略图落盘**（157KB→38KB）+ 无封面**文字封面**（`FittedTitle` 撑满，源流明体）+ **打包源流明体**（OFL 1.1）+ **四套色彩取向**（明暗黑灰白 / 羊皮纸明暗）+ `IBookPicker` 端口收敛 + 导入编排下沉 `IImportQueue` + 设置原子写 `patchSetting` + 阅读器**恢复上次内容**；细节见 `client/docs/FEATURES.md` §10
- **样式方案**：Tailwind CSS v4 已落地（`@tailwindcss/vite`；styles.css 仅留主题变量/kookit 契约；借物表已登记）
- **插件态度**：v1 不做插件运行时，**ports 即插件边界**（官方插件 = 注册进 ServiceContainer 的适配器 + 追加 FeatureDescriptor 进 registry）；第三方插件演进路径见 `client/docs/ARCHITECTURE.md` §4
- 下一步：vitest → 笔记实现 → 「标准化」（WorkIdentity + 房间入口）→ 更多设置项（字号/行距）；tag 约定 `client-v0.1.x` / `server-v0.2.x`
- 开发原则：**解释优先**；检查点——大改前写理由、不知代码放哪层就停下讨论（Rule of Three）
