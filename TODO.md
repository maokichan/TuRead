# TuRead 待办（TODO）

> 全项目唯一待办清单：server / client / 跨端 所有未完成事项集中于此。
> 已完成事项见 `docs/STATUS.md` 的版本历史；讨论/挂起事项单独列出。
> 维护规则：完成一项即删除或移到 STATUS 版本历史；新增待办先登记这里。

## server

- [ ] **房主权限（转让，删房已 v0.2.0 完成）**：转让房间 `owner_token` 给房内另一成员（协议待设计：`POST /rooms/{id}/transfer` 或类似）
- [ ] **用户系统（剩余）**：昵称/bio 编辑接口、`limited` 角色语义、token 加密码列（加盐哈希）登录 —— **搁置**（2026-08-29 决定先不考虑）
- [ ] **部署形态**（VPS/Docker）——不影响代码，仅配置
- [ ] **cmd/smoke**：对真实部署实例做通电检查的命令 —— 待部署形态确定后补（常驻 E2E 集成测试已有）
- [ ] **服务器地址部署细节**（公网 IP / 端口映射 / 是否 HTTPS）——与服务器负责人讨论（运维话题）；**地址本身已定** = 客户端直接配置服务器 IP

## client

- [x] **client v1 骨架**：Electron + React + `core/{domain,usecases,ports,adapters}` 落成真实 TS（契约见 `client/docs/CONTRACTS.md` v0.2.1）—— **v0.1.0 已完成（2026-08-31）**：全层结构 + 最小可运行窗口；net/identity 适配器做实（WS+REST、md5-sample3-v1 指纹），storage 用主进程 JSON 文件，render 为 kookit 桩
- [ ] **kookit 渲染集成（v0.1.1，遗留修复 2026-09-01 已落地①②③⑤ + PDF 注入）**：适配器已从桩换真实（vendor 单文件 ESM + readFile 注入 + `#page-area` 契约已修 + 阅读视图 + dev 无头验证）。**隔离测试已定位真因（2026-08-31，见 `client/docs/KOOKIT.md` + `client/tools/kookit-harness/`）**：无 CSP 测试页验证 **EPUB/MOBI/AZW3 渲染 OK**；正文空根因 = 适配器 `renderTo` 后只调 `record()`、**缺一次导航调用**（kookit `renderTo` 不渲染正文，须 `goToChapterIndex(0)`/`goToPosition`）；CSP 拦 `blob:` 为次因；PDF 超时 = 未内联 `window.pdfjsLib`（外部全局）。**修复**：① 适配器补初始导航（无历史位置时 `goToChapterIndex(0)`）② CSP 放行 `blob:`（connect/img/style/frame-src）③ 重跑 4 格式无头验证（`TUREAD_DEV_BOOK` + `kookit-harness`）④ 再验真机交互（翻页/进度/定位回跳）⑤ App 阅读视图容器 `overflow-y:auto`（scroll 模式滚动在宿主元素，见 KOOKIT §5.10）
- [ ] **UI 组件化（2026-08-31 排期）**：当前 UI 是"丑但诚实"的单文件 `App.tsx` + `styles.css`；拆分为组件（书架/服务器连接/房间会话/聊天/阅读器/日志栏）+ 样式模块化（CSS 变量/模块化 or 引入轻量方案）—— 排在渲染链路稳定后
- [ ] **PDF 支持（2026-09-01 实装主体完成）**：pdfjs-dist@4.8.69 注入（adapter 动态加载 vendor + `ensurePdfjs`）+ `/lib/pdfjs/` 静态资源（cmaps/standard_fonts/2 个 css/worker）+ CSP worker-src；无头验证 PDF 渲染 OK（19 页、canvas、subHtml）。页码定位不依赖 OCR；扫描版走 `external-engine` 插槽接本地 OCR（PP-OCRv5 等，单独立项，接口见 `client/docs/RENDER_INTERFACE.md` §6）。OCR 多端一致性见 `KOOKIT.md` §8.2。剩余：PDF 真机交互（翻页/进度）验证
- [ ] **client 管理界面**：admin 操作（删房间 / 删副本）在客户端完成 —— 协议已支持（REST + admin token），UI 属 client 里程碑
- [ ] **契约 v0.2 用户评审反馈**（v0.2.1 已补 REST 缺口，见 CONTRACTS §8）
- [x] **UI 技术栈最终确认**（2026-08-31 定案：electron-vite + React + TS；本地书库 = JSON 文件起步）
- [ ] **OCR（ISBN 提取）是否进 v1**（`IOcrService` 草案；技术路线 PP-OCRv5 纯本地）

## 跨端

- [ ] **书籍来源**：仅本地导入 vs 服务器共享书库
- [ ] **账号体系**：游客昵称 vs 注册 —— 影响 `RoomMember.id` 语义；服务端签发 token（v0.1.6）已为其铺路（token 即用户名）
- [ ] **语音通话（远期挂起，2026-08-31 定案）**：房间内实时语音 —— **SFU 中继**（服务器只转发音频包，不碰编解码），与现有同步的星型拓扑同构（全员连服务器、服务器中转）；**编解码在客户端**；**不加密**（朋友局，接受明文 UDP 边界）；同步仍走 WS:8080，媒体另起 UDP/RTP 通道（控制面/媒体面分离）。技术路线：pion/webrtc（或裸 RTP + 自定义 framing），client v1 落地后再评估
