# TuRead 项目地图

> 本文件会被模型会话**自动加载**，保持精简，细节一律指向文档。

## 项目

多人房间共读阅读器：多个用户进同一房间共同阅读同一本书。
渲染/解析复用 kookit（AGPL-3.0，git submodule）；同步服务器用 Go。
**server v0.2.0 已实现；client v0.1.1 kookit 渲染集成实装中（隔离测试已定位真因：缺初始导航 + CSP blob:，见下）。**

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

## 当前状态（更新于 2026-09-06）

- **server v0.2.0 已实现并测试全绿**：书籍标定（Work/Edition）+ 房间（TTL/发现/聊天/持久化）+ token 双闸（二级令牌 + 服务端按 IP 签发成员 token）+ 配置系统（TOML + 热重载）+ 上传限制 + 转发规范 + **房主删房权限（v0.2.0）** + E2E 集成测试（独立 `server/test/e2e/`）；待办见 `TODO.md`
- **client v0.1.0 骨架已完成（2026-08-31）**：electron-vite + React + `core/{domain,usecases,ports,adapters}` 落成真实 TS（CONTRACTS v0.2.1）；net/identity 适配器做实、storage 为 JSON 文件、render 为 kookit 桩；最小可运行窗口；类型检查 + build + 冒烟全绿
- **client v0.1.2 kookit 渲染集成（2026-09-01）**：render 适配器实装（vendor 单文件 ESM + 初始导航修复 + CSP `blob:` + PDF pdfjs 注入）；封装接口定型见 `client/docs/RENDER_INTERFACE.md`
- **kookit 单体 harness 自检强化（2026-09-06）**：EPUB/MOBI/AZW3 **全绿**（含"翻页位置必须变化"断言）；修了 harness 自身 `--url` 解析 bug 与宿主 `overflow` 问题；**关键结论：kookit 文字渲染不监听宿主 scroll，翻页/滚动后须停稳补 `record()`（App 侧同适用）**；PDF 单体侧 pdfjs 注入已打通、canvas 渲染触发待定位（低优先级，见 TODO）。详见 `client/docs/KOOKIT.md` §9
- 契约 v0.2.1 定稿（补 REST 缺口，只增不改）；架构术语已定案
- 下一步：App 集成侧 EPUB 正文空白定位（单体已排除 kookit 本体，嫌疑集中 App 环境，探针 `pageAreaSame` 待跑）→ PDF 真机交互 → UI 组件化
- 开发原则：v1 允许"丑但诚实"；**解释优先**；检查点——大改前写理由、不知代码放哪层就停下讨论（Rule of Three）
