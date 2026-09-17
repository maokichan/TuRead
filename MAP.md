# TuRead 项目地图

> 本文件会被模型会话**自动加载**，只放"去哪找"与"不要违反什么"，细节一律指向文档。

## 项目

多人房间共读阅读器：多个用户进同一房间共同阅读同一本书。
渲染/解析复用 kookit（AGPL-3.0，git submodule）；同步服务器用 Go。
**server v0.2.0 已实现；client 本地阅读侧端到端可用，房间同步已与真实 server 打通（阅读器内聊天室已落地）。**

## 关键文档（按阅读顺序）

1. `docs/STATUS.md` —— **项目状态与决策记录**（会话交接首选，先读这个）
2. `TODO.md` —— **待办清单**（唯一一份：server / client / 跨端 / 产品）
3. `docs/ARCHITECTURE.md` —— 共同架构：书籍标定（Work/Edition）+ 仓库布局
4. `client/docs/CONTRACTS.md` —— 客户端契约（领域类型 / 定位系统 §2.1 / 锚点层 §2 / usecases / ports / adapters）
5. `client/docs/DATA_MODEL.md` —— 客户端数据建模（统一 SQLite 单库 + 身份分层 + 状态转移）
6. `client/docs/ARCHITECTURE.md` —— client 架构（六边形选型 / 术语 / 平台与插件）
7. `client/docs/KOOKIT.md` —— **kookit 逆向文档**（渲染生命周期 / 硬编码契约 / 外部依赖 / 升级指南）
8. `client/docs/RENDER_INTERFACE.md` —— 渲染封装的接口面与行为语义
9. `server/docs/ARCHITECTURE.md` —— server 架构（模块 / 通讯模型 token 双闸 / 数据模型）
10. `server/docs/API.md` —— REST / WS 契约（含「同步协议与转发规范」）
11. `server/docs/OPS.md` —— 运维手册（配置 / 热重载 / 故障排查）
12. `client/docs/FEATURES.md` —— UI 功能组件设计（标准容器契约 / 功能划分 / 插件化边界）
13. `client/docs/STYLE.md` —— **渲染层风格基线**（文字优先 / 统一字体 / 中文排版 / 沉浸态 / 禁区与验收）
14. `D:\PROJECT\NETWORK.md` —— 网络配置（git 代理 + OpenSSL、Go GOPROXY、打包代理）

## 红线（不要违反）

- **kookit 子模块内禁止 `git commit` / `git push`**（其 CLAUDE.md 规则）
- 依赖方向：UI → usecases → ports ← adapters；**领域层零依赖**
- **渲染层开发先读 `client/docs/STYLE.md`**：新组件不得自创视觉语汇
- UI 不直接 import kookit / better-sqlite3 / WebSocket 实现（只走 ServiceContainer）
- 引入新依赖**先核许可证与 AGPL-3.0 兼容性**
- **解释优先**：大改前写理由；**不知代码该放哪层就停下讨论**（Rule of Three）
- **提交 / 打 tag 由 agent 执行；版本号滚动由用户决定**（agent 不自行发版，见 `docs/STATUS.md` §2）
- **打包（`npm run dist`）只在用户明确要求时做** —— "滚了版本号"不等于"该打包"；
  打包这件事也可能由**用户交给另一个 agent** 做（2026-09-16 用户定，起因见 `docs/STATUS.md` §2）

## 当前状态（只留指针；**状态细节的唯一归属是 `docs/STATUS.md`**）

- **版本**：client **v0.1.19**（**房间功能已落地、等用户验收后再滚 0.2.0**）/ server **v0.2.0**。
  本地阅读侧端到端可用；**房间同步已与真实 server 打通**（真机 `TUREAD_DEV_PROBE=room` 验）。
- **现在在哪 / 下一步 / 验证工具链** → `docs/STATUS.md` **§6 交接快照**（会话交接先读它）。
- **逐版本过程明细** → `docs/STATUS.md` **§4 版本历史**。
- **房间/聊天室**：契约 = `client/docs/CONTRACTS.md` **v0.4.3**；形态 = `FEATURES.md` §11；
  视觉 = `client/docs/STYLE.md` §5.8（**v1.12：右段两格「参數 / 聊天」**）；协议词汇 = `core/domain/protocol.ts`。
- **待办（唯一一份）** → `TODO.md`；**下一个专题 = 阅读时间（弹窗与界面）**。
- **插件态度**：v1 不做插件运行时，**ports 即插件边界**（官方插件 = 注册进 ServiceContainer 的
  适配器 + 追加 `FeatureDescriptor` 进 registry）。
