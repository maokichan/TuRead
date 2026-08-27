# server — Go 同步服务器（v0.1.0）

多人共读的同步服务器：房间管理 + 书籍标定注册表 + 电子版分发 + 阅读位置实时广播。

- 技术栈：Go 1.26 + 标准库 `net/http` + `gorilla/websocket` + `modernc.org/sqlite`（纯 Go 无 cgo）
- 版本：v0.1.0（`cmd/server/main.go` 中 `version` 常量）

## 目录

```
cmd/server           入口：装配 store / room / transport，监听端口
internal/domain      领域：BookLocation / Work / Edition / 消息信封
                     识别协议：isbn(校验位) / asin / doi / open-library / content-hash-v1
internal/store       SQLite 注册表（works / editions）+ 内容寻址文件存储
internal/room        内存 RoomManager（房间/成员/位置/广播，不落库）
internal/transport   REST + WebSocket（消息信封收发）
```

## 数据模型

- **持久化（SQLite）**：`works`（作品 = 同一本书，识别协议+编码唯一）｜`editions`（电子版 = 同一电子文件，扩展名+指纹唯一，含分发副本路径）
- **内存态**：房间 / 成员 / 位置 / WS 连接（不落库，重启即销毁）
- 电子版指纹：`md5-sample3-v1`（头 64KB + 中点 64KB + 尾 64KB 三点采样拼接后哈希）+ 文件大小

## 运行

```
TUREAD_ADDR      监听地址（默认 :8080）
TUREAD_DATA_DIR  数据目录（默认 ./data，SQLite + books/ 副本）
```

无账号认证（学习期）：昵称 + 随机后缀标识成员；文件上传/下载走内容寻址（文件名 = 指纹哈希，天然去重）。

## REST / WS 接口（v0.1.0）

- `POST /rooms` — 创建房间并注册 work/edition
- `GET  /books/{editionID}` — 电子版信息（无书成员标定）
- `POST /books/{editionID}/file` — 上传副本（分发源）
- `GET  /books/{editionID}/file` — 下载副本（分发）
- `GET  /ws?room=&nick=` — WebSocket 房间同步（信封：`room.join` / `room.join-ack` / `room.location` / `room.presence`）
