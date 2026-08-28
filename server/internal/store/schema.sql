-- TuRead server schema（v5）
-- 说明：go:embed 嵌入二进制；老库用 internal/store 的列迁移补列（ALTER TABLE）。
-- 持久化内容：works（作品 = 同一本书，协议+编码唯一）+ editions（电子版 = 同一电子文件，扩展名+指纹唯一）
--   + rooms（房间定义）+ messages（聊天消息）+ users（用户档案）。
-- v3（2026-08-27）：works 移除 author / publisher 列（多作者建模远期复杂不做；ISBN 提供可查询性）。
--   旧开发库若已存在这两列：新代码不读写它们，保留无害，可忽略或删库重建。
-- v4（2026-08-29）：新增 rooms / messages 表（聊天室进 v1，房间定义与聊天消息落库；成员/位置/订阅仍内存）。
-- v5（2026-08-29）：rooms.owner 昵称快照 → rooms.owner_token（房主身份可验证）；users 加 ip + token_issued_at
--   （成员 token 改由服务端按 IP 签发：同一 IP 7 天内申请过则复用，超期换发）。

CREATE TABLE IF NOT EXISTS works (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    protocol    TEXT NOT NULL,
    code        TEXT NOT NULL,
    language    TEXT,
    cover       TEXT,
    description TEXT,
    created_at  INTEGER NOT NULL,
    UNIQUE(protocol, code)
);

-- editions.url：下载来源 URL（外部平台 zlib/anna 等，或本机地址；可选）
-- editions.local_copy：本机（server 内容寻址存储）是否已存副本；上传成功后置 1。
--   本机下载地址不落库：local_copy=1 时即派生 GET /books/{id}/file，绝对地址由客户端用其配置的 server 地址拼接。
--   url 与 local_copy 正交：可同时成立（外部源 + 本机也有），也可只有其一。
CREATE TABLE IF NOT EXISTS editions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    work_id     INTEGER NOT NULL REFERENCES works(id),
    ext         TEXT NOT NULL,
    hash_algo   TEXT NOT NULL DEFAULT 'md5-sample3-v1',
    hash        TEXT NOT NULL,
    size        INTEGER NOT NULL,
    source      TEXT,
    url         TEXT,
    local_copy  INTEGER NOT NULL DEFAULT 0,
    file_path   TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    UNIQUE(hash_algo, ext, hash, size)
);

CREATE INDEX IF NOT EXISTS idx_editions_work ON editions(work_id);

-- users：用户档案。token = 成员 token = 用户 ID（7 位大小写字母数字，**服务端按 IP 签发**，v0.1.6 起）。
-- 首次进房间（WS join）时自动建档（幂等；签发时已建档，join 只补 nick）；远期迁移用户系统时 token 即用户名，可加密码列。
-- ip：签发时记录的访问 IP（复用/换发依据）；token_issued_at：最后签发/续期时间（unix 秒；超过 7 天未续期则换发新 token）。
-- role 枚举：user（正常）/ admin（管理）/ limited（限制）；v0.1.1 只存不 enforce。
CREATE TABLE IF NOT EXISTS users (
    token           TEXT PRIMARY KEY,
    nick            TEXT NOT NULL,
    bio             TEXT NOT NULL DEFAULT '',
    role            TEXT NOT NULL DEFAULT 'user',
    ip              TEXT NOT NULL DEFAULT '',
    token_issued_at INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL
);

-- rooms：房间定义（v0.1.5 起持久化；成员/位置/订阅仍内存）。
-- 生命周期与内存房间一致：创建落库；空房间 TTL 过期或 admin 删除时整行删除（messages 级联清）。
-- owner_token：房主成员 token（v0.1.6 起，取代昵称快照；房主身份可验证）。
CREATE TABLE IF NOT EXISTS rooms (
    id          TEXT PRIMARY KEY,
    edition_id  INTEGER NOT NULL REFERENCES editions(id),
    owner_token TEXT NOT NULL,
    created_at  INTEGER NOT NULL
);

-- messages：聊天消息（追加日志模型，随房间删除级联清理）
CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id    TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    member     TEXT NOT NULL, -- 发送者成员 token
    nick       TEXT NOT NULL, -- 发送时昵称快照（防改名影响历史显示）
    text       TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, id);
