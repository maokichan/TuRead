# 项目状态与决策记录（会话交接）

> 目的：让下一次会话/模型以最低成本恢复上下文。
> 阅读顺序：本文件 → `MAP.md`（自动加载）→ `TODO.md` → 各端架构文档（见 MAP）。
> 更新：2026-09-08（client v0.1.7：本地阅读器修复批 —— 位置正确性 / 并发竞态 / 存储安全）

## 1. 一句话

TuRead = **多人房间共读阅读器**：多个用户进入同一房间，共同阅读同一本书。
渲染/解析复用 [kookit](https://github.com/koodo-reader/kookit)（AGPL-3.0，git submodule）；
同步服务器用 Go，**v0.2.0 已实现**（仓库内 `server/`）；**client v0.1.6**。

## 2. 仓库与提交（`D:\PROJECT\TuRead`）

- git 仓库：本地 `main`，`origin = https://github.com/maokichan/TuRead.git`（独立仓库，非 fork）
- 结构：`client/`（Electron 客户端）｜`server/`（独立 Go module）｜`kookit/`（submodule，HEAD `6e18465`）｜`docs/`｜`TODO.md`｜`借物表.md`
- **tag 约定**：两端版本号独立滚动（server `v0.2.x` / client `v0.1.x`），tag 命名带端名前缀：`client-v0.1.4`、`server-v0.2.0`（首个 tag：client-v0.1.4，2026-09-08）
- **提交与标签的职责划分（2026-09-08 定）**：
  - `git commit` 与 `git tag` **由 agent（模型会话）执行** —— 一次交付 = 一次提交 + 一个带端名前缀的 annotated tag（tag 消息沿用 `client vX — 摘要` 格式）；agent 不 push，除非用户明确要求。
  - **版本号是否滚动由用户决定**：agent **不得自行发版**。用户明确指示（如"发 client v0.1.7"）后，
    才改 `client/package.json` 的 `version` 与本文 §4 版本历史；未获指示的改动并入当前版本。
  - 因此"提交已做但版本未滚"是合法状态：此时不打 tag（或按用户指定命名），待发版指示后补。
- 网络配方：见 `D:\PROJECT\NETWORK.md`（git 需代理 + OpenSSL；Go `GOPROXY=goproxy.cn`；npm 直连）

## 3. 已定决策（要点；细节见权威文档）

| 决策 | 要点 | 权威位置 |
|---|---|---|
| 架构选型 | client = 六边形（端口-适配器）+ DDD 命名；**server = 简单分层**（cmd→transport→room→store→domain，非六边形） | `client/docs/ARCHITECTURE.md` §1；`server/docs/ARCHITECTURE.md` §5 |
| 定位系统 | BookLocation 字段三级角色（key/hint/display）+ 标准原语收拢进 `core/domain/location.ts`；**任何组件不得自行比较/解释位置字段**（笔记/同步回跳/进度/恢复共用） | `client/docs/CONTRACTS.md` §2.1 |
| 书籍标定 | Work/Edition 两层模型；Work 不设 author/publisher；content-hash-v1 = edition 内容指纹；指纹 `md5-sample3-v1` 三点采样 | `docs/ARCHITECTURE.md` §1 |
| 认证 | **token 双闸**：二级令牌 + 成员 token（服务端按 IP 签发，7 天复用窗口）；无账号/密码 | `server/docs/ARCHITECTURE.md` §2；`server/docs/API.md` |
| 房间 | 定义落库 + 运行时纯内存；空房间 TTL 12h（可热改）；发现 = `GET /rooms`；v1 默认公开可见 | `server/docs/API.md` |
| 聊天室 | `room.chat`/`room.message` + messages 表（追加日志）；随房间删除级联清理 | `server/docs/API.md` |
| 同步边界 | 状态转发而非操作转发（只同步 BookLocation 与聊天）；笔记/划线/光标在场 v1 明确排除（信封预留扩展） | `server/docs/API.md` 转发规范 |
| 配置 | TOML + 环境变量覆盖 + 热重载（策略类 2s 生效） | `server/docs/OPS.md` |
| 副本分发 | server 保存并分发电子版副本（内容寻址）；edition 信息由客户端计算随副本上传 | `server/docs/API.md` |
| 客户端样式 | **Tailwind CSS v4 已落地（2026-09-08）**：`@tailwindcss/vite`；`styles.css` 仅留主题语义 token / 全局 base / kookit 契约；MIT 已核 | 借物表；`client/docs/FEATURES.md` |
| 插件 | v1 不做插件运行时；ports 即插件边界（官方插件 = 适配器注册进 ServiceContainer） | `client/docs/ARCHITECTURE.md` §4 |
| UI 功能组件（2026-09-08 落地） | UI 按 Feature 划分标准化（Library/Reader/**Room[含 Server 连接]**/Settings + 展示组件 + AppShell 宿主）；**标准容器**：`FeatureDescriptor` + `registry.ts` + `AppShell`（侧边栏=单色符号图标栏 + 主面板宿主，功能常驻挂载/非激活隐藏 → 状态继承，settings 钉置底）；跨功能跳转走 `FeatureHost`（navigate/openReader/closeReader/selectBook/pushLog）；**纯 React 状态 + props**；Tailwind 与拆组件同步迁移；颜色语义 token 标准化（第三方覆盖 token 建主题）；官方插件 = 追加 descriptor 进 registry | `client/docs/FEATURES.md` |
| 许可 | kookit AGPL-3.0 → TuRead 以 **AGPL-3.0** 开源；新依赖先核许可证再登记借物表 | `借物表.md` |
| 仓库形态 | 单仓库 monorepo（server 可零成本拆出） | `docs/ARCHITECTURE.md` §2 |
| 开发原则 | v1 允许"丑但诚实"；**解释优先**；大改前写理由（Rule of Three） | — |

## 4. 版本历史

### client

| 版本 | 日期 | 内容 |
|---|---|---|
| v0.1.7 | 2026-09-08 | **本地阅读器修复批（只动本地阅读器半边，云端同步未触碰）**：① **滚动位置补录** —— 宿主容器 `scroll` 停稳 400ms 后适配器补 `record()` 并上报（文字类手动滚动此前不留位置痕迹，进度/持久化/同步全错）② **关闭/切书落位置** —— 绕过 2s 节流 flush（最后 2s 的翻页不再丢）③ **`open` 并发守卫** —— 代次令牌，快速切书时后解析完的旧书不再覆盖新书 ④ `removeNote` 按**笔记自身**章节定位（原用"当前章节"）⑤ `isZeroLocation` 判据补 `chapterHref`（首章首块不再被误判为零位置）⑥ **JsonStore 写盘串行化 + 损坏文件备份**（并发 save 共用 `.tmp` 可能写坏书库；解析失败不再静默清空）⑦ `BookService.importBook` 返回 `{book,reused}`（删除 UI 侧 id 快照反推）⑧ 启动不再重复写盘、补 MHTML 扩展名 ⑨ **dev 自检从 AppShell 移入 `dev/selfCheck.ts`**（shell 只做组合）。typecheck 全绿 + 四格式无头自检全绿 |
| v0.1.6 | 2026-09-08 | **功能组件标准容器 + UI 交互流**：`AppShell`（侧边栏=纯符号图标栏 + 主面板=宿主，功能常驻挂载/非激活隐藏 → 状态继承，settings 钉置底）+ `features/{types,registry}` 容器契约（FeatureDescriptor/FeatureHost，官方插件=追加 descriptor）+ Library/Reader/Room/Settings 功能组件 + 展示组件 + **Tailwind v4 引入** + 房间流程（大厅→选房→`host.openReader` 状态继承自动开阅读器）+ dev 自检走真实 openReader 链路；**全局 UI**：去顶栏/日志栏/logo、去 Electron 菜单栏（三重保险）、侧边栏压窄为**单色汉字符号**（禁彩色 emoji）、**Server 并入 Room**（连接=房间组件一部分）、SettingsFeature（**跟随系统**/dark/sepia/light 主题 + 阅读模式 + 诊断日志）、**颜色语义 token 标准化**（组件禁写死 hex，第三方覆盖 token 建主题）；typecheck 全绿、四格式无头自检全绿（偶发时序抖动重跑即绿）；记录已知例外（选文件仍走桥） |
| v0.1.5 | 2026-09-08 | **一致性修复**：`location-updated` 死端口修复（join-ack 基线 + room.presence 快照 diff 派生远端位置；位置先归一、比较走 sameLocation）+ **leaveRoom 误解绑 P1**（订阅分构造期 net / join 期 render，离开后可重 join，契约 v0.2.4）+ **UI 功能组件讨论稿**（`client/docs/FEATURES.md`，未定稿） |
| v0.1.4 | 2026-09-08 | **本地阅读 MVP 第一批**：书架增删（导入指纹去重 + 删除 UI）+ **目录跳转**（`Chapter.chapterDocIndex` + `goToChapter`，CONTRACTS v0.2.3）+ `lastLocation` 落库/恢复接线 + 术语统一定稿（定位系统/宿主容器，文档级）；typecheck 全绿 |
| v0.1.3 | 2026-09-07 | **定位系统立约**（CONTRACTS §2.1 + `domain/location.ts`：key/hint/display 三级角色 + normalize/same/compare/anchorStrength 原语；chapterDocIndex 收窄为 number）+ **渲染链路闭环**（EPUB"正文空"销案=测量假象；修宿主容器 CSS 压扁 iframe、PDF scroll iframe 不拉高两真 bug；App 无头自检 EPUB/MOBI/AZW3/PDF 全绿）+ **Tailwind 采纳定案** + 文档全面收紧 |
| v0.1.2 | 2026-09-01 | kookit 遗留修复（初始导航/CSP blob:/overflow）+ PDF 支持实装（pdfjs 注入 + /lib/pdfjs/ 静态资源）+ 封装接口定型（RENDER_INTERFACE.md） |
| v0.1.1 | 2026-08-31 | render 适配器实装（vendor 单文件 ESM + readFile 注入 + 阅读视图 + 无头验证）；harness 隔离测试定位"缺初始导航"根因 |
| v0.1.0 | 2026-08-31 | 骨架：electron-vite + React + `core/{domain,ports,usecases,adapters}`（CONTRACTS v0.2.1）；net/identity/storage 适配器做实；最小可运行窗口 |

### server

| 版本 | 日期 | 内容 |
|---|---|---|
| v0.2.0 | 2026-08-31 | 房主删房 + 测试组织（E2E 独立 `server/test/e2e/` 黑盒）+ HTTP 服务模型文档 |
| v0.1.0–v0.1.6 | 2026-08-27~29 | 房间同步 + Work/Edition 标定（schema v3）+ token 双闸 + 传输基本功（背压/healthz/优雅关停）+ 空房间 TTL + 房间发现 + TOML 配置/热重载 + 聊天室（schema v4）+ 转发规范定稿 + owner_token / 按 IP 签发成员 token（schema v5）+ OPS 手册 |

## 5. 环境 / 沙箱事实

- 本地代理 `127.0.0.1:7897`（Clash Verge rev）；npm registry 直连；GitHub 直连被墙（走代理 + OpenSSL）；curl.exe 不可用
- go 沙箱下 telemetry 报错是噪音；`GOPROXY=https://goproxy.cn,direct`；`go build` 把 GOCACHE 指到工作区
- 测试：`go test ./...`（白盒在源码旁）+ `server/test/e2e/`（黑盒走 HTTP/WS）
- kookit 子模块的 `CLAUDE.md` 规则：**禁止在其仓库内 git commit / push**
