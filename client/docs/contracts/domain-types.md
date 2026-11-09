# 契约 · 领域类型（domain types）

> 形状权威 = [`src/core/domain/types.ts`](../../src/core/domain/types.ts)（1:1，字段与注释以此为准；本页不复读形状）。本页只留代码**不能**自证的：语义、应然、用户裁决、why。
> 定位/锚点的语义权威在总纲 [`CONTRACTS.md`](../CONTRACTS.md)；数据表结构、schema 迁移、列口径 = [`DATA_MODEL.md`](../DATA_MODEL.md)；wire 形状权威 = [`server/docs/API.md`](../../../server/docs/API.md)。

## 阅读位置与指纹

- **BookLocation** —— 房间同步最小载荷，与 kookit `getPosition()` 对齐。字段语义与比较**一律走定位系统原语**（[`src/core/domain/location.ts`](../../src/core/domain/location.ts)），任何组件不得自行比较/解释字段；角色分级（key/hint/display）与零位置判定见总纲。
- **BookFingerprint** —— 标定「同一本书的同一电子版」。算法 `md5-sample3-v1`（头/中/尾三点采样 + size 共同降碰撞）：server 侧已注册，client 计算必须与 server 一致——跨端标定、房间加入、导入去重都以它为键。
- **BookFormat** —— 16 枚举（types.ts）。可导入扩展名的**唯一定义处** = [`src/shared/ipc.ts`](../../src/shared/ipc.ts) 的 `EBOOK_EXTENSIONS`（对话框过滤与目录扫描共用）；扩展名→格式的映射原语在 [`src/core/domain/format.ts`](../../src/core/domain/format.ts)（未知扩展名回退 TXT，调用方负责过滤）。

## 书的身份（v0.4.0 定案）

> 病根：原 `BookRecord` 把四种身份（库内条目/内容指纹/文件路径/可选 Work）揉在一个类型里，导致「同一本书多库各持一份笔记」。定案拆开：**内容身份 = edition**（全局唯一，键 = 指纹）、**组织归属 = holding**（收录）、**作品身份 = work**（可空，只留接口）。建模与批复 = [`DATA_MODEL.md`](../DATA_MODEL.md) §4.2/§6。

**不变量（实现与测试的判据）**：
1. 同一指纹在 editions 全局**至多一行**（跨库共享的根）；
2. 同一 `(libraryId, editionId)` 在 holdings **至多一行**；
3. 删除收录（holding）**不得级联**删除 `notes` / reading_state（笔记与阅读状态是用户资产）；
4. 笔记的锚点是在某个 edition 里量出来的 → **禁止**把笔记归属挂到 work 上（否则跨版解析必然失准）。

- **EditionRecord** —— 本地持久化的 edition 行，**不是** server 的 wire `Edition` 载荷（后者见 [`server/docs/API.md`](../../../server/docs/API.md)）。`coverPath` 是 **edition 级**（封面由内容决定，跨库一致；字节落盘不进 JSON）；`coverFailed` 是提取失败负缓存（只试一次；重试 = 删除本字段）。`work` 可空 = 尚未标准化（完整标准化后置，见根 [`TODO.md`](../../../TODO.md)「标准化」）。
- **Holding** —— 「哪个书库里有这本书」。同一 edition 可被**多库**收录（多行）→ 跨库共享天然成立；库内**单亲归属**（一个书箱）。`missing`（来源缺失，映射库对账产物）**只影响可见性**，不影响笔记与阅读状态。`parentPath` 是层级浏览的 SQL 过滤列（写入时维护）。
- **WorkIdentity** —— 只留接口、不做完整标准化（D11/F9）：阅读时间按 work 汇总依赖它（同一本书的不同电子版合并计时）。
- **BookRecord**（⚠ 退役别名 = EditionRecord）—— 保留只为压住渲染层爆炸半径（`IRenderService.open` 仍收它）；**新代码不得用它表达「属于哪个库」**（那是 Holding）。收尾时删除。
- **ReadingState / ReadingSession / ReadDayMinutes / TopReadEdition** —— 阅读时间模型：**逐 edition 记录、按 work 汇总是查询口径，不是存储口径**。`totalReadMs` 是便于展示的累计投影，权威明细在 ReadingSession（写入纪律见                      ILibraryStore 节）。
- **LibraryItem** —— UI 侧读模型（非存储实体）：一次 JOIN 出 edition + 收录关系 + 阅读状态，为的是不 N+1。

