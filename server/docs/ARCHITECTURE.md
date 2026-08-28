# server 架构（模块 / 通讯模型）

> 归属：**server 专属**文档。共同架构与术语见 `../../docs/ARCHITECTURE.md`；
> REST / WS 接口契约见 `API.md`；运行说明见 `../README.md`。

## 1. 服务端模块（Go，v0.1.0 已实现于 `server/`）

> server 已在仓库内实现 v0.1.0（`server/`，独立 Go module，可随时拆为独立仓库）。

| 模块 | 职责 | 实现 |
|---|---|---|
| `room` | 房间状态机：成员、绑定 edition、当前位置；**纯内存**（重启即销毁）；空房间 TTL 倒计时（默认 12h）超时惰性清理；发现（大厅/按书找房）基于内存房间表 | `internal/room`（RoomManager） |
| `book` | 标定注册表：works / editions 查询、注册、比对；指纹校验 | `internal/store`（SQLite）+ `internal/domain`（协议校验） |
| `sync` | 同步事件分发（房间内广播），WS 消息信封 | `internal/transport`（WS）+ `internal/room`（广播） |
| `store` | SQLite（`modernc.org/sqlite`，纯 Go 无 cgo，works / editions / **users**）+ 内容寻址文件存储 | `internal/store` |
| `api` | REST（房间/书籍/上传下载）+ WebSocket（同步） | `internal/transport` |

> v0.1.0 决策：**无账号认证**（昵称+随机后缀）、**server 保存并分发电子版副本**（内容寻址 `data/books/<hash>.<ext>`）、数据目录/端口走环境变量（`TUREAD_DATA_DIR` / `TUREAD_ADDR`），部署形态不影响代码。

## 2. 通讯模型（token 双闸，v0.1.1 已实现第 2/3 层）

**结论：不用 cookie，用纯 token 双闸。** cookie 绑定浏览器语义（`Set-Cookie`/自动携带），桌面+移动客户端需自管 token，纯 token 天然跨平台。核心思想参考主流 App：*不认识的请求在碰到业务逻辑之前就被挡掉*。

四层定位，各管各的：

1. **服务器地址（IP/端口 或 域名）**：客户端配置 `server 地址`；REST 用 `http(s)://<addr>`，WS 用 `ws(s)://<addr>/ws`。**已定：客户端直接配置服务器 IP**；部署细节（公网 / 端口映射 / 是否 HTTPS）与服务器负责人讨论（运维话题，不阻塞开发），见 §3。
2. **准入门禁（服务器级共享 token）**：`TUREAD_ACCESS_TOKEN` 环境变量，部署者设**一把共享钥匙**（未设置 = 该层不启用）；所有 REST 请求与 WS 握手带 `X-Turead-Access` 头；middleware 常量时间比较校验，失败 401 / 拒绝升级。目的：**挡公网扫描与陌生人**。—— **v0.1.1 已实现**
3. **成员身份 token（客户端级，匿名访客）= 成员 ID**：客户端**自生成 7 位大小写字母+数字**（`^[A-Za-z0-9]{7}$`），`Authorization: Bearer <token>` 携带；middleware 格式校验（不合法 401）；WS 连接以 token 为 `memberID`（重连找回、跨平台同一身份）；**同 token 新连接踢旧连接**；昵称 ≤12 字；**role**（`user`/`admin`/`limited`）建档时按 `TUREAD_ADMIN_TOKENS` 判定，管理接口（副本/房间清理）enforce `admin`；远期可迁移为用户系统登录凭证。—— **v0.1.1 已实现**
4. **房间号（会话钥匙）**：`POST /rooms` 生成 8 位 hex 房间号；加入走 `/ws?room=<id>&nick=<name>`，定位房间绑定的 edition，完成标定/下载/位置同步。—— v0.1.0 已实现

> - token 放 header 而非 query：query 会进访问日志/浏览器历史，等于把钥匙到处写。
> - 双层 token 职责分离：**第 2 层挡"谁能连"（服务器级，所有人同一把）**，**第 3 层标识"谁在连"（成员级，每人一把 = 成员 ID）**；都不是账号认证，现阶段不做密码/登录。
> - /healthz 豁免双闸（探活不带 token）。
> - 主流 App（如抖音）参考：标准 HTTPS（HTTP/2/3）传输 + 私有应用层（Protobuf）+ 认证/风控/WAF 多层防御；现阶段只需 token 双闸，TLS/风控/WAF 上正式公网部署再考虑。

