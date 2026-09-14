# TuRead 项目地图

> 本文件会被模型会话**自动加载**，保持精简，细节一律指向文档。

## 项目

多人房间共读阅读器：多个用户进同一房间共同阅读同一本书。
渲染/解析复用 kookit（AGPL-3.0，git submodule）；同步服务器用 Go。
**server v0.2.0 已实现；client v0.1.16（2026-09-14 已发版：笔记/划线落地，见下）。**

## 关键文档（按阅读顺序）

1. `docs/STATUS.md` —— 项目状态与决策记录（会话交接首选，先读这个）
2. `TODO.md` —— **待办清单**（server / client / 跨端 所有未完成事项）
3. `docs/ARCHITECTURE.md` —— 共同架构：书籍标定（Work/Edition）+ 仓库布局
4. `client/docs/CONTRACTS.md` —— 客户端契约 **v0.3.12**（领域类型 / **定位系统 §2.1** / **选区级锚点层 §2** / usecases / ports / adapters 接口）
5. `client/docs/ARCHITECTURE.md` —— client 架构（六边形选型 / 术语 / 平台与 UI / 插件）
6. `client/docs/KOOKIT.md` —— **kookit 逆向文档**（渲染生命周期 / 硬编码契约 / 外部依赖 / 升级指南）
7. `server/docs/ARCHITECTURE.md` —— server 架构（模块 / 通讯模型 token 双闸 / 数据模型）
8. `server/docs/API.md` —— REST / WS 接口契约（含「同步协议与转发规范」权威转发语义）
9. `server/docs/OPS.md` —— **运维手册**（配置 / 热重载 / 故障排查，运维同学先看这个）
10. `D:\PROJECT\NETWORK.md` —— 网络配置（git 代理+openssl 配方、Go GOPROXY、npm 直连、**electron-builder 打包也走代理**）
11. `client/docs/FEATURES.md` —— **UI 功能组件设计（v0.1.6 落地）**：标准容器契约 / 功能划分 / 状态继承 / 插件化 UI 边界（**视觉语汇见 §13**）
12. `docs/LANDSCAPE.md` —— **竞品与生态全景（2026-09-12）**：Koodo/kookit 上游风险评估 / 同类阅读器交互对标 / 共读社交产品形态对标与启示
13. `client/docs/DATA_MODEL.md` —— **客户端数据建模（已批复并落地）**：SQLite 单库（books/書箱/notes/设置）+ 与 server 表对齐 + **§3.1.1 定位转换机制** + §5 开放问题
14. `client/docs/STYLE.md` —— **渲染层风格基线（v0.9，准则）**：文字优先（P1）/ 全局统一字体（Times + 源流明）/ 字号阶梯 / **中文排版 §4** / **阅读器沉浸态 §5.8（桌与纸、阅读页零控件、覆盖式侧边栏、目录挂载线、遮罩高亮）** / **可调参数清单 §5.9** / 例外清单 / 禁区与验收 / 激进档回退机制

> 注：`借物表.md` **已退役**（2026-09-11：不再逐依赖登记、移出版本控制，见 `docs/STATUS.md` §3），
> 不再列在文档导航里；许可义务仍在（新依赖核许可证与 AGPL 兼容性）。

## 红线（不要违反）

- **kookit 子模块内禁止 `git commit` / `git push`**（其 CLAUDE.md 规则）
- 依赖方向：UI → usecases → ports ← adapters；**领域层零依赖**
- **渲染层开发先读 `client/docs/STYLE.md`**（风格基线）：新组件不得自创视觉语汇；加边框/图标/新字号前先改基线
- UI 不直接 import kookit / better-sqlite3 / WebSocket 实现（只走 ServiceContainer）
- 引入新依赖**先核许可证与 AGPL-3.0 兼容性**（**登记仪式已退役**：`借物表.md` 2026-09-11 起不再维护、已移出版本控制，见 `docs/STATUS.md` §3）
- **提交/打 tag 由 agent 执行；版本号滚动由用户决定**（agent 不自行发版，规则见 `docs/STATUS.md` §2）

## 当前状态（更新于 2026-09-14）

> 本文件**自动加载，只放"现在在哪"**；逐版本过程明细见 `docs/STATUS.md` §4，交接快照见 §6。

- **server v0.2.0 已实现、测试全绿**（书籍标定 / 房间 / token 双闸 / 配置热重载 / 转发规范 / E2E）。
- **client v0.1.16（2026-09-14，已发版）—— 笔记/划线落地**：领域层锚点（`anchor.ts`，二层 = Norm +
  引擎载荷）+ `Note` v2 收拢 → `notes` 表存储/IPC → 引擎侧原语（取锚/导航/重锚）→
  **右键"挂载线"菜单为标记/批注主入口** + 批注输入 + 笔记面板 + 高亮生命周期（重开书/切章自动回挂）。
  同时引入 **vitest + 分层依赖守卫**（架构纪律机器化）；**选区配色跟主题**（去掉系统蓝）。
  验证：`npm test` 42 断言 + typecheck 三 project + `library` 探针 39 断言 + `note` 探针全绿 + 渲染自检无回归。
  **真机验收尚未做**（探针证不了手感与观感）。
- **client 分两半**：**本地阅读器**端到端可用（渲染四格式 / 书架全流程 / 沉浸态阅读器 / 笔记）；
  **云端同步**四层骨架齐备但**未与真实 server 打通** —— WS 握手缺 `?room=&nick=`、presence 载荷形状、
  join-ack reason 三处静默失败型协议漂移（详见 `docs/STATUS.md` §4）。
- **★ 下一步唯一主线（用户 2026-09-14 定，最高优先级）：「书的身份」** ——
  「可见性与追踪」+「笔记身份（跨库）」+「阅读时间模型」本质上是同一个问题
  （**虚拟映射下什么算"同一本书"**），下一个 session 专注解决。见 `TODO.md` 文首 ★ 块。
- **插件态度**：v1 不做插件运行时，**ports 即插件边界**（官方插件 = 注册进 ServiceContainer 的适配器 + 追加 FeatureDescriptor 进 registry）
- 开发原则：**解释优先**；检查点——大改前写理由、不知代码放哪层就停下讨论（Rule of Three）；tag 约定 `client-v0.1.x` / `server-v0.2.x`
- 下一步见 `TODO.md`（唯一待办清单）
