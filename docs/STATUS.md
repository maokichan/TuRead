# 项目状态与决策记录（会话交接）

> **本文件的职能（三件）**：① **交接快照**（现在在哪 / 下一步 / 怎么验）；② **决策索引**
> （一行一条，指向权威文档）；③ **版本历史**。**不承载**具体的视觉/契约/数据规则 ——
> 那些的归属是 `client/docs/{STYLE,FEATURES,CONTRACTS,DATA_MODEL,KOOKIT,RENDER_INTERFACE}.md`。
> 阅读顺序：本文件 → 仓库根 [`AGENTS.md`](../AGENTS.md)（agent 入口，自动注入）→ [`TODO.md`](../TODO.md) → 各端架构文档。
> 逐版过程明细随 git 历史（annotated tag + 提交消息）留存，本文件只留定位用的要点。

## 1. 一句话

TuRead = **多人房间共读阅读器**：多个用户进入同一房间，共同阅读同一本书。
渲染/解析复用 [kookit](https://github.com/koodo-reader/kookit)（AGPL-3.0，git submodule）；
同步服务器用 Go，**v0.2.0 已实现**（`server/`）；**client v0.2.7**（插件系统与 AI 共读「問」随 v0.2.1；界面空间语法 v2 随 v0.2.4；交互打磨批 1.9~1.18 随 v0.2.5；聚焦舞台随 v0.2.6；**挂载线退役完成 + 阅读时间上线随 v0.2.7**）。
**本地阅读侧端到端可用；房间同步已与真实 server 打通**（v0.2.0，含阅读器内聊天室；多人场景仍在补验）。

## 2. 仓库与提交（`D:\PROJECT\TuRead`）

- git 仓库：本地 `main`，`origin = https://github.com/maokichan/TuRead.git`（独立仓库，非 fork）
- 结构：`client/`（Electron）｜`server/`（独立 Go module）｜`kookit/`（submodule，HEAD `6e18465`）｜`docs/`｜`TODO.md`
- **tag 约定**：两端版本号独立滚动（server `v0.2.x` / client `v0.2.x`），tag 带端名前缀：`client-v0.2.0`
- **职责划分**：通用「提交 / 版本分工」见 `generate-swe` skill（commit + tag 由 agent、不 push；
  版本号滚动与 push 由用户）。本项目专属：**一次交付 = 一次提交 + 一个 annotated tag**，消息沿用
  `client vX — 摘要`；未获指示的改动并入当前版本（「已提交但版本未滚」合法，此时不打 tag）。
  ⚠ **打包（`npm run dist` / `dist:dir` / `pack:portable`）只在用户明确要求时做**，且打包可能由用户交给
  另一个 agent 做——**「滚了版本号」不等于「该打包」**，绝不因为版本滚动就顺手出 release。
- **发版节奏**：**功能确定后即滚版本号**（不长期堆改动）。滚版本时 agent 同步 `package.json` /
  `package-lock.json` / 本文 §4 / `README.md` + 打 tag。产物（便携版 exe）不在此列。
- 网络配方（git 代理 + OpenSSL、Go `GOPROXY=goproxy.cn`、npm 直连、打包代理）见 `D:\PROJECT\NETWORK.md`

## 3. 已定决策（**索引**：一行一条 + 权威位置；细节不在这里重复）

| 决策 | 一句话 | 权威 |
|---|---|---|
| 架构选型 | client = 六边形（端口-适配器）+ DDD 命名；server = 简单分层（非六边形） | `client/docs/ARCHITECTURE.md` §1；`server/docs/ARCHITECTURE.md` §5 |
| 定位系统 | `BookLocation` 三级角色（key/hint/display），原语收拢进 `core/domain/location.ts`，任何组件不得自行解释位置字段 | `CONTRACTS.md` §2.1 |
| 书籍标定 | Work/Edition 两层；Work 不设 author/publisher；`content-hash-v1` + `md5-sample3-v1` | `docs/ARCHITECTURE.md` §1 |
| 认证 / 房间 / 聊天室 / 同步边界 | token 双闸（无账号密码）；房间定义落库 + 运行时纯内存（空房 TTL 12h）；聊天随房间级联；**只同步 BookLocation 与聊天**，笔记/划线 v1 明确排除 | `server/docs/{ARCHITECTURE,API}.md` |
| **房间连接模型（契约 v0.4.3）** | **连接粒度 = 房间**：`connect` = 只领成员 token（不建 WS），**进房间才 `openRoom`（握手带 `?room=&nick=`）**、离房即 `closeRoom`；大厅/建房/聊天历史走 REST；断线重连后**重发 join** + `after=` 增量补拉 | `CONTRACTS.md` §4.2/§5.1；`server/docs/API.md`「WebSocket」 |
| **房间同步正确性（契约 v0.4.7，cowork 批）** | 位置上报/跟随跳转都过**指纹校验**（`getOpenBook` ≡ 房间 edition，与服务器标定同口径）；**join 代次守卫**（并发 join 落败方 `superseded`，UI 静默）；**重连耗尽 = `failed` 态** → 自动复位回大厅（可预期出口）；**同位不跳**防跟随回声 | `CONTRACTS.md` §4.1/§4.2/§5.1；`RoomSession.ts`；`FEATURES.md` §15.3 |
| **副本分发闭环（契约 v0.4.8）** | **建房即传副本**（server 即分发源）；**无书进入自动补书**：大厅行点击 = 无书 join → 按指纹找本地书 → 没有则下载落盘（`userData/downloads`）→ 导入 → 打开；两端皆无留在房间 | `FEATURES.md` §15；`CONTRACTS.md` §4.5（`saveBookCopy`）/§5.1（`RoomState.edition`/`downloadBookCopy`） |
| **跟随模式 v1（用户定形态，cowork 批）** | 开关 = 聊天格「跟隨」文字动作；跟**任一**成员的位置事件（"一起读"，不是监控某人）；生命周期 = 本次房间会话，不持久化 | `FEATURES.md` §15.3；`ChatPanel.tsx`；`ReaderFeature` |
| **join-ack reason 对齐裁定** | **服务器向文档看齐**（error 串改连字符）；客户端 `normalizeJoinReason` 两种都认（容错保留） | `server/docs/API.md`「已知不一致」；`domain/protocol.ts` |
| **阅读器聊天室（用户定）** | 挂载线右段两格（契约 v0.4.3）→ **批1.13 起住右欄卡片页**（"聊天"页签，仅房间态）；聊天**只在经房间进入的那本书**上存在；消息由渲染层共享态统一持有（房间组件与阅读器同一份）；**生命周期归属于房间** | `STYLE.md` §5.8；`FEATURES.md` §11；`features/roomSession.ts` |
| 副本分发 / 配置 | server 保存并分发副本（内容寻址），edition 信息由客户端随副本上传；TOML + 环境变量 + 热重载 | `server/docs/API.md`；`OPS.md` |
| 客户端样式 | **Tailwind v4**；`styles.css` 只留主题语义 token / 全局 base / kookit 契约 | `FEATURES.md`；`styles.css` |
| **渲染层风格基线（准则）** | **文字即界面**（动作/导航一律文字，边框仅输入类与浮层）；**全局统一字体**；负片仅两处；中文排版硬规则；层级靠排版不靠颜色 | `client/docs/STYLE.md`（**渲染层开发先读**） |
| **产品方向（用户定）** | **强交互研读**（模型驱动，工具是客人、产出锚回原文）+ **卡片层次化**（阅读 = 浮于书库的卡片层；非弹窗/非全屏沉浸窗）+ **端形态 = 桌面书房**（竖屏管线性消费，不与之争）；研读核心机构 = 内嵌目录 + 卡片页（批1.20 挂载线机构退役，用户定） | `docs/DIRECTION.md` |
| **界面空间语法 v2（用户定）** | **chrome 底面 + 卡片层**：背景 = 连续一整面（无"栏"边界，区域靠 inset/gutter 声明）；书库/阅读/笔记/房间/设置五界面全卡片化（统一桌色卡面）；阅读卡独占 scrim 叠于书库卡上；搜索等工具随卡片走，窗控与后退/前进是仅有的底面全局件；阅读内搜索本轮不接线（CONTRACTS §7 形状前置） | `docs/DIRECTION.md` §2；`client/docs/STYLE.md` §1.1 |
| 阅读器沉浸态 | **全屏的是「桌」不是正文**；阅读页零控件（退出 `Esc`）；覆盖式侧边栏；目录 = 左缘内嵌件（左）/ 阅读参数住卡片页（右）；滚动条 2px 且短章节隐藏 | `STYLE.md` §5.8；`FEATURES.md` §11 |
| 阅读参数分工 | **宿主几何走 CSS 变量**（纸宽 / 纸内边距），**正文排版走注入**（字号/行距/段距 → `applyTypography`）；缺省 = 不注入；高频参数进右侧面板，低频留设置页 | `CONTRACTS.md` §2/§4.1；`STYLE.md` §5.9 |
| **挂载线两挂件几何（v1.9/v1.10；批1.13 修正）** | 线是**固定的一条**（`--sidebar-w` → 窗口右缘）；⚠ **宽度不许由纸宽派生**；**纸给挂件让位**（`--page-w` 唯一定义处）。批1.13 起右段换形卡片页 → **镜像口径退役**：左垂挂贴卡缘、右卡内收 `--rail-gap`（同宽同高上限仍由一对 token 保证） | `STYLE.md` §5.8 + §3.4；`FEATURES.md` §11 |
| **右欄卡片页（批1.13/1.14，用户定）** | 挂载线退役第一步：右段 = **独立的卡片页**——批1.14 起**与阅读卡平级**（AppShell 卡片区的兄弟卡，中间一道沟露出底板，"参数面板和阅读器一样都是置于底板之上"），不是阅读卡内的浮层；圆角族卡面、自右滑入显影、收回更快；**单槽位**（"目前只给右侧一个槽位"），页族 = 參數/筆記/聊天（仅房间）/插件格，页签切内容；**筆記迁入卡族**（"笔记，AI，插件，都可以有同样的归属"），**左栏只剩目录**（"目录仍然有保留在阅读器内的必要"——暂留垂挂）；召唤四路 = 线右段 / `p` / `c` / **命令面板「呼出X」**（`readerCardBus` 登记，随页族增减）；**卡片页 = 插件贡献点的未来落位**。**批1.15 呼出制**：**默认收起**（"卡片页需要是呼出"，2026-09-13"默认展开"作废），召唤 = 线右段 / **`` ` `` 总开关** / `p` / `c` / 命令面板；**阅读态背景 = 底板本色**（`--bg`，scrim 压暗书库的视觉退役，阻挡职能保留——书库存活但不可见）。**批1.16**：**挂载线收缩为目录段**（用户定"右边的挂载线清掉"——中段纯线与右段召唤位退役，卡片页无线上入口）。**批1.18 定稿（用户拍板"就是这个"）= 两条准绳同时成立**：① **两张卡并排在底板上**（批1.15 的 flex 行形态，批1.16 常驻让位与批1.17 浮层两个变体均被否）；② **纸钉死不动**（用户准绳"没有直接影响到显示内容区的时候就不要改变显示内容区的宽度"）——`--page-w` **锚定视口**（100vw − 侧边栏 − 两侧 inset − 两侧让位区，全固定 token，纸宽与开合无关），阅读卡收窄导致的 re-center 由 `.reader-stage` 的**位移补偿**精确抵消（`--slot-w` × ½，与槽位宽度过渡同 token 同曲线 → 纸在窗口里全程静止）。⚠ 教训：批1.17 的浮层变体未实机确认就被否——形态改动必须实机自查（ui-shot/截图）后再回话 | `STYLE.md` §5.8；`FEATURES.md` §11/§14；`ReaderRail.tsx`；`readerCardBus.ts`；`domain/input.ts` |
| **跟随当前位置 / 点高亮语义（v1.8/v1.9）** | 目录/笔记的当前条目随阅读位置**落在列表正中**（判据 = 纯函数 `readerFollow.ts`）；**单击正文高亮 = 看内容（左侧定位）**，改内容走右键菜单或抽屉「編輯」 | `STYLE.md` §5.8；`readerFollow.ts` |
| **批注输入栏（v1.8~v1.10）** | 底部居中、纯色带边框、**零文字**、宽 = 纸宽 × 0.9、**自增长 2→5 行**；**生命周期 = 绑在它的对象上**（选区型随选区消失；笔记型随笔记从库中消失） | `STYLE.md` §5.8；`NoteComposer.tsx` |
| **沉浸全屏（v1.11）** | `F11` = **进入**全屏（幂等，不是切换）；退出全屏走 `Esc` 分流；**离开阅读器时若仍全屏 → 退出全屏并保持最大化**（`win:set-maximized`） | `STYLE.md` §5.8；`shared/ipc.ts` |
| 键鼠意图层 | 键盘 = **意图**：`core/domain/input.ts` 纯函数绑定表（一键一意）+ `useKeyIntents`（ref 装载 + 常驻组件必须带 enabled 守卫） | `domain/input.ts`；`useKeyIntents.ts` |
| **无边框窗口 + chrome 底面** | `frame:false` + 底面整面拖拽区（`.chrome-base`）+ 底面全局件 `ChromeControls`（窗控右上、书库后退/前进左上）；自绘标题栏已退役（`trash/`） | `ChromeControls.tsx`；`FEATURES.md` §8/§11 |
| **阅读标签页模型（批1.10，用户定）** | **打开一本书 = 开一个标签**（一本书一标签，重复打开=激活既有标签）；标签条 = 底面全局件（顶栏，`ReaderTabStrip`）= 阅读会话的在场；**切换 = 重开链路**（B1，代次守卫护换书；B2 真并行留作性能升级）；Esc = 关当前标签（邻位激活/最后回书库，书库=新标签页）；切库清空标签 | `docs/DIRECTION.md` §2；`FEATURES.md` §7.10/§11；`AppShell.tsx`；`ReaderTabStrip.tsx` |
| **阅读卡进出场 = 暗场浮现（批1.9，用户定）** | scrim 压深一档（`--reader-dip-peak`，**只往深里走**——深色主题不反光，不做闪光弹）+ 卡片原比例自下浮起，退场下沉显隐（出比进快）；原"从被点封面长大"（scale 0.5）退役——文字不参与形变；`openReader` 契约去 origin | `docs/DIRECTION.md` §2；`FEATURES.md` §7.7；`styles.css` `.reader-dip` |
| **数据存储 v3（全局单库）** | 全应用一个 SQLite 库 = 一份用户数据（作品/电子版/收录/书库/书箱/笔记/阅读状态/设置）；JSON 只剩**引导文件**；**书库 = 组织模式**，成员关系 = **收录（holdings）**；笔记挂 edition、阅读时间逐 edition 记按 work 汇总；设置一律全局 | `DATA_MODEL.md` §1/§2/§4.2 |
| 「书的身份」三问定案 | 书库降为组织模式 + 全局单库；**映射库**（移除 = 移除可见性，靠**扫描**对账）vs **自建库**；笔记不自动跨版迁移；Work 只留接口；**Pro = 功能分层非订阅** | `DATA_MODEL.md` §4.2 D1–D12 + §6；`TODO.md` |
| 笔记管理（跨书） | 「筆」= **同级功能组件**（不引入分类）；網格/瀑布流两态 + 窗口化；筛选判据是 **`body` 是否为空，不是 `kind`**；检索 = 笔记卡头部本地搜索 | `FEATURES.md` §12；`STYLE.md` §5.10；`CONTRACTS.md` v0.4.1/v0.4.2 |
| PDF 纸宽填充 + 单页交互 | PDF 改纸宽 = **原地重开**（kookit PdfRender 无重排入口）；单页模式交互两处真根因（嵌套 iframe 桥盲区、点击带滚轮死区）已修；**PDF 滚动模式 = 页卡流** + **PDF 专属纸宽档位**（`readerWidthPdf`）；暗色 = 开书时逐像素烘焙（`bakeDarkModePixels`，口径 = 原 CSS filter 精确复算） | `kookitRenderAdapter.ts`；`client/docs/KOOKIT.md` §7 |
| iframe 事件桥 | 键盘/滚轮落在书文档里到不了宿主 → `components/iframeBridge.ts`（同源 iframe 挂同一套监听，**按键只看界面不看焦点**）；分页模式滚轮翻页 | `iframeBridge.ts`；`useKeyIntents.ts` |
| **右键菜单坐标（真 bug 修复）** | 适配器曾把**书文档的 `clientX/clientY`** 当宿主坐标发出 → 菜单出现在非内容处；现由 `hostOffset()` 沿 `frameElement` 链**逐层累加**。⚠ 旧探针曾把 bug 断言成契约，已纠正 | `kookitRenderAdapter.ts`；`dev/noteProbe.ts` |
| 全局禁选 | **文字选择 = 阅读正文专属**（宿主 UI 一律不可拖选，`input/textarea` 豁免） | `styles.css`；`FEATURES.md` §10/§11 |
| 书库层级后退/前进 | 对齐资源管理器：鼠标侧键 + 底面全局件按钮（ChromeControls）；历史栈条目含**面包屑整条**；模块总线 `libraryNavBus` 跨兄弟组件 | `LibraryFeature`；`libraryNavBus.ts` |
| 渲染内核可替换性 | kookit 整体封装在 vendor ESM 容器内，UI/应用层**只经端口**触达 → 换内核 = 重写适配器层 | `KOOKIT.md`；`CONTRACTS.md` §4.1 |
| 主题色取向 | 四套：纯色·深/亮（黑灰白，不引入色相）+ 羊皮纸·深/亮；状态色保留语义色相 | `styles.css`；`STYLE.md` §3.4 |
| 抽屉平面结构 | 封面 2:3 不拉伸；三行 = 封面高度三等分；标题/数据行单行；指标行无标签；外壳全透明 | `STYLE.md` §5.5 |
| 样式效果确认方式 | 浏览器**样式样张**（`npm run style`）+ 无头机检（`smoke.cjs`）；排版类最终仍要在 Electron 内复核 | `tools/style-gallery/README.md`；`STYLE.md` §8.0 |
| **发行版范围与形态** | **只出 64 位 Windows**；当前形态 = **免安装便携版**（NSIS 暂不出，配置留着备用）；打包关掉原生重建、排除 pdfjs 的 `canvas`。⚠ **打包由用户明确指示后才做**（见 §2） | `electron-builder.yml`；`README.md`；§2 |
| **纸静止单驱动（批1.19）** | 卡片页开合只过渡注册属性 `--slot-w` 一个值（槽位宽与纸位移每帧同源）——双线程过渡漂移已废；机检 `paperStillOk` | `STYLE.md` §5.8；`smoke.cjs` |
| **目录 = 左缘内嵌件（批1.20/1.21，用户定）** | 挂载线**本体退役**（"去掉的只是线语法"）；目录内嵌阅读卡左缘、半高起排、压印字（`--toc-press-*` 四主题各一组）、显影 = 字色按距离（不变量：远端静息不更暗）；**折叠语法全站退役**（目录常驻、`t` 强隐藏）；条目缩进 24px、长题悬停 Marquee | `STYLE.md` §5.8/§3.4；样张 `docs/prototypes/toc-final-home.html` |
| **卡片页鼠标召唤 = 「卡」按钮（批1.21）** | 右上角压印字双位点（阅读侧呼出 / 卡侧缩回）；页签行去线（选中 = 字色）；m1 右键菜单 / m2 右缘悬停两候选销案 | `STYLE.md` §5.8 |
| **设置页格局（批1.22/1.23，用户定）** | 无标题/无提示段落/分组去线；布尔 = 「關｜開」文字选项（原生 checkbox 禁用）；快捷键只读清单（渲染意图绑定表）；插件 = 注册表（一行一生死，配置住使用处）；诊断日志不进设置页 | `STYLE.md` §5.7 |
| **阅读时间口径（批1.24，用户拍板）** | 阅读态累计、**失焦暂停**、边界落笔（换书/关标签/退 app；单段 1h 上限）、**<10s 丢弃**；展示 = 侧栏「筆」列表顶部「閱讀」段（贡献图+Top5，**全局口径**，v1 只读）；逐日数据自接入起有形状（旧账只在投影） | `FEATURES.md` §12；`readSessionRecorder.ts` |
| **阅读器权重模型（方向已定，待实施）** | 右卡片页宽度可调，挤压按序让位：目录区收缩 → 目录舍去 → 纸宽收缩（红线）；开合（瞬态）不动纸的批1.18 分工不变 | `TODO.md`；样张 `docs/prototypes/toc-final-home.html` |
| 插件 | v1 不做插件运行时；**ports 即插件边界**（官方插件 = 适配器 + descriptor） | `ARCHITECTURE.md` §4 |
| UI 功能组件 | 标准容器：`FeatureDescriptor` + `registry` + `AppShell`；跨功能跳转走 `FeatureHost`；纯 React 状态 + props | `FEATURES.md` |
| 跳转历史 | **行动树驳回** → 状态机（前进/后退栈）；随笔记落地后实施 | `TODO.md` |
| 阅读器功能边界（产品哲学） | ① 不管理源文件（导入=建索引、移除=只删索引）—— **不延伸到索引组织层**；② 参数形态克制（召唤式、默认暴露集最小）；③ 阅读界面 = 注意力焦点模式（淡出要慢、召回恒定） | 本表；`STYLE.md` §5.8 |
| 跨层改动授权 | 书库重做等允许改应用层与领域层（前提：不违六边形依赖、契约文档先行） | — |
| 仓库形态 | 单仓库 monorepo（server 可零成本拆出） | `docs/ARCHITECTURE.md` §2 |
| 许可 | kookit AGPL-3.0 → 本项目 AGPL-3.0；引入新依赖先核兼容性；**发行物缺件（LICENSE/OFL/第三方声明）登记在 TODO** | `TODO.md` |

## 4. 版本历史

> 逐版的实施过程、验证数字与教训在 git 历史（annotated tag + 提交消息）与各契约文档的修订记录里；本表只留定位要点。

### client

| 版本 | 内容 |
|---|---|
| **v0.2.7** | **挂载线退役完成 + 阅读时间上线**（批1.19~1.24）。① 批1.19 纸静止单驱动：开合只过渡 `@property --slot-w`（槽位宽与纸位移每帧同源，根治主线程/合成器双线漂移）；RM 豁免块复位（原排基础规则之前整块失效）；样张新增 `paperStillOk` 动态机检。② 批1.20 目录 = 阅读卡左缘**内嵌件**（半高起排、压印字「透明字符边缘阴影」四主题各一组、显影 = 字色按距离、垂挂揭幕换装显影淡入）；挂载线本体退役。③ 批1.21（用户真机反馈）：**折叠语法全站退役**（目录常驻/`t` 强隐藏、卡片页四页「折疊」清除）；页签行去线；右上角「卡」压印按钮双位点（鼠标召唤回归）；条目缩进 24px；长题悬停 Marquee。④ 批1.22 设置页重设计：无标题/无提示/去线；**關｜開文字选项**（on/off 语汇首定义，原生 checkbox 全灭）；快捷键只读清单；插件注册表；诊断日志移除；文字按钮按压 scale(0.97)。⑤ 批1.23 信息结构纠偏：快捷键键值相邻 + 两级缩进；字号放开（值 17px）。⑥ 批1.24 阅读时间：会话记录器（**失焦暂停**/边界落笔/<10s 丢弃/单段 1h 上限；段携 edition 快照防换书错账）+ `readMinutesByDay`/`topReadEditions` 聚合 + 侧栏「筆」列表顶部「閱讀」段（贡献图 26 周/今日本週/Top5，全局口径，v1 只读）。**验证**：typecheck 四套 + 单测 162 + 样张机检 9/9（含 paperStillOk）+ note 探针实证会话落笔 + spike 实证聚合。⚠ 未打包；手感复看清单见 TODO（压印观感/「卡」静息浓度/閱讀段） |
| **v0.2.6** | **书库单击详情 = 「聚焦舞台」**：想法披露（用户参照 2024 巴黎奥运 Louise Michel 绶带段）→ 独立原型（`docs/prototypes/detail-orbit.html`：three.js 三维绶带舞台 + 調參面板，用户手调定妆五带配置）→ 真机移植（three r187 入户，MIT 已核 AGPL 兼容；`FocusStage.tsx` + `focusStageEngine.ts`：持久渲染器 / 墙钟补间 / 收场看门狗 / 文字独立承载层 / 真实封面字节 / 真 token，新增 `--scrim-blur`；顶条带在幕外）→ 交互批次二（**空缺提示槽**：原位留空 + 淡边框 + 浅提示「再次點擊打開」，点击直进阅读；**雕塑卡本体可点击**；动作交右键菜单；旧抽屉退役进 trash/）→ 修复链（StrictMode 通知边界 / 持久画布重挂新 host / 字体栈竞态画时现读 / 飞行起点坐标系 / 开场期幕放行双击）。**验证**：typecheck 四套 + 单测 162 + CDP 真机走查（三开三关 / 冷启动首开 / 空缺槽全流程）。⚠ 未打包；手感细修滚动（四主题观感 / reduced-motion 实测未做）；WebGL 运行时丢失硬化待做；工程教训与剩余待办详见 TODO「聚焦舞台」条 |
| **v0.2.5** | **批1.9 阅读卡进出场动效重做**：动效隐喻换版 = **暗场浮现**（scrim 压深一档 + 卡片原比例自下浮起；只往深里走，深色主题不反光；原"从被点封面长大"退役——文字不参与形变）；`openReader` 契约去 origin。**批1.10 阅读标签页 B1**：打开一本书 = 开一个标签（一本书一标签，重复打开 = 激活既有标签）；标签条暂住顶栏（**形态已被用户否**，方向已裁 = 侧边栏分界线，见 TODO）；切换 = 重开链路（B2 真并行后置）；Esc = 关当前标签（邻位激活/最后回书库，书库 = 新标签页）。**修正**：阅读卡四角直角（scrim 补 `--radius-panel`）+ 进出场放慢（300/600/200ms 全走 token）。**批1.11 全局件生命周期 + 圆角裁定**：① **导航恒在**——后退/前进不随状态消失，职能按域分流（书库域 = 层级历史；其余域无历史机构恒禁用）；② **搜索回底板**（用户改定，批1.7d"搜索住进卡片"退役）——全局搜索框住顶条带右端，激活域经 `chromeSearchBus` 注入绑定（书库/笔记已接线、检索词归各 Feature 自持），阅读器/房间 = 禁用 + 域占位（承退役 TitleBar 作用域表）；`CardSearchInput`/`searchFocusBus` 入 trash。③ **圆角/直角两族裁定**（STYLE.md §3.3）——按归属分族：圆角族 = chrome/卡片世界的实体表面（卡/浮出面板〔命令面板入族：+`--radius-panel`+`--shadow-panel`〕/模态/输入），直角族 = 挂载线家族（长在正文纸上的）；判定一句话 = "长在正文纸上的直角，长在底面/卡片上的圆角"。**批1.12 全库检索 + 搜索框定妆**：① **书库检索换源**（用户报"搜索不是搜到书库下面所有内容"）——新端口 `store.searchHoldings`（SQL 侧跨层级 LIKE 标题/来源路径/收录路径，LIKE 通配符转义，不含 missing；IPC `store:search-holdings`），检索态 = 命中书平面列表（書箱/文件夹不参与），清词回当前层；检索态空态优先于"書架為空"（检索空态口径销案）。② **搜索框定妆**（用户否"标签一多被挤到窗控边上"）——位置固定在导航键之后（左簇），标签条伸缩不挪动它；占位文案去工程腔（"（未接線）"退役，禁用态本身说明不可用）。**批1.13 挂载线退役第一步：右欄卡片页**（用户定）——右段换形 = **独立的卡片页**（`.rail-card`：圆角族卡面、右缘内收一沟、自右滑入显影 `--dur-panel`/收回 `--dur-hover` 收完卸载）；**单槽位**（"目前只给右侧一个槽位"），页族 = 參數/筆記/聊天（仅房间）/插件格，页签切内容；**筆記迁入卡族、左栏只剩目录**（目录暂留垂挂）；召唤 = 线右段/`p`/`c`/**命令面板「呼出X」**（新总线 `readerCardBus`，ReaderFeature 登记页族清单、AppShell 面板据此给命令）；**镜像口径退役**（右卡内收，`mirrorOk` → `cardOk`/页签对称改量卡片中心/聊天判据随形重定义，样张八条机检全绿）。**批1.14 搜索真因修复 + 卡片页平级化**：① **搜索修复**（用户报"仍然没有修好"）——真因 = 批1.12 改空态分支时把"检索态有结果"落进了渲染 null 的三元分支（检索时内容区整块空白，比修复前更糟）；修正 = 三元链重排（在途 null / 无命中空态 / 常态空架 / 列表渲染四支各归其位）。② **卡片页平级化**（用户定"呼出的卡片其实应该和阅读器的界面是平级的……参数面板和阅读器一样都是置于底板之上"）——卡片页**不再是阅读卡内的浮层**：AppShell 卡片区 scrim 容器改 flex 行，阅读卡（flex-1）与槽位并排、中间一道沟露出底板，两张卡同顶同底同卡面；开合经 `readerCardBus.setView` 广播（AppShell 布局反应），卡片内容由 ReaderFeature 经 **portal** 送进槽位；槽位宽度与滑入/滑出同节奏过渡；纸宽公式容器相对自动夹取且仍按两侧让位区预留 → **切卡不重排正文**。**批1.15 呼出制 + 底板纯色 + 热修**：① **默认收起**（用户定"卡片页需要是呼出"——2026-09-13"参数默认展开"作废），新意图 `reader.toggleCard` = **`` ` ``**（卡片页总开关，临时定反引号、随配键体系可调；`p`/`c` = 呼出并切面）。② **阅读态背景 = 底板本色**（`--bg`，用户定"两卡之间显示的应该仍然是纯色"——scrim 压暗书库的视觉退役，书库存活但不可见、不可点）。③ **热修 d9041101**：scrim 容器的内联 `display:flex` 压过 `hidden` 类 → 阅读器分支常显、界面卡死（批1.14 引入）；改条件类名。**批1.16 右线清除 → 批1.18 并排 + 纸静止定稿**：① 挂载线**只剩目录段**（用户定"顺手给右边的挂载线清掉"）——卡片页召唤只剩键盘四路（`` ` ``/`p`/`c`/命令面板）。② 布局三轮收敛后定稿（用户拍板"就是这个"）：**flex 行并排**（两张卡在底板上、中间露底板；批1.16 常驻让位、批1.17 浮层两变体均已否）+ **纸钉死不动**——`--page-w` 锚定视口（固定 token），阅读卡收窄的 re-center 由 `.reader-stage` 位移补偿（`--slot-w`×½）抵消，纸在开合全程静止、零重排。期间修复：批1.12 检索态渲染 null（搜索空白真因）；smoke composer 判据同步视口锚定公式（innerWidth vs clientWidth 的滚动条差）。**验证**：typecheck 四套 + 单测 162 + 样张八条机检全绿 + 实机截图自查（开/合两态纸宽一致）。⚠ 未打包；补偿动画的曲线吻合度待真机复看 |
| **v0.2.4** | **界面空间语法 v2**：chrome 底面化（自绘标题栏退役；窗控与书库后退/前进 = 底面全局件 `ChromeControls`，背景整面拖拽区）+ 全界面卡片化（`FeatureCard` 统一桌色卡面，scrim 归阅读卡独占）+ 搜索住进卡片（`CardSearchInput`，Ctrl+F 经 `searchFocusBus` 随激活卡）。方向与术语：`docs/DIRECTION.md` §2、`client/docs/STYLE.md` §1.1。**验证**：typecheck 四套 + 单测 162 + 样张八条机检 + ui-shot 真机五页截图。⚠ 未打包；浅色主题卡面对比度、拖拽/双击最大化待真机复看 |
| **v0.2.0** | **房间功能上线**：按房间建连（根因修复：服务器 WS 握手就要 `?room=&nick=`，旧模型走不到 join）+ 阅读器聊天室（右抽屉两格）+ 协议词汇收拢 `core/domain/protocol.ts`（reason 容错归一）+ 无书成员加入（契约 v0.4.4）。真机探针 16 断言全 PASS；**用户双开验收通过**。⚠ 未打包 |
| **v0.2.3** | **蜂群测试机制 + presence 修复**：① `tools/swarm` 单机 服务-客户端 多客户端模拟（roombot 复用真实核心层 + 假渲染端口；编排器起一次性 server 撒 N 只跑语义断言 A1-A5，8 只规模验证）；**首跑抓出 presence 载荷形状真实跨端 bug**（server 裸数组 vs client {members}，成员快照恒空 → 位置派生/离房清理/跟随全失效）—— server v0.2.2 修复 + client 双形状归一。**验证**：typecheck 四套（含 tools/swarm）+ 单测 157；npm run swarm 全绿。⚠ 8 只首跑一次偶发失败未再现（README 登记） |
| **v0.2.2** | **共读功能批（cowork 分支）**：① 房间同步正确性——位置上报校验归属（`getOpenBook` + 指纹，审计 B-2）、幽灵会话/残留待发清理（B-3/C-5）、join 代次守卫 + 重连耗尽 `failed` 复位 + 状态噪声去重（B-4/C-2/C-4；`ConnectionState` 补 `failed`、reason 补 `superseded`）。② **副本分发闭环**——建房即传副本 + 无书成员自动补书（大厅行点击即进；`saveBookCopy` 落 `userData/downloads`；`RoomState.edition` / `downloadBookCopy`）。③ **跟随模式 v1**——聊天格「跟隨」开关，三道闸门（开关 / 指纹 / 同位不跳）。**验证**：typecheck 四套全绿；单测 154（RoomSession 3 → 22）。⚠ 未打包；手感待真机复看（TODO 同步组）
| **v0.2.1** | **插件系统 + AI 共读上线；PDF 专项与审查修复随版收口**。① 插件系统内核：manifest 校验 / 种子（缺则种）/ Blob 动态加载 / 挂载线右段面板格（**渲染权在宿主**）/ 设置页「插件」启停（契约 §9 v0.4.5，STYLE v1.13）；开发工作区 `client/plugins/`。② 時鐘插件（首个验证件，真机通过）。③ 插件契约 v1.1（v0.4.6）：`net.fetch` https 代理 / `secrets` 保险库（safeStorage 落库密文）/ `hideWhenInRoom` 互斥 / `ctx.reader` 阅读上下文（快照 + 溯源跳回）。④ **AI 共读插件「問」v0.1.0**：对话 + 位置/目录上下文注入 + 『引文』点击跳回 + 跨书会话 + 非流式打字机（真机發消息验证通过）。⑤ 随版收口：PDF 专项（滚动调度 / 暗色烘焙 / 专属纸宽 / 页卡边缘）+ 两批审查修复 + 审计第一批。**验证**：typecheck 四套全绿；单测 131；样张八条机检全绿。⚠ 未打包（发行物仍是 v0.1.15 便携版） |
| v0.1.19 | 本地阅读侧收口：目录/笔记跟随居中、挂载线镜像几何、纸给挂件让位、批注输入栏（自增长/生命周期）、右键坐标真 bug 修复、`F11` 幂等全屏 + 退出保持最大化 |
| v0.1.18 | 笔记管理（跨书）：「筆」功能组件 + 窗口化瀑布流 + 三态筛选 + 跨书跳转契约；用户真机验收通过 |
| v0.1.17 | 「书的身份」：全局单 SQLite 库 + 书库降为组织模式 + 迁移器 T1/T2 + 映射库扫描对账 + `ReadingState` 拆出 |
| v0.1.16 | 笔记/划线落地（文字类优先）：锚点两层（Norm+Fragment）、笔记 CRUD 全链路、右键主入口、vitest + 分层守卫 |
| v0.1.15 | **首个打包发行版**（免安装便携版）：无边框窗口 + 自绘标题栏 + 挂载线 + 沉浸态 + SQLite 单库（用户实机 327 本验收通过） |
| v0.1.13~14 | 窗口与阅读器交互大版本 + 阅读器交互三则（随 v0.1.15 一并交付，从未单独打包） |
| v0.1.8~12 | 书库重做 → 架构审查修复 → **渲染层风格基线**（`STYLE.md` 立项）→ 阅读器沉浸态收官 |
| v0.1.0~7 | 骨架 → 渲染适配器 → PDF/pdfjs → 定位系统立约 → 本地阅读 MVP → 功能组件标准容器 → 阅读器修复批 |

### server

| 版本 | 内容 |
|---|---|
| **v0.2.1** | **契约对齐**：join-ack 的 reason 串改连字符（向 `API.md` 看齐；`ws.go` 硬编码改引 `room.ErrNotFound`）+ `POST /rooms` 的 owner 昵称校验（与 WS 握手同判据 ≤12 rune，超长 400 —— 修"房主进不去自己刚建的房"）+ API 版本头 v0.2.1。**验证**：`go build` + 白盒全绿（新增 `TestCreateRoomOwnerNickConstraint`）；⚠ e2e `TestE2EFloodNoDrop` 本机既有不稳（非回归，登记 TODO）
| **v0.2.2** | **presence 载荷形状修正**：三处发送点包 `domain.PresencePayload{members}`（此前裸数组与 client 契约不符，真客户端成员快照恒空 —— 蜂群首跑抓出）；e2e `readPresence` 同步解包。**验证**：白盒全绿 + 蜂群 8 只全绿 |
| v0.2.0 | 房主删房 + E2E 独立黑盒测试 + HTTP 服务模型文档 |
| v0.1.0~6 | 房间同步 + Work/Edition 标定 + token 双闸 + 传输基本功（背压/healthz/优雅关停）+ 空房 TTL + 房间发现 + TOML 热重载 + 聊天室 + owner_token / 按 IP 签发成员 token + OPS 手册 |

## 5. 环境 / 沙箱事实

- 本地代理 `127.0.0.1:7897`（Clash Verge rev）；npm registry 直连；GitHub 直连被墙（走代理 + OpenSSL）；`curl.exe` 不可用
- go 沙箱下 telemetry 报错是噪音；`GOPROXY=https://goproxy.cn,direct`；`go build` 把 GOCACHE 指到工作区
- 测试：`go test ./...`（白盒在源码旁）+ `server/test/e2e/`（黑盒走 HTTP/WS）
- **跑碰 better-sqlite3 的临时探针**：原生模块是 **electron-v130 ABI**，系统 Node `require` 会
  `ERR_DLOPEN_FAILED` → 用 `client/node_modules/electron/dist/electron.exe <脚本.cjs>` 跑；
  **Windows 下 Electron 的 stdout 抓不到** → **结果写文件再读**；脚本末尾 `app.quit()` 会打一条
  `platform_channel.cc Check failed` 的 FATAL 噪音（**文件已写完，不影响结论**）。
- ⚠ **受限文件沙箱下**：`npm test` / `npm run dev` / 任何探针都经 esbuild 管道 stdio 或 Electron Mojo
  命名管道 → **必然 `EPERM` / FATAL**，需在放宽模式下跑；`TUREAD_USER_DATA` 要落在工作区内。
- **蜂群（`npm run swarm`）是纯 Node**：无 Electron 噪音、stdout 直接可读、退出码干净 —— 与探针的
  "写文件再读"纪律互补；GOCACHE/GOPROXY 有默认兜底（可用环境覆盖）；server 每房上限 20，蜂群别超
- kookit 子模块的 `CLAUDE.md` 规则：**禁止在其仓库内 git commit / push**

## 6. 交接快照

**当前位置**：`main`（client **v0.2.7** / server v0.2.2；**未 push，等用户**；未打包，发行物仍是 v0.1.15 便携版）。
**当前重心（用户定）= 阅读界面的交互打磨**（Emil Kowalski 式设计工程：交互手感 / 层次感 / 质量感；
**整个 UI 在此前提下允许改**，纪律 = emil-design-eng skill + `STYLE.md` 红线，先概览现状再动工）。
**v0.2.7 已上线真机待复看**：内嵌目录（压印字/显影）、「卡」按钮、设置页新格局、「筆」页閱讀统计段——
手感反馈驱动细修（显影半径/静息浓度/字号音量均已按用户纠偏调过一轮）；CDP 真机调试脚本勿再投入
（用户裁：探针只留生命周期边界与日志通道，自主点击不可靠且不值专题；vite 长跑实例会卡旧模块，
真机验证前先重启 dev——批1.22 实测）。
已定方向（用户）：**阅读器改标签页模型**（打开一本书 = 开一个标签；书库 = 新标签页；B2 真并行后置；
标签已迁侧栏 = 批1.20 前的标签条重设计，形态已落）；
**PDF 烘焙推广到四主题**（调研已毕，排在挂载线之后——挂载线已完成，本批可启动）；**纯文字沉浸态**（想法阶段）。
**待办（唯一清单 = `TODO.md`）的建议顺序**：
1. **真机复看**（v0.2.7 三处新东西：内嵌目录压印观感/「卡」按钮静息浓度/「筆」页閱讀段；清单见 TODO）。
2. **阅读器权重模型**（方向已定待实施：右卡宽度弹性 + 让位序列；动工前回 TODO 条对齐全序与契约落点）。
3. **PDF 烘焙推广**（调研结论与逐主题 profile 已写进 TODO；挂载线已完，无前置）。
4. **聚焦舞台收尾**（WebGL 运行时丢失硬化 + 手感细修，见 TODO）。
5. **共读真机复核 / 多人补验**（等用户有空并行）；**server 侧**按既定节奏挂起。

**验证工具链（回归全靠它们；口径：单测验判据、探针验链路）**
- **`npm test`** = 纯逻辑单测（anchor/location 语义 + `compareNoteOrder` + `readerFollow` + `noteLayout`
  + `protocol` + 分层守卫 + 迁移/双队列 + RoomSession 首批）。秒级、无需书。
- **`npm run typecheck:all`** = 四个 tsconfig（node / web / test / **preview**）。
  ⚠ **preview 覆盖样式样张 —— 改数据层或组件 props 后必跑**（「样张整页黑屏」就是漏跑它）。
  ⚠ `tsconfig.test.json` 不设 `jsx` → 纯 `.ts` 不能 import `.tsx` 的类型（数据形状要住纯模块里）。
- **样式样张**：`npm run style` 起样张；另开终端
  `node_modules\electron\dist\electron.exe tools\style-gallery\smoke.cjs [url] [--scale=N] [--no-window]`
  → 判据 = 有面板 + 有文字 + 无页面错误 + **八条几何机检**（`cardOk` / `widthIndependentOk` /
  `paperClearOk` / `tabsSymOk` / `followedOk` / `chatDrawerOk` / `noRoomTabsOk` / `composerOk`；
  逐条条件见 `STYLE.md` §8.0）。⚠ **探针的假数字/假绿比 FAIL 更危险**：`--scale` 会自检计时环境；
  样张里受控组件必须自己持有 state；模板字符串里不能写反引号（改完先 `node --check`）。
- **真机探针**（都需要 `TUREAD_USER_DATA=<独立目录>`，**别碰真实书库**）：
  - `TUREAD_DEV_BOOK=<书>` 单跑 = 渲染自检（四格式；输出 `[TUREAD-TEST-OK]`）
  - `TUREAD_DEV_PROBE=library` = 多库/書箱/笔记读模型探针
  - `TUREAD_DEV_PROBE=note` = 笔记/划线全链路（选区→锚点→回显→导航→重锚→删除）。
    样书首章是纯图片扉页，探针会自动逐章找有正文的章；超时可用 `TUREAD_DEV_TIMEOUT_MS` 放宽。
  - **`TUREAD_DEV_PROBE=room`（唯一要真 server 的探针）**：会话→建房→按房间握手→标定→聊天回执→
    历史→离房→再进房→共享态（16 条断言）。需要 `TUREAD_DEV_SERVER` 与 `TUREAD_DEV_ACCESS`；
    服务器侧建议用一次性 data 目录（`TUREAD_ADDR=:8099` + `TUREAD_DATA_DIR=$TEMP\...`），
    别拿入库的 `server/data/turead.db` 做探针。⚠ 负向断言会在 Electron 日志留一行
    `Error occurred in handler for 'net:send'` —— **那是预期的**。
  - `TUREAD_DEV_PROBE=paged-interact` / `pdfWidth` = 单页交互 / PDF 纸宽量化（无产品断言，看事实行）
  - `TUREAD_DEV_SQLITE=1` = 原生模块 spike；`TUREAD_DEV_BOOK` **打包产物**跑自检不自退（已知问题，见 TODO）
- 换 Electron 版本后 `npm run rebuild:sqlite`；打包走代理（`NETWORK.md`）。
- **发行版冒烟**（**打包之后**才做）：独立 userData 起 `release/win-unpacked/TuRead.exe` →
  应落盘 `config.json` + `store.db` + `covers/<editionId>.jpg`。

- **`npm run swarm`** = 单机 蜂群-同步 回归（client/tools/swarm）：起一次性 server + N 只 roombot，
  语义断言 A1-A5（全员到齐 / 除发送者外 / 聊天回执 / 离房不残留 / 无错误），退出码即结论。
  覆盖边界 = 同步逻辑/协议/传输；渲染/UI/IPC 桥归真窗口探针与手感（立项时与用户对齐）。
**待真机复看（探针证不了手感/窗口状态；批1.24 维护时已清退役项）**：
① **v0.2.7 新三样**：内嵌目录压印观感（四主题/显影半径 110px/静息浓度）、「卡」按钮静息浓度、
「筆」页閱讀统计段（贡献图/Top 榜/两栏布局）；② 暗场浮现幅度与节奏、退场下沉；③ 标签侧栏
切换大书手感与深色对比度；④ 顶条带布局（后退/前进恒在、全局搜索框左簇）；⑤ 输入栏自增长手感、
抽屉「編輯」hover 显形；⑥ 聊天室手感（自动滚到底/长消息遮罩/`c` 键）；⑦ PDF 滚动调度与暗色
烘焙实效；⑧ 插件/AI（『引文』跳回落点、進房互斥）；⑨ 多库同书笔记/进度共享、映射库扫描手感；
⑩ 共读多人补验（等用户并行）。

**关键对象速查**：`LibraryManager`（引导文件 + store 句柄）｜`SqliteStore`（**全应用一个全局 `.db`**，
close 后可 init 重开）｜切库信号 = main 广播 `store:library-changed`；⚠ `store:*` 不再「打到当前库」
（涉及收录/书箱的调用显式带 `libraryId`）｜**契约版本 v0.4.4**（`CONTRACTS.md`）｜
笔记链路：`domain/anchor.ts`（锚点纯函数权威）、`TextAnchor` 二层（Norm + Fragment）、
`components/readerFollow.ts`（跟随判据）、`components/noteLayout.ts`（笔记流几何）、
适配器 `renderedChapter`（高亮回显的过滤依据）、`hostOffset()`（iframe→宿主坐标）、
`readerTarget`（「带目标打开」载荷，tick 防重复消费）、`win:set-maximized`。
**房间链路速查**：`domain/protocol.ts`（**协议词汇唯一解释处**）｜`INetService.openRoom/closeRoom`
（**按房间建连**；`connect` 只领 token）｜`IRoomSession`（`chat-history` 事件 + `listMessages` +
10s join 超时 + 重连重发 join）｜`features/roomSession.ts`（**渲染层共享会话态**）｜
`components/ChatPanel.tsx`（卡片页族的聊天页）｜`ReaderRail` 的 `rightPanel`（**CardPageKind**）/ `rail-tabs`｜
`dev/roomProbe.ts`（唯一要真 server 的探针）。
**动效与命令面板速查（v1.14；批1.13 增补）**：动效 token 唯一来源 = `styles.css` `:root`（六档 `--dur-*` +
`--ease-out/--ease-inout`；**组件禁写死时长**）｜`components/motion.ts`（`playSettle` = 大状态切换
200ms 模糊落定）｜`components/veil.ts`（`paintVeil` 遮罩按距离 + `paintGlow` 灯光因子）｜
`components/ReaderRail.tsx` 的 `useHangingPanel`（开合 closing 状态机：左垂挂 `.rail-hang` clip 揭幕、
右卡片页 `.rail-card` 从右滑入；收回 180ms 后卸载）｜`features/readerCardBus.ts`（**右欄卡片页清单 +
召唤**，命令面板「呼出X」的数据源）｜`viewSwitchFlash.ts`（240ms + `flashSeq` key 重启 = 闪屏中可连点）｜
`components/CommandPalette.tsx` + `commandFilter.ts`（命令面板 + 纯函数检索，单测覆盖）｜
`domain/input.ts`（`app.commandPalette` = `ctrl+shift+p`；**Shift 已入表**；useKeyIntents 对
**组合键在输入框聚焦时放行**）。
**插件链路速查（契约 v0.4.5）**：`shared/plugin.ts`（manifest 校验纯函数 + 单测）｜
`main/plugins.ts`（PluginManager：种子"缺则种" / 扫描 / 入口读取——渲染层不传路径，信任边界在主进程）｜
`renderer/src/plugins/runtime.ts`（模块级注册表：清单 → 启用状态（settings 键 `plugins`）→ Blob import
激活 → 面板注册表；`usePluginPanels` 归阅读器、`installed` 归设置页）｜
`components/ReaderRail.tsx` 的 `RailPluginMount`（宿主外壳，复用 `.reader-controls` 几何）｜
开发工作区 `client/plugins/`（時鐘 = 首个验证插件；打包 extraResources → resources/plugins）。

**工作区注意事项**：kookit 子模块的 `m` 是其自身工作树噪音，**勿动**（清理项见 `TODO.md` 审计组）；
动 server 前先与用户确认工作树里来源不明的改动（`TODO.md` 审计组有登记）。
