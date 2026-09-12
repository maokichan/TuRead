# 竞品与生态全景（Landscape）

> **目的**：在 client 本地侧继续开发前，评估三件事——① kookit 的娘家（Koodo Reader）的健康度与上游风险；
> ② 同类阅读器的交互体验与功能实现（本地侧对标）；③ 社交/共读产品的形态（房间侧对标）。
> **性质**：调研底稿 + 决策输入。本文的结论**被采纳后应回写**到权威文档（`client/docs/STYLE.md` / `CONTRACTS.md` / `TODO.md`），本文不替代它们。
> **方法与日期**：2026-09-12 三路网络调研（桌面阅读器 7 例 / 社交阅读 10+ 例 / Koodo 生态），证据为公开资料，来源链接随文。
> 阅读顺序：MAP → STATUS → 本文；结论落地见 §4。

---

## 1. kookit 的娘家：Koodo Reader

### 1.1 项目事实（2026-09 核实）

- **本体**：[koodo-reader/koodo-reader](https://github.com/koodo-reader/koodo-reader)，AGPL-3.0，创建于 2020-03，28.2k stars / 2.1k forks，最新 release **v2.4.4（2026-09-03）**，约每月 2-3 个版本，几乎每日有提交。
- **作者**：GitHub 账号 [troyeguo](https://github.com/troyeguo)（品牌 "App by Troye"，真名郭亮，中国江西独立开发者；见 [Flathub](https://flathub.org/zh-Hans/apps/io.github.troyeguo.koodo-reader)、[Microsoft Store](https://apps.microsoft.com/detail/9p5ns7r781p4)）。
- **bus factor = 1**：38 位 contributor 中 troyeguo 独占约 97% 提交（3,068/3,151），其余多为翻译/个位数小修。
- **商业化**：免费开源 + **官方"专业版"订阅**（限时 ¥25/年）：移动端免费限 20 本书，跨平台同步 / 官方 AI / 真人 TTS（Azure+Kokoro）/ OCR / 发 Kindle 为付费（[pricing](https://www.koodoreader.com/zh/pricing)）。社区已出现绕限额 fork（free-koodo-reader）。
- **技术栈**：桌面 Electron + React；移动端 v2 = **React Native/Expo**（非 Flutter）；另有 Web 版与 Docker 自部署。

### 1.2 kookit 现状

- kookit 是 koodo-reader 组织下的独立仓库 [koodo-reader/kookit](https://github.com/koodo-reader/kookit)（2021-10 从主项目抽出，"The core rendering engine for Koodo Reader"），AGPL-3.0，649 commits 基本全来自作者一人，最近仍在推送（2026-09-12）。
- **没有发布到 npm registry**（`registry.npmjs.org/kookit` 404），package.json 停在 1.0.4——主项目以构建产物/git 依赖方式引入。TuRead 是**其几乎唯一的外部消费者**。
- 内部构成：foliate-js（EPUB/MOBI/AZW3/FB2）+ pdf.js（PDF）+ mammoth（DOCX）+ 7z-wasm（CB7）+ rangy（选区）等；定位体系自带 `src/libs/cfi.ts`（CFI 锚定）。

### 1.3 上游风险与应对

| 风险 | 评估 | 应对 |
|---|---|---|
| 单人维护、API 随主程序随时变 | 真实存在 | 子模块 commit 钉死（现状 `6e18465`）；保持"定期跟进上游 + 本地 diff 评审"；做好随时自己 fork kookit 的预案 |
| 短期健康度 | **良好**：主程序月发 2-3 版重度依赖 kookit，bug 会持续被修 | 不做一次性 vendoring；升级指南已有（`client/docs/KOOKIT.md`） |
| AGPL 合规 | kookit AGPL-3.0，内部捆绑 MIT 的 foliate-js 等 | 义务已登记 `TODO.md`（LICENSE / OFL / 第三方声明随包），对外发行前必修 |

社区口碑要点（对 TuRead 的镜子）：好评集中在**格式通吃、深色模式、目录/字体灵活、简洁 UI**；差评集中在 **Electron/RN 打包方案的卡顿掉帧、长书翻页卡、大书库慢**、AI 绑定官方服务+年费（[App Store 评论](https://apps.apple.com/cn/app/koodo-reader/id6744887779)、[r/selfhosted](https://www.reddit.com/r/selfhosted/comments/1l7ti0f/koodo_reader_experiences/)、[少数派](https://sspai.com/post/70855)）。

---

## 2. 桌面/跨平台阅读器：交互与功能对标

### 2.1 逐产品速览

| 产品 | 定位 | 引擎 | 许可/栈 | 排版参数入口 | 标注 | 进度同步 |
|---|---|---|---|---|---|---|
| [Koodo Reader](https://github.com/koodo-reader/koodo-reader) | 全能书库+阅读器，云备份 | foliate-js + pdfjs（kookit 封装） | AGPL / Electron+RN | 阅读页设置面板 + 移动端预设版式 | 高亮+富文本笔记，自有 DB（非 CFI） | 全量云（WebDAV/网盘/S3/Docker…）+ kosync 兼容 |
| [Readest](https://readest.com/) | "Foliate 现代重写"，主打沉浸阅读 | foliate-js | AGPL / Tauri v2 | 中央点击呼出工具栏+侧栏；**按书覆盖全局** | 选中即弹条，3 样式×5 色，Markdown 笔记，CFI 锚定 | 账号云 + KOReader/Readwise/Obsidian 集成 |
| [Thorium Reader](https://www.edrlab.org/software/thorium-reader/) | 非营利 EDRLab，无障碍优先，Readium 旗舰 | Readium Desktop | BSD / Electron | 阅读页就地面板（Theme/Text/Display/Spacing 四组） | **Readium Annotations 规范**（W3C 2025 引用），可共享 | 无（回避账号云） |
| [Foliate](https://github.com/johnfactotum/foliate) | Linux 最优雅本地阅读器，foliate-js 母体 | foliate-js 自研 | GPL-3 / GTK4 | 阅读页 popover | 高亮/笔记/书签，JSON 导入导出，时间戳 | 无（社区用 Syncthing 变通，[讨论 #824](https://github.com/johnfactotum/foliate/discussions/824)） |
| [Calibre viewer](https://manual.calibre-ebook.com/viewer.html) | 最大开源书库管理器内置阅读器 | Qt WebEngine | GPL-3 | **独立 Preferences 对话框**（反例） | 选中弹条；**书签可内嵌 EPUB 文件本身**；calibre:// 位置分享 | 仅 Content server 注释同步 |
| [KOReader](https://koreader.rocks/user_guide/) | 墨水屏极致可调 | crengine + MuPDF | AGPL / Lua | 菜单+**长按设默认(★)**+按书保存+Profiles | 4 样式、跨页双段选择、导出 5 格式直连 Readwise/Joplin/Flomo | **kosync**（自托管，成事实协议） |
| [SumatraPDF](https://www.sumatrapdfreader.org/free-pdf-reader) | Windows 极速轻量查看器 | MuPDF | GPL v3 / C++ | 几乎无 | 基本无 | 无（以此为荣） |

### 2.2 共同模式（行业收敛点）

1. **排版参数入口**："阅读页就地呼出、改动即时可见"是主流最优解（Readest/Thorium/Koodo）；Calibre 的独立对话框是公认反例。所有产品都朝"**全局默认 + 单书覆盖**"演进（Readest local settings、KOReader 按书保存/★）。
2. **目录形态**："侧栏多标签容器（目录/书签/标注/搜索）"是唯一答案，差异只在召唤方式（常驻按钮 vs 快捷键）。**进度条带章节刻度线**是第二共识（Readest/Foliate/KOReader）。
3. **标注交互**："选中即弹迷你工具条"是行业标准；数据模型以 **EPUB CFI 锚定**为共识（Koodo 的自有 DB 是例外也是槽点来源）；标注可导出是进阶共识（Foliate JSON / KOReader 5 格式）。跨页长选是公认难点：Foliate [#9](https://github.com/johnfactotum/foliate/issues/9) 丢字是反面教材，KOReader 的"两次长按选择模式"是专用解法。
4. **进度定位**：双重进度（章节+全书）+ 剩余时间估算 + 可分享位置（Calibre URL）是成熟做法；KOReader 的 **Book Map**（全书鸟瞰+标注可视化）是唯一差异化创新。
5. **同步光谱**：商业/活跃项目走"账号云+自托管协议兼容"，纯本地/非营利干脆不做；自托管最小公约数 = **WebDAV**，进度同步开放事实协议 = **kosync**（Readest/Calibre-Web-Automated 都在做兼容）。
6. **沉浸态**：共识是"控件按需出现"（Readest："controls appear when you ask for them and disappear when you don't"），但**没有任何产品做到 TuRead 的"零控件+桌/纸空间隐喻"级别**——这是被验证可行的方向且仍是差异化空间。

### 2.3 对 TuRead 本地侧的启示（映射到 TODO）

1. **右侧召唤面板方向正确**，继续沿"就地面板 + 即时预览"路线（对齐 §5.9 频率表）；进阶可借鉴 KOReader 的"长按设默认 + Profile（夜间/双栏预设组）"。剩余参数（字距/字体/对齐/首行缩进/标点）全部有同业先例，参数化深度上限看 KOReader。
2. **排版参数加"单书覆盖全局"**：TuRead 目前是全局设置；Readest/KOReader 都按书本地化。数据层已是数值（px），加 bookId 维度即可。
3. **标注实现（TODO 高优）按行业标准做**：选中即弹工具条、3 样式×多色、**CFI 锚定**（kookit 自带 `cfi.ts`，正合定位系统的 key/hint 思路）、跨页选区专用处理、导出 Markdown/JSON 起步。
4. **目录挂载线保留，但考虑一个传统侧栏作"安全出口"**（新用户/无障碍过渡）；复用"当前章节高亮跟随 + 条目带进度"两个共识细节。
5. **进度 UI 可加"章节刻度 + 剩余时间"**；KOReader Book Map 与 TuRead 的桌/纸隐喻天然契合（远期）。
6. **性能是 Electron 阅读器生死线**：Koodo 最集中差评即此。把"千页长书键盘连翻不卡、大书库不卡"列为验收标准；参考 Thorium"每书独立 reader 窗口"隔离。
7. **快捷键肌肉记忆**：Space/←→ 翻页、Ctrl+F 搜索、Ctrl+B 书签、F11 全屏、S/Esc 目录，与「键鼠意图层」高优项合流。

---

## 3. 共读/社交阅读：形态对标

### 3.1 关键发现：**全行业没有产品做"实时同位共读"**

微信读书、Fable、Perusall、蜗牛读书——全部收敛到"**异步锚定注释 + 进度可视化**"。没有任何主流产品同步"对方正看到的原文内容"本身；Kindle 甚至把同账号双设备同书当冲突处理（Whispersync 覆盖警告，[Amazon 帮助](https://www.amazon.com/gp/help/customer/display.html?nodeId=GEX2D6QN8PKQJAJ2)）。这说明自由阅读节奏与强制同位天然冲突；TuRead 的房间+BookLocation 转发是**真正的空白点**，也应因此把"跟随"设计成可选项而非唯一形态。

### 3.2 逐产品要点

- **微信读书**：社交成功的本质不是组织共读，而是"**读到同一句话的偶然邂逅**"——划线/想法默认对同书读者可见（正文内气泡+点赞），配套完整隐私开关（私密阅读/替身书架/想法可见范围，[隐私政策](https://weread.qq.com/policy)）。好友间只展示**延迟的进度百分比+时长+笔记数**，不做实时同位。"读书小队"是激励玩法（组队赚无限卡），不是共读房间。
- **网易蜗牛读书**：国内最接近共读房间——"29 人 21 天同读一本书"，可实时查看他人批注，"共时间"仪式感（[产品分析](https://www.woshipm.com/evaluating/4177441.html)、[新华网](http://www.xinhuanet.com/politics/2019-04/23/c_1124401502.htm)）。现状：产品整体边缘化但共读未下线；其活跃**长期依赖领读人/出版方运营**，非产品自驱。
- **Fable**（fable.co）：2024 年爆发的海外读书会 App——Social Mode 可见书友高亮与内嵌讨论题（异步），club 由达人主持、大 club 付费；教训：书内社交"像埋藏的宝藏"无引导就没人发现；3000 人大 club 热帖只有几十条评论——**大房间=死讨论**（[Book Riot 评测](https://bookriot.com/fable-book-club-app-review/)）。
- **Perusall / Hypothesis**（教育协同注释）：在共享文档上对**文本选区**发锚定注释（评论/提问/回复），全班可见，异步为主。核心验证："锚定到选区"的讨论比论坛更贴文本（[Hypothesis 对比文](https://web.hypothes.is/choosing-hypothesis-over-perusall/)）——这是位置同步与讨论锚定的技术金标准。
- **BookBuds**（2025）：虚拟篝火"read together"——**不同步内容，同步"人在读书"这个状态**（在场+计时+聊天）。证明"在场感"可独立于内容同步、成本低价.value 高（[App Store](https://apps.apple.com/us/app/bookbuds-read-with-friends/id6755941845)）。
- **反面教材 Readmill（2011-2014）**：社交 EPUB 阅读器先驱，死于 DRM 墙（读不到用户合法拥有的书）+ 无法变现，被 Dropbox 招安后关停（[TechCrunch](https://techcrunch.com/2014/03/28/confirmed-dropbox-aqcui-hires-social-reading-app-readmill/)）。
- **组织类（Bookclubs/StoryGraph/有书/樊登）**：读书会管理与阅读是两个产品；樊登/有书干脆"代读"（拆书稿+社群），证明陪伴感需求巨大但满足方式可以完全不碰原文。

### 3.3 设计问题 × 各家答案矩阵

| 问题 | 各家答案 | 共识/空缺 |
|---|---|---|
| 成员间同步什么 | 汇总进度（微信读书/蜗牛）｜批注划线（微信读书/Fable/Perusall）｜在场/计时（BookBuds） | **原文同位：无人做** ← TuRead 空白点 |
| 实时性 | 实时跟随翻页：无人做；近实时批注流：蜗牛/Fable；异步为主：Perusall/微信读书 | 异步是主流，实时是赌注 |
| 房间生命周期 | 短周期仪式（蜗牛 21 天/BookBuds session）vs 长期组织（Bookclubs 月度/书即房间） | TuRead TTL 方向正确，缺"续期/下一本"路径 |
| 谁控制翻页 | **无人做房主控翻页**；用进度可视化+按章节解锁讨论（Fable）化解 | 跟随必须是可选模式 |
| 讨论锚定 | 文本选区（Perusall，最稳）>段落（起点段评/微信读书想法）>章节（Fable）>不锚定 | 选区锚定是金标准，页码不可用 |
| 书的来源 | 书城正版（微信读书/Fable）vs 自带文件（Readmill 死于此；TuRead 模式无商业先例） | 自带电子版+位置/短引用转发，边界要守住 |

### 3.4 对 TuRead 房间侧的启示

1. **实时同位是差异化卖点，但做成"跟随模式可选"**：成员可一键脱离跟随回到自己的位置（微信读书连实时进度都不做、Kindle 把位置改写当 bug——"位置被别人改写"是明确的用户痛点）。
2. **抄微信读书的"社交层可见+隐私开关"**：房间内划线/想法对成员可见（气泡+点赞+回复），每人有完整可见性开关。
3. **讨论锚定文本选区**，永远不锚页码——与定位系统（`CONTRACTS.md` §2.1）同构，笔记功能落地时直接采用。
4. **小房间=好体验**：人数克制（个位数~30，蜗牛 29 人上限），强调熟人邀请制（成员 token 恰好是正确机制）。
5. **在场感是廉价高价值**："成员正在读"状态灯 + 房间共读计时，成本低、情绪价值高，还给 TTL/开席散会节奏。
6. **房主工具要做厚**（公告、讨论题、章节小结）：共读产品的活跃历史上都依赖"领读人"人力，没有运营资源就把房主武装成领读人。
7. **内容边界纪律**：房间转发严格限定"位置/短引用"，绝不变成文件分发通道——这是 Readmill 尸检给的根本教训。

---

## 4. 综合结论与建议行动

**一句话**：本地侧的正路已被行业验证（就地排版面板、CFI 锚定标注、章节刻度进度），TuRead 的沉浸态与挂载线是领先形态；房间侧的实时同位是真空白，但必须做成可选跟随 + 选区锚定的异步社交层，而不是裸的强制同步。

| # | 行动 | 归属 | 已登记 |
|---|---|---|---|
| 1 | 排版参数：剩余参数照常落右侧面板/设置页；增加"单书覆盖全局" | 本地侧 | `TODO.md` 渲染与阅读器 |
| 2 | 标注：选中即弹条 + 3 样式多色 + **CFI 锚定**（kookit `cfi.ts`）+ 跨页选区处理 + Markdown/JSON 导出 | 本地侧 | `TODO.md` 笔记（高优） |
| 3 | 性能验收标准："千页长书键盘连翻不卡、大书库不慢"显式入验收 | 本地侧 | 待入 `STYLE.md` §8 |
| 4 | 目录挂载线之外评估一个传统侧栏"安全出口" | 本地侧 | 待讨论 |
| 5 | 键鼠意图层绑定表遵循行业肌肉记忆（Space/←→/Ctrl+F/Ctrl+B/F11） | 本地侧 | `TODO.md` 书库 UI（高优） |
| 6 | 同步：跟随模式可选 + 一键脱离；进度差可视化而非强制跳转 | 房间侧 | 待入 FEATURES §9 |
| 7 | 笔记/想法：锚定选区、房间可见、隐私开关、点赞回复 | 房间侧 | `TODO.md` 笔记 + 同步 |
| 8 | 房主工具 + 在场感（状态灯/共读计时）+ "下一本"续期路径 | 房间侧 | 待入 FEATURES §9 |
| 9 | 上游跟进机制：kookit 定期 diff 评审 + fork 预案 | 工程 | 待入 KOOKIT.md |

## 6. 用户判断（2026-09-12，产品哲学定调）

> 用户自 2023 年起是 Koodo Reader 用户，长期使用后对其性能与交互模式的不适构成以下判断的来源。
> 本节是**产品哲学层**的裁决记录，效力高于 §2/§3 的"行业惯例"——行业收敛点不自动等于 TuRead 该做的。

### 6.1 三条判断

1. **阅读器 = 索引，不做实体管理**。桌面阅读器的功能应该只有"索引"（对书籍的轻量引用与阅读状态），
   图书实体的组织/管理（分类、标签、集合、资产管理）不该塞进阅读器，而属于**专门的资产管理程序**——
   用户用什么是用户自己的事（用户本人现状的例子是 TagHit：标签替代层级、跨目录、数据本地）。
   ⚠ 这**不是**"要求用户装某个特定程序"：TuRead 不依赖、不绑定、不推荐任何外部管理器，
   它只是**自己不做**管理功能，把这部分让位给用户已有的工具（哪怕只是文件管理器）。
   **佐证**：Calibre 的"重度管理+阅读"混合是它被嫌弃笨重的根源；TuRead 书库 v0.1.8 起已是"移除=只删索引"，
   这条判断只是把既有做法上升为边界原则。
2. **暴露的参数是负担，排版参数过分分散注意力**。Koodo/Foliate/KOReader 式的参数墙（尤其 KOReader
   "overwhelmed by all the options" 的社区共识差评，§2.1）是负资产。参数面板可以存在（已是召唤式、默认收起），
   但**默认暴露集必须最小**，新参数不自动进面板。
3. **阅读界面 = 注意力焦点模式，不是功能抽屉**。不应做"功能都在、等用户翻牌子"的抽屉式 UI；
   而是**不用的功能透明度逐渐提高（淡出）**——界面元素随使用情况自适应隐没，注意力留给正文。
   这是对现有沉浸态（§5.8 零控件、覆盖式侧边栏、挂载线默认展示）的进一步推广：从"控件只在召唤时出现"
   走到"**用进废退**"。

### 6.2 判断与调研证据的关系

- §2 的"共同模式"多数**不与本判断冲突**：行业收敛的"就地呼出面板"与判断 2/3 兼容（呼出即用完即走）；
  Calibre 参数对话框是行业公认反例，恰是被判断 2 拒绝的形态。
- 判断 1 与 §3.3"书城 vs 自带文件"的矩阵正交：它不是版权问题，是**职责边界**问题——比行业更激进
  （行业默认阅读器自带书库管理），但与 TuRead 既有架构（BookRecord 索引、不拷贝文件）自洽。

### 6.3 两个诚实的张力（记录在案，不是反驳）

1. **淡出 vs 可发现性**：Fable 的教训是书内社交"像埋藏的宝藏，没有引导就没人发现"（§3.2）。
   自适应淡出若太快/太彻底，新功能会死在没人看见。缓解方向：淡出要慢（按"长期未用"计，不是翻一页就藏）、
   召回路径恒定（肌肉记忆快捷键 + 固定召唤方式）、淡出仅限阅读页（书库/设置态不适用）。
2. **索引边界 vs 即将做的"容器"**：TODO 的「多书架/书库容器」方向（分类树/书单/tag 系统）在判断 1 下
   **属于专门资产管理程序的职责**——TuRead 若做容器，就在重走 Calibre 的路。该项已标注冻结重审（见 TODO.md）；
   TuRead 的书库保持"索引 + 阅读状态"的薄形态，将来若有组织需求，正确的演进是**开放数据**（导入/导出、
   可被外部工具读的索引格式），而不是自建容器模型，更不是绑定某个特定外部程序。

### 6.4 判断的落点（哪些东西变了）

| 影响面 | 变化 |
|---|---|
| TODO「多书架/书库容器」 | **冻结重审**：分类/容器/tag 不自建，留给用户选择的资产管理程序；TuRead 只留索引（将来最多做开放数据/可互操作的索引格式，不绑定特定外部程序） |
| TODO「剩余阅读参数」（字距/字体/对齐/缩进/标点） | **降速**：不按原计划自动落右侧面板；先立"默认暴露集最小"原则，需要时再按个评估 |
| `client/docs/STYLE.md` §5.8 沉浸态 | 待吸收"注意力焦点/用进废退"原则（淡出要慢、召回恒定、仅阅读页），下次动 STYLE 时入册 |
| 交互底线 | 召唤式 UI 的键盘召回路径成为一等公民（淡出后必须有一致的键可召回） |

## 5. 证据局限与待跟进

- 微信读书"实时共读房间"多轮搜索未找到官方证据（其社交层为异步邂逅）；若实测发现存在，需更新 §3.1。
- Koodo 排版面板的精确形态（底部/侧边唤出式）未逐帧核实，建议装一个实机对照。
- kosync 协议细节（指纹匹配/端点）未展开，未来做"与墨水屏互通"时再调研。
- 本文日期 2026-09-12；产品活跃度数据会过时，引用时注意复核。