## 书库与书箱

- **LibraryEntry** —— 书库是**组织模式，不是物理分区**：全部数据在一个全局 .db（旧「一库一 .db」与 `dbPath` 已作废；库注册表本身也进库，引导文件只剩极小 JSON——[`DATA_MODEL.md`](../DATA_MODEL.md) §1）。`mode`：`mapped`（映射库，跟踪唯一真实文件夹，书只能扫进来）｜`curated`（自建库，空库起步自建书箱树）。
- **BookContainer** —— 書箱（树在库内，带 `libraryId`；映射库的「文件夹」是按 rootPath 派生的，不落行）。
- **LibrarySettings / NoteSettings / ReaderSettings** —— **设置一律全局**（D9：没有库级设置），分别落全局 `settings` 表的 `librarySettings` / `noteSettings` / `readerSettings` 键。
- **ReaderSettings / ReaderTypography 分工**（[STYLE](../STYLE.md) §5.9）—— 宿主几何（纸宽/纸内边距）走 CSS 变量；正文排版（字号/行距/段距）走 `applyTypography` 注入正文 iframe。字段**缺省 = 不改**（「默認」档运行时存 null，读取侧 `?? 默认值` 兜底）；存**数值**不存档位名；阅读页零控件（[STYLE](../STYLE.md) §5.8），参数唯一写者 = 参数面板。

## 主题

- **ResolvedTheme / ThemeTone / ThemeMode**（权威 = [`src/core/domain/theme.ts`](../../src/core/domain/theme.ts)）—— 2 主题（tone：纯色 solid / 羊皮纸 parchment）× 2 模式（mode：深/浅）= 4 套 resolved（= styles.css 的 data-theme 枚举）；**跟随系统只作用于模式**，在所选主题内解析。任何组件不得自行解释主题字符串。偏好持久化于全局 `settings` 表 `appearance` 键（`SettingsFeature` 落库）。

## 渲染配置

- **RenderOptions** —— 适配器内部翻译为 kookit config。`theme` 已被适配器消费（open 时映射 isDarkMode/backgroundColor，深色下经 applyTheme 注入正文深色 CSS）；`lastLocation` = 首次定位目标（「回到上次读到哪」；v0.4.0 起从 record 拆出——渲染层不得为拿一个位置去依赖阅读状态表）。`password` = 加密 PDF/EPUB。
- **Chapter** —— `chapterDocIndex` 缺省 = 目录项无可直达渲染节（仅分组标题）；PDF 下等于页码；goToChapter 的跳转参数。

## 笔记与锚点

> 锚点（Norm/Fragment）的分层语义、比较次序、「读到哪 ≠ 标在哪」见总纲 [`CONTRACTS.md`](../CONTRACTS.md)；纯函数权威 = [`src/core/domain/anchor.ts`](../../src/core/domain/anchor.ts)。

