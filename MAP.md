# TuRead 项目地图

> 本文件会被模型会话**自动加载**，保持精简，细节一律指向文档。

## 项目

多人房间共读阅读器：多个用户进同一房间共同阅读同一本书。
渲染/解析复用 kookit（AGPL-3.0，git submodule）；同步服务器用 Go。
**server v0.2.0 已实现；client v0.1.2 渲染链路闭环（App 无头自检 EPUB/MOBI/AZW3/PDF 全绿，2026-09-07，见下）。**

## 关键文档（按阅读顺序）

1. `docs/STATUS.md` —— 项目状态与决策记录（会话交接首选，先读这个）
2. `TODO.md` —— **待办清单**（server / client / 跨端 所有未完成事项）
3. `docs/ARCHITECTURE.md` —— 共同架构：书籍标定（Work/Edition）+ 仓库布局
4. `client/docs/CONTRACTS.md` —— 客户端契约 v0.2（domain / usecases / ports / adapters 接口）
5. `client/docs/ARCHITECTURE.md` —— client 架构（六边形选型 / 术语 / 平台与 UI / 插件）
6. `client/docs/KOOKIT.md` —— **kookit 逆向文档**（渲染生命周期 / 硬编码契约 / 外部依赖 / 升级指南）
7. `server/docs/ARCHITECTURE.md` —— server 架构（模块 / 通讯模型 token 双闸 / 数据模型）
8. `server/docs/API.md` —— REST / WS 接口契约（含「同步协议与转发规范」权威转发语义）
9. `server/docs/OPS.md` —— **运维手册**（配置 / 热重载 / 故障排查，运维同学先看这个）
10. `借物表.md` —— 第三方资源与许可证（AGPL 约束，引新依赖先登记）
11. `D:\PROJECT\NETWORK.md` —— 网络配置（git 代理+openssl 配方、Go GOPROXY、npm 直连）

## 红线（不要违反）

- **kookit 子模块内禁止 `git commit` / `git push`**（其 CLAUDE.md 规则）
- 依赖方向：UI → usecases → ports ← adapters；**领域层零依赖**
- UI 不直接 import kookit / better-sqlite3 / WebSocket 实现（只走 ServiceContainer）
- 引入新依赖先核许可证再登记进借物表

## 当前状态（更新于 2026-09-07）

- **server v0.2.0 已实现并测试全绿**：书籍标定（Work/Edition）+ 房间（TTL/发现/聊天/持久化）+ token 双闸（二级令牌 + 服务端按 IP 签发成员 token）+ 配置系统（TOML + 热重载）+ 上传限制 + 转发规范 + **房主删房权限（v0.2.0）** + E2E 集成测试（独立 `server/test/e2e/`）；待办见 `TODO.md`
- **client v0.1.0 骨架已完成（2026-08-31）**：electron-vite + React + `core/{domain,usecases,ports,adapters}` 落成真实 TS（CONTRACTS v0.2.1）；net/identity 适配器做实、storage 为 JSON 文件、render 为 kookit 桩；最小可运行窗口；类型检查 + build + 冒烟全绿
- **client v0.1.2 kookit 渲染集成（2026-09-01）**：render 适配器实装（vendor 单文件 ESM + 初始导航修复 + CSP `blob:` + PDF pdfjs 注入）；封装接口定型见 `client/docs/RENDER_INTERFACE.md`
- **渲染链路闭环（2026-09-07）**：EPUB"正文空"已知问题**销案**（测量假象——第 0 章纯图片扉页，harness/App 行为逐位一致）；顺手修了两个真 bug：宿主 CSS 不得对 iframe 设 `height:100%`（压扁 kookit 拉高的 iframe → scroll 模式全坏）、PDF scroll 模式适配器补拉高外层 iframe（kookit 只对文字类拉）。**App 无头自检四格式全绿（EPUB/MOBI/AZW3/PDF）**；无头环境 smooth scroll 推迟 ~2s 的坑已记录（KOOKIT §9）
- 契约 v0.2.1 定稿（补 REST 缺口，只增不改）；架构术语已定案
- 下一步：UI 组件化（渲染链路已稳定）→ PDF 真人可见窗口交互抽查 → OCR 立项讨论
- 开发原则：v1 允许"丑但诚实"；**解释优先**；检查点——大改前写理由、不知代码放哪层就停下讨论（Rule of Three）