## 3. 待定事项（server）

- [ ] **服务器地址部署细节**（公网 IP / 端口映射 / 是否 HTTPS）—— 地址本身已定为"客户端直接配置 IP"；部署细节与服务器负责人讨论（运维话题，不阻塞开发）
- [x] 房间生命周期：**空房间 TTL 定案**（默认 12h，`TUREAD_ROOM_TTL` 可配；空房间进入倒计时，超时清理，重新有人加入取消）—— v0.1.4 已实现；**房主权限（删除/转让）仍挂起**
- [x] 房间发现：`GET /rooms`（大厅）+ `?edition=`（按书找房）—— v0.1.4 已实现；v1 房间默认公开可见（无密码），隐私开关远期
- [ ] 用户系统（剩余）：昵称 / bio 编辑接口、`limited` 角色语义、token 加密码列（加盐哈希）演进为登录系统（`admin` 已 enforce：管理接口副本/房间清理）

## 4. 传输与运行基本功（2026-08-27 已实现）

### 4.1 广播背压（backpressure）

**问题**：v0.1.0 的广播在发送者 goroutine 里同步写每个连接——一个慢客户端（网络慢/不读消息）会阻塞整个房间广播链。

**解法**（gorilla 官方聊天模式，`internal/transport/server.go`）：

- 每个 WS 连接：**独立 out 队列（容量 32）+ 独立写 goroutine**；广播方（`send` 回调）只做**非阻塞入队**，队列满即 `kick` 断开慢客户端
- 写 goroutine 串行写（10s 写超时）+ 周期 ping（54s）保活；任何写失败同样 `kick`
- 两条背压路径殊途同归：队列满（writer 阻塞时）或写失败（TCP 缓冲满/死连接）→ 断开连接并清理房间订阅
- 常量：`writeWait=10s / pongWait=60s / pingPeriod=54s / sendQueue=32`
- 验证：包内单元测试 `TestSendQueueOverflowKicks`（队列满必 kick，确定性）；E2E 冒烟验证"慢客户端不拖垮房间 + 断线清理"

### 4.2 /healthz 健康检查

`GET /healthz`：SQLite `PingContext` 探活 → `200 {"status":"ok"}`；DB 不可用 → `503 {"status":"degraded"}`。

### 4.3 优雅关停（graceful shutdown）

`cmd/server/main.go`：`signal.NotifyContext(SIGINT/SIGTERM)` → `http.Server.Shutdown(10s)`（停收新连接、等在途 REST 请求）→ 关 SQLite → 退出。

> 注：`Shutdown` 不等 hijacked 连接（WebSocket）——当前接受，关停时 WS 被直接断开。

## 5. 分层与抽象决策（2026-08-27 定案）

**结论：不增加分层/抽象，维持当前包结构；只做文件级整理。**

- 现有分层已正确：`cmd → transport → room → store → domain`，依赖方向单向，domain 零依赖——已是六边形/分层的骨架
- 核心业务（房间转发）简单且不会再膨胀；复杂度集中在横切关注点（认证 / 背压 / 管理 / 并发安全），已各归其位
- 过早抽象是负债（YAGNI / Rule of Three）：当前每个抽象只有 1 个实现（SQLite / WebSocket / REST），没有第二个实现方，抽 interface 没有对象
- **文件级划分**（transport 包）：`server.go`（装配+路由）/ `rest.go`（业务 REST）/ `ws.go`（WS+背压）/ `admin.go`（管理接口）/ `auth.go`（双闸）/ `utils.go`

**何时才需要真正的抽象（触发条件，出现其一再动手）：**

1. 出现第二个传输（HTTP 轮询 / 自定义协议 / gRPC）——先抽 `transport` 接口
2. 出现第二个存储（PostgreSQL / 内存态可切换）——先抽 `store` 接口
3. 出现第二个调用方（Web 壳 / 移动端 API 复用）——先立 `usecases` 层
4. `transport` 包再次超过 ~800 行或 handler 数量翻倍——先拆文件
