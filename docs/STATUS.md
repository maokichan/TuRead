# 项目状态与决策记录（会话交接）

> **本文件的职能（三件）**：① **交接快照**（现在在哪 / 下一步 / 怎么验）；② **决策索引**
> （一行一条，指向权威文档）；③ **版本历史**。**不承载**具体的视觉/契约/数据规则 ——
> 那些的归属是 `client/docs/{STYLE,FEATURES,CONTRACTS,DATA_MODEL,KOOKIT,RENDER_INTERFACE}.md`。
> 阅读顺序：本文件 → [`MAP.md`](../MAP.md)（自动加载）→ [`TODO.md`](../TODO.md) → 各端架构文档。

> **更新 2026-09-17 · 房间功能上线（client 未滚版本，等用户验收）**：用户定调"临时暂停其他一切功能开发，
> 直接上线房间功能"，本轮落成 **阅读器聊天室**（挂载线右段两格：参數 / 聊天）并**首次把房间同步与真实 server
> 打通**（根因 = 连接模型与服务器文本不一致，见 §6「本轮落成」）。**版本口径：验收之后才滚 0.2.0，不打包**；
> 契约 = `CONTRACTS.md` **v0.4.3**，视觉 = `STYLE.md` §5.8 **v1.12**，交接 = §6。

> **更新 2026-09-16 · client v0.1.19 发版**：把 **v0.1.16 ~ v0.1.18 三版未打包的内容 + 本轮
> 「阅读器跟随与镜像」（v1.8~v1.11 四轮）** 一次收口 —— 详细过程见 §4，视觉/几何口径见
> `STYLE.md` §5.8/§5.10 与 §10 v1.8~v1.11。

## 1. 一句话

