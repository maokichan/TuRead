# TuRead 项目地图

> 本文件会被模型会话**自动加载**，保持精简，细节一律指向文档。

## 项目

多人房间共读阅读器：多个用户进同一房间共同阅读同一本书。
渲染/解析复用 kookit（AGPL-3.0，git submodule）；同步服务器用 Go。
**server v0.2.0 已实现；client v0.1.13（2026-09-12，见下）。**

## 关键文档（按阅读顺序）

1. `docs/STATUS.md` —— 项目状态与决策记录（会话交接首选，先读这个）
2. `TODO.md` —— **待办清单**（server / client / 跨端 所有未完成事项）
3. `docs/ARCHITECTURE.md` —— 共同架构：书籍标定（Work/Edition）+ 仓库布局
4. `client/docs/CONTRACTS.md` —— 客户端契约 v0.2.9（领域类型 / **定位系统 §2.1** / usecases / ports / adapters 接口）
5. `client/docs/ARCHITECTURE.md` —— client 架构（六边形选型 / 术语 / 平台与 UI / 插件）
6. `client/docs/KOOKIT.md` —— **kookit 逆向文档**（渲染生命周期 / 硬编码契约 / 外部依赖 / 升级指南）
7. `server/docs/ARCHITECTURE.md` —— server 架构（模块 / 通讯模型 token 双闸 / 数据模型）
8. `server/docs/API.md` —— REST / WS 接口契约（含「同步协议与转发规范」权威转发语义）
9. `server/docs/OPS.md` —— **运维手册**（配置 / 热重载 / 故障排查，运维同学先看这个）
10. `D:\PROJECT\NETWORK.md` —— 网络配置（git 代理+openssl 配方、Go GOPROXY、npm 直连、**electron-builder 打包也走代理**）
11. `client/docs/FEATURES.md` —— **UI 功能组件设计（v0.1.6 落地）**：标准容器契约 / 功能划分 / 状态继承 / 插件化 UI 边界（**视觉语汇见 §13**）
12. `docs/LANDSCAPE.md` —— **竞品与生态全景（2026-09-12）**：Koodo/kookit 上游风险评估 / 同类阅读器交互对标 / 共读社交产品形态对标与启示
13. `client/docs/DATA_MODEL.md` —— **客户端数据建模（2026-09-12 提案待批复）**：笔记(SQLite)/书籍(JSON)/索引容器(JSON)三实体 + 与 server 表对齐 + 开放问题
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

## 当前状态（更新于 2026-09-12）

- **server v0.2.0 已实现并测试全绿**：书籍标定（Work/Edition）+ 房间（TTL/发现/聊天/持久化）+ token 双闸 + 配置系统（TOML + 热重载）+ 上传限制 + 转发规范 + 房主删房 + E2E 集成测试
- **client 分两半开发**：**本地阅读器**（书架/渲染/设置/本地持久化）与**云端同步**（net + RoomSession + 房间 UI）
  - **本地阅读器**：渲染四格式 + 书架全流程 + 目录/位置恢复 + 封面管线 + 设置 + **阅读器沉浸态（v0.4~v0.8）**，端到端可用
  - **云端同步**：四层骨架齐备（端口/适配器/用例/UI），但**未与真实 server 打通** ——
    WS 握手缺 `?room=&nick=`、presence 载荷形状、join-ack reason 三处静默失败型协议漂移（详见 `docs/STATUS.md` §4）
- **client v0.1.13（2026-09-12）—— 窗口与阅读器交互大版本**：
  **无边框窗口 + 自绘标题栏**（h-11，主题化控制键；标题栏 = **全局搜索栏**，书库搜书已接线、阅读器/房间占位）；
  **挂载线实体**（`ReaderRail`）：横向挂载线**延伸整页宽、被书页压着**（仅左右留白可见），
  目录左段垂挂（点线左段开合）、**阅读参数右段垂挂**（点线右段/面板底部「折疊」/`p` 开合，
  **折叠向上收回线里**；内容居中、**遮罩按距离**与目录同款）；
  **键鼠意图层骨架**（`domain/input.ts` 绑定表 + `useKeyIntents`，Reader/TitleBar 已迁移）；
  **离屏解析**（kookit getMetadata 独立进程，封面批量提取不再饿死 UI）；
  **书库窗口化渲染**（可视区 ±4 行）；**TXT 全格式打不开修复**（chardet 编码检测）；
  **架构审查三修**（依赖倒置/实体提升/配置去重）；**数据建模立项**（`DATA_MODEL.md` v2，统一 SQLite，待批复）
- **client v0.1.12（2026-09-11）—— 阅读器沉浸态收官（v0.4~v0.8）**：
  **全屏的是「桌」不是正文**（桌 `--desk-bg` / 纸 `--page-bg` + 1px `--page-edge` 边，靠颜色区分）；
  正文 = **居中定宽「纸」**（`--read-width`）+ **纸内边距** `--page-pad-x`；**阅读页零控件**（退出 `Esc`）；
  滚动条 2px、短章节整条隐藏；**阅读态侧边栏覆盖式**（打开左侧菜单不影响阅读器宽度）；
  目录 = **挂载线 + 垂挂列表**（遮罩按鼠标距离高亮、默认展示）；**高频显示参数在阅读页右侧可召唤面板**
  （字号/行距/段距/纸宽/内边距），低频（布局模式）在设置页；夜间模式 = 非 PDF 正文深色注入（PDF 像素反相待做）
- **插件态度**：v1 不做插件运行时，**ports 即插件边界**（官方插件 = 注册进 ServiceContainer 的适配器 + 追加 FeatureDescriptor 进 registry）
- 开发原则：**解释优先**；检查点——大改前写理由、不知代码放哪层就停下讨论（Rule of Three）；tag 约定 `client-v0.1.x` / `server-v0.2.x`
- 下一步见 `TODO.md`（唯一待办清单）
