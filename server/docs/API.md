# server API 契约（REST + WebSocket，v0.1.5）

> 权威实现：`internal/transport/server.go`；信封与载荷类型：`internal/domain/types.go`。
> 客户端侧适配入口：`client/docs/CONTRACTS.md` 的 `INetService`（信封搬运，不理解语义）与 `IRoomSession`（业务语义）。
> 配置与运维：见 `OPS.md`。**同步协议与转发规范**（转发语义权威）见下文「同步协议与转发规范」。

## 基础约定

- **无账号认证（v0.1.1 已升级为 token 双闸，见下）**：成员身份 = 成员 token；WS 连接断开即失效。**房间定义与聊天消息落库**（v0.1.5 起）；成员/位置/订阅仍纯内存
- **电子版指纹**：`md5-sample3-v1`（头 64KB + 中点 64KB + 尾 64KB 三点采样拼接后哈希）+ 文件大小（`Fingerprint{algorithm, hash, size}`）。
- **文件分发走内容寻址**：`<dataDir>/books/<hash>.<ext>`，文件名即指纹，同一电子版天然去重。
- **edition.url（下载来源）**：`editions.url` 存"这本书可以从哪下"——外部平台（zlib / Anna's Archive 等）链接，或本机地址；可选，创建房间时由客户端提供。**本机下载地址不落库**：`local_copy = 1` 时下载即派生的 `GET /books/{editionID}/file`，绝对地址由客户端用其配置的 server 地址拼接。
- **edition.local_copy（本机副本状态）**：`0` = 本机（server 内容寻址存储）无副本，`1` = 已存副本（`POST /books/{editionID}/file` 上传成功后 server 自动置 1）。与 `url` **正交**：外部源 + 本机有副本可同时成立，也可只有其一。
- **配置**：TOML 配置文件（`turead.toml`，`TUREAD_CONFIG` 指定路径）+ 环境变量覆盖（`TUREAD_*`），见 `OPS.md`；策略类字段（access_token / admin_tokens / room_ttl / max_upload_mb）支持**热重载**。

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
- **权限**：管理接口（副本删除 / 房间删除）要求 `role = admin`——判定 = 配置的 `admin_tokens` 列表命中 或 `users.role == admin`；非 admin → `403`
- **热重载（v0.1.5）**：`access_token` / `admin_tokens` 修改配置文件后自动生效（2s 内）；**已连接 WS 不受影响**（连接时已鉴权），新连接按新配置校验

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
    "code": "识别编码（isbn 含校验位；asin/doi/open-library 仅格式校验；content-hash-v1 = edition 内容指纹，客户端校准算法计算，server 只存不重算）",
    "title": "书名",
    "ext": "扩展名（小写）",
    "hashAlgo": "md5-sample3-v1（缺省）",
    "hash": "指纹哈希（hex）",
    "size": 12345,
    "source": "来源（可选）",
    "url": "下载来源（可选；外部平台 zlib/anna 等，或本机地址）"
  }
}
```

> 模型说明（2026-08-27）：**Work 不设 author / publisher**（多作者需联结表+核对机制，远期复杂不做；ISBN 已提供可查询性）。
> `content-hash-v1` = **edition 内容指纹**：同一扫描版/同一文件内容 → 同 code（标题/文件名不同不影响）；扫描版不同即不同 edition，位置无法对齐。
> **Edition 信息由客户端计算并上传**：客户端用其校准算法（含 OCR，如扫描书提 ISBN）计算指纹，创建房间时**同时上传副本与 edition 信息**；server 只登记，从不自己计算指纹。

- `200` 响应：`{ "roomId": "8位hex", "editionId": 1, "workId": 1, "created": true }`
- `400`：owner 为空 / protocol 不在枚举 / code 校验失败 / title·ext·hash·size 缺失或非法
- `500`：存储或房间创建失败

### GET /rooms —— 房间发现（大厅 / 按书找房）

> v0.1.5 起房间定义落库（rooms 表，重启恢复）；列表基于内存房间表（含恢复的房间）。空房间进入 TTL 倒计时（默认 12h，配置 `room_ttl`），TTL 内仍可见可加入，超时惰性清理（含删持久化记录与聊天消息）；有成员的房间一直存活。

- `GET /rooms`：全部存活房间列表
- `GET /rooms?edition=<editionID>`：按书找房（筛选绑定该 edition 的房间）

响应（`200`）：

```json
{
  "rooms": [
    {
      "roomId": "8位hex",
      "editionId": 1,
      "title": "书名（work.title，可能缺）",
      "ext": "epub",
      "memberCount": 0,
      "createdAt": 1756300000
    }
  ]
}
```

- `400`：`edition` 参数非数字
- 加入方式不变：`WS /ws?room=<roomId>&nick=<name>`（房间号即加入钥匙；v1 房间默认公开可见，无密码）

### GET /rooms/{roomID}/messages —— 聊天历史（追加日志，v0.1.5）

- 查询参数：`after=<id>`（增量拉取：只取 id 更大的消息，0/缺省 = 从头）、`limit=<n>`（条数，默认 50，上限 500）
- `200`：`{ "messages": [ { "id": 1, "roomId": "...", "member": "...", "nick": "...", "text": "...", "createdAt": 1756300000 } ] }`（按 id 升序）
- `400`：`after` / `limit` 非法
- 聊天消息随房间删除（TTL 过期 / admin 删除）级联清理，历史生命周期与房间一致

### GET /books/{editionID} —— 电子版信息（无书成员标定用）

- `200`：Edition 完整字段（`id` / `workId` / `ext` / `hashAlgo` / `hash` / `size` / `source` / `url` / `localCopy` / `filePath` / `createdAt`）
- `404`：edition 不存在

### POST /books/{editionID}/file —— 上传副本（分发源，幂等）

- 请求体：原始文件二进制流。
- 已存在同名副本（`<hash>.<ext>`）则跳过；写临时文件后 rename，防半写。
- 成功后将 edition 置 `local_copy = 1`（本机已有副本）。
- `200` 成功｜`413` 超过上传上限（配置 `max_upload_mb` > 0 时；可热改）

### GET /books/{editionID}/file —— 下载副本（分发）

- `200`：文件流，`Content-Disposition: attachment; filename="book.<ext>"`
- `404`：edition 不存在或副本尚未上传

### DELETE /books/{editionID}/file —— 删除本机副本（admin only）

- 删除内容寻址文件 + 置 `local_copy = 0`（幂等；文件不存在也算成功）
- `200` 成功｜`403` 非 admin｜`404` edition 不存在

### DELETE /rooms/{roomID} —— 删除房间并踢出全部成员（admin only）

- 从内存房间表移除房间，断开房间内所有成员的 WS 连接，并删除持久化房间记录与聊天消息
- `200` 成功｜`403` 非 admin｜`404` 房间不存在

## 同步协议与转发规范（转发语义权威，v0.1.5）

> 目标：把"服务器转什么、怎么转"钉死，**与客户端交互方式解耦**——客户端无论用点击/滚轮/键盘哪种方式翻页，最终都归一为位置状态（`room.location`）上报；server 只转发**状态**，不转发操作动作。改协议 = 契约先行（同 commit 改本文 + `client/docs/CONTRACTS.md`）。

**信封**（transport 只搬运，不理解语义）：

```json
{ "type": "<消息类型>", "payload": { } }
```

**消息集与转发规则**：

| type | 方向 | 触发 | 转发规则 |
|---|---|---|---|
| `room.join` | client → server | 成员加入 | 上报指纹（`null` = 无书成员）→ 标定 |
| `room.join-ack` | server → client | 标定完成 | 只发给加入者：ok / reason / roomId / edition / members 全量快照 |
| `room.location` | client → server | 成员位置变化 | server 更新该成员位置 |
| `room.presence` | server → 房间**其他成员** | join 成功 / 位置变化 / **成员离开（v0.1.5 补丁）** | 广播**全量成员快照**（含每人位置）；发送者除外 |
| `room.chat` | client → server | 成员发消息 | **先落库**（追加日志），再广播 |
| `room.message` | server → 房间**全部成员**（含发送者） | chat 落库成功 | 广播消息（id / roomId / member / nick / text / createdAt）；发送者也收到 = server 权威回执 |
| `room.system` | server → client | 预留 | 已定义未发送 |
| `room.book-mismatch` | server → client | 预留 | 已定义未发送（当前走 join-ack 的 reason） |

**核心语义**：
1. **状态转发而非操作转发**：只同步位置状态（BookLocation）与聊天消息；翻页/滚动等操作动作本身不转发。v1 边界：笔记 / 划线 / 光标在场 / 操作事件流**明确排除**（契约预留扩展，信封不变）
2. **全量快照广播**：presence 每次携带完整成员列表（v1 人少，全量简单正确；人多了再演进增量）
3. **除发送者外**：presence 排除触发者；chat 广播**含**发送者（回执语义）
4. **离开必须广播**：成员断线/离开 → server 移除成员后立即广播 presence，其余成员不残留离线成员
5. **加入即全量同步**：join-ack 携带 members 快照，新成员拿到当前房间状态
6. **背压**：广播非阻塞入队（每连接队列 32），队列满或写失败即断开慢客户端（不拖垮房间）
7. **广播频率**：位置上报的节流是 client 职责（见 CONTRACTS IRoomSession"节流 → send"）

## WebSocket —— `GET /ws?room=<id>&nick=<name>`

信封（transport 只搬运，语义由用例层解释；payload 先按 `type` 再解析）：

```json
{ "type": "room.join | room.location | room.chat", "payload": { } }
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
  "members": [ { "id": "...", "nickName": "...", "location": { "...BookLocation 字段..." } } ]
}
```

标定规则（严格模式）：上报指纹必须与房间绑定 edition 的 `hash` + `size` 完全一致，否则 `ok: false, reason: "book-mismatch"`。
加入成功后，server 向房间内**其他**成员广播 `room.presence`（更新后的成员列表）。

### room.location（client → server）

```json
{ "location": { "chapterDocIndex": 0, "chapterHref": "...", "count": 0, "page": 0, "percentage": 0.0, "text": "...", "chapterTitle": "..." } }
```

server 更新该成员位置，并向**其他**成员广播 `room.presence`（含全部成员当前位置）。

### room.chat（client → server）｜room.message（server → 房间）

```json
{ "text": "大家好" }
```

server 落库成功后广播 `room.message`：

```json
{ "id": 1, "roomId": "...", "member": "...", "nick": "alice", "text": "大家好", "createdAt": 1756300000 }
```

空文本（全空白）不落库不广播。

### 消息类型清单（`internal/domain/types.go` 的 `Msg*` 常量）

| type | 方向 | 状态 |
|---|---|---|
| `room.join` | client → server | v0.1.0 使用中 |
| `room.join-ack` | server → client | v0.1.0 使用中 |
| `room.location` | client → server | v0.1.0 使用中 |
| `room.presence` | server → 房间 | v0.1.0 使用中（v0.1.5 补离开广播） |
| `room.chat` | client → server | v0.1.5 使用中 |
| `room.message` | server → 房间 | v0.1.5 使用中 |
| `room.system` | server → client | 已定义，未发送 |
| `room.book-mismatch` | server → client | 已定义，未发送（标定失败当前走 join-ack 的 reason） |

## 已知不一致（已解决）

- ~~`domain.Member` 无 json tag~~ —— **v0.1.5 已对齐**：成员字段为 `id` / `nickName` / `location`（omitempty），与 client 契约 `RoomMember` 一致
