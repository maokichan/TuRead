# TuRead 共同架构

> 本文只保留**跨端共同**的内容：书籍标定模型 + 仓库布局。各端专属架构见各自 docs：
> client 分层/术语/平台/插件 → `client/docs/ARCHITECTURE.md`；client 契约 → `client/docs/CONTRACTS.md`；
> server 模块/通讯模型 → `server/docs/ARCHITECTURE.md`；REST/WS 接口与转发规范 → `server/docs/API.md`；
> 配置与运维 → `server/docs/OPS.md`；待办清单 → `TODO.md`（根目录）。

## 1. 书籍标定（Work / Edition 两层模型）

**目标**：房间内所有成员读的是同一本书的**同一电子版**（严格模式，房间绑定 Edition）。

- **Work（同一本书）**：识别协议 + 识别编码唯一确定。协议枚举：`isbn`（校验位）/ `asin` / `doi` / `open-library` / `content-hash-v1`（无外部标识符书籍的兜底身份 = **edition 内容指纹**，客户端校准算法计算：同一扫描版/同一文件内容 → 同 code，标题不同不影响；扫描版不同即不同 edition）。**不设 author / publisher 字段**：多作者需联结表+核对机制，远期复杂不做；ISBN 已提供可查询性。
- **Edition（同一电子文件）**：扩展名 + 指纹唯一确定。指纹 = **头/中/尾三点采样**（头 64KB + 中点 64KB + 尾 64KB 拼接哈希，算法 `md5-sample3-v1`）+ 文件大小；参考 koodo-reader 的 `getBookPartialMd5`，kookit 的 `Book` 模型自带 `md5` 字段但**计算是调用方职责**。
- **服务端注册表（SQLite）**：`works`（work 元数据 + 协议 + 编码）→ `editions`（指纹 + source + 分发副本路径）。
- **指纹计算在客户端**：edition 指纹由客户端校准算法计算（含 OCR，如扫描书提 ISBN），创建房间时客户端**同时上传副本与 edition 信息**；server 只登记与比对，从不自己计算指纹。
- **房间绑定 edition**：加入房间时客户端上报指纹 → 服务端比对 → 一致放行 / 不一致拒绝（`book-mismatch`）；无书成员可上报 Work 信息并从 server 下载副本。
- **客户端本地书库**同样记录指纹（导入时计算，crypto-js / Web Crypto / Node crypto）。

## 2. 仓库布局（决策，2026-08-27）

**单仓库（monorepo）**：`client/` / `server/` / `kookit/`（submodule）/ `docs/` 同仓；`server/` 为**独立 Go module**（依赖全部内置，不依赖 client），随时可零成本拆出独立仓库。

**暂不分仓库**，理由：
- **契约先行需要跨端原子提交**：改协议 = 同一 commit 同时改 `client/docs/CONTRACTS.md` 与 `server/docs/API.md`，单仓库最顺；分仓后跨端改动 = 两仓库两次提交 + 版本对齐（tag 配对），对当前阶段是负担
- 规模小（两人/单人开发），无独立 CI / 团队 / 访问权限需求
- 拆分零成本且可随时做：无跨仓库引用，拷贝 `server/` 或 git subtree 即拆

**触发条件**（出现其一再拆）：
1. server 需独立发布节奏 / 被其他项目复用
2. 需要独立的 CI / 发布流水线
3. 仓库访问权限分离需求（不想 client 开发者看到 server 或反之）
