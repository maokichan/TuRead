# 项目状态与决策记录（会话交接）

> 更新：2026-08-27（server v0.1.0 落地）｜目的：让下一次会话 / 模型以最低成本恢复上下文。
> 阅读顺序：本文件 → `MAP.md`（自动加载）→ `NETWORK.md` → `docs/ARCHITECTURE.md`（共同）→ `client/docs/CONTRACTS.md` → `server/docs/ARCHITECTURE.md` → `借物表.md`。

## 1. 一句话

TuRead = **多人房间共读阅读器**：多个用户进入同一房间，共同阅读同一本书。
渲染/解析复用 [kookit](https://github.com/koodo-reader/kookit)（AGPL-3.0，git submodule）；
同步服务器用 Go，**v0.1.0 已实现**（仓库内 `server/`）；**client 尚未开发**。

## 2. 仓库与提交（`D:\PROJECT\TuRead`）

- git 仓库：本地 `main`，`origin = https://github.com/maokichan/TuRead.git`（**已推送 2026-08-27，HEAD `7774da6`**）
- 提交历史：`aff370c` 基线骨架 → `cf58376` 契约 v0.1 → `3a72d3d` 借物表+插件决策 → `ffb4712` 契约 v0.2 → `4000db5` 术语定案 → `8a8b46a` 会话交接 → `6e355a3` server v0.1.0 → `e98fd99` 文档 → `7774da6` **server v0.1.2**
- 结构：`client/`（空骨架，待搭）｜`server/`（v0.1.2，Go module）｜`kookit/`（submodule，HEAD `6e18465`）｜`docs/`｜`借物表.md`
- 网络配方：见 `D:\PROJECT\NETWORK.md`（git 需 `-c http.proxy=http://127.0.0.1:7897 -c http.sslBackend=openssl`；Go 需 `GOPROXY=https://goproxy.cn,direct`；npm registry 直连）

## 3. 已定决策

| 决策 | 内容 |
|---|---|
| 开发范围 | **server v0.1.0 已实现**；client 尚未开发（`server/docs/ARCHITECTURE.md` §1） |
| 架构选型 | **六边形（端口-适配器）为骨架 + DDD 命名为层内词汇**，二者不冲突（ARCHITECTURE.md §2） |
| server 分层 | `cmd/server` 入口 → `internal/transport`(REST+WS) → `internal/room`(用例,内存) → `internal/store`(SQLite+文件) → `internal/domain`(领域) |
| 客户端契约 v0.2 | 能力服务：`IRenderService` / `INetService` / `IBookIdentityService` / `ILibraryStore`；应用服务：`IRoomSession` / `IBookService` |
| 书籍标定 | **两层模型**：Work（同一本书 = 识别协议+编码：isbn/asin/doi/open-library/content-hash-v1；**不设 author/publisher 字段**）+ Edition（同一电子版 = 扩展名+指纹+size）；server 只持久化 works/editions，**房间/成员/位置纯内存**；指纹由客户端校准算法计算（含 OCR 提 ISBN），创建房间时客户端同时上传副本与 edition 信息 |
| 版本指纹 | **头/中/尾三点采样**（头64KB+中点64KB+尾64KB 拼接哈希），算法 `md5-sample3-v1`（client 侧 `IBookIdentityService` 待同步） |
| 认证 | **token 双闸（v0.1.1 已实现）**：第 2 层服务器级共享钥匙 `TUREAD_ACCESS_TOKEN`（`X-Turead-Access` 头，未配置不启用）+ 第 3 层成员 token = 成员 ID（`Authorization: Bearer <7位大小写字母数字>`，客户端自生成）；除 /healthz 外全部校验，缺一 401 直接关；同 token 新连接踢旧连接；仍无账号/密码（远期成员 token 可迁移为用户系统凭证） |
| 副本分发 | **server 保存并分发电子版副本**：内容寻址存储 `data/books/<hash>.<ext>`（按 hash 去重）；无书成员加入时可下载 |
| 传输基本功 | 广播背压（per-connection 写队列 + 写 goroutine，队列满/写失败即断）+ `GET /healthz`（DB 探活）+ 优雅关停（SIGINT/SIGTERM → `Shutdown(10s)`）—— 2026-08-27 已实现（见 `server/docs/ARCHITECTURE.md` §4） |
| 电子版来源与副本 | `editions.url` = **下载来源**（外部平台 zlib/anna 等，或本机地址，可选；本机下载地址不落库，由 `GET /books/{id}/file` 派生）；`editions.local_copy` = 本机是否已存副本（上传成功自动置 1）。两字段**正交**：外部源 + 本机副本可同时成立 |
| schema 管理 | `internal/store/schema.sql` + `go:embed` 嵌入二进制（单文件部署不变）；老库缺列自动 `ALTER` 补列（`PRAGMA table_info` 检查） |
| 用户档案 | `users` 表：`token`=成员 ID（PK）/ `nick`（≤12 字）/ `bio`（≤120 字）/ `role`（`user`|`admin`|`limited`）/ `created_at`；首次 WS join 自动建档（`INSERT OR IGNORE` 幂等）；`role` 建档时按 `TUREAD_ADMIN_TOKENS` 判定；远期 token 即用户名可加密码列 |
| 管理接口 | `DELETE /books/{id}/file`（删副本：文件+`local_copy=0`）与 `DELETE /rooms/{id}`（删房间踢人）—— **admin only**（`TUREAD_ADMIN_TOKENS` env 或 `users.role=admin`），非 admin 403；`admin` 角色已 enforce |
| 房间同步 | WS 消息信封：`room.join` / `room.join-ack` / `room.location` / `room.presence` / `room.chat` / `room.message`（server 定义，client 适配；转发语义权威见 `server/docs/API.md`「同步协议与转发规范」） |
| 房间生命周期与发现 | **房间定义落库（rooms 表，v0.1.5 起）**，运行时状态（成员/位置/订阅）纯内存；空房间 TTL 倒计时（默认 12h，`room_ttl` 可热改），超时惰性清理（Get/List 时 reap + 回调删 DB 记录与聊天），重新有人加入取消；有成员房间一直存活；admin `DELETE /rooms` 强制删除；发现 = `GET /rooms`（大厅）+ `?edition=`（按书找房），v1 房间默认公开可见（roomId 即加入钥匙，无密码）—— v0.1.4/v0.1.5 |
| 聊天室 | **v1 进（2026-08-29 定案）**：`room.chat`（C→S）→ 落库 `messages` 表（追加日志模型）→ 广播 `room.message`（含发送者 = 权威回执）；历史 `GET /rooms/{id}/messages`（`?after=` 增量 / `?limit=`）；消息随房间删除级联清理。**存储模型定案：server 存**（不采用 owner 本地方案：双写一致性负担 + 可用性黑洞 + server 本就可信存储者；若在意隐私远期做端到端加密）—— v0.1.5 |
| 配置 | **TOML 文件（`turead.toml`，示例 `turead.toml.example`）+ 环境变量覆盖（TUREAD_* 优先）+ 文件监听热重载（策略类：access_token/admin_tokens/room_ttl/max_upload_mb 2s 生效；启动类 addr/data_dir 需重启）**；运维手册 `server/docs/OPS.md`—— v0.1.5 |
| kookit 能力 | 支持漫画 cbz/cbr/cbt/cb7（ComicRender）；扫描 PDF 内置 OCR（tesseract/paddle）；`Book.md5` 由调用方计算 |
| OCR 候选 | OCR-buddy（MIT）技术路线 `ppu-paddle-ocr` + `onnxruntime-web`（PP-OCRv5，纯本地）可在 Electron 渲染进程复用；`IOcrService` 草案未入契约 |
| 插件 | v1 **不做插件运行时**；官方插件 = 实现某 port 注册进 `ServiceContainer`（`client/docs/ARCHITECTURE.md` §3） |
| 许可 | kookit AGPL-3.0 → TuRead 以 **AGPL-3.0** 开源；所有第三方资源登记于 `借物表.md` |
| 开发原则 | **不暂停项目**；v1 用三层直觉 + 两个接缝（kookit 包一层、同步/传输分离）；**Rule of Three**；检查点：大改前写一行理由、不知道代码放哪层就停下讨论；解释优先 |
| 仓库形态 | **暂不分仓库**（单仓库 monorepo）：server 是独立 Go module（依赖全部内置，不依赖 client），随时可零成本拆出。理由：契约先行需跨端原子提交（改协议 = 同 commit 改 CONTRACTS.md + API.md）；规模小无独立 CI/团队需求；拆分成本 = 两仓库两次提交 + 版本对齐。**触发条件**（出现其一再拆）：server 需独立发布节奏/被其他项目复用｜需独立 CI/流水线｜仓库访问权限分离需求 |

## 4. 待办 / 待确认（下次开始）

- [x] server **冒烟测试 / WS 联调**（healthz / 建房间 / 双客户端 join → 广播位置 / 慢客户端不拖垮 / 断线清理 / 优雅关停）—— 2026-08-27 一次性 E2E 已跑通；单元测试 `TestSendQueueOverflowKicks` 常驻
- [x] server 基本功：优雅关停（graceful shutdown）+ `/healthz` 健康检查 + 慢客户端/广播背压 —— 2026-08-27 已实现
- [x] 访问令牌实现：`TUREAD_ACCESS_TOKEN` + middleware（通讯模型 `server/docs/ARCHITECTURE.md` §2）—— v0.1.1 已实现
- [x] 成员身份 token（= 成员 ID）：客户端自生成 7 位大小写字母数字；同 token 踢旧连接 —— v0.1.1 已实现
- [x] 用户档案入库（`users` 表：token=nick/bio/role/created_at，首次 join 自动建档）—— v0.1.1 已实现
- [x] 管理接口 + `role=admin` enforce：`DELETE /books/{id}/file`（删副本）、`DELETE /rooms/{id}`（删房间踢人），`TUREAD_ADMIN_TOKENS` env 判定 —— v0.1.1 已实现
- [ ] 用户系统（剩余）：昵称/bio 编辑接口、`limited` 角色语义、token 加密码列（加盐哈希）登录 —— **搁置**（2026-08-27 用户决定先不考虑）
- [x] server 上传大小限制（防滥用；`max_upload_mb` 配置可热改，超限 413）—— v0.1.5 已实现
- [x] 配置系统：TOML 文件 + 环境覆盖 + 文件监听热重载（策略类）+ 运维手册 `server/docs/OPS.md` —— v0.1.5 已实现
- [x] 聊天室：`room.chat`/`room.message` + `messages` 表落库 + 历史接口 + 房间定义落库（rooms 表）—— v0.1.5 已实现
- [x] 转发规范定稿（server/docs/API.md「同步协议与转发规范」）+ 离开广播补丁 + Member json 对齐 client 契约 —— v0.1.5 已实现
- [x] E2E 冒烟固化 —— 2026-08-29 落地为**常驻集成测试** `server/internal/transport/e2e_test.go`（建房间 / 双成员 join / 位置广播转发 / 洪泛不丢 / 断线清理 / 同 token 踢旧，随 `go test ./...` 回归）；`cmd/smoke`（对真实部署实例做通电检查）留待部署形态确定后再补（与部署话题绑定）
- [ ] **服务器地址：已定 = 客户端直接配置服务器 IP**（REST `http(s)://<ip>:<port>` / WS `ws(s)://<ip>:<port>/ws`）；部署细节（公网 IP / 端口映射 / 是否 HTTPS）与服务器负责人讨论，属运维话题、不阻塞开发 —— 2026-08-27 更新
- [ ] client v1 骨架：Electron + React + `core/{domain,usecases,ports,adapters}` 落成真实 TS
- [ ] client 管理界面：admin 操作（删房间 / 删副本）在客户端完成 —— 协议已支持（REST + admin token，server 侧 v0.1.1 已就绪），UI 属 client 里程碑（2026-08-29 用户确认期待在客户端完成）
- [ ] 契约 v0.2 用户评审反馈；`BookFingerprint.algorithm` 需同步为 `md5-sample3-v1`
- [ ] UI 技术栈最终确认（React 倾向，未定死）
- [ ] OCR（ISBN 提取）是否进 v1
- [ ] server 部署形态（VPS/Docker）——不影响代码，仅配置（`TUREAD_ADDR` / `TUREAD_DATA_DIR`）

## 5. 2026-08-27 会话记录（server 数据库设计与 v0.1.0）

- 确认 server 服务形态：单进程 Go web 服务（HTTP REST + WebSocket + SQLite），部署形态未知不影响开发（数据目录/端口可配置）
- 数据库设计讨论并定案：Work/Edition 两层模型；协议枚举含 content-hash 兜底；指纹三点采样；房间纯内存；要分发副本
- 实现 `server/` v0.1.0：domain（标定/ISBN 校验/信封）+ store（SQLite 注册表 + 内容寻址文件）+ room（内存房间管理）+ transport（REST + WS）；已 `go build ./...` 通过
- 新依赖（已登记借物表）：`gorilla/websocket` v1.5.3（BSD-3-Clause）、`modernc.org/sqlite` v1.57.0（BSD-3-Clause）
- 通讯模型讨论（`server/docs/ARCHITECTURE.md` §2）：**token 双闸** = 服务器地址（**暴露方式待讨论，挂起**）+ 准入门禁（`TUREAD_ACCESS_TOKEN` 共享钥匙，待实现 v0.1.1）+ 成员身份 token（匿名访客，待实现）+ 房间号（已实现）；**弃用 cookie**（浏览器语义，桌面/移动用纯 token 跨平台）；主流 App = 标准 HTTPS + 私有应用层 + 认证/风控多层防御（现阶段只做双闸）
- server 与桌面程序的差异盘点（并发/重启语义/网络边界/可观测性/配置/数据库并发）——基本功欠账已入 §4 待办
- 云端旧历史（Express/socket.io 原型，V2tin19）已弃用，`git push --force-with-lease` 覆盖为本地历史

### 2026-08-27（续）文档分家 + server 增量（editions.url / schema.sql / Linux 编译）

- **文档结构分家**：根 `docs/` 只留共同内容（ARCHITECTURE.md 精简为分层/术语/标定 + 文档归属表；STATUS.md 不动）；client 专属 → `client/docs/`（CONTRACTS.md 由 `docs/CLIENT-CONTRACTS.md` git mv 迁移 + ARCHITECTURE.md）；server 专属 → `server/docs/`（ARCHITECTURE.md 模块/通讯模型 + API.md 接口契约）；MAP/README/STATUS 交叉链接全部更新
- **editions 新增 `url` + `local_copy` 两列（模型修正，2026-08-27 定案）**：`url` = **下载来源**（外部平台 zlib/anna 等，或本机地址；可选，创建房间时客户端提供）——**本机下载地址不落库**（`local_copy=1` 时派生 `GET /books/{editionID}/file`，绝对地址由客户端用其配置的 server 地址拼接）；`local_copy` = 本机是否已存副本（`POST .../file` 上传成功自动置 1）。两字段正交，解决"网络可下 + 本机有副本"并存问题；上一轮"自动构造 url 落库"实现已移除
- **schema 改为 SQL 文件**：`internal/store/schema.sql`（`go:embed` 嵌入，保持单二进制部署）；老库经 `PRAGMA table_info` 缺列检查自动 `ALTER` 补列（已用模拟最老库跑通迁移验证：url + local_copy 两列同时补）
- **server 存副本能力确认**：v0.1.0 已实现（FileStore 内容寻址 + `POST/GET /books/{id}/file`），"副本存储与分发流程"已写入 `server/docs/API.md`
- **Linux 交叉编译验证通过**：`GOOS=linux GOARCH=amd64 go build ./...`（gorilla/websocket + modernc.org/sqlite 均纯 Go 无 cgo）
- 冒烟测试概念已向用户解释（最小链路"通电"检查：两客户端 join → 广播位置），执行仍挂起

### 2026-08-27（续二）server 传输基本功（背压 / healthz / 优雅关停）

- **广播背压**：每个 WS 连接独立 out 队列（32）+ 写 goroutine；广播只非阻塞入队，队列满即 kick；写 goroutine 串行写（10s 超时）+ ping 保活（54s），写失败也 kick。两条路径殊途同归：慢客户端/死连接被断开并清理订阅，不再拖垮房间（原同步写 WS 隐患已除）
- **/healthz**：SQLite PingContext 探活 → 200 ok / 503 degraded
- **优雅关停**：`signal.NotifyContext(SIGINT/SIGTERM)` → `http.Server.Shutdown(10s)` → 关 DB（WS 为 hijacked 连接，关停时直接断开，当前接受）
- **验证**：新增常驻单元测试 `server/internal/transport/backpressure_test.go`（`TestSendQueueOverflowKicks` 队列满必 kick）；一次性 E2E 冒烟跑通全链路（healthz/建房间/双 join/广播/4000 条洪泛 B 不丢/断线清理/优雅关停）——冒烟程序跑完即删

### 2026-08-27（续三）token 双闸认证（v0.1.1）

- **第 2 层准入门禁已实现**：`TUREAD_ACCESS_TOKEN` 环境变量（未设置 = 该层不启用，启动打 warning）；`X-Turead-Access` 头 + `crypto/subtle` 常量时间比较，不匹配 401
- **第 3 层成员 token = 成员 ID 已实现**：客户端**自生成 7 位大小写字母+数字**（`^[A-Za-z0-9]{7}$`，社区传统格式；格式校验 = 用户提议"密码学机制"的最简落地），`Authorization: Bearer` 携带；WS 连接以 token 为 `memberID`（`newMemberID` 昵称+随机后缀已废除）；**同 token 新连接踢旧连接**（"单设备登录"，跨平台同一身份）；远期可迁移为用户系统登录凭证
- **/healthz 豁免双闸**（探活不带 token）
- **实现**：`internal/transport/auth.go`（中间件 + 校验）；`server.go` 的 Server 增加 accessToken + active（token→连接）管理
- **验证**：常驻单元测试 `auth_test.go`（门禁矩阵：无头/错钥匙/缺成员 token/格式非法 → 401，合法 → 通过；healthz 豁免；第 2 层未配置时只验成员 token；同 token 踢旧）；一次性 E2E 冒烟跑通（401 门禁 → 建房间 → 双 token join → 广播 → 同 token 踢旧 → 优雅关停）——跑完即删
- 版本 `0.1.0` → `0.1.1`（基本功 + 认证）

### 2026-08-27（续四）用户数据库（users 表）

- **设计定案**：用户 ID = 成员 token（7 位 alphanumeric，**token 即主键，不另设自增 id**——跨平台同一 token 即同一用户，与"成员 token = 成员 ID"决策一致）；字段 = `nick` / `bio`（≤120 字，写接口时校验）/ `role`（`user` 正常 / `admin` 管理 / `limited` 限制，**只存不 enforce**）/ `created_at`
- **自动建档**：首次 `WS join` 时 `INSERT OR IGNORE`（幂等，不覆盖既有档案；nick 取 join 昵称作默认值）；失败不阻断 join（log 警告）
- **实现**：`schema.sql` 加 users 表；`store.go` 加 `RegisterUser`/`GetUser`；`transport.handleJoin` 调 `RegisterUser`
- **顺手修复潜伏 bug**：`RegisterWork`/`RegisterEdition`/`RegisterUser` 的 `created` 判定从"created_at 与本调用时间比较"改为 **`RowsAffected()`**（同一秒内重复调用不再误判；store 单测 `store_test.go` 覆盖幂等）
- **验证**：store 单测（建档/幂等/读取/不存在）+ E2E 冒烟（join 自动建档、同 token 重复 join 不覆盖 nick）跑通
- 远期：昵称/bio 编辑接口、role 权限 enforce、token 加密码列（加盐哈希）演进为登录用户系统

### 2026-08-27（续五）管理接口 + role enforce + 输入约束

- **副本/房间管理接口（admin only）**：`DELETE /books/{editionID}/file`（删内容寻址副本文件 + `local_copy` 置 0，幂等）；`DELETE /rooms/{roomID}`（`RoomManager.Delete` 返回成员快照 → transport 逐个踢连接）；非 admin `403`
- **role enforce**：admin 判定 = `TUREAD_ADMIN_TOKENS`（env 逗号分隔列表）命中 或 `users.role == admin`；`RegisterUser` 建档时按判定写 role（`store.RegisterUser(token, nick, role)`，幂等不覆盖）；`limited` 语义与用户资料编辑留远期
- **昵称约束**：WS join 昵称 ≤12 字（`utf8.RuneCountInString`，中文按"字"计），超长拒绝连接
- **XSS 定位**：server 原样存储不转义（转义是 client 渲染层职责，React 文本节点默认安全）；server 侧防滥用 = 长度约束（nick/bio）+ 将来上传大小限制
- **新增测试**：`admin_test.go`（权限闸 403/放行、删副本后 local_copy=0+下载 404、删房间踢成员、昵称 12/13 字边界）；store 测试覆盖 role 幂等
- 环境变量新增：`TUREAD_ADMIN_TOKENS`

### 2026-08-27（续六）术语收敛 + 文件级整理 + 架构判定

- **清除文档中"学习期/学习路径/护栏"措辞**（9 处 → 全部替换为具体表述，如"当前接受/现阶段"）；顺带修正 `server/docs/API.md` 中一条过时描述（"昵称+随机后缀"→ token 双闸）
- **架构判定（定案）**：不增加分层/抽象，维持 `cmd → transport → room → store → domain`（依赖方向已正确）；核心业务=房间转发，复杂度集中在横切关注点已各归其位；过早抽象是负债（每个抽象仅 1 实现，无第二实现方）
- **文件级整理**：`transport/server.go`（530 行）拆分为 `server.go`（装配+路由）/ `rest.go` / `ws.go` / `admin.go` / `auth.go` / `utils.go`——纯重组零行为变化，测试全过
- **"何时该抽象"触发条件已写入** `server/docs/ARCHITECTURE.md` §5（第二传输/第二存储/第二调用方/文件过大）

### 2026-08-27（续七）v0.1.2 推送 + 剩余方向 + 仓库形态决策

- **已推送**：`7774da6`（server v0.1.2）推至 `origin`（maokichan/TuRead）
- **剩余方向已记入 §4 待办**：上传大小限制；E2E 冒烟固化（`server/cmd/smoke` 或常驻集成测试）；用户系统剩余（已有）
- **仓库形态定案（暂不分仓库）**：单仓库 monorepo；server 为独立 Go module（依赖内置、不依赖 client），零成本可拆；理由 = 契约先行需跨端原子提交 + 规模小 + 拆分成本（两仓两提交+版本对齐）现阶段不值；**触发条件**（独立发布节奏/独立 CI/权限分离）已写入根 `docs/ARCHITECTURE.md` §5

### 2026-08-27（续八）数据库设计修正：Work 去 author/publisher + content-hash-v1 重定义

- **决策：Work 不设 author / publisher**——一本书可能多位作者，单作者字段是错误建模；多作者需 `work_author` 联结表 + 倒查表 + 核对机制，会让远期功能复杂，现阶段不做；ISBN 等外部标识符已提供可查询性（作者/出版商可经 ISBN 外部解析）。`language` / `cover` / `description` **保留**（当前未填充，预留书架展示）
- **content-hash-v1 重定义**（原"标题+作者归一化哈希"作废）：**无外部标识符书籍的兜底身份 = edition 内容指纹**，由**客户端校准算法计算**（同一扫描版/同一文件内容 → 同 code，标题/文件名不同不影响；扫描版不同 = 不同 edition，位置无法对齐）。server 只存不重算（不透明字符串）；原 `ContentHashCode` 参考实现已移除
- **Edition 信息由客户端计算并上传**：客户端用校准算法（+ OCR，扫描书提 ISBN）算指纹，创建房间时**同时上传副本与 edition 信息**；server 只登记与比对，从不自己计算指纹
- **实施**：`schema.sql` v3（works 去 author/publisher 列，旧开发库多余列无害可忽略）；`domain/types.go` Work 去两字段；`identity.go` 去 ContentHashCode + 协议注释更新；`store.go` INSERT/SELECT 去两列；`rest.go` 请求体去 author；API.md / ARCHITECTURE.md 同步；`go build` + `go test ./...` 全绿；版本 `0.1.2` → `0.1.3`

### 2026-08-27（续九）房间设计定案：纯内存 + 空房间 TTL + 发现接口（v0.1.4）

- **决策：房间保持纯内存，不新增 rooms 表**（重启即销毁，接受）；空房间生命周期从"空即销毁"改为 **TTL 倒计时**：默认 **12h**（`TUREAD_ROOM_TTL` 环境变量可配），房间变空记 `emptyAt`，超过 TTL 在 Get/List 时惰性清理（`reap`）；重新有人加入取消倒计时；有成员的房间一直存活；admin `DELETE /rooms` 强制删除保留
- **决策：发现机制 v1 全做**（基于内存房间表，无需持久化）：`GET /rooms`（公开大厅：roomId/editionId/书名/ext/memberCount/createdAt）+ `GET /rooms?edition=<id>`（按书找房）+ roomId 直达（`WS /ws?room=` 不变）；v1 房间默认公开可见、无密码，隐私开关远期
- **实现**：`room/manager.go`（Room.emptyAt + TTL reap + List/RoomInfo；`NewManager(maxMembers, ttl)` 签名变更，`now` 时钟可注入供测试）；`store.GetWork`（大厅书名展示）；`rest.go` `handleListRooms`；`server.go` 路由 `GET /rooms`；`main.go` `TUREAD_ROOM_TTL` 解析；新增单测 `room/manager_test.go`（TTL 语义 5 例 + 标定回归）与 `transport/roomlist_test.go`（鉴权/列表/筛选/非法参数）；`go build` + `go test -count=1 ./...` 全绿；版本 `0.1.3` → `0.1.4`

### 2026-08-29（续十）v0.1.5：配置系统 + 聊天室 + 持久化 + 转发规范 + 冒烟固化

- **冒烟固化定案（综合多面考虑）**：落地为**常驻集成测试** `transport/e2e_test.go`（自动进 `go test ./...`、httptest 随机端口、真实 TCP+WS）；`cmd/smoke`（对真实部署实例通电检查）留待部署形态确定后补（与部署话题绑定）。E2E 覆盖：建房间/双 join/位置广播/洪泛不丢/断线清理+离开广播/同 token 踢旧
- **服务器地址定案**：**客户端直接配置服务器 IP**（REST `http(s)://<ip>:<port>` / WS `ws(s)://<ip>:<port>/ws`）；部署细节（公网/端口映射/HTTPS）与服务器负责人讨论 = 运维话题，不阻塞开发（STATUS §4 / server ARCHITECTURE §2/§3 已更新）
- **用户系统剩余搁置**（2026-08-29 用户决定先不考虑）
- **配置系统（v0.1.5）**：**TOML 文件**（`turead.toml`，示例 `turead.toml.example`，`TUREAD_CONFIG` 指定路径）+ 环境变量覆盖（TUREAD_* 优先）+ **文件监听热重载**（2s 轮询，仅策略类：access_token / admin_tokens / room_ttl / max_upload_mb；addr / data_dir 启动类需重启）；已连接 WS 不受令牌热改影响；新依赖 `BurntSushi/toml` v1.6.0（MIT，已登记借物表）；**运维手册 `server/docs/OPS.md`**（配置说明 + 常见故障排查表 + 管理接口用法）
- **上传大小限制**：`max_upload_mb`（0 = 不限，可热改）；`handleUploadFile` 用 ContentLength 预检 + `http.MaxBytesReader` 兜底 chunked，超限 413
- **聊天室进 v1 + server 存（定案）**：信封模型零改动扩展——`room.chat`（C→S）→ 落库 `messages` 表（追加日志模型）→ 广播 `room.message`（含发送者 = 权威回执）；历史 `GET /rooms/{id}/messages`（`?after=` 增量 / `?limit=`，默认 50 上限 500）；**不采用 owner 本地存储方案**（双写一致性负担 + owner 离线可用性黑洞 + server 本就可信存储者；隐私远期走端到端加密）；**房间定义落库（rooms 表，推翻续九"纯内存"）**——聊天要历史，房间就得在；TTL 过期/admin 删除 → 房间与消息一起清理；重启时从 DB 恢复房间（空房间，TTL 重新起算）
- **转发规范定稿**（`server/docs/API.md`「同步协议与转发规范」）：状态转发而非操作转发（交互无关，可在客户端交互定案前钉死）；消息集/方向/转发规则表；presence 全量快照、除发送者外、加入即全量同步、**离开必须广播（补丁）**、背压、节流属 client 职责；v1 边界 = 位置 + 聊天，笔记/光标/操作事件流明确排除
- **Member json 对齐**：`domain.Member` 加 tag（`id` / `nickName` / `location`），API.md「已知不一致」清零
- **实现**：`internal/config`（新包）；`schema.sql` v4（rooms + messages）；`store.go`（RegisterRoom/ListRooms/DeleteRoom/InsertMessage/ListMessages）；`room/manager.go`（SetTTL/SetOnExpired/Restore）；`transport`（Policy 热改、聊天、离开广播、历史接口、上传限制、建房/删房落库）；`main.go`（配置加载 + 热重载 + 启动恢复房间）；新增测试：config 5 例、store rooms/messages 1 例、transport chat+历史+上传限制 2 例、E2E 更新；`go vet` + `go test -count=1 ./...` 全绿；版本 `0.1.4` → `0.1.5`

### 2026-08-29（续十一）v0.1.6：房主身份 token 化 + 成员 token 改服务端签发

- **决策：rooms.owner 由昵称快照改为 owner_token**（用户指出 owner 未关联用户 token 的缺口）——房主身份 = 成员 token（来自请求认证上下文），房主权限（远期）可验证；展示昵称建房时建档（RegisterUser，幂等）并经 users 表解析（大厅 `ownerNick`）
- **决策：成员 token 改为服务端签发**（推翻 v0.1.1"客户端自生成"）：`POST /auth/token`（仅需第 2 层二级令牌，成员 token 层豁免）——**同一 IP 7 天内申请过 → 复用并续期（活跃身份不因窗口过期）；超过 7 天未申请 → 换发新 token**。users 表加 `ip` / `token_issued_at`；签发即建档（nick 空，join 时补）；token 生成在 `domain.NewMemberToken`（crypto/rand，碰撞重试）
- **明确接受限制（NAT/共享 IP）**：同一公网 IP 多客户端共享同一 token，会触发"同 token 踢旧"互相顶线——v1 接受（匿名访客模型），远期用客户端 nonce 区分同 IP 多设备；移动网络 IP 漂移也会在 7 天无活动后换发（身份断，匿名模型可接受）
- **数字 id 结论**：token 不翻译成纯数字 id（token 即用户 ID，无第二消费方，YAGNI）
- **实施**：`schema.sql` v5（rooms.owner_token；users.ip + token_issued_at + 迁移补列）；`domain/token.go`（NewMemberToken）+ RoomRecord/Room.OwnerToken；`store.go`（RegisterRoom/ListRooms 换列、RegisterUser 补空 nick、FindTokenByIP/TouchToken/IssueToken）；`transport/token.go`（handleIssueToken + clientIP）+ auth 中间件 /auth/token 豁免第 3 层；建房时建档 + 大厅 ownerNick；版本 `0.1.5` → `0.1.6`；新增测试 store/token_test.go（签发/复用/换发/过期/碰撞）+ transport/token_test.go（接口/复用/授权/owner_token）；`go vet` + `go test -count=1 ./...` 全绿
- **⚠️ 文档待同步（下次文档重整时处理）**：API.md 认证章节仍写"客户端自生成"、README 环境变量与 users 表说明、CONTRACTS.md 相关描述、OPS.md 增加"如何给客户端发 token"一节

## 6. 环境 / 沙箱事实

- 本地代理 `127.0.0.1:7897`（Clash Verge rev，verge-mihomo）；npm registry 直连；GitHub 直连被墙（走代理 + OpenSSL 后端）；curl.exe 不可用（仅 schannel）
- go 命令在沙箱下报 telemetry 写失败（`C:\Users\1\AppData\Roaming\go\telemetry`，噪音，不影响执行）；已 `go env -w GOPROXY=https://goproxy.cn,direct`
- 沙箱下 `go build` 需把 `GOCACHE` 指到工作区（默认缓存目录 `C:\Users\1\AppData\Local\go-build` 被沙箱拦）；`GOOS=linux GOARCH=amd64` 交叉编译已验证
- 冒烟/测试路径：`go test ./...`（常驻：单测 + E2E 集成测试 `transport/e2e_test.go`、聊天 `chat_test.go`、TTL `room/manager_test.go` 等）；`cmd/smoke`（对真实部署实例通电检查）待部署形态确定后补
- kookit 子模块的 `CLAUDE.md` 规则：**禁止在其仓库内 git commit / push**
