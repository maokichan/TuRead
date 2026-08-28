# TuRead 待办（TODO）

> 全项目唯一待办清单：server / client / 跨端 所有未完成事项集中于此。
> 已完成事项见 `docs/STATUS.md` 的版本历史；讨论/挂起事项单独列出。
> 维护规则：完成一项即删除或移到 STATUS 版本历史；新增待办先登记这里。

## server

- [ ] **房主权限**：房主删除/转让房间（`rooms.owner_token` 已备好，v0.1.6；规则待定：房主 vs admin 的权限边界）
- [ ] **用户系统（剩余）**：昵称/bio 编辑接口、`limited` 角色语义、token 加密码列（加盐哈希）登录 —— **搁置**（2026-08-29 决定先不考虑）
- [ ] **部署形态**（VPS/Docker）——不影响代码，仅配置
- [ ] **cmd/smoke**：对真实部署实例做通电检查的命令 —— 待部署形态确定后补（常驻 E2E 集成测试已有）
- [ ] **服务器地址部署细节**（公网 IP / 端口映射 / 是否 HTTPS）——与服务器负责人讨论（运维话题）；**地址本身已定** = 客户端直接配置服务器 IP

## client

- [ ] **client v1 骨架**：Electron + React + `core/{domain,usecases,ports,adapters}` 落成真实 TS（契约见 `client/docs/CONTRACTS.md` v0.2）
- [ ] **client 管理界面**：admin 操作（删房间 / 删副本）在客户端完成 —— 协议已支持（REST + admin token），UI 属 client 里程碑
- [ ] **契约 v0.2 用户评审反馈**
- [ ] **UI 技术栈最终确认**（React 倾向，未定死）
- [ ] **OCR（ISBN 提取）是否进 v1**（`IOcrService` 草案；技术路线 PP-OCRv5 纯本地）

## 跨端

- [ ] **书籍来源**：仅本地导入 vs 服务器共享书库
- [ ] **账号体系**：游客昵称 vs 注册 —— 影响 `RoomMember.id` 语义；服务端签发 token（v0.1.6）已为其铺路（token 即用户名）
