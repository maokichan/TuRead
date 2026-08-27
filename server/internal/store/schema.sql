-- TuRead server schema（v2）
-- 说明：go:embed 嵌入二进制；老库用 internal/store 的列迁移补列（ALTER TABLE）。
-- 持久化内容：works（作品 = 同一本书，协议+编码唯一）+ editions（电子版 = 同一电子文件，扩展名+指纹唯一）。

CREATE TABLE IF NOT EXISTS works (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    protocol    TEXT NOT NULL,
    code        TEXT NOT NULL,
    author      TEXT,
    publisher   TEXT,
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

-- users：用户档案。token = 成员 token = 用户 ID（7 位大小写字母数字，客户端自生成）。
-- 首次进房间（WS join）时自动建档（INSERT OR IGNORE 幂等）；远期迁移用户系统时 token 即用户名，可加密码列。
-- role 枚举：user（正常）/ admin（管理）/ limited（限制）；v0.1.1 只存不 enforce。
CREATE TABLE IF NOT EXISTS users (
    token      TEXT PRIMARY KEY,
    nick       TEXT NOT NULL,
    bio        TEXT NOT NULL DEFAULT '',
    role       TEXT NOT NULL DEFAULT 'user',
    created_at INTEGER NOT NULL
);