TuRead = **多人房间共读阅读器**：多个用户进入同一房间，共同阅读同一本书。
渲染/解析复用 [kookit](https://github.com/koodo-reader/kookit)（AGPL-3.0，git submodule）；
同步服务器用 Go，**v0.2.0 已实现**（`server/`）；**client v0.1.19**。
**本地阅读侧端到端可用；客户端与真实服务器的对接尚未打通**（房间是半成品）。

## 2. 仓库与提交（`D:\PROJECT\TuRead`）

- git 仓库：本地 `main`，`origin = https://github.com/maokichan/TuRead.git`（独立仓库，非 fork）
- 结构：`client/`（Electron）｜`server/`（独立 Go module）｜`kookit/`（submodule，HEAD `6e18465`）｜`docs/`｜`TODO.md`
- **tag 约定**：两端版本号独立滚动（server `v0.2.x` / client `v0.1.x`），tag 带端名前缀：`client-v0.1.19`
- **职责划分（2026-09-08 定；2026-09-16 补一条硬边界）**：`git commit` 与 `git tag` **由 agent 执行**
  （一次交付 = 一次提交 + 一个 annotated tag，消息沿用 `client vX — 摘要`）；agent 不 push，除非用户明确要求。
  **版本号是否滚动由用户决定** —— agent 不得自行发版；未获指示的改动并入当前版本，
  "已提交但版本未滚"是合法状态（此时不打 tag）。
  ⚠ **打包（`npm run dist` / `dist:dir` / `pack:portable`）只在用户明确要求时做**（用户 2026-09-16 定），
  且**打包这件事可能根本不由本会话的 agent 做**（用户可交给另一个 agent）——
  **"滚了版本号"不等于"该打包"**，绝不因为版本滚动就顺手出 release。
  （本条是一次事故的产物：2026-09-16 agent 依据下面那条"发版节奏"自行打包，用户纠正"没有让你发 release来着"。）
- **发版节奏（2026-09-13 定；2026-09-16 收窄）**：**功能确定后即滚版本号**（不再把多版改动长期堆着）。
  滚版本时 agent 同步 `package.json` / `package-lock.json` / 本文 §4 / `MAP.md` / `README.md` + 打 tag。
  **产物（便携版 exe / 安装包）不在此列** —— 见上一条：打包等用户明确指示。
- 网络配方（git 代理 + OpenSSL、Go `GOPROXY=goproxy.cn`、npm 直连、打包代理）见 `D:\PROJECT\NETWORK.md`

## 3. 已定决策（**索引**：一行一条 + 权威位置；细节不在这里重复）

| 决策 | 一句话 | 权威 |
|---|---|---|
| 架构选型 | client = 六边形（端口-适配器）+ DDD 命名；server = 简单分层（非六边形） | `client/docs/ARCHITECTURE.md` §1；`server/docs/ARCHITECTURE.md` §5 |
| 定位系统 | `BookLocation` 三级角色（key/hint/display），原语收拢进 `core/domain/location.ts`，任何组件不得自行解释位置字段 | `CONTRACTS.md` §2.1 |
| 书籍标定 | Work/Edition 两层；Work 不设 author/publisher；`content-hash-v1` + `md5-sample3-v1` | `docs/ARCHITECTURE.md` §1 |
| 认证 / 房间 / 聊天室 / 同步边界 | token 双闸（无账号密码）；房间定义落库 + 运行时纯内存（空房 TTL 12h）；聊天随房间级联；**只同步 BookLocation 与聊天**，笔记/划线 v1 明确排除 | `server/docs/{ARCHITECTURE,API}.md` |
| **房间连接模型（v0.4.3，2026-09-17）** | **连接粒度 = 房间**：`connect` = 只领成员 token（不建 WS），**进房间才 `openRoom`（握手带 `?room=&nick=`）**、离房即 `closeRoom`；大厅/建房/聊天历史走 REST；断线重连后**重发 join** + `after=` 增量补拉 | `CONTRACTS.md` §4.2/§5.1；`server/docs/API.md`「WebSocket」 |
| **阅读器聊天室（v0.4.3，2026-09-17 用户定）** | 挂载线**右段两格**（`閱讀參數 / 聊天`，与左段目錄/筆記同构）；聊天**只在经房间进入的那本书**上存在；消息由渲染层共享态统一持有（房间组件与阅读器同一份）；**生命周期归属于房间** | `STYLE.md` §5.8；`FEATURES.md` §11；`features/roomSession.ts` |
| 副本分发 / 配置 | server 保存并分发副本（内容寻址），edition 信息由客户端随副本上传；TOML + 环境变量 + 热重载 | `server/docs/API.md`；`OPS.md` |
| 客户端样式 | **Tailwind v4**；`styles.css` 只留主题语义 token / 全局 base / kookit 契约 | `FEATURES.md`；`styles.css` |
| **渲染层风格基线（准则）** | **文字即界面**（动作/导航一律文字，边框仅输入类与浮层）；**全局统一字体**；负片仅两处；中文排版硬规则；层级靠排版不靠颜色 | `client/docs/STYLE.md`（**渲染层开发先读**） |
| 阅读器沉浸态 | **全屏的是「桌」不是正文**；阅读页零控件（退出 `Esc`）；覆盖式侧边栏；挂载线 = 目录（左）/ 阅读参数（右）；滚动条 2px 且短章节隐藏 | `STYLE.md` §5.8；`FEATURES.md` §11 |
| 阅读参数分工 | **宿主几何走 CSS 变量**（纸宽 / 纸内边距），**正文排版走注入**（字号/行距/段距 → `applyTypography`）；缺省 = 不注入；高频参数进右侧面板，低频留设置页 | `CONTRACTS.md` §2/§4.1；`STYLE.md` §5.9 |
| **挂载线两挂件几何（v1.9/v1.10）** | 线是**固定的一条**（`--sidebar-w` → 窗口右缘）；两段**等宽 + 各贴线的一端** ⟺ 关于线中心镜像（**无中心点算式**）；⚠ **宽度不许由纸宽派生**；**纸给挂件让位**（`--page-w` 唯一定义处） | `STYLE.md` §5.8 + §3.4；`FEATURES.md` §11 |
| **跟随当前位置 / 点高亮语义（v1.8/v1.9）** | 目录/笔记的当前条目随阅读位置**落在列表正中**（判据 = 纯函数 `readerFollow.ts`）；**单击正文高亮 = 看内容（左侧定位）**，改内容走右键菜单或抽屉「編輯」 | `STYLE.md` §5.8；`readerFollow.ts` |
| **批注输入栏（v1.8~v1.10）** | 底部居中、纯色带边框、**零文字**、宽 = 纸宽 × 0.9、**自增长 2→5 行**；**生命周期 = 绑在它的对象上**（选区型随选区消失；笔记型随笔记从库中消失） | `STYLE.md` §5.8；`NoteComposer.tsx` |
| **沉浸全屏（v1.11）** | `F11` = **进入**全屏（幂等，不是切换）；退出全屏走 `Esc` 分流；**离开阅读器时若仍全屏 → 退出全屏并保持最大化**（`win:set-maximized`） | `STYLE.md` §5.8；`shared/ipc.ts` |
| 键鼠意图层 | 键盘 = **意图**：`core/domain/input.ts` 纯函数绑定表（一键一意）+ `useKeyIntents`（ref 装载 + 常驻组件必须带 enabled 守卫） | `domain/input.ts`；`useKeyIntents.ts` |
| 无边框窗口 + 自绘标题栏 | `frame:false` + 自绘控制键 + 标题栏内嵌**全局搜索栏**（作用域随功能：书库/笔记已接线，阅读器·房间未接线） | `TitleBar.tsx`；`FEATURES.md` §11 |
| **数据存储 v3（全局单库）** | 全应用一个 SQLite 库 = 一份用户数据（作品/电子版/收录/书库/书箱/笔记/阅读状态/设置）；JSON 只剩**引导文件**；**书库 = 组织模式**，成员关系 = **收录（holdings）**；笔记挂 edition、阅读时间逐 edition 记按 work 汇总；设置一律全局 | `DATA_MODEL.md` §1/§2/§4.2 |
| 「书的身份」三问定案 | 书库降为组织模式 + 全局单库；**映射库**（移除 = 移除可见性，靠**扫描**对账）vs **自建库**；笔记不自动跨版迁移；Work 只留接口；**Pro = 功能分层非订阅** | `DATA_MODEL.md` §4.2 D1–D12 + §6；`TODO.md` |
| 笔记管理（跨书） | 「筆」= **同级功能组件**（不引入分类）；網格/瀑布流两态 + 窗口化；筛选判据是 **`body` 是否为空，不是 `kind`**；检索 = 标题栏·笔记作用域 | `FEATURES.md` §12；`STYLE.md` §5.10；`CONTRACTS.md` v0.4.1/v0.4.2 |
| PDF 纸宽填充 + 单页交互 | PDF 改纸宽 = **原地重开**（kookit PdfRender 无重排入口）；单页模式交互两处真根因（嵌套 iframe 桥盲区、点击带滚轮死区）已修 | `kookitRenderAdapter.ts`；`dev/pagedInteractProbe.ts` |
| iframe 事件桥 | 键盘/滚轮落在书文档里到不了宿主 → `components/iframeBridge.ts`（同源 iframe 挂同一套监听，**按键只看界面不看焦点**）；分页模式滚轮翻页 | `iframeBridge.ts`；`useKeyIntents.ts` |
| **右键菜单坐标（v1.9 修的真 bug）** | 适配器曾把**书文档的 `clientX/clientY`** 当宿主坐标发出 → 菜单出现在非内容处；现由 `hostOffset()` 沿 `frameElement` 链**逐层累加**。⚠ 旧探针把 bug 断言成了契约，已纠正 | `kookitRenderAdapter.ts`；`dev/noteProbe.ts` |
| 全局禁选 | **文字选择 = 阅读正文专属**（宿主 UI 一律不可拖选，`input/textarea` 豁免） | `styles.css`；`FEATURES.md` §10/§11 |
| 书库层级后退/前进 | 对齐资源管理器：鼠标侧键 + 标题栏按钮；历史栈条目含**面包屑整条**；模块总线 `libraryNavBus` 跨兄弟组件 | `LibraryFeature`；`libraryNavBus.ts` |
| 渲染内核可替换性 | kookit 整体封装在 vendor ESM 容器内，UI/应用层**只经端口**触达 → 换内核 = 重写适配器层 | `KOOKIT.md`；`CONTRACTS.md` §4.1 |
| 主题色取向 | 四套：纯色·深/亮（黑灰白，不引入色相）+ 羊皮纸·深/亮；状态色保留语义色相 | `styles.css`；`STYLE.md` §3.4 |
| 抽屉平面结构 | 封面 2:3 不拉伸；三行 = 封面高度三等分；标题/数据行单行；指标行无标签；外壳全透明 | `STYLE.md` §5.5 |
| 样式效果确认方式 | 浏览器**样式样张**（`npm run style`）+ 无头机检（`smoke.cjs`）；排版类最终仍要在 Electron 内复核 | `tools/style-gallery/README.md`；`STYLE.md` §8.0 |
| **发行版范围与形态** | **只出 64 位 Windows**；当前形态 = **免安装便携版**（NSIS 暂不出，配置留着备用）；打包关掉原生重建、排除 pdfjs 的 `canvas`。⚠ **打包由用户明确指示后才做**（agent 不得自行打包 / 发 release，见 §2） | `electron-builder.yml`；`README.md`；§2 |
| 插件 | v1 不做插件运行时；**ports 即插件边界**（官方插件 = 适配器 + descriptor） | `ARCHITECTURE.md` §4 |
| UI 功能组件 | 标准容器：`FeatureDescriptor` + `registry` + `AppShell`；跨功能跳转走 `FeatureHost`；纯 React 状态 + props | `FEATURES.md` |
| 跳转历史 | **行动树驳回** → 状态机（前进/后退栈）；随笔记落地后实施 | `TODO.md`；`FEATURES.md` §9 |
| 阅读器功能边界（产品哲学） | ① 不管理源文件（导入=建索引、移除=只删索引）—— **不延伸到索引组织层**；② 参数形态克制（召唤式、默认暴露集最小）；③ 阅读界面 = 注意力焦点模式（淡出要慢、召回恒定） | 本表；`STYLE.md` §5.8 |
| 跨层改动授权 | 书库重做等允许改应用层与领域层（前提：不违六边形依赖、契约文档先行） | — |
| 开发原则 | **解释优先**（大改前写理由）；不知放哪层就停下讨论（Rule of Three） | — |
| 仓库形态 | 单仓库 monorepo（server 可零成本拆出） | `docs/ARCHITECTURE.md` §2 |
| 许可 | kookit AGPL-3.0 → 本项目 AGPL-3.0；引入新依赖先核兼容性；**发行物缺件（LICENSE/OFL/第三方声明）登记在 TODO** | `TODO.md` |

## 4. 版本历史

### client

| 版本 | 日期 | 内容 |
|---|---|---|
| **v0.1.19** | 2026-09-16 | **本地阅读侧收口（把 v0.1.16~v0.1.18 未打包的内容 + 本轮「阅读器跟随与镜像」一次交付）**。本轮四轮改动（v1.8~v1.11，逐项见 `client/docs/STYLE.md` §10 与 §5.8）：① **目录/笔记的当前条目随阅读位置居中**（判据 = 纯函数 `components/readerFollow.ts` + 单测；打开/换书瞬时、跨章平滑）；② **挂载线两挂件关于「线的中心」镜像**（线固定、两段等宽且各贴一端 —— 纠正 v1.8 把宽度写成纸宽函数的错；机检含"现场改纸宽，两段宽度一点不变"）；③ **纸给挂件让位**（`--page-w` 唯一定义处，纸与输入栏都读它 —— 修"纸宽调宽时挂件盖住正文"）；④ **左抽屉两格页签关于抽屉几何中心对称**；⑤ **批注输入栏**：底部居中、纯色带边框、**零文字**、宽 = 纸宽×0.9、**自增长 2→5 行封顶转滚动**、**生命周期绑在它的对象上**（选区型随选区消失；笔记型随笔记消失）；⑥ **单击正文高亮 = 看内容（左侧定位）而非改内容**；抽屉笔记行补**「編輯」**（焦点自动落输入区）与**「註」符号**（`body` 非空，区分批注/高亮）；⑦ **右键菜单坐标**（真 bug：书文档坐标当宿主坐标 → 菜单跑到非内容处；`hostOffset()` 逐层累加，旧探针曾把 bug 断言成契约）；⑧ **笔记排序**按阅读先后（`compareNoteOrder` 上收领域层）；⑨ **`F11` = 进入全屏（幂等）**，退出全屏走 `Esc`；**离开阅读器时若仍全屏 → 保持最大化**（新 IPC `win:set-maximized`）。**同时收拢文档**：README 改为"给使用者 + 给开发者"两段式，MAP 只留导航与红线，本文件 §3 压成决策索引、§6 收成快照，`STYLE.md` §10 修订记录压缩成条目（教训搬进 §8.0）。**验证**：`typecheck:all` 四 project 全绿；`npm test` **98 断言**；样式样张 `smoke.cjs` **六条几何机检全绿**；真机 `note` 探针**全 PASS**（含本轮新增：右键点落在纸内、纸不被挂件压住、输入栏宽 = 纸宽×0.9 / 空态两行 / 灌 8 行封顶五行转滚动、选区消失→输入框消失、Enter 提交落库、笔记面板行数同口径、「註」符号、「編輯」带出正文 + 焦点在输入区 + Esc 关闭、重开后自动回挂 span=1）。⚠ **未打包**：发行物仍是 v0.1.15 那次的便携版，v0.1.16~v0.1.19 需下次 `npm run dist` 一并打。⚠ **待真机复看**："退出阅读器保持最大化"（窗口状态，无头探针量不到）+ 本轮所有手感类改动 |
| v0.1.18 | 2026-09-16 | **笔记管理（跨书）落地**：同级功能组件「筆」（不引入分类）；網格/瀑布流两态 + **窗口化**（自实现装箱 + 按列二分，1000 条 DOM 只留 ~42 张）；三态筛选（判据 = `body`，**不是 `kind`**）；右键挂载线菜单；跨书跳转契约（`openReader(editionId, {revealNoteId})` + `readerTarget` tick）；修"样式样张整页黑屏"并把漂移防线写进验收。详情 = `FEATURES.md` §12 / `STYLE.md` §5.10 / `CONTRACTS.md` v0.4.1+v0.4.2；决策索引 = §3。**真机验收：用户当日通过** |
| v0.1.17 | 2026-09-15 | **「书的身份」**：存储从"一库一 `.db`"改为**全应用一个 SQLite 库**；**书库降为组织模式**（收录 holdings）；迁移器 T1（旧 JSON）/T2（多库合并）；**映射库禁导入 + `ScanService` 扫描对账**；`ReadingState` 从书行拆出；`edition_toc` 留位。详情 = `DATA_MODEL.md` §4.2/§6；契约 = `CONTRACTS.md` v0.4.0。⚠ 真机验收还剩一小块（多库同一本书的笔记是否真共享、扫描手感） |
| v0.1.16 | 2026-09-14 | **笔记/划线落地（文字类优先）**：`domain/anchor.ts`（选区级锚点两层 Norm + Fragment，先 Fragment 后 Norm 出 exact/strong/weak）；笔记 CRUD 全链路（store → IPC → 适配器）；引擎原语 `getSelectionAnchor`/`resolveAnchor`/`remeasureAnchor`/`clearSelection`；**右键 = 标记/批注主入口**；`NoteComposer` + `NotesPanel`；高亮生命周期（每章 `rendered` 后重挂）；引入 **vitest** + 分层依赖守卫。详情 = `CONTRACTS.md` v0.3.12；kookit 三处静默坑 = `KOOKIT.md` §5 #13/#14/#15 |
| v0.1.15 | 2026-09-13 | **首个打包发行版（免安装便携版）**：无边框窗口 + 自绘标题栏；挂载线实体；阅读器沉浸态；沉浸全屏；键鼠意图层骨架；iframe 事件桥；离屏封面/元数据解析；SQLite 单库 + 迁移器（用户实机 327 本）；多书库 + 書庫管理；书库双模式（映射/自建）+ 资源管理器式层级浏览；书/書箱移动全量交互；书架三则（全局禁选 / 层级后退前进 / 面包屑根固定）。**真机验收通过**（全局禁选 ✓ 侧键 ✓） |
| v0.1.13 · v0.1.14 | 2026-09-12 / 09-13 | 已 tag **从未单独打包**，内容随 v0.1.15 一并交付：窗口与阅读器交互大版本（自绘标题栏 + 全局搜索栏、挂载线实体、意图层骨架、离屏解析、书库窗口化渲染）+ 阅读器交互三则、沉浸全屏、iframe 桥、分页滚轮、PDF 改纸宽原地重开、SQLite 单库落地 |
| v0.1.8 ~ v0.1.12 | 2026-09-08 ~ 09-11 | 书库重做（两视图 + 状态栏 + 详情抽屉 + 移除语义 + 封面管线 + 文字封面）→ 架构审查修复与交互细化 → 书库交互收口 → **渲染层风格基线落地**（`STYLE.md` 立项、文字优先、负片、抽屉平面重做、样式样张）→ **阅读器沉浸态收官**（桌/纸、零控件、2px 滚动条、挂载线目录、右侧参数面板）。逐条见 git log 与 `STYLE.md` §10 |
| v0.1.0 ~ v0.1.7 | 2026-08-31 ~ 09-08 | 骨架（electron-vite + React + 六边形目录）→ 渲染适配器 + 无头验证 → PDF/pdfjs → **定位系统立约** + 渲染链路闭环 → 本地阅读 MVP（书架增删 / 目录跳转 / 位置落库）→ 一致性修复（位置事件 / leaveRoom）→ **功能组件标准容器 + UI 交互流** → 本地阅读器修复批（滚动位置补录、落位置、并发守卫、JsonStore 串行化、dev 自检独立） |

### server

| 版本 | 日期 | 内容 |
|---|---|---|
| v0.2.0 | 2026-08-31 | 房主删房 + 测试组织（E2E 独立 `server/test/e2e/` 黑盒）+ HTTP 服务模型文档 |
| v0.1.0–v0.1.6 | 2026-08-27~29 | 房间同步 + Work/Edition 标定（schema v3）+ token 双闸 + 传输基本功（背压/healthz/优雅关停）+ 空房间 TTL + 房间发现 + TOML 配置/热重载 + 聊天室（schema v4）+ 转发规范 + owner_token / 按 IP 签发成员 token（schema v5）+ OPS 手册 |

## 5. 环境 / 沙箱事实

- 本地代理 `127.0.0.1:7897`（Clash Verge rev）；npm registry 直连；GitHub 直连被墙（走代理 + OpenSSL）；`curl.exe` 不可用
- go 沙箱下 telemetry 报错是噪音；`GOPROXY=https://goproxy.cn,direct`；`go build` 把 GOCACHE 指到工作区
- 测试：`go test ./...`（白盒在源码旁）+ `server/test/e2e/`（黑盒走 HTTP/WS）
- **跑碰 better-sqlite3 的临时探针**：原生模块是 **electron-v130 ABI**，系统 Node（v24）`require` 会
  `ERR_DLOPEN_FAILED` → 用 `client/node_modules/electron/dist/electron.exe <脚本.cjs>` 跑；
  **Windows 下 Electron 的 stdout 抓不到**（GUI 子系统）→ **结果写文件再读**；脚本末尾 `app.quit()`
  会打一条 `platform_channel.cc Check failed: 拒绝访问` 的 FATAL 噪音（**文件已写完，不影响结论**）。
- ⚠ **受限文件沙箱下**：`npm test` / `npm run dev` / 任何探针都经 esbuild 管道 stdio 或 Electron Mojo
  命名管道 → **必然 `EPERM` / FATAL**，需在放宽模式下跑；`TUREAD_USER_DATA` 要落在工作区内。
- kookit 子模块的 `CLAUDE.md` 规则：**禁止在其仓库内 git commit / push**

## 6. 交接快照（2026-09-17 · **client v0.1.19 + 房间聊天室（v0.4.3）待验收**）

> **本轮（2026-09-17）用户指示**："专注 TuRead client，今天将会进入 0.2.0 —— 临时暂停其他一切功能开发，
> 直接上线房间功能，为阅读器增加一个生命周期归属于房间的聊天室，与参数调整控件对应；
> **房间同步的所有功能都直接参照于服务器相关文本以及纪律**"。
> **版本口径（用户当场定）**：功能做完 → 用户**验收之后**再滚 0.2.0；**不打包**。
> 故本轮**已提交但未滚版本、未打 tag、未打包**，`client/package.json` 仍是 **0.1.19**。

**★ 本轮落成（未滚版本；契约 = `CONTRACTS.md` v0.4.3，视觉 = `STYLE.md` §5.8 v1.12）**
1. **房间同步首次与真实 server 打通**（这是"房间是半成品"的直接根因）：服务器 WS **握手就要 `?room=&nick=`**
   （`transport/ws.go`，缺任一/昵称 >12 字直接关连接），而客户端旧模型是"先连一条通用连接、再发 room.join"
   → 在服务器上根本走不到 join。现改成**按房间建连**：`connect` = 只领成员 token，`openRoom/closeRoom` = 房间连接。
2. **阅读器聊天室**：挂载线**右段两格**「閱讀參數 / 聊天」（与左段目錄/筆記同构），
   **只在经房间进入的那本书上有这一格**；消息与「房间」组件的会话视图**同一份**（`features/roomSession.ts`）；
   `c` 键 = 聊天这一面。形态逐字依据见 `STYLE.md` §5.8 新增行。
3. **协议词汇收拢** `core/domain/protocol.ts`（type 常量 / **reason 容错归一** / 昵称约束 / 握手地址 /
   历史路径 / 聊天合并 + 15 条单测）—— 起因是**实测的服务器/文档偏差**：服务器下发的是
   `"book mismatch"`（空格分词），旧客户端按连字符精确匹配 → "书不匹配"被静默降级成 server-error。
4. **顺手关掉的旧账**（`TODO.md` 同步组已销案）：join 握手 10s 超时 / pendingJoin 单槽覆盖 / post 失败仍续连 /
   REST 无超时 / `emitLocation` 绕过节流 / `JoinResult` 两处重复 / 协议形状散落。
5. **验证**：`typecheck:all` 四 project 全绿；`npm test` **113 断言**（+15）；样式样张 `smoke.cjs`
   **八条几何机检全绿**（新增 `chatDrawerOk` / `noRoomTabsOk`）；**真机房间探针对真 server 16 条断言全 PASS**。
   ⚠ 服务器侧两处**未修**（本轮只做客户端）：reason 字符串与 `API.md` 不一致、`POST /rooms` 的 `owner` 昵称无长度校验
   —— 均已按"契约先行"登记 `TODO.md` 同步组，**答复见下面「人类开发者提问」**。

**★ 人类开发者在 server 代码里留的提问（`internal/room/manager.go` 的注释）**
> "我是人类开发者，你如果读到这里记得回复我的问题：**似乎房间没有做出名字长度限制？**"

**答复**：**房间没有"名字"这个字段**（房间只有 8 位 hex 号 + 绑定的 edition；大厅里显示的 `title` 是
`work.title`，即书的名字），所以不存在"房间名长度限制"。**昵称**的长度限制**存在**，但**只在 WS 握手**：
`transport/ws.go:24` `maxNickLen = 12` + `:114` `utf8.RuneCountInString(nick) > maxNickLen` → 直接关连接
（有测试 `TestNickLengthLimit`）。**缺口在建房这条路径**：`POST /rooms`（`rest.go:60` 只校验 `owner != ""`）
→ `RegisterUser(ownerToken, req.Owner, role)` 把 **任意长度**的昵称写进 `users.nick`；后果是**建房者自己
之后 WS join 会被握手拒绝**（超长昵称 → 关连接 → 进不去自己的房）。处置建议 = 把 `handleCreateRoom` 的
`owner` 与 `ws.go` 用**同一判据**（rune 数 ≤12）并同步 `API.md`「用户」一节；已登记 `TODO.md`。

**工作区状态**：client 本轮改动**已提交** —— `feat(client)!: 房间功能上线——阅读器聊天室 + 房间同步对齐服务器文本（契约 v0.4.3）`
（**未打 tag**、未打包）；`client/package.json` = 0.1.19。
⚠ 交接时用 `git log -1` 取确切 hash：**别把 hash 写进这个文件**（自引用哈希每 amend 一次就过期，已踩过一次）。
⚠ **server 侧三处未提交改动来源不明**（`cmd/server/main.go`、`internal/room/manager.go`、`internal/store/store.go`
—— 其中 `manager.go` 就是上面那条提问所在），**本轮未动 server**，下次动 server 前先与用户确认。
kookit 子模块的 `m` 是其自身工作树噪音，**勿动**。
**发行物**：`client/release/` 里仍只有 v0.1.15 那次便携版；v0.1.16 起**全部未打包**（用户定：打包另派 agent）。

**★ 下一步（按建议优先级；唯一待办清单在 `TODO.md`）**
1. **等用户验收本轮房间聊天室** → 通过后滚 **client 0.2.0** + `client-v0.2.0` tag（打包仍另说）。
   真机复看清单：右抽屉两格切换 / `c` 键 / 自动滚到底是否打断上翻 / 长消息下遮罩是否太淡 /
   输入框自增长 / 加入→自动跳阅读器后聊天是否就在那儿 / 离开房间后页签确实消失。
2. **服务器侧两处对齐**（`TODO.md` 同步组前两条）：reason 字符串、`POST /rooms` 昵称长度校验。
3. **多人场景补验**（`TODO.md`）：presence "除发送者外"广播、成员离开、双人位置 diff —— 探针目前是单连接。
4. 之后回到既有主线：笔记内容导出 / 划线样式 / 交互模式大改 / 阅读时间专题 / PDF 翻页专题 / 旧账。

**验证工具链（回归全靠它们；口径：单测验判据、探针验链路）**
- **`npm test`** = 纯逻辑单测（**113 断言**：anchor/location 语义 + `compareNoteOrder` + `readerFollow`
  + `noteLayout` 14 + **`protocol` 15（v0.4.3 新增）** + 分层守卫 + 迁移/双队列）。秒级、无需书。
- **`npm run typecheck:all`** = 四个 tsconfig（node / web / test / **preview**）。
  ⚠ **preview 覆盖样式样张 —— 改数据层或组件 props 后必跑**（"样张整页黑屏"就是漏跑它）。
  ⚠ `tsconfig.test.json` **不设 `jsx`** → 纯 `.ts` 不能 import `.tsx` 的类型（数据形状要住纯模块里）。
- **样式样张**：`npm run style` 起样张；另开终端
  `node_modules\electron\dist\electron.exe tools\style-gallery\smoke.cjs [url] [--scale=N] [--no-window]`
  → 判据 = 有面板 + 有文字 + **无页面错误** + 笔记卡片高度多档 + **八条几何机检**
  （`mirrorOk` / `widthIndependentOk` / `paperClearOk` / `tabsSymOk` / `followedOk` /
  **`chatDrawerOk` / `noRoomTabsOk`（v0.4.3 新增）** / `composerOk`；逐条条件见 `STYLE.md` §8.0）。
  ⚠ 探针的**假数字/假绿**比 FAIL 更危险：`--scale` 会自检计时环境（空闲 rAF > 60ms 直接 FAIL）；
  样张里**受控组件必须自己持有 state**；模板字符串里**不能写反引号**（改完先 `node --check`）。
- **真机探针**（都需要 `TUREAD_USER_DATA=<独立目录>`，**别碰真实书库**）：
  - `TUREAD_DEV_BOOK=<书>` 单跑 = 渲染自检（四格式；输出 `[TUREAD-TEST-OK]`）
  - `TUREAD_DEV_PROBE=library` = 多库/書箱/**笔记读模型**探针
  - `TUREAD_DEV_PROBE=note` = **笔记/划线全链路**。⚠ 样书首章是纯图片扉页，探针会自动逐章找有正文的章；
    它**最多连试两轮重开**，180s 会被吃满 → 可用 `TUREAD_DEV_TIMEOUT_MS` 放宽（排障用）。
  - **`TUREAD_DEV_PROBE=room`（v0.4.3 新增，唯一"要真 server"的探针）**：会话 → 建房 → **按房间握手** →
    标定 → 聊天回执 → 空文本不落库 → 历史 REST → 离房断连但历史仍在 → 再进房预载 → 共享会话态登记/复位
    （**16 条断言**）。需要 `TUREAD_DEV_SERVER`（默认 `http://127.0.0.1:8080`）与 `TUREAD_DEV_ACCESS`；
    服务器侧建议用**一次性 data 目录**（`TUREAD_ADDR=:8099` + `TUREAD_DATA_DIR=$env:TEMP\...`），
    别拿入库的 `server/data/turead.db` 做探针。⚠ 负向断言（"未进房间时 send 必失败"）会在 Electron 日志里
    留一行 `Error occurred in handler for 'net:send'` —— **那是预期的**，不是失败。
  - `TUREAD_DEV_PROBE=paged-interact` / `pdfWidth` = 单页交互 / PDF 纸宽量化（无产品断言，看事实行）
  - `TUREAD_DEV_SQLITE=1` = 原生模块 spike；`TUREAD_DEV_BOOK` **打包产物**跑自检不自退（已知问题，见 TODO）
- 换 Electron 版本后 `npm run rebuild:sqlite`；打包走代理（`NETWORK.md`）。
- **发行版冒烟**（**打包之后**才做；`release/win-unpacked/` 由打包产出，未打包时该目录不存在）：
  独立 userData 起 `release/win-unpacked/TuRead.exe` → 应落盘 `config.json` + `store.db` +
  `covers/<editionId>.jpg`（导入→封面→落库整链成立）。

**旧账状态（唯一一条会干扰探针的）**：「**重开书偶发空白**」——"关书 → 重开"后 iframe 数为 0、无任何报错，
`note`/渲染自检都复现过（历史 ~1/4，2026-09-16 多次连试两轮全灭）；**还见过一次"半成功"**
（新 iframe 出来了但渲染侧未就绪：手工 `renderHighlighters` 被"当前节"过滤到 0 条、笔记面板空）。
⚠ **探针分段已重排（v1.9）**：只有"重开后自动回挂"一条依赖重开 → 命中时**只损失它自己**，
不再整段跳过（旧写法让 10 条断言陪着消失 = 假绿）。真实根因候选仍见 `TODO.md` 同名条目。

**待真机复看（探针证不了手感/窗口状态）**：① **退出阅读器保持最大化**；② 输入栏自增长手感；
③ 抽屉「編輯」的 hover 显形；④ 挂载线两段与纸的观感（尤其窄窗口下纸被夹窄）；
⑤ v0.1.17 遗留（多库同一本书的笔记/进度是否真共享、映射库扫描手感）；
⑥ **本轮聊天室的六项**（见上「下一步」第 1 条与 `TODO.md` 的"待真机复看"条目）。

**关键对象速查**：`LibraryManager`（引导文件 + store 句柄）｜`SqliteStore`（**全应用一个全局 `.db`**，
close 后可 init 重开）｜切库信号 = main 广播 `store:library-changed`；⚠ **`store:*` 不再"打到当前库"**
（库是库内实体，涉及收录/书箱的调用显式带 `libraryId`）｜**契约版本 v0.4.3**（`CONTRACTS.md` §8）｜
笔记链路：`domain/anchor.ts`（锚点纯函数权威）｜`TextAnchor` 二层（Norm + Fragment）｜
`components/readerFollow.ts`（跟随判据 + 落点，纯函数 + 单测）｜`components/noteLayout.ts`（笔记流几何）｜
适配器 `renderedChapter`（高亮回显的过滤依据）｜`hostOffset()`（iframe→宿主坐标，逐层累加）｜
`context-menu` / `note-clicked`（适配器在**书文档**上听，UI 收）｜`readerTarget`（「带目标打开」载荷，tick 防重复消费）｜
`win:set-maximized`（退出阅读器时"全屏 → 最大化"）。
**房间链路速查（v0.4.3）**：`domain/protocol.ts`（**协议词汇唯一解释处**：type 常量 / reason 归一 /
昵称约束 / 握手地址 / 历史路径 / 聊天合并）｜`INetService.openRoom/closeRoom`（**按房间建连**；
`connect` 只领 token）｜`IRoomSession`（`chat-history` 事件 + `listMessages` + 10s join 超时 + 重连重发 join）｜
`features/roomSession.ts`（**渲染层共享会话态**：房间组件与阅读器聊天室同一份）｜
`components/ChatPanel.tsx`（右抽屉第二格；`.toc-list--right`）｜`ReaderRail` 的 `rightPanel` / `rail-tabs`｜
`dev/roomProbe.ts`（**唯一要真 server 的探针**）。
