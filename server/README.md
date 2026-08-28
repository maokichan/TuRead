# server — Go 同步服务器（v0.1.5）

多人共读的同步服务器：房间管理 + 书籍标定注册表 + 电子版分发 + 阅读位置实时广播 + 聊天。

- 技术栈：Go 1.26 + 标准库 `net/http` + `gorilla/websocket` + `modernc.org/sqlite`（纯 Go 无 cgo）+ `BurntSushi/toml`
- 版本：v0.1.5（`cmd/server/main.go` 中 `version` 常量；v0.1.2 = 传输基本功 + token 双闸认证 + 用户系统/管理接口；v0.1.3 = Work 去 author/publisher + content-hash-v1 重定义为 edition 内容指纹；v0.1.4 = 空房间 TTL + 房间发现接口；v0.1.5 = 配置文件 + 热重载 + 上传限制 + 聊天室与持久化 + 转发规范）
- 文档：架构与通讯模型 → `docs/ARCHITECTURE.md`｜REST/WS 接口契约与转发规范 → `docs/API.md`｜**运维手册 → `docs/OPS.md`**

## 目录

```
cmd/server           入口：装配 config / store / room / transport，监听端口
internal/config      TOML 配置加载 + 环境覆盖 + 校验 + 文件监听热重载
internal/domain      领域：BookLocation / Work / Edition / RoomRecord / ChatMessage / 消息信封
                     识别协议：isbn(校验位) / asin / doi / open-library / content-hash-v1
internal/store       SQLite 注册表（works / editions / users / rooms / messages）+ 内容寻址文件存储
internal/room        内存 RoomManager（成员/位置/订阅/广播；房间定义落库，运行时状态不落库）
internal/transport   REST + WebSocket（消息信封收发）
docs                 本模块文档（架构 / 接口契约 / 运维手册）
```

## 数据模型

- **持久化（SQLite）**：`works`（作品 = 同一本书，识别协议+编码唯一）｜`editions`（电子版 = 同一电子文件，扩展名+指纹唯一，含下载来源 `url`、本机副本标志 `local_copy` 与分发副本路径）｜`users`（用户档案：token=成员 ID/nick/bio/role/created_at，首次 join 自动建档）｜`rooms`（房间定义，v0.1.5 起）｜`messages`（聊天消息，追加日志，随房间删除级联清理）
- **内存态**：房间成员 / 位置 / WS 连接（不落库）；空房间 TTL 倒计时（默认 12h，配置 `room_ttl` 可热改），超时惰性清理（含删持久化记录），重新有人加入取消
- 电子版指纹：`md5-sample3-v1`（头 64KB + 中点 64KB + 尾 64KB 三点采样拼接后哈希）+ 文件大小
- schema 管理：`internal/store/schema.sql`（`go:embed` 嵌入二进制，保持单文件部署；老库缺列自动 `ALTER` 补列）

## 运行

配置优先用 **TOML 文件**（`turead.toml`，示例见 `turead.toml.example`；策略类字段改完 2 秒内热生效，`addr`/`data_dir` 改完需重启）；环境变量可覆盖（env 优先）：

```
TUREAD_CONFIG          配置文件路径（默认 ./turead.toml）
TUREAD_ADDR            监听地址（默认 :8080）
TUREAD_DATA_DIR        数据目录（默认 ./data，SQLite + books/ 副本）
TUREAD_ACCESS_TOKEN    服务器级共享钥匙（可选；设置后所有请求须带 X-Turead-Access 头，未设置 = 该层不启用；可热改）
TUREAD_ADMIN_TOKENS    管理员 token 列表（逗号分隔；可热改）
TUREAD_ROOM_TTL        空房间 TTL（默认 12h；可热改）
TUREAD_MAX_UPLOAD_MB   上传大小上限 MB（0 = 不限；可热改）
```

认证（v0.1.1 token 双闸）：除 `/healthz` 外，所有 REST 与 WS 握手须带 `X-Turead-Access`（服务器级共享钥匙）+ `Authorization: Bearer <7位大小写字母数字>`（成员 token = 成员 ID，客户端自生成）；缺一即 401 直接关闭；同 token 新连接踢旧连接；昵称 ≤12 字。管理接口（`DELETE /books/{id}/file` 删副本、`DELETE /rooms/{id}` 删房间踢人）仅 admin（配置的 `admin_tokens` 或 `users.role=admin`）。文件上传/下载走内容寻址（文件名 = 指纹哈希，天然去重）。

## REST / WS 接口（v0.1.5）

完整契约（请求/响应体、信封、错误码、**转发规范**）见 `docs/API.md`；快速索引：

- `GET  /healthz` — 健康检查（存活探针，含 DB 连通）
- `POST /rooms` — 创建房间并注册 work/edition（房间定义落库）
- `GET  /rooms` — 房间发现：大厅列表；`?edition=<id>` 按书找房
- `GET  /rooms/{roomID}/messages` — 聊天历史（`?after=` 增量 / `?limit=` 条数）
- `GET  /books/{editionID}` — 电子版信息（无书成员标定）
- `POST /books/{editionID}/file` — 上传副本（分发源；可配上限，超限 413）
- `GET  /books/{editionID}/file` — 下载副本（分发）
- `GET  /ws?room=&nick=` — WebSocket 房间同步（信封：`room.join` / `room.join-ack` / `room.location` / `room.presence` / `room.chat` / `room.message`）
