# 项目状态与决策记录（会话交接）

> **本文件的职能（三件）**：① **交接快照**（现在在哪 / 下一步 / 怎么验）；② **决策索引**
> （一行一条，指向权威文档）；③ **版本历史**。**不承载**具体的视觉/契约/数据规则 ——
> 那些的归属是 `client/docs/{STYLE,FEATURES,CONTRACTS,DATA_MODEL,KOOKIT,RENDER_INTERFACE}.md`。
> 阅读顺序：本文件 → [`MAP.md`](../MAP.md)（自动加载）→ [`TODO.md`](../TODO.md) → 各端架构文档。
> 逐版过程明细随 git 历史（annotated tag + 提交消息）留存，本文件只留定位用的要点。

## 1. 一句话

TuRead = **多人房间共读阅读器**：多个用户进入同一房间，共同阅读同一本书。
渲染/解析复用 [kookit](https://github.com/koodo-reader/kookit)（AGPL-3.0，git submodule）；
同步服务器用 Go，**v0.2.0 已实现**（`server/`）；**client v0.2.0**。
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
  `package-lock.json` / 本文 §4 / `MAP.md` / `README.md` + 打 tag。产物（便携版 exe）不在此列。
- 网络配方（git 代理 + OpenSSL、Go `GOPROXY=goproxy.cn`、npm 直连、打包代理）见 `D:\PROJECT\NETWORK.md`

## 3. 已定决策（**索引**：一行一条 + 权威位置；细节不在这里重复）

| 决策 | 一句话 | 权威 |
|---|---|---|
| 架构选型 | client = 六边形（端口-适配器）+ DDD 命名；server = 简单分层（非六边形） | `client/docs/ARCHITECTURE.md` §1；`server/docs/ARCHITECTURE.md` §5 |
| 定位系统 | `BookLocation` 三级角色（key/hint/display），原语收拢进 `core/domain/location.ts`，任何组件不得自行解释位置字段 | `CONTRACTS.md` §2.1 |
| 书籍标定 | Work/Edition 两层；Work 不设 author/publisher；`content-hash-v1` + `md5-sample3-v1` | `docs/ARCHITECTURE.md` §1 |
| 认证 / 房间 / 聊天室 / 同步边界 | token 双闸（无账号密码）；房间定义落库 + 运行时纯内存（空房 TTL 12h）；聊天随房间级联；**只同步 BookLocation 与聊天**，笔记/划线 v1 明确排除 | `server/docs/{ARCHITECTURE,API}.md` |
| **房间连接模型（契约 v0.4.3）** | **连接粒度 = 房间**：`connect` = 只领成员 token（不建 WS），**进房间才 `openRoom`（握手带 `?room=&nick=`）**、离房即 `closeRoom`；大厅/建房/聊天历史走 REST；断线重连后**重发 join** + `after=` 增量补拉 | `CONTRACTS.md` §4.2/§5.1；`server/docs/API.md`「WebSocket」 |
| **阅读器聊天室（用户定）** | 挂载线**右段两格**（`閱讀參數 / 聊天`，与左段目錄/筆記同构）；聊天**只在经房间进入的那本书**上存在；消息由渲染层共享态统一持有（房间组件与阅读器同一份）；**生命周期归属于房间** | `STYLE.md` §5.8；`FEATURES.md` §11；`features/roomSession.ts` |
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
| PDF 纸宽填充 + 单页交互 | PDF 改纸宽 = **原地重开**（kookit PdfRender 无重排入口）；单页模式交互两处真根因（嵌套 iframe 桥盲区、点击带滚轮死区）已修；**PDF 滚动模式 = 页卡流** + **PDF 专属纸宽档位**（`readerWidthPdf`）；暗色 = 开书时逐像素烘焙（`bakeDarkModePixels`，口径 = 原 CSS filter 精确复算） | `kookitRenderAdapter.ts`；`client/docs/KOOKIT.md` §7 |
| iframe 事件桥 | 键盘/滚轮落在书文档里到不了宿主 → `components/iframeBridge.ts`（同源 iframe 挂同一套监听，**按键只看界面不看焦点**）；分页模式滚轮翻页 | `iframeBridge.ts`；`useKeyIntents.ts` |
| **右键菜单坐标（真 bug 修复）** | 适配器曾把**书文档的 `clientX/clientY`** 当宿主坐标发出 → 菜单出现在非内容处；现由 `hostOffset()` 沿 `frameElement` 链**逐层累加**。⚠ 旧探针曾把 bug 断言成契约，已纠正 | `kookitRenderAdapter.ts`；`dev/noteProbe.ts` |
| 全局禁选 | **文字选择 = 阅读正文专属**（宿主 UI 一律不可拖选，`input/textarea` 豁免） | `styles.css`；`FEATURES.md` §10/§11 |
| 书库层级后退/前进 | 对齐资源管理器：鼠标侧键 + 标题栏按钮；历史栈条目含**面包屑整条**；模块总线 `libraryNavBus` 跨兄弟组件 | `LibraryFeature`；`libraryNavBus.ts` |
| 渲染内核可替换性 | kookit 整体封装在 vendor ESM 容器内，UI/应用层**只经端口**触达 → 换内核 = 重写适配器层 | `KOOKIT.md`；`CONTRACTS.md` §4.1 |
| 主题色取向 | 四套：纯色·深/亮（黑灰白，不引入色相）+ 羊皮纸·深/亮；状态色保留语义色相 | `styles.css`；`STYLE.md` §3.4 |
| 抽屉平面结构 | 封面 2:3 不拉伸；三行 = 封面高度三等分；标题/数据行单行；指标行无标签；外壳全透明 | `STYLE.md` §5.5 |
| 样式效果确认方式 | 浏览器**样式样张**（`npm run style`）+ 无头机检（`smoke.cjs`）；排版类最终仍要在 Electron 内复核 | `tools/style-gallery/README.md`；`STYLE.md` §8.0 |
| **发行版范围与形态** | **只出 64 位 Windows**；当前形态 = **免安装便携版**（NSIS 暂不出，配置留着备用）；打包关掉原生重建、排除 pdfjs 的 `canvas`。⚠ **打包由用户明确指示后才做**（见 §2） | `electron-builder.yml`；`README.md`；§2 |
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
| **v0.2.0** | **房间功能上线**：按房间建连（根因修复：服务器 WS 握手就要 `?room=&nick=`，旧模型走不到 join）+ 阅读器聊天室（右抽屉两格）+ 协议词汇收拢 `core/domain/protocol.ts`（reason 容错归一）+ 无书成员加入（契约 v0.4.4）。真机探针 16 断言全 PASS；**用户双开验收通过**。⚠ 未打包 |
| （未滚版本） | `client-v0.2.0` tag 之后 5 个已提交 commit：**PDF 专项**（滚动渲染调度去阻塞 / 暗色逐像素烘焙 / PDF 专属纸宽 / 页卡边缘）+ 两批代码审查修复（数据丢失竞态 / 全屏状态机 / 静默 no-op / 风格回归）+ 临时审计第一批（A-1/A-2/B-1/B-5/C-3） |
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
- kookit 子模块的 `CLAUDE.md` 规则：**禁止在其仓库内 git commit / push**

## 6. 交接快照

**当前位置**：`client-v0.2.0` tag 之后有 **5 个已提交未滚版本的 commit**（PDF 专项 + 两批审查修复 +
审计第一批），**未滚版本、未打包**（发行物仍是 v0.1.15 的便携版；打包另派，见 §2）。
**当前重心 = PDF 优化 + 阅读滚动/连续的手感**：渲染调度改造已落地（`KOOKIT.md` §7），**待真机复看**；
翻页/点击区/滚轮阈值等交互口径留「PDF 翻页交互重做」专题（`TODO.md`）。

**待办（唯一清单 = `TODO.md`）的建议顺序**：
1. **服务器侧两处对齐**（TODO 同步组）：reason 字符串、建房昵称长度校验。
2. **审计遗留**（TODO 审计组）：B-3 / C-5 随手批先行；B-2 是跟随模式的前置。
3. **多人场景补验 + 正式的多端身份方案**。
4. **无书成员的 UI 入口**（用例层已就绪，缺产品形态）。
5. 回到主线：PDF 暗色烘焙竞态与深底不反转（修法均已定）、翻页交互专题、交互模式大改、笔记导出/划线样式。

**验证工具链（回归全靠它们；口径：单测验判据、探针验链路）**
- **`npm test`** = 纯逻辑单测（anchor/location 语义 + `compareNoteOrder` + `readerFollow` + `noteLayout`
  + `protocol` + 分层守卫 + 迁移/双队列 + RoomSession 首批）。秒级、无需书。
- **`npm run typecheck:all`** = 四个 tsconfig（node / web / test / **preview**）。
  ⚠ **preview 覆盖样式样张 —— 改数据层或组件 props 后必跑**（「样张整页黑屏」就是漏跑它）。
  ⚠ `tsconfig.test.json` 不设 `jsx` → 纯 `.ts` 不能 import `.tsx` 的类型（数据形状要住纯模块里）。
- **样式样张**：`npm run style` 起样张；另开终端
  `node_modules\electron\dist\electron.exe tools\style-gallery\smoke.cjs [url] [--scale=N] [--no-window]`
  → 判据 = 有面板 + 有文字 + 无页面错误 + **八条几何机检**（`mirrorOk` / `widthIndependentOk` /
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

**待真机复看（探针证不了手感/窗口状态）**：① 退出阅读器保持最大化；② 输入栏自增长手感；
③ 抽屉「編輯」hover 显形；④ 挂载线两段与纸的观感（尤其窄窗口）；⑤ 多库同一本书的笔记/进度共享、
映射库扫描手感；⑥ **聊天室的手感**（自动滚到底 / 长消息遮罩 / 输入框自增长 / `c` 键）；
⑦ **PDF 滚动调度的手感**（本轮重心）。

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
`components/ChatPanel.tsx`（右抽屉第二格）｜`ReaderRail` 的 `rightPanel` / `rail-tabs`｜
`dev/roomProbe.ts`（唯一要真 server 的探针）。

**工作区注意事项**：kookit 子模块的 `m` 是其自身工作树噪音，**勿动**（清理项见 `TODO.md` 审计组）；
动 server 前先与用户确认工作树里来源不明的改动（`TODO.md` 审计组有登记）。
