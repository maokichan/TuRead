# server API 契约（REST + WebSocket，v0.1.0）

> 权威实现：`internal/transport/server.go`；信封与载荷类型：`internal/domain/types.go`。
> 客户端侧适配入口：`client/docs/CONTRACTS.md` 的 `INetService`（信封搬运，不理解语义）与 `IRoomSession`（业务语义）。

## 基础约定

- **无账号认证（v0.1.1 已升级为 token 双闸，见下）**：成员身份 = 成员 token（不再是昵称+随机后缀）；WS 连接断开即失效；房间/成员不落库
- **电子版指纹**：`md5-sample3-v1`（头 64KB + 中点 64KB + 尾 64KB 三点采样拼接后哈希）+ 文件大小（`Fingerprint{algorithm, hash, size}`）。
- **文件分发走内容寻址**：`<dataDir>/books/<hash>.<ext>`，文件名即指纹，同一电子版天然去重。
- **edition.url（下载来源）**：`editions.url` 存"这本书可以从哪下"——外部平台（zlib / Anna's Archive 等）链接，或本机地址；可选，创建房间时由客户端提供。**本机下载地址不落库**：`local_copy = 1` 时下载即派生的 `GET /books/{editionID}/file`，绝对地址由客户端用其配置的 server 地址拼接。
- **edition.local_copy（本机副本状态）**：`0` = 本机（server 内容寻址存储）无副本，`1` = 已存副本（`POST /books/{editionID}/file` 上传成功后 server 自动置 1）。与 `url` **正交**：外部源 + 本机有副本可同时成立，也可只有其一。
- **环境变量**：`TUREAD_ADDR`（监听地址，默认 `:8080`）｜`TUREAD_DATA_DIR`（数据目录，默认 `./data`，含 SQLite + `books/` 副本）。

## 副本存储与分发流程

1. 房主 `POST /rooms` 注册 work/edition（edition 落库，含可选的 `url` 外部来源；`local_copy` 初始 0）。
2. 房主 `POST /books/{editionID}/file` 上传副本 → server 存进内容寻址存储（`data/books/<hash>.<ext>`，幂等去重）并置 `local_copy = 1`——**server 本身即副本源**。
3. 成员 `WS join`（`fingerprint: null` 的无书成员）→ join-ack 返回 edition（含 `url` 与 `localCopy`）。
4. 无书成员获取副本的途径（二选一）：`localCopy = 1` 时 `GET <server>/books/{editionID}/file` 从本机下；或按 `url` 从外部源下。

> 说明：副本是否已上传与 edition 注册是两件事——edition 可先注册，文件后上传（未上传时本机下载返回 404，`local_copy` 仍为 0）。

## 认证（token 双闸，v0.1.1）

除 `/healthz` 外，**所有 REST 请求与 WS 握手**必须同时通过两层校验，否则 `401` 直接关闭（先于任何业务）：

| 层 | 头 | 值 | 校验 |
|---|---|---|---|
| 第 2 层 准入门禁 | `X-Turead-Access` | 服务器级共享钥匙（`TUREAD_ACCESS_TOKEN`，所有人同一把；未配置 = 该层不启用） | 常量时间比较，不匹配 401 |
| 第 3 层 成员身份 | `Authorization: Bearer <token>` | 成员 token = 成员 ID：**7 位大小写字母+数字**（`^[A-Za-z0-9]{7}$`，客户端自生成） | 格式校验，缺失/非法 401 |

- WS 握手同样带这两个头（桌面客户端可自定义 header）；同一成员 token 的新连接会**踢掉旧连接**（"单设备登录"）
- 成员 token 即成员 ID：重连找回身份、跨平台同一身份；远期可迁移为用户系统登录凭证
- `/healthz` 完全豁免（探活不带 token）
- **权限**：管理接口（副本删除 / 房间删除）要求 `role = admin`——判定 = `TUREAD_ADMIN_TOKENS` 列表命中 或 `users.role == admin`；非 admin → `403`

## 用户（users）

- **用户 ID = 成员 token**（7 位大小写字母数字，客户端自生成；无独立自增 id）
- **自动建档**：首次 `WS join` 时 `INSERT OR IGNORE`（幂等，不覆盖已存在档案）；`nick` 取 join 昵称（**≤12 字**，超长拒绝连接）；`role` 按是否在 `TUREAD_ADMIN_TOKENS` 判定（admin/user）
- 字段：`token`(PK) / `nick` / `bio`（描述，≤120 字，写接口时校验）/ `role` / `created_at`
- `role` 枚举：`user`（正常）/ `admin`（管理）/ `limited`（限制）—— v0.1.1 已 enforce admin（管理接口）；`limited` 语义远期实现
- 远期迁移：token 即用户名，可加密码列（加盐哈希）演进为登录用户系统

