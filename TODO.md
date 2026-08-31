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
- [ ] **kookit 渲染集成（v0.1.1 实装中）**：适配器已从桩换真实（vendor 单文件 ESM + readFile 注入 + `#page-area` 契约已修 + 阅读视图 + dev 无头验证）；**当前阻塞 = CSP 拦 `blob:`**：`client/src/renderer/index.html` 的 `default-src 'self'` 未放行 `blob:` → kookit 章节内容/图片/样式加载失败：正文渲染空、`next()` `Failed to fetch`、PDF 超时；EPUB/MOBI/AZW3 仅章节列表解析 OK（98/13/7 章）。**修复**：CSP 补 `blob:`（connect-src / img-src / style-src）→ 重跑 4 格式无头验证（`TUREAD_DEV_BOOK`）→ 再验真机交互（翻页/进度/定位回跳）
- [ ] **client 管理界面**：admin 操作（删房间 / 删副本）在客户端完成 —— 协议已支持（REST + admin token），UI 属 client 里程碑
- [ ] **契约 v0.2 用户评审反馈**（v0.2.1 已补 REST 缺口，见 CONTRACTS §8）
- [x] **UI 技术栈最终确认**（2026-08-31 定案：electron-vite + React + TS；本地书库 = JSON 文件起步）
- [ ] **OCR（ISBN 提取）是否进 v1**（`IOcrService` 草案；技术路线 PP-OCRv5 纯本地）

## 跨端

- [ ] **书籍来源**：仅本地导入 vs 服务器共享书库
- [ ] **账号体系**：游客昵称 vs 注册 —— 影响 `RoomMember.id` 语义；服务端签发 token（v0.1.6）已为其铺路（token 即用户名）
- [ ] **语音通话（远期挂起，2026-08-31 定案）**：房间内实时语音 —— **SFU 中继**（服务器只转发音频包，不碰编解码），与现有同步的星型拓扑同构（全员连服务器、服务器中转）；**编解码在客户端**；**不加密**（朋友局，接受明文 UDP 边界）；同步仍走 WS:8080，媒体另起 UDP/RTP 通道（控制面/媒体面分离）。技术路线：pion/webrtc（或裸 RTP + 自定义 framing），client v1 落地后再评估