- **Note** —— v2 形状（v1 退役，过程归 git）。**不含 excerpt 字段**：`notes` 表 `excerpt` 列是 `anchor.norm.quote.exact` 的投影（权威只在锚点侧，避免两处同值漂移）。`bookId → editionId`（D8）：笔记挂**内容（edition）**——跨库共享、不随条目消失；**各版各一份，不做自动跨版迁移**（跨版搬运是用户的主动动作）。`owner` 本地笔记为 null（同步上线后回填）。`body` 只有这里住批注内容，**原生 Markdown**（笔记 v3 定案：Markdown 对纯文本透明，旧内容原样可读；渲染子集 = 决策笔记                                                                                                                矩阵）；kookit 侧用 body 判定「是否带批注」且当字符串用——传引擎必须是 string（[`KOOKIT.md`](../KOOKIT.md)）。`ink` 仅 `kind='ink'`（InkStroke[] JSON）。`markStyle` = 线样语义名，缺省 `background`。
- **NoteKind** —— `kind` 是「载体类型」不是「创建来路」（收敛**已执行**：存储层把存量 `'note'` 行迁为 `highlight`，写侧统一「标记 + 可选正文」）：`highlight` = 锚在正文范围（带不带 body 都是它）；`bookmark` = 标位置、无文本范围（尚无 UI）；`ink` = 几何画布矢量墨迹（[DATA_MODEL](../DATA_MODEL.md) §3.3）。呈现只按有无 body 区分。
- **NoteMarkStyle**（笔记 v3 新增）—— **线样与色正交两维**：`background`（底纹，历史缺省）/ `underline` / `wavy` / `strikethrough`——kookit `buildHighlightStyleForType` 原生支持四样（PDF 覆盖层走内联 SVG，见 [`KOOKIT.md`](../KOOKIT.md)）。⚠ `--note-*` 色值按「叠正文 0.8 透明」取值、描边色不透明——描边类线样不能共用，需独立 token 族（`--mark-line-*`，落点 [STYLE](../STYLE.md) §3.4）。
- **NoteColor** —— 语义名（red/yellow/green/blue），UI 按主题 token 渲染；库内不存 hex。
- **NoteTextFocus / NoteFilter**（用户 定案； 重构升级）—— 视图**只留瀑布流**（`NoteView` 退役：两种排列都没组织起"笔记属于书"的关系，按书的组织归详情轴）；卡片文字主次两档**可切换**，语义 = **主方 ≤8 行、副方 ≤2 行**（两边都有界的信息取舍，非字号强调）；排序恒按最近更新倒序（不按书组织）；单击卡片 = 进**详情轴**（跳回原文的入口移到轴上）。筛选 = 单按钮三态循环（批註→劃線→全部）。⚠ **筛选判据是 `body` 是否为空，不是 `kind`**——kind 只分载体不分内容（划线补正文 ≈ 批注），按 kind 分组会分错；与呈现口径一致：**只按有无 body 区分**。

## 房间与聊天（wire 镜像）

> 协议权威 = [`server/docs/API.md`](../../../server/docs/API.md)；RoomInfo / Edition / JoinAck / TokenResponse / ApiError 等 wire 镜像类型以 server 文档为准。协议词汇（信封 type 常量 / reason 归一 / 昵称 ≤12 字 / 握手地址 / 历史路径与合并）的**唯一解释处** = [`src/core/domain/protocol.ts`](../../src/core/domain/protocol.ts)（含单测），适配器与用例不得自行解释字符串。

- **ChatMessage** —— 追加日志模型；`id` = server 分配的追加序号（去重与排序的天然键，合并一律走 `mergeChatMessages`）。时间戳是 unix 秒。
- **RoomInfo** —— roomId = 8 位 hex（server `newID` 4 字节随机）。
- **Edition（wire）** —— `createdAt` 是 RFC3339 字符串，与 RoomInfo/ChatMessage 的 unix 秒**不同**（混用会错）。
- **RoomState.edition** —— join-ack 透传的房间绑定电子版：无书成员的补书流程靠它（指纹找本地书 / `localCopy` 决定能否下载 / `ext` 定文件名）。
- **ConnectionState** —— `failed` = 断线自动重连**耗尽**（可预期终点），区别于 `disconnected`（安静未连接）；用例层据此自动离开房间并告知。
- **MessageEnvelope** —— 传输层只搬运信封不理解语义；语义由用例层解释。
- **JoinFailureReason** —— UI 只认归一后的五个值；`superseded` 不是服务器的失败，是**并发 join 的落败方**自废，UI 应**静默**处理（用户要的是新房间）。归一判据 = `normalizeJoinReason`（容错服务器的空格分词等历史形状）。
