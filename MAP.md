# TuRead 项目地图

> 本文件会被模型会话**自动加载**，保持精简，细节一律指向文档。

## 项目

多人房间共读阅读器：多个用户进同一房间共同阅读同一本书。
渲染/解析复用 kookit（AGPL-3.0，git submodule）；同步服务器用 Go。
**server v0.1.0 已实现（2026-08-27）；client 尚未开发。**

## 关键文档（按阅读顺序）

1. `docs/STATUS.md` —— 项目状态与决策记录（会话交接首选，先读这个）
2. `docs/ARCHITECTURE.md` —— **共同架构**：六边形骨架 + DDD 命名；分层图；书籍标定（Work/Edition）
3. `client/docs/CONTRACTS.md` —— 客户端契约 v0.2（domain / usecases / ports / adapters 接口）
4. `client/docs/ARCHITECTURE.md` —— client 架构（分层 / 平台与 UI / 插件）
5. `server/docs/ARCHITECTURE.md` —— server 架构（模块 / 通讯模型 token 双闸）
6. `server/docs/API.md` —— REST / WS 接口契约
7. `server/README.md` —— 同步服务器 v0.1.0 运行说明（数据模型 + 接口索引）
8. `借物表.md` —— 第三方资源与许可证（AGPL 约束，引新依赖先登记）
9. `D:\PROJECT\NETWORK.md` —— 网络配置（git 代理+openssl 配方、Go GOPROXY、npm 直连）

## 红线（不要违反）

- **kookit 子模块内禁止 `git commit` / `git push`**（其 CLAUDE.md 规则）
- 依赖方向：UI → usecases → ports ← adapters；**领域层零依赖**
- UI 不直接 import kookit / better-sqlite3 / WebSocket 实现（只走 ServiceContainer）
- 引入新依赖先核许可证再登记进借物表

## 当前状态（更新于 2026-08-27）

- **server v0.1.0 已实现**：`server/` Go module，domain（标定/指纹/协议校验）+ store（SQLite + 内容寻址文件存储）+ room（内存房间）+ transport（REST + WS）；已编译通过，待联调冒烟
- 契约 v0.2 用户评审中；架构术语已定案
- 下一步：client v1 骨架（Electron + React + core 落成 TS）｜server 冒烟测试/WS 联调
- 开发原则：v1 允许"丑但诚实"；**解释优先**；检查点——大改前写理由、不知代码放哪层就停下讨论（Rule of Three）
