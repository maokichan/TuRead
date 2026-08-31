# TuRead server 运维手册（OPS）

> 给运维同学看的操作与排障指南。开发/架构细节见 `ARCHITECTURE.md` 与 `API.md`。
> 一句话：**配置改文件、端口和数据目录改完要重启、其余配置改完自动生效**。

## 1. 快速上手

```bash
# 1) 写配置文件（可选，不写就用默认值）
cp turead.toml.example turead.toml   # 或手写一个，见 §2

# 2) 启动
./turead-server

# 3) 验证存活
curl http://<服务器IP>:8080/healthz        # → {"status":"ok"}

# 4) 停止（优雅关停，等 10s 内收尾）
Ctrl+C   # 或 kill -TERM <pid>
```

## 2. 配置文件（turead.toml）

配置读取顺序：**环境变量 > 配置文件 > 默认值**。文件路径用环境变量 `TUREAD_CONFIG` 指定，默认 `./turead.toml`。

```toml
# ---- 启动类（改动必须重启进程才生效）----
addr = ":8080"            # 监听地址：端口，或 IP:端口（如 "0.0.0.0:8080"）
data_dir = "./data"       # 数据目录：SQLite 数据库 + books/ 电子版副本（改了找不到原数据，勿乱动）

# ---- 策略类（改完文件 2 秒内自动生效，无需重启）----
access_token = ""         # 服务器级共享钥匙（第 2 层准入门禁）：所有客户端连这台服务器要带同一把钥匙；
                          # 留空 = 不启用（任何人都能连，公网部署务必设置！）
admin_tokens = ["Abc1234"] # 管理员 token 列表（逗号分隔写数组）；管理员可删房间/删副本
room_ttl = "12h"          # 空房间保留时长：房间没人后过多久清理（含聊天记录）。示例："30m" "1h" "12h"
max_upload_mb = 0         # 上传电子版大小上限（MB）；0 = 不限。防有人传超大文件占满磁盘
log_level = "info"        # 预留：日志级别（日志系统未做分级，先放着）
```

> **环境变量覆盖**（和配置文件二选一，env 优先）：`TUREAD_ADDR` / `TUREAD_DATA_DIR` / `TUREAD_ACCESS_TOKEN` / `TUREAD_ADMIN_TOKENS`（逗号分隔）/ `TUREAD_ROOM_TTL` / `TUREAD_MAX_UPLOAD_MB` / `TUREAD_CONFIG`。

## 2.1 客户端如何拿到成员 token

成员 token **由服务器签发**（客户端不用自己造）：客户端带二级令牌调签发接口即可，**同一 IP 7 天内重复申请会拿到同一个 token**（复用，不需要也不该反复换）：

```bash
# 客户端首次连接前调用一次，保存返回的 token
curl -X POST http://<IP>:8080/auth/token -H "X-Turead-Access: <access_token>"
# → {"token":"wv5WHOO","issued":true}
```

之后所有 REST / WS 请求都带 `Authorization: Bearer <token>`。管理员直接用配置 `admin_tokens` 里的 token，无需走签发。

## 3. 端口与地址

- 客户端连服务器：**直接把服务器 IP 给客户端**，客户端里填 `http://<IP>:8080`（REST）与 `ws://<IP>:8080/ws`（同步）
- 改监听端口：改配置文件 `addr` → **重启进程**
- 对外部网络开放需要：服务器所在机器放行端口（防火墙/安全组）+ 路由器端口映射；是否上 HTTPS 由部署负责人决定（现阶段未内置 TLS）

## 4. 数据与备份

```
data/
├── turead.db          # SQLite：作品/电子版/房间定义/聊天消息/用户档案（全部持久化数据）
└── books/             # 电子版副本（内容寻址：文件名 = 指纹哈希，天然去重）
```

- **备份 = 停机拷贝 data/ 目录**（或停服后复制 turead.db + books/）；SQLite 单文件，直接复制即可
- **房间/成员在线状态不落库**：重启后房间定义恢复为"空房间"（成员重连回来），在线成员/位置/连接全部重建
- 聊天消息生命周期 = 房间生命周期：房间空置超过 `room_ttl` 或管理员删除 → 房间和聊天记录一起清理

## 5. 常见故障排查

| 症状 | 可能原因 | 处理 |
|---|---|---|
| `curl /healthz` 连不上 / 超时 | 端口没开 / 进程没起 / 防火墙拦 | 看进程在不在（`ps`）；`netstat -anp | grep 8080`；放行端口 |
| `healthz` 返回 `503 degraded` | SQLite 打不开（磁盘满/权限/文件损坏） | 看日志报错；`df -h` 查磁盘；检查 data 目录权限 |
| 客户端提示 401 | ① `access_token` 没对上 ② 成员 token 缺失/非法（token 由服务器签发，见 §2.1；同一 IP 7 天内申请会复用同一 token，换 IP/7 天后会拿到新 token） | ① 检查两边配置的钥匙一致（改文件自动生效）② 客户端先调 `POST /auth/token` 拿 token 再带 `Authorization` 头 |
| 客户端能连但进不了房间 / 房间不存在 | 房间空置超过 `room_ttl` 被清理了 | 房间号过期，重新建房间；或调大 `room_ttl` |
| 上传文件提示 413 | 超过 `max_upload_mb` 上限 | 调大或置 0（不限），2 秒生效 |
| 重启后成员全掉线 | 正常现象：在线状态不落库 | 客户端重连即可，房间号仍有效（TTL 内） |
| 日志一直刷某错误 | 视内容而定 | 带日志找开发；常见：`delete expired room` 说明 TTL 清理正常 |
| 想踢掉某个房间/副本 | 用管理员 token 调管理接口 | 见 §6 |

## 6. 管理接口（需要管理员 token；删房间另允许房主）

```bash
# 删除某房间（踢出全部成员 + 删聊天记录）；v0.2.0 起房主也能删自己的房间（用房主自己的成员 token），
# admin 可删任何房间
curl -X DELETE http://<IP>:8080/rooms/<roomId> \
     -H "X-Turead-Access: <access_token>" \
     -H "Authorization: Bearer <管理员token 或 房主自己的成员token>"

# 删除某电子版的本机副本（仍 admin only）
curl -X DELETE http://<IP>:8080/books/<editionId>/file \
     -H "X-Turead-Access: <access_token>" \
     -H "Authorization: Bearer <管理员token>"
```

## 7. 日志怎么看

- 启动会打印：版本、监听地址、数据目录、管理员数量、恢复的房间数
- 常见日志含义：
  - `warning: access_token not set` —— 第 2 层门禁没启用，公网部署必须补
  - `config reloaded: ...` —— 配置文件热重载生效（正常）
  - `config reload failed: ...` —— 配置文件写错了（TOML 语法/字段值），修完会重试
  - `member xxx: kicking previous connection` —— 同一 token 顶号（正常）