## REST

### GET /healthz —— 健康检查（存活探针）

- `200`：`{ "status": "ok" }`（SQLite 可 ping）
- `503`：`{ "status": "degraded", "error": "..." }`（DB 不可用）

### POST /rooms —— 创建房间并注册 work/edition

请求体：

```json
{
  "owner": "昵称",
  "book": {
    "protocol": "isbn | asin | doi | open-library | content-hash-v1",
    "code": "识别编码（isbn 含校验位；asin/doi/open-library 仅格式校验）",
    "title": "书名",
    "author": "作者（可选）",
    "ext": "扩展名（小写）",
    "hashAlgo": "md5-sample3-v1（缺省）",
    "hash": "指纹哈希（hex）",
    "size": 12345,
    "source": "来源（可选）",
    "url": "下载来源（可选；外部平台 zlib/anna 等，或本机地址）"
  }
}
```

- `200` 响应：`{ "roomId": "8位hex", "editionId": 1, "workId": 1, "created": true }`
- `400`：owner 为空 / protocol 不在枚举 / code 校验失败 / title·ext·hash·size 缺失或非法
- `500`：存储或房间创建失败

### GET /books/{editionID} —— 电子版信息（无书成员标定用）

- `200`：Edition 完整字段（`id` / `workId` / `ext` / `hashAlgo` / `hash` / `size` / `source` / `url` / `localCopy` / `filePath` / `createdAt`）
- `404`：edition 不存在

### POST /books/{editionID}/file —— 上传副本（分发源，幂等）

- 请求体：原始文件二进制流。
- 已存在同名副本（`<hash>.<ext>`）则跳过；写临时文件后 rename，防半写。
- 成功后将 edition 置 `local_copy = 1`（本机已有副本）。
- `200` 成功。

### GET /books/{editionID}/file —— 下载副本（分发）

- `200`：文件流，`Content-Disposition: attachment; filename="book.<ext>"`
- `404`：edition 不存在或副本尚未上传

### DELETE /books/{editionID}/file —— 删除本机副本（admin only）

- 删除内容寻址文件 + 置 `local_copy = 0`（幂等；文件不存在也算成功）
- `200` 成功｜`403` 非 admin｜`404` edition 不存在

### DELETE /rooms/{roomID} —— 删除房间并踢出全部成员（admin only）

- 从内存房间表移除房间，并断开房间内所有成员的 WS 连接
- `200` 成功｜`403` 非 admin｜`404` 房间不存在

## WebSocket —— `GET /ws?room=<id>&nick=<name>`

信封（transport 只搬运，语义由用例层解释；payload 先按 `type` 再解析）：

```json
{ "type": "room.join | room.location", "payload": { } }
```

### room.join（client → server）

```json
{ "fingerprint": { "algorithm": "md5-sample3-v1", "hash": "...", "size": 12345 } }
```

`fingerprint: null` = 无书成员（允许加入，返回 edition 供下载）。

### room.join-ack（server → client）

```json
{
  "ok": true,
  "reason": "book-mismatch | room-not-found | room-full | bad payload（仅失败时）",
  "roomId": "...",
  "edition": { "...Edition 字段..." },
  "members": [ { "ID": "...", "NickName": "...", "Location": { "...BookLocation 字段..." } } ]
}
```

标定规则（严格模式）：上报指纹必须与房间绑定 edition 的 `hash` + `size` 完全一致，否则 `ok: false, reason: "book-mismatch"`。
加入成功后，server 向房间内**其他**成员广播 `room.presence`（更新后的成员列表）。

### room.location（client → server）

```json
{ "location": { "chapterDocIndex": 0, "chapterHref": "...", "count": 0, "page": 0, "percentage": 0.0, "text": "...", "chapterTitle": "..." } }
```

server 更新该成员位置，并向**其他**成员广播 `room.presence`（含全部成员当前位置）。

### 消息类型清单（`internal/domain/types.go` 的 `Msg*` 常量）

| type | 方向 | 状态 |
|---|---|---|
| `room.join` | client → server | v0.1.0 使用中 |
| `room.join-ack` | server → client | v0.1.0 使用中 |
| `room.location` | client → server | v0.1.0 使用中 |
| `room.presence` | server → 房间 | v0.1.0 使用中 |
| `room.system` | server → client | 已定义，未发送 |
| `room.book-mismatch` | server → client | 已定义，未发送（标定失败当前走 join-ack 的 reason） |

## 已知不一致（联调冒烟时需对齐）

- `domain.Member` 无 json tag：`room.presence` 里成员字段为大写 `ID` / `NickName` / `Location`；
  client 契约 `RoomMember` 为 `id` / `nickName` / `isMe?`。联调时需确定对齐方向。
