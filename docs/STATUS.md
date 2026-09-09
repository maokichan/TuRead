# 项目状态与决策记录（会话交接）

> 目的：让下一次会话/模型以最低成本恢复上下文。
> 阅读顺序：本文件 → `MAP.md`（自动加载）→ `TODO.md` → 各端架构文档（见 MAP）。
> 更新：2026-09-09（client v0.1.11：渲染层风格基线落地 —— 文字优先 / 全局统一字体 / 负片抽屉 / 中文排版 / 浏览器样张）

## 1. 一句话

TuRead = **多人房间共读阅读器**：多个用户进入同一房间，共同阅读同一本书。
渲染/解析复用 [kookit](https://github.com/koodo-reader/kookit)（AGPL-3.0，git submodule）；
同步服务器用 Go，**v0.2.0 已实现**（仓库内 `server/`）；**client v0.1.11**。

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
| 渲染层风格（2026-09-09 定，**准则**） | **文字即界面**：动作/导航/选项一律文字（边框仅输入类与浮层）；**全局统一字体**（西文 Times New Roman + 中文源流明體，`--font-ui`，`--mono` 并为同值别名）；**负片（反色块）仅两处**（详情抽屉字段 + 侧边栏选中）；中文排版硬规则（混排/标点/段距）；层级靠排版不靠颜色 | `client/docs/STYLE.md`（MAP §13，渲染层开发先读） |
| 抽屉平面结构（2026-09-09 定） | 封面 **2:3（64×96）不得拉伸**；三行 = 封面高度三等分（各 32px）；标题/数据行**单行**（`Marquee` 超出才滚）；数据行含格式·大小·导入时间·**文件路径**；指标行无标签（已读 42% / 3 天前 / 共 —）；外壳**完全透明** | `client/docs/STYLE.md` §5.5 |
| 样式效果确认方式（2026-09-09 定） | 浏览器**样式样张**（`npm run style`，`client/tools/style-gallery/`）—— 只导入真实组件与真实 token，不启动 Electron；排版类最终判定仍需在 Electron 内复核（CJK 特性依赖 Chromium 版本） | `client/tools/style-gallery/README.md` |
| 插件 | v1 不做插件运行时；ports 即插件边界（官方插件 = 适配器注册进 ServiceContainer） | `client/docs/ARCHITECTURE.md` §4 |
| UI 功能组件（2026-09-08 落地） | UI 按 Feature 划分标准化（Library/Reader/**Room[含 Server 连接]**/Settings + 展示组件 + AppShell 宿主）；**标准容器**：`FeatureDescriptor` + `registry.ts` + `AppShell`（侧边栏=单色符号图标栏 + 主面板宿主，功能常驻挂载/非激活隐藏 → 状态继承，settings 钉置底）；跨功能跳转走 `FeatureHost`（navigate/openReader/closeReader/selectBook/pushLog）；**纯 React 状态 + props**；Tailwind 与拆组件同步迁移；颜色语义 token 标准化（第三方覆盖 token 建主题）；官方插件 = 追加 descriptor 进 registry | `client/docs/FEATURES.md` |
| 书库重做（v0.1.8 起，v0.1.9/v0.1.10 细化） | **去容器外壳** + **两视图**（列表/網格；瀑布流并入）+ **底部状态栏**（文字按钮：左=视图切换单按钮，右=导入；"含子文件夹"在设置里配置）+ 详情抽屉（**只在内容区弹出**）+ 移除=**只删索引不删源文件**（首次确认可勾不再提示）+ 封面**缩略图落盘** + 文字封面（`FittedTitle` 撑满） | `client/docs/FEATURES.md` §10 |
| 主题色取向（2026-09-08 定，**四套**） | **暗色/亮色**一律黑灰白（不引入色相；高亮=灰阶两端）+ **羊皮纸·亮 / 羊皮纸·暗**（同一暖棕取向的明暗两版）；状态色（ok/warn/err）保留语义色相 | `client/src/renderer/src/styles.css` |
| 书籍身份模型（2026-09-08 定术语） | **作品身份**（Work：`protocol` + `code`，如 ISBN）＋ **电子版身份**（Edition：`fingerprint`）；**标准化** = 补齐作品身份（入口在房间功能，短期手填、远期 OCR）；**标定** = 加入房间时的**比对**动作。本地**不采集/不显示** author·publisher（与 server Work 模型一致） | `docs/ARCHITECTURE.md` §1 |
| 跨层改动授权（2026-09-08） | 书库重做等改动**允许修改应用层与领域层**（前提：不违背六边形依赖规则、契约文档先行） | — |
| 许可 | kookit AGPL-3.0 → TuRead 以 **AGPL-3.0** 开源；新依赖先核许可证再登记借物表 | `借物表.md` |
| 仓库形态 | 单仓库 monorepo（server 可零成本拆出） | `docs/ARCHITECTURE.md` §2 |
| 开发原则 | **解释优先**；大改前写理由（Rule of Three） | — |

## 4. 版本历史

### client

| 版本 | 日期 | 内容 |
|---|---|---|
| v0.1.11 | 2026-09-09 | **渲染层风格基线落地（8 次提交）**：① 新增 `client/docs/STYLE.md`（五原则 / 字体 / 字号白名单 / **中文排版** / 例外清单 / 禁区与机器断言 / 激进档回退机制），MAP 登记为红线「渲染层开发先读」② **文字优先**：动作按钮（房间/阅读器/设置/确认弹窗/导入菜单）统一 `.text-action`（18px 衬线无框，主次靠色温），目录与大厅行去按钮外观（纯文字靠留白分行），设置页去圆角容器改「副标题 + 分割线」③ **全局字体统一**：`--font-ui` = Times New Roman + 源流明體（顺序不可反），`--mono` 并为同值别名；**阅读器正文不受影响**（kookit iframe 自建样式）④ **负片**（`--negative-bg/--negative-text`，派生自各主题）用于抽屉字段与侧边栏选中 ⑤ **抽屉平面重做**：外壳全透明、封面 2:3 不拉伸、三行三等分封面高度、标题/数据行单行 `Marquee` 滚动、路径并入数据行、指标行无标签、关闭在底部 ⑥ 视图切换 900ms + 动画期间禁用 + 右下角 `difference` 负片三角（压在字上）⑦ 状态栏左对齐、无书目数、按钮 22px/0.08em ⑧ 新增浏览器**样式样张**（`npm run style`）+ `tsconfig.preview.json`。验证：typecheck 双绿（web + preview）、样张 dev server 实测 CSS 产物。**同步半边未动**（三处协议漂移仍待修，见下） |
| v0.1.10 | 2026-09-08 | **书库交互收口 + 文档校订**：① 视图切换合并为**单个文字按钮**（显示当前视图名 `列表`/`網格`，点击后视图与文字同时切换，动画 42% 处替换文字），导入改**文字按钮**「導入」，两者 18px 加粗源流明体无边框 ② **修复"进入阅读器恢复上次内容"未生效** —— 侧边栏按钮原先绕过 `host.navigate`；自检断言改为点击**真实侧边栏按钮**（此前直接调 API，测了接口没测用户路径）③ 文档校订：修正"字体未打包/两套主题/行高 1.02/状态栏含子目录开关"等已过时表述，去掉重复段落。验证：typecheck 全绿；EPUB/PDF 自检 `恢复=ok`，四格式渲染全绿 |
| v0.1.9 | 2026-09-08 | **架构审查修复 + 交互细化**：① **批量导入下沉为用例 `IImportQueue`**（串行/进度/取消/失败上报，与 `CoverQueue` 同构；`LibraryFeature` 不再持有编排）② **`ILibraryStore.patchSetting`**（主进程原子合并，消除两个 Feature 对 `librarySettings` 的"读-改-写"覆盖竞态）③ **`IBookService.getLastRead()`** + 进入阅读器**自动恢复上次内容**（不再空白）④ **`FittedTitle` 修复**（拟合条件误用 `scrollWidth`（盒子宽）→ 字号恒为 minSize；改按高度拟合 + 剩余空间分行距）⑤ 列表标题改**源流明体 17px 不加粗** ⑥ 视图切换改**无边框加粗源流明体文字 + "吞没→浅字→复原"动画**（四主题各配 `--flash-bg/--flash-text`）⑦ `extToFormat` 移入 `core/domain/format.ts`；自检新增**文字封面填充**与**恢复上次内容**两条断言。契约 `CONTRACTS.md` v0.2.8。验证：typecheck 全绿；四格式无头自检全绿（`字体=ok`/`文字封面=ok`/`恢复=ok`） |
| v0.1.8 | 2026-09-08 | **书库重做**：**去容器外壳**（无边框面板/无标题栏，主体铺满）+ **两视图**（列表/网格；瀑布流因缩略图统一 2:3 并入网格）+ 列表行封面**左侧填充向右渐隐**（文字封面不套遮罩）+ **底部状态栏**（左=视图切换/书目数/封面进度，右=导入菜单「文件…/文件夹…」+「文件夹含子目录」可配置项 + 导入进度可取消）+ **详情抽屉只在内容区弹出**（不覆盖状态栏；单击详情/双击打开/Esc/点外关闭）+ **移除语义**（只删书库索引不删源文件，首次确认弹窗可勾"下次不再提示"）+ **封面缩略图落盘**（canvas 400px/q0.82，实测 157KB→38KB；字节不进 JSON）+ `CoverQueue` 异步提取 + 无封面**文字封面**（`FittedTitle` 二分搜索撑满 + 加粗 + 源流明体字栈）+ **`IBookPicker` 端口**（选文件/选目录/递归扫描/读文件，UI 不再直用桥）+ 设置拆 `config.json`（`library.json` 加 `version` 与迁移）+ **主题色取向**（明暗一律黑灰白、羊皮纸深棕；状态色保留语义色）+ 自检新增封面管线断言并修三类假阴性（可见性/iframe 高度/翻页起点）。契约 `CONTRACTS.md` v0.2.6/v0.2.7；细节 `client/docs/FEATURES.md` §10。验证：typecheck 全绿；四格式无头自检全绿；封面管线端到端（落盘 + `coverPath` 回写 + 读回） |
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
