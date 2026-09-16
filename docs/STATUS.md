# 项目状态与决策记录（会话交接）

> 目的：让下一次会话/模型以最低成本恢复上下文。
> 阅读顺序：本文件 → `MAP.md`（自动加载）→ `TODO.md` → 各端架构文档（见 MAP）。
> 更新：2026-09-16（**client v0.1.18：笔记管理（跨书）落地** —— 「工具组件」= 同级功能组件的第二例：
> 读模型 + 網格/瀑布流两态 + **窗口化**（自实现装箱 + 按列二分）+ 状态栏/右键/複製/跳转全链路；
> 期间修掉**样式样张整页黑屏**并把漂移防线写进验收；⚠ 一处**测量假象**（rAF 被节流）已纠正并加了自检。
> 逐项见 §4 的 v0.1.18 条目；**真机验收：用户当日通过**）。
> 上一条 2026-09-15（client v0.1.17：「书的身份」落地 —— 全局单库 + 书库降为组织模式；逐项见 §4）

## 1. 一句话

TuRead = **多人房间共读阅读器**：多个用户进入同一房间，共同阅读同一本书。
渲染/解析复用 [kookit](https://github.com/koodo-reader/kookit)（AGPL-3.0，git submodule）；
同步服务器用 Go，**v0.2.0 已实现**（仓库内 `server/`）；**client v0.1.18**。

## 2. 仓库与提交（`D:\PROJECT\TuRead`）

- git 仓库：本地 `main`，`origin = https://github.com/maokichan/TuRead.git`（独立仓库，非 fork）
- 结构：`client/`（Electron 客户端）｜`server/`（独立 Go module）｜`kookit/`（submodule，HEAD `6e18465`）｜`docs/`｜`TODO.md`
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
| 客户端样式 | **Tailwind CSS v4 已落地（2026-09-08）**：`@tailwindcss/vite`；`styles.css` 仅留主题语义 token / 全局 base / kookit 契约；MIT 已核 | `client/docs/FEATURES.md` |
| 渲染层风格（2026-09-09 定，**准则**） | **文字即界面**：动作/导航/选项一律文字（边框仅输入类与浮层）；**全局统一字体**（西文 Times New Roman + 中文源流明體，`--font-ui`，`--mono` 并为同值别名）；**负片（反色块）仅两处**（详情抽屉字段 + 侧边栏选中）；中文排版硬规则（混排/标点/段距）；层级靠排版不靠颜色 | `client/docs/STYLE.md`（MAP §13，渲染层开发先读） |
| 抽屉平面结构（2026-09-09 定） | 封面 **2:3（64×96）不得拉伸**；三行 = 封面高度三等分（各 32px）；标题/数据行**单行**（`Marquee` 超出才滚）；数据行含格式·大小·导入时间·**文件路径**；指标行无标签（已读 42% / 3 天前 / 共 —）；外壳**完全透明** | `client/docs/STYLE.md` §5.5 |
| **阅读器沉浸态（2026-09-11 定稿 v0.4~v0.8）** | **全屏的是「桌」不是正文**（桌 `--desk-bg` / 纸 `--page-bg` + 1px `--page-edge` 边，**靠颜色区分**）；正文 = 居中定宽「纸」+ 纸内边距；**阅读页零控件**（退出 `Esc`；**浮动出来的栏同样是状态栏**）；滚动条 2px 且短章节整条隐藏；**阅读态侧边栏覆盖式**（打开左侧菜单不影响阅读器宽度；⚠ 只给阅读态，理由与将来的扩展方式见 `AppShell.tsx` 注释）；目录 = 挂载线 + 垂挂列表（容器全透明、遮罩按鼠标距离高亮且远端保持静息、默认展示、点条目不收起）。规则见 §5.8，逐项改动见 §4 v0.1.12 | `client/docs/STYLE.md` §5.8；`FEATURES.md` §11 |
| **阅读参数分工（2026-09-11 v0.3.3 定）** | **宿主几何走 CSS 变量**（纸宽 `--read-width` / 内边距 `--page-pad-x` —— kookit 的排版宽度读宿主 `clientWidth`，给宿主加 padding 会对不上）；**正文排版走注入**（字号/行距/段距 → `applyTypography` → kookit `setStyle`，一次注入全书生效）；**字段缺省 = 不注入**（尊重书自带排版）；数据层存 **px 数值**不存档位名。**高频参数入口 = 阅读页右侧可召唤面板**，低频（布局模式）留设置页 —— 频率表见 §5.9 | `client/docs/CONTRACTS.md` §2/§4.1；`STYLE.md` §5.9 |
| 样式效果确认方式（2026-09-09 定） | 浏览器**样式样张**（`npm run style`，`client/tools/style-gallery/`）—— 只导入真实组件与真实 token，不启动 Electron；排版类最终判定仍需在 Electron 内复核（CJK 特性依赖 Chromium 版本） | `client/tools/style-gallery/README.md` |
| **发行版范围与形态（2026-09-11 定范围；2026-09-14 用户定形态）** | **只出 64 位 Windows**，不出 mac/linux；**当前出免安装便携版**（用户 2026-09-14 定："不是正式版本，给免安装版本最好"）——`npm run dist` → `client/release/TuRead-<version>-win-x64-portable.exe`（免安装自解压单体，双击即用）+ `release/win-unpacked/`（同一份应用的目录形态；`release/` 已 gitignore）；**NSIS 安装包暂不出**（安装包写注册表/开始菜单/卸载项，属"正式版"语义；配置块留在 `electron-builder.yml` 备用，正式发版时加回 `win.target`）。两条实测约束：① 打包要走本地代理（electron-builder 从 GitHub 拉 Electron 组件，见 `NETWORK.md`；**便携目标不涉 NSIS/winCodeSign 组件，故不受本机代理抖动影响 —— 实测直接成功**）② **关掉原生重建**（`npmRebuild: false`）并把 pdfjs 的可选依赖 `canvas` 排除出包 —— 运行时没有需要编译的原生依赖，而本机缺 cairo/GTK 会直接编译失败 | `client/electron-builder.yml`；`README.md` |
| 插件 | v1 不做插件运行时；ports 即插件边界（官方插件 = 适配器注册进 ServiceContainer） | `client/docs/ARCHITECTURE.md` §4 |
| UI 功能组件（2026-09-08 落地） | UI 按 Feature 划分标准化（Library/Reader/**Room[含 Server 连接]**/Settings + 展示组件 + AppShell 宿主）；**标准容器**：`FeatureDescriptor` + `registry.ts` + `AppShell`（侧边栏=单色符号图标栏 + 主面板宿主，功能常驻挂载/非激活隐藏 → 状态继承，settings 钉置底）；跨功能跳转走 `FeatureHost`（navigate/openReader/closeReader/selectBook/pushLog）；**纯 React 状态 + props**；Tailwind 与拆组件同步迁移；颜色语义 token 标准化（第三方覆盖 token 建主题）；官方插件 = 追加 descriptor 进 registry | `client/docs/FEATURES.md` |
| 书库重做（v0.1.8 起，v0.1.9/v0.1.10 细化） | **去容器外壳** + **两视图**（列表/網格；瀑布流并入）+ **底部状态栏**（文字按钮：左=视图切换单按钮，右=导入；"含子文件夹"在设置里配置）+ 详情抽屉（**只在内容区弹出**）+ 移除=**只删索引不删源文件**（首次确认可勾不再提示）+ 封面**缩略图落盘** + 文字封面（`FittedTitle` 撑满） | `client/docs/FEATURES.md` §10 |
| 主题色取向（2026-09-08 定，**四套**） | **暗色/亮色**一律黑灰白（不引入色相；高亮=灰阶两端）+ **羊皮纸·亮 / 羊皮纸·暗**（同一暖棕取向的明暗两版）；状态色（ok/warn/err）保留语义色相 | `client/src/renderer/src/styles.css` |
| 书籍身份模型（2026-09-08 定术语） | **作品身份**（Work：`protocol` + `code`，如 ISBN）＋ **电子版身份**（Edition：`fingerprint`）；**标准化** = 补齐作品身份（入口在房间功能，短期手填、远期 OCR）；**标定** = 加入房间时的**比对**动作。本地**不采集/不显示** author·publisher（与 server Work 模型一致） | `docs/ARCHITECTURE.md` §1 |
| 跨层改动授权（2026-09-08） | 书库重做等改动**允许修改应用层与领域层**（前提：不违背六边形依赖规则、契约文档先行） | — |
| 许可 | kookit AGPL-3.0 → TuRead 以 **AGPL-3.0** 开源；引入新依赖**先核许可证与 AGPL 兼容性**（不逐依赖登记）。**发行物缺件（LICENSE / OFL 全文 / 第三方声明随包）登记在 `TODO.md`** | `TODO.md` |
| **发版节奏（2026-09-13 用户定）** | **功能确定后即滚版本号 + 出 release**（不再把多个版本的改动长期堆在"已提交未发版"状态）：本机 `npm run dist`（走代理，见 `NETWORK.md`）→ 便携产物（见上一条）+ `client-v<version>` annotated tag。版本号滚动仍由用户决定（见 §2），agent 按指示执行并同步 `package.json` / `package-lock.json` / 本文 §4 / `MAP.md` / `README.md` | `client/electron-builder.yml`；`docs/STATUS.md` §2/§4 |
| 仓库形态 | 单仓库 monorepo（server 可零成本拆出） | `docs/ARCHITECTURE.md` §2 |
| 开发原则 | **解释优先**；大改前写理由（Rule of Three） | — |
| 跳转历史（2026-09-09 群聊定案） | **行动树驳回**：注释/跳转会打断线性阅读，但人的体验归根结底是线性的 → 跳转历史用**状态机**（前进/后退栈，undo/redo），不做"世界树/时间树"树状可视化；随笔记/划线落地后实施 | `TODO.md` client；`client/docs/FEATURES.md` §9 |
| **无边框窗口 + 自绘标题栏（2026-09-12 用户定）** | `frame:false`，不用系统控制键——自绘 min/max/close（主题 token，关闭 hover = `--err` 负片；`win:*` IPC 走 `ipcMain.handle`）。标题栏内嵌**全局搜索栏**（绝对定位几何居中；作用域随功能：书库搜书已接线、阅读器搜书内内容/房间搜房间占位待接线；**笔记作用域已于 2026-09-16 定形态、待实施**；Ctrl+F 聚焦、Esc 清空） | `client/src/renderer/src/components/TitleBar.tsx`；`FEATURES.md` §11 |
| **挂载线实体（2026-09-12 用户定，二次纠正定稿）** | 目录（左）与阅读参数（右）同处**一条横向挂载线**：线**延伸整个页面宽度、被书页压着**（纸列 z2 建层，横线仅左右留白可见）；左段可点 = 目录开合，右段可点 = 参数开合，参数面板底部「折疊」与目录同款；**折叠 = 向上收回线里**；参数内容中间对齐、**低透明度 = 遮罩按鼠标距离**（与目录同款，废静态灰字）。原右侧独立召唤条与面板内「收起」废除 | `client/src/renderer/src/components/ReaderRail.tsx`；`STYLE.md` §5.8 |
| **键鼠意图层机制（2026-09-12 骨架落地）** | 键盘 = **意图**：`core/domain/input.ts` 纯函数绑定表（normalizeKey/resolveIntent/**assertNoConflict 一键一意**）+ `DEFAULT_BINDINGS`（先原样收拢现状键位）+ `useKeyIntents`（ref 装载防过期闭包；**常驻挂载组件必须带 enabled 守卫**）。已迁移：Reader 全部键、TitleBar Ctrl+F。待收编：书库行内键（元素级）、用户自定义表 | `client/src/core/domain/input.ts`；`client/src/renderer/src/components/useKeyIntents.ts` |
| **数据存储 v3（2026-09-15 批复，取代 2026-09-12 的 v2）** | **全应用一个 SQLite 库 = 一份用户数据**：作品/电子版/收录/书库/书箱/笔记/阅读状态/设置全在一个 .db；JSON 只剩**引导文件**（`{version, dbPath, 窗口状态}`）。**书库 = 组织模式（非物理分区）**，成员关系 = **收录（holdings）**；同一内容可被多库收录 → **跨库共享天然成立**。**笔记挂 edition（各版一份）、阅读时间逐 edition 记录并按 work 汇总**；**设置一律全局**（无库级设置）。⚠ 取代"一库一 .db = 一份书库 / 多书库 = 多 .db" | `client/docs/DATA_MODEL.md` §1/§2/§4.2 |
| **「书的身份」三问一次定案（2026-09-15 用户批复）** | 三问（可见性与追踪 / 笔记身份 / 阅读时间）本质同问 → 一次定案：书库降为组织模式 + 全局单库；**映射库**（跟踪真实文件夹；**移除 = 移除可见性**；**不能在其中加书**，靠**扫描**对账，**监听不作首选**）vs **自建库**；**笔记不自动跨版迁移**（跨版搬运 = 用户主动动作，Pro 候选）；**Work 身份本次只留接口**（阅读时间按 work 汇总的前提）；**Pro 版 = 功能分层、非订阅**（捐赠走爱发电；服务器开源可自建）。术语：**收录 / 映射库 / 自建库**（`mode: 'mapped' \| 'curated'`） | `DATA_MODEL.md` §4.2 D1–D12 + §6；`TODO.md` 文首 ★ |
| **PDF 纸宽填充 + 单页交互核查（2026-09-13 用户定）** | ① **PDF 改纸宽应当填充**（用户定）——kookit PdfRender 渲染时刻定 canvas 像素、无重排入口（`dev/pdfWidthProbe.ts` 量化存档），修法 = **PDF 改纸宽时阅读器原地重开**（`reopenTick` 机制，位置自动恢复；将来 kookit 出重排入口可换轻量路径）② **单页模式交互核查**：无头探针 `dev/pagedInteractProbe.ts`（`TUREAD_DEV_PROBE=paged-interact`）实证 EPUB 单页模式键盘/滚轮/目录三路全部正常（合成事件派发，位置均移动、目录落点精确）——用户报障的两处真根因 = **桥的嵌套 iframe 盲区**（PDF 每页是顶层 iframe 里再嵌的子 iframe，已修：桥递归扫描+递归观察）与**左右点击翻页带的滚轮死区**（已修：滚轮接管上移到整个阅读器区，目录/参数面板让位）。⚠ 若 EPUB 真实鼠标滚轮仍有异常，属原生滚动与翻页的竞态，需用户复现步骤 | `client/src/renderer/src/components/iframeBridge.ts`；`ReaderFeature`；`dev/pagedInteractProbe.ts` |
| **iframe 事件桥 + 分页滚轮翻页（2026-09-13 用户定/实测修）** | **根因**：kookit 正文渲染在 iframe 里，焦点进书页后键盘/滚轮事件落在 iframe document 上，**到不了宿主 window**（文档边界）——实测点进书页后 F11 失灵。修法 = `components/iframeBridge.ts`：对同源 iframe 文档挂同一套监听（MutationObserver 追懒加载章节），按键**只看当前界面不看焦点**（用户定：无状态实现）；useKeyIntents 全量接入 + 输入类目标让位。**分页模式滚轮翻页**同批落地（默认键盘、无按钮控件，滚轮像 koodo 可翻页；留白走宿主 onWheel、正文走 iframe 桥；平滑滚轮累积 + 冷却防连翻；scroll 模式不拦） | `client/src/renderer/src/components/iframeBridge.ts`；`useKeyIntents.ts`；`ReaderFeature`；`FEATURES.md` §11 |
| **沉浸全屏落地 + 模糊立项（2026-09-13 用户定）** | **全屏**：`F11`（意图 `reader.toggleFullscreen`，绑定表收编）+ 设置开关「進入閱讀器時進入全屏」（默认关，`appearance.readerFullscreen`，SettingsFeature 经 patchSetting 写——appearance 键自此改原子合并）= OS 全屏 + 标题栏退场（TitleBar 订阅 `win:fullscreen-changed` 返回 null）；`Esc` 分流（**2026-09-13 用户纠正**：面板是常伴工具，Esc 不收面板）= 全屏→退阅读器；离开阅读器自动还原窗口。新增 IPC `win:set-fullscreen` / `win:fullscreen-changed`（main 于 enter/leave-full-screen 广播）。**模糊（blur）立项**：页面模糊作注意力工具（大状态切换的过渡模糊 + 定向聚焦模糊），实现路径与形态待定项见 TODO | `client/src/main/index.ts`；`shared/ipc.ts`；`ReaderFeature`；`TitleBar`；`SettingsFeature`；`TODO.md` 模糊条目 |
| **阅读器交互三则（2026-09-13 用户定）** | ① **阅读参数面板默认展开**（废 v0.1.12"默认收起"——参数是阅读的常伴工具，不该每次伸手召唤；折叠仍是临时动作，重开书回展示态）② **布局模式从设置页移入参数面板**（滾動/單頁/雙頁，改 = 重开书生效；`readerSettings` 的唯一写者 = 面板，设置页不再写该键）③ **空目录占位**：无目录索引的书也展开目录垂挂区、显示「本書沒有目錄索引」（缺失要可见，不静默）④ **TODO 开设 PDF 专区**（改纸宽不重排/页面旋转/分页模式验证/夜间反相/交互抽查集中登记），**PDF 页面旋转立项**（±90°，修法候选与形态待定见 TODO） | `client/src/renderer/src/components/ReaderControls.tsx`；`STYLE.md` §5.8/§5.9；`FEATURES.md` §11；`TODO.md` PDF 专区 |
| **渲染内核可替换性（2026-09-12 用户提出，架构考量入册）** | kookit（连同 pdfjs 等解析/渲染工具）整体封装在 vendor 单文件 ESM 容器内，UI/应用层**只经端口**（`IRenderService` / `IMetadataExtractor` / `buildKookitConfig` 等收敛点）触达——**未来更换渲染内核 = 重写适配器层，UI/usecases/domain 零改动**。纪律：任何 kookit 专属概念（kookit config 字段、rendition 事件名）不得越过适配器边界上行 | `client/docs/KOOKIT.md`；`client/docs/CONTRACTS.md` §4.1 |
| **全局禁选（2026-09-13 用户定）** | **文字选择 = 阅读正文专属**：除阅读页正文外，宿主 UI 任何内容都不响应按住鼠标拖选（`body{user-select:none}`，`input/textarea` 豁免——更名/搜索/新建命名仍可选中复制）。正文在 kookit iframe（独立 document）内，天然不受宿主规则影响，选择能力原样保留。顺带删除 `LibraryFeature` 内容区原有的局部 `select-none`（被全局覆盖，冗余） | `client/src/renderer/src/styles.css`；`client/docs/FEATURES.md` §10/§11 |
| **书库层级后退/前进（2026-09-13 用户定）** | 对齐**文件资源管理器**逻辑：① **鼠标侧键** XButton1/2 = 后退/前进（仅 `activeFeature==='library'` 接管，`preventDefault` 压掉 Chromium 默认历史导航）② **标题栏返回/前进按钮**，左缘 = `var(--sidebar-w)`（与左侧边栏右缘对齐），只在书库态渲染，不可用禁用（opacity-30）。**历史栈在 `LibraryFeature`**（`histRef` = stack + idx）：条目 = `{containerId, folder, trail}`——**面包屑整条随条目存取**，后退/前进一起还原；`enterContainer`/`enterFolder`/`goToLevel` 全走 `pushEntry`（新导航截断"前进"分支，资源管理器语义），移动/导入等 `commitNav` 是**原地重载、不入栈**；切库广播时历史重置为根。跨兄弟组件用**模块总线** `features/libraryNavBus.ts`（TitleBar 与 LibraryFeature 是 AppShell 兄弟，props 穿 Shell 不值当——`logStore` 先例；TitleBar 以 `useSyncExternalStore` 订阅可用性） | `client/src/renderer/src/features/LibraryFeature/index.tsx`；`features/libraryNavBus.ts`；`components/TitleBar.tsx`；`FEATURES.md` §10/§11 |
| **面包屑根固定（2026-09-13 用户定）** | 状态栏右下角"当前层级路径"：**根（库名）显示位置固定、子节点向右增生**（原实现容器宽度随内容 + `ml-auto`，路径变深时整体左移、根会跑）。实现 = 容器改**固定宽度** `w-[420px]` + `ml-auto`，内容从左往右流 → 容器左缘锚死。⚠ 过长处理**暂不做**（登记 TODO）。顺带修一个分隔符 bug：`/` 原先渲染在根段**之前**（箱内显示「/ 書庫 測試箱A」）会把根推右 → 改 `index > 0` 才渲染 | `client/src/renderer/src/components/LibraryToolbar.tsx`；`FEATURES.md` §10 |
| **笔记管理（跨书）—— 契约 / 视觉 / 窗口化（2026-09-16 定案并实施，发版 v0.1.18）** | **① 形态四项**：容器 = **同一套容器、同级功能组件**（「工具组件」**就是**既有「功能组件」，**不引入 `kind` 分类** —— 用户明确纠正过）→ 只加一条 `FeatureDescriptor`（id `notes`、「筆」入正常流，`設` 仍钉底）；作用域 = **当前库为默认、可切全部庫**（笔记挂 edition → 经 `holdings` 的**查询口径**）；检索 = **只搜笔记**（`excerpt` + `body`）、v1 用 `LIKE` 子串（2000 条中文笔记实测 **0.32 ms**）、**FTS5 不上**（换装条件与两个静默坑见 `DATA_MODEL.md` §5 问题 6）；章节标签 = 「書名 · 節 N」，**章标题不冗余存**。**② 视觉与交互**：视图两态 **網格 / 瀑布流（默认），无列表**、列宽固定只变高（摘录 ≤4 行 / 批注 ≤6 行）；卡片 = **纯文字块**（零 chrome）三段 = 元行（标记块 + 書名·節 N + 相对时间）／摘录（**加「」**）／批注；文字主次**两档可切换**（默认**批註為主**，差别只有字号 + 颜色）；筛选 = **单按钮三态循环**（默认批註）；⚠ **判据是 `body` 是否为空、不是 `kind`**（用户原话："画完线后补 body，那这就是批注，很显然"；反向"加批註没写字"的 `kind='note'` 又 body 为空）；单击选中 / 双击跳转；**右键 = 挂载线菜单**（跳轉 / 複製批註（仅 body 非空）/ 刪除）；**不放开拖选**（守全局禁选），複製走新端口 `IClipboard`（preload **具名方法**）；**用词纪律**：书库「移除」= 只删索引 vs 笔记「**刪除**」= **真实删除**，两词不混用（确认弹窗写明不可恢复、**不给"下次不再提示"**）；选中态 = **试验档**（1px `--accent-ring` 直角 + 卡片常驻 8px 内边距，按 §7 可单 commit 回退）。**③ 窗口化**（用户提示"书库域有过大规模刷新卡死"）：实现 = **自实现装箱（最短列优先 + 绝对定位）+ 按列二分**（几何在纯函数 `components/noteLayout.ts`，**14 条单测**）；**有效 A/B** = 窗口化 `commit 22ms / refresh 21ms / DOM 42 张` vs 全量对照 `519ms / 1000 张` → **保留窗口化**（硬理由 = **DOM 与观察器数不随规模增长**）；配套**检索防抖 200ms** 与刷新粒度纪律（激活重读只重渲视口 / 筛选变化不重建滚动容器 / 切视图滚动归零）。⚠ **教训**：第一版量到"刷新 **1.607 s**"是**探针假象** —— `show:false` 的窗口不出帧 → `rAF` 被节流到 ~850ms，而 commit/refresh 正是用 rAF 计的；已给探针加**计时环境自检**（空闲 rAF > 60ms 直接 FAIL）。**口径：探针的假数字/假阴性比 FAIL 更危险。** **④ 契约缺口已补**：`openReader(editionId, target?: {revealNoteId?})`（可选参数、向后兼容）+ `FeatureProps.readerTarget`（**tick 防重复消费**），ReaderFeature 在**笔记载入 + 目标章 `rendered` 之后**再 `resolveAnchor(revealNoteId)`。另：笔记管理与阅读器**不同屏**（切过去即离开阅读器）→ **激活时重读**即可，无需 `notes-changed` 广播 | `client/docs/FEATURES.md` §12；`STYLE.md` §5.10；`CONTRACTS.md` v0.4.1/v0.4.2；`DATA_MODEL.md` §5 问题 6 |
| **阅读器功能边界判断（2026-09-12 用户定，产品哲学层；同日二次澄清收窄）** | ① **不管理源文件**：阅读器对书籍实体（源文件）不做资产管理——导入=建索引不拷贝、移除=只删索引（现状即如此）；⚠ **不延伸到索引组织层**：容器/书架系统照常演进（2026-09-09 已定案，用户总要用一种方式索引信息），也不依赖/不绑定任何外部管理程序；② **参数控制有必要，但形态克制**：剩余排版参数照常评估落地，形态上坚持召唤式、默认收起、默认暴露集最小，不做 Koodo 式参数墙分散注意力；③ **阅读界面=注意力焦点模式**：不做功能抽屉，不用的功能透明度逐渐提高（淡出）——淡出要慢、召回路径恒定、仅限阅读页。效力高于行业惯例；待吸收进 `STYLE.md` §5.8 | `docs/STATUS.md` §3（本行）；`client/docs/STYLE.md` §5.8 |

## 4. 版本历史

### client

| 版本 | 日期 | 内容 |
|---|---|---|
| v0.1.18 | 2026-09-16 | **笔记管理（跨书）落地** —— 「工具组件」= **同级功能组件**的第二例（不引入分类，只加一条 `FeatureDescriptor`：「筆」入正常流）。① **契约/领域**：`NoteView`/`NoteFilter`/`NoteTextFocus`/`NoteSettings`（v0.4.2）+ 读模型 `listAllNotes`/`countAllNotes`（v0.4.1：`buildNoteFilter` **单一筛选口径**供列表与计数共用、库作用域走 `holdings` 的 **EXISTS** 以免多库收录重复出行、`LIKE` **通配符转义**、三种排序 + 分页）+ `IClipboard` 端口（§4.6，preload **具名方法**，不用泛化 `invoke`）。**⚠ 判据纪律：区分"划线/批注"按 `body` 是否为空，不按 `kind`**（用户原话："画完线后补 body，那这就是批注，很显然"；反向"加批註没写字"的 `kind='note'` 又 body 为空 —— 两个方向都有真实路径）。② **视觉**（`STYLE.md` §5.10）：網格 / **瀑布流（默认）**两态、**无列表**；列宽固定只变高（摘录 ≤4 行 / 批注 ≤6 行）；卡片 = **纯文字块**（零 chrome）三段 = 元行（标记块 + 書名·節 N + 相对时间）／摘录（**加「」**）／批注；文字主次**两档可切换**（默认批註為主）；标记块与选中态（**试验档**，按 §7 可单 commit 回退）；**容器边界可显形**（`--note-card-edge`/`--note-flow-edge`，改一个值就看出边缘，且因 `border-box` **不引起重排**）。③ **窗口化**（用户提示"书库域有过大规模刷新卡死"）：`components/noteLayout.ts` **纯函数**装箱（最短列优先 / 行内等高）+ 按列二分求可见集（**14 条单测**）；`NoteFlow` 只渲染视口 ± overscan、未测条目按文本长度估算位置。**有效 A/B**：窗口化 `commit 22ms / refresh 21ms / DOM 42 张` vs 全量对照 `519ms / 1000 张`。④ **功能**：`NotesFeature` + `NotesToolbar`（状态栏 5 件：视图切换带三角负片 / 三态筛选 批註→劃線→全部 / 层级两态 / 作用域两态 / 筛选计数）、**右键 = 挂载线菜单**（跳轉 / 複製批註（仅 body 非空）/ 刪除）、删除确认（**不可恢复**、**不给"下次不再提示"** —— 与书库「移除」严格区分）、空态报出被隐藏的划线数、**激活时重读** + **检索防抖 200ms**；检索走**标题栏 · 笔记作用域**（`TitleBar` 扩为按 `FeatureId` 分表 + `app.focusSearch` 分流扩域）。⑤ **契约缺口补齐**：`FeatureHost.openReader(editionId, target?: {revealNoteId?})`（**可选参数、向后兼容**）+ `FeatureProps.readerTarget`（**tick 防重复消费**）；ReaderFeature 必须在**笔记载入 + 目标章 `rendered` 之后**再 `resolveAnchor`，否则静默落空。⑥ **顺手修复**：**样式样张整页黑屏**（数据层换代后样张未跟进 → `LibraryToolbar` 必填 prop `crumbs` 缺失致渲染期抛错 → React 卸掉整棵树；修法 = 样张对齐 v0.4.0 + demo 换成真实 `ReaderRail` 组合）+ 把**漂移防线**写进验收（`STYLE.md` §8.0 增"改数据层/组件 props 后必跑 `typecheck:preview`"、新增 `tools/style-gallery/smoke.cjs` 与 `npm run typecheck:all`）。⚠ **一处测量假象（重要）**：第一版量到"整片重渲染 **1.607 s**"并据此写下"否决不窗口化"，复核发现是**探针假象** —— `show:false` 的窗口不出帧 → `rAF` 间隔被拉到 ~850ms，而 commit/refresh 正是用 rAF 计的（计时器不受影响，故 `settleMs` 一直正常、掩盖了问题）；已给探针加**计时环境自检**（空闲 rAF > 60ms 直接 FAIL）。**口径：探针的假数字/假阴性比 FAIL 更危险。** 实现期另修两个真 bug：流不在滚动容器顶部时"窗口坐标系"算错（→ 一张卡都不渲染）、测量反馈级联（→ 量化 8px + 16px 死区）。**验证**：`npm test` **86 断言**（新增 noteLayout 14）、`typecheck:all` 四 project、`library` 探针 **+12 断言**（含"`kind=highlight` 但补过 body 的必须算批注"）、样式样张探针 `ok=true`（含"卡片高度至少 3 种"断言）、规模 A/B、应用启动自检全绿。**真机验收：用户 2026-09-16 通过** |
| v0.1.17 | 2026-09-15 | **「书的身份」定案并落地：全局单库 + 书库降为组织模式**（定案 = `client/docs/DATA_MODEL.md` §4.2 D1–D12 / §6）。① **存储**从"一库一 `.db`"改为**全应用一个 SQLite 库**（`store.db`）：`works / editions / holdings / libraries / containers(+library_id) / notes.edition_id / reading_state / reading_sessions / edition_toc`；`config.json` 瘦为 `{version, dbPath, 窗口状态}`。② **迁移器** `main/store/migrate.ts`：T1 旧 JSON、**T2 多 `.db` 合并**（**同指纹归并到第一条 edition**、笔记重挂、旧文件留档可回退、单库失败不阻断其余库、`failed` 可重试）。③ **语义全量换层**：端口/适配器/IPC/用例/UI 改 edition + holding；**导入去重改全局**；**映射库禁导入**、新增 **`ScanService` 扫描对账**（`missing` 只标不删）+ 状态栏「掃描」；**Work 做成活列**（阅读时间按 work 汇总的前提）；`edition_toc` 留位。④ **阅读状态**从书行拆出为 `ReadingState`，并进层级读模型（免 N+1）。**实现期四处自查修正**：`addHolding` 不得夺走書箱归属（扫描会吃用户组织）、`upsertEdition` 幂等、纯 JSON 老用户不丢设置、**阻塞级 bug —— 全局库与旧默认库同名撞 schema**（`CREATE TABLE IF NOT EXISTS` 静默跳过旧表 → `no such column`；改 `store.db` + 形状守卫 + 夹具变异测试）。**验证**：`npm test` **72 断言**（新增 `migrate` 15 / 双队列 14 / 分层守卫 9）、typecheck 三 project、`npm run build`、`library` 探针 **44**、`note` 探针、渲染自检 `恢复=ok`、**迁移夹具 T2 59 + T1 37 断言**（走真实主进程入口）。契约 **v0.4.0** / DATA_MODEL **v3**。⚠ **真机验收未做**（多库同一本书的笔记/进度是否真共享、扫描手感） |
| v0.1.16 | 2026-09-14 | **笔记/划线落地（本地侧，文字类优先；PDF 第二批）**：① **领域层** `core/domain/anchor.ts` —— 选区级锚点两层结构（`Norm` 跨格式可比 + 引擎载荷 `Fragment` 不透明），`compareAnchor` **先 Fragment 后 Norm** 出 exact/strong/weak，含落库映射纯函数；`Note` 收拢 v2（v1 形状退役），`excerpt` 不设字段（是 `quote.exact` 的投影）② **存储/IPC**：`ILibraryStore` 笔记 CRUD（`NotePatch` 白名单）→ `SqliteStore` → `shared/ipc` → `main/ipc` → `IpcStoreAdapter`；**`anchor` 更新时三列 + `excerpt` 一起重写**（投影不许两处各写各的），`updatedAt` 由存储层盖戳 ③ **引擎侧原语**：`getSelectionAnchor`（`fromSelection`）/ `resolveAnchor`（`resolveToView` + `revealNoteId`）/ `remeasureAnchor`（诚实降级为**弱锚点**，因 kookit 搜索不给字符偏移）/ `clearSelection` ④ **右键 = 标记/批注主入口**（用户定）：适配器在**书文档**上听 `contextmenu` / `note-clicked`（宿主收不到 iframe 内事件），UI 弹**「挂载线」菜单**（横向 1px 线 + 功能项自线下方生长，**摒弃圆角/阴影/卡片底**；**形态全站统一、语义按域不同**）⑤ **批注**：`NoteComposer`（**受控**组件 —— 便于键盘意图从外部提交当前输入）+ `NotesPanel`（左挂件「目錄/筆記」开关，共用挂载线几何）⑥ **高亮生命周期**：载入 → 每章 `rendered` 后重挂 → 增删即时改 DOM ⑦ **侧键进阅读器**（XButton1/2 翻页；与书库域按功能态分工）⑧ **键盘接口预留**：4 个 `reader.*` 意图（markSelection/annotateSelection/composerCommit/composerCancel），**键位故意留空**，行为已就位 ⑨ **测试设施**：引入 `vitest`（MIT，devDependency，不进发行物）+ **分层依赖守卫**（7 条规则把六边形纪律机器化，含"防静默通过"与元测试）⑩ **选区配色跟主题**（新增 `--selection-bg` 四套取向，去浏览器默认蓝）⑪ 删 `SelectionPalette`（被右键菜单取代，避免两个入口语义重叠）。验证：`npm test` **42 断言** + typecheck **三 project** + `library` 探针 **39 断言** + **新增 `note` 探针**（选区→锚点→引擎回显→导航→重锚→删除→**重开书自动回挂**→笔记面板列出→右键/批注正文到达引擎/点击高亮）+ 渲染自检无回归。⚠ 真机验收未做；逆向补录 3 个 kookit 静默坑（`KOOKIT.md` §5 #13/#14/#15）。契约 v0.3.12 / STYLE v1.4 |
| v0.1.15 | 2026-09-13 | **首个打包发行版（用户 2026-09-13 定"功能确定后滚版本放 release"）——把此前 v0.1.13/v0.1.14 只提交未打包的客户端内容一次交付**（逐项明细见 git log，此处按"实现了某某功能"收敛）：① **无边框窗口 + 自绘标题栏**（主题化控制键；标题栏内嵌居中**全局搜索栏**，书库搜书已接线，阅读器/房间占位）② **挂载线实体**（目录左段 + 阅读参数右段共用一条横向线，线延伸整页宽、被纸压着；折叠 = 向上收回线里；遮罩按鼠标距离）③ **阅读器沉浸态**（全屏的是「桌」不是正文 / 纸居中定宽 + 纸内边距 / 阅读页零控件 / 覆盖式侧边栏 / 挂载线目录与参数面板 / 空目录占位 / PDF 改纸宽原地重开）④ **沉浸全屏**（`F11` + 设置开关 + 标题栏退场 + Esc 分流 + 离开阅读器自动还原）⑤ **键鼠意图层骨架**（`domain/input.ts` 绑定表 + `useKeyIntents`）⑥ **iframe 事件桥**（键盘/滚轮被文档边界挡住的根修；分页模式滚轮翻页）⑦ **离屏封面/元数据解析** + TXT 编码修复 + 书库窗口化渲染 ⑧ **SQLite 单库落地 + one-shot 迁移器**（用户实机 327 本已迁移）+ **多书库**（一库一 .db，config.json = 引导文件）+ 書庫管理弹窗 ⑨ **书库双模式（虛擬映射 / 自建書箱）+ 资源管理器式层级浏览 + 書箱一等条目交互**（computer-use 实机验证）⑩ **书/書箱移动全量交互**：拖拽双向 + 右键「移動到」子菜单，`moveContainer` 防成环（CONTRACTS v0.3.8）⑪ **书架三则**：全局禁选（正文专属）、层级后退/前进（历史栈 + 标题栏按钮 + 鼠标侧键）、面包屑根固定。验证：typecheck 双绿；`library` 探针 **20 断言全过**（含書箱移动/防成环）；EPUB 无头自检无回归；**真机验收通过（用户 2026-09-14：全局禁选 ✓ / 鼠标侧键 ✓）**。发行物 = **免安装便携版** `TuRead-0.1.15-win-x64-portable.exe`（用户 2026-09-14 定：非正式版本给免安装版最好；不出 NSIS 安装包）。⚠ 分页模式交互用户复测仍异常（待复现细节，见 TODO 渲染组） |
| v0.1.14 | 2026-09-13 | **（已 tag，从未打包）** 沉浸全屏 + 交互根修 + 数据地基 + 书架层级化。实现了：① 阅读器交互三则（参数面板默认展开 / 布局模式入面板 / 空目录占位）+ TODO 开设 PDF 专区 ② 沉浸全屏（F11 + 设置开关 + 标题栏退场 + Esc 分流 + 离开阅读器自动还原）③ iframe 事件桥（键盘/滚轮被文档边界挡住的根修，按键只看界面不看焦点）④ 分页模式滚轮翻页 ⑤ PDF 改纸宽原地重开（填充）⑥ **SQLite 单库落地 + one-shot 迁移器**（用户实机 327 本已迁移）⑦ **多书库 + 書庫管理弹窗**（config.json=引导文件，一库一 .db）⑧ **书库双模式（虛擬映射/自建書箱）+ 资源管理器式层级浏览 + 書箱一等条目交互**（computer-use 实机验证）⑨ **书/書箱移动全量交互**：書箱可拖拽（拖箱入箱 / 拖到面包屑段），右键「移動到」子菜单，面包屑拖入段高亮，`moveContainer` 防成环（CONTRACTS v0.3.8）⑩ Esc 分流纠正 + 搜索栏两修 + 书架 select-none。⚠ 内容随 v0.1.15 一并交付 |
| v0.1.13 | 2026-09-12 | **（已 tag，从未打包）** 窗口与阅读器交互大版本（本地侧）：① **无边框窗口 + 自绘标题栏**（`frame:false`，min/max/close 经 `win:*` IPC（`handle`，用 `.on` 会 No handler——实测踩坑），最大化状态广播切 □/❐；标题栏 h-11 且内嵌**全局搜索栏**（按功能域作用域：书库=标题/路径过滤已接线，阅读器=引擎内搜索占位、房间=搜房间占位；Ctrl+F 聚焦/Esc 清空）② **挂载线实体**（`ReaderRail`）：横向挂载线**延伸整个页面宽度**（左段目录/中段纯线跨正文上方/右段参数），目录左段垂挂、**阅读参数挂右段下方——点右段开合、折叠向上收回线里、内容中间对齐、面板内「收起」废除**、原右侧独立召唤条废除；目录折叠时点线（左段）=展开 ③ **键鼠意图层骨架**：`domain/input.ts` 纯函数绑定表 + `useKeyIntents`（ref 装载防过期闭包），Reader/TitleBar 全部迁移 ④ **离屏解析**：kookit getMetadata 移独立进程（封面/元数据提取期间主窗口 CPU~10%，328 本积压一轮收敛）；TXT 全格式打不开修复（chardet 编码检测）⑤ **书库窗口化渲染**（`useVirtualRange`，328 本流畅）⑥ **架构审查三修**：CoverQueue 依赖倒置 / ReaderSettings 提升领域层 / buildKookitConfig 去重 ⑦ 数据建模立项：`DATA_MODEL.md` v2（统一 SQLite 单库，待批复）。⚠ 内容随 v0.1.15 一并交付 |
| v0.1.12 | 2026-09-11 | **阅读器沉浸态收官（v0.4~v0.8，用户逐轮纠正后收敛）+ 右侧阅读参数面板**：① **全屏的是「桌」不是正文** —— 桌 `--desk-bg` + 纸 `--page-bg` + 1px `--page-edge` 边（**靠颜色区分**，无阴影无圆角）；正文 = **居中定宽「纸」**（`--read-width` 620/760/920）+ **纸内边距** `--page-pad-x`（注入 `body{padding-inline}`，即"出血"旋钮）② **阅读页零控件**：删掉临时顶栏与常驻进度线（浮动出来的栏同样是状态栏），退出 = `Esc`；**阅读态侧边栏改覆盖式**（打开左侧菜单不再影响阅读器宽度；只给阅读态，其他功能态保持占位）；贴缘条可见 6×160 / 判定 18×200 ③ **滚动条 2px**、静息 10%、指针进入正文列才 26%、**短章节（仅 kookit +300px 余量）整条隐藏**（⚠ 只写 `::-webkit-scrollbar`：写了标准属性会屏蔽它）④ 目录 = **挂载线 + 垂挂列表**（左缘对齐侧边栏右缘、容器全透明、**遮罩按鼠标距离高亮且远端保持静息**、默认展示、点条目不收起、折叠按钮居中 + 上方引导分割线、点击判定区放大）⑤ **右侧可召唤阅读参数面板**（字号/行距/段距/纸宽/内边距，默认收起）：契约 v0.3.3 增 `applyTypography` + `ReaderTypography` —— **宿主几何走 CSS 变量、正文排版走注入**；设置页只留低频（布局模式）⑥ 主题模型 2 主题 × 2 模式 + 非 PDF 深色注入（PDF 像素反相待做）；**「深色下正文长度异常」销案** = 指标错（`innerText` 排版相关，实测 70/109 漂移；浅/深两侧 `bodyHtml=704`、`textContent=109` 完全一致），自检改 `textContent` 判定并新增「注入前后正文不许变」回归断言 + 注入事实输出；**自检判据按格式分开**（PDF 跳过夜间注入断言 —— `applyTheme` 对位图本就是 no-op；恢复判据对 PDF 数子 iframe 里的 canvas，而不是顶层 `textContent`）。验证：typecheck 双绿（含 preview）、**四格式**（AZW3/EPUB/MOBI/PDF）深色无头自检全绿（独立 userData：`渲染OK / 夜間注入=ok / 封面=ok / 字体=ok / 恢复=ok`）|
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
- **跑碰 better-sqlite3 的临时探针（2026-09-16 实测）**：原生模块是 **electron-v130 ABI**，
  **系统 Node（v24 / MODULE_VERSION 137）`require` 会 `ERR_DLOPEN_FAILED`**
  → 改用 `client/node_modules/electron/dist/electron.exe <脚本.cjs>` 跑；且 **Windows 下 Electron 的 stdout 抓不到**
  （GUI 子系统）→ **结果写文件再读**；脚本末尾 `app.quit()` 会打一条
  `platform_channel.cc Check failed: 拒绝访问 (0x5)` 的 FATAL 噪音（**文件已写完，不影响结论**）。
- kookit 子模块的 `CLAUDE.md` 规则：**禁止在其仓库内 git commit / push**

## 6. 交接快照（2026-09-16 更新）

**工作区状态**：**client v0.1.18 已提交并打 tag**（`client-v0.1.18`：笔记管理落地）；
`client/package.json` version = **0.1.18**，**client 工作树干净**。发行物仍是上一版的免安装便携版
`client/release/TuRead-0.1.15-win-x64-portable.exe` + `release/win-unpacked/`
（**v0.1.16 ~ v0.1.18 都还没打包** —— 下次出发行物时一并打）。
⚠ **工作树里另有 server 侧三处未提交改动**（`server/cmd/server/main.go`、`server/internal/room/manager.go`、
`server/internal/store/store.go`）—— 来源不明（非本会话所为），**下次动 server 前先确认**。
kookit 子模块的 `m` 是其自身工作树噪音，**勿动**。
逐版本过程明细见 §4；**本文件只写"现在在哪"，细节一律指向权威文档**。

**★ 现在在哪（2026-09-16）· 笔记管理（跨书）已落地并真机验收通过**
- 权威：形态与交互 = `FEATURES.md` **§12**；视觉 + **窗口化 A/B 与两个实现期坑** = `STYLE.md` **§5.10**；
  契约 = `CONTRACTS.md` **v0.4.1/v0.4.2**；检索口径 = `DATA_MODEL.md` §5 问题 6；决策汇总 = §3 第一行。
- 实现清单、验证数字与那次**测量假象**的来龙去脉 = §4 的 **v0.1.18 条目**（本节不重述）。
- ⏳ **本次没做、下次可做**（按建议优先级）：
  1. **笔记域的 dev 探针** —— 现在只有单测 + 样张覆盖，**功能链路的无头断言还缺**（与"单测覆盖缺口"同源）；
  2. **阅读时间专题**（存储半边已落，缺"会话事件口径 → 计时 → 弹窗界面"）；
  3. **笔记概念收敛**（`NoteKind` 去 `'note'`）—— **待用户放行**，决定已记档；
  4. **发行物**：打一次便携版（v0.1.16~18 三版内容一起）+ **许可文件随包**（对外发行前必修）；
  5. **旧账**：分页模式交互（需复现细节）、「重开书偶发空白」（已有可重复复现器）。

**★ 上一轮（v0.1.17）·「书的身份」**：全局单库 + 书库降为组织模式 + 迁移器（T1/T2）。
**结论权威 = `DATA_MODEL.md` §4.2 + §6，逐项与验证 = §4 的 v0.1.17 条目。**
⚠ 那次真机验收仍有一小块没走（多库同一本书的笔记/进度是否真共享、映射库扫描手感）——
属"待用户实测"，**不阻塞**任何后续工作。

**笔记落地的硬约束与坑：见 `KOOKIT.md` §5 #13/#14/#15 与 `RENDER_INTERFACE.md` §5**
（不在本文件重述 —— 那三处静默坑、四条载荷约束、以及"谁在画"的边界，权威都在那两份）。
要点索引：#13 文字类 `rendered` 事件**不带章号**（`undefined` 静默 0 命中）；
#14 笔记载荷 = rangy 字符范围（非 CFI）+ `handleNoteClick` 是**委托 + 需配对 mousedown**；
#15 桌面端**无 kookit 右键占用**（触屏/右键接线是死代码）。

**旧账证据升级**：**「重开书偶发空白」已被 `note` 探针复现**（"关书→重开"连试 3 次都没产生新 iframe，
每轮等 15s），与 TODO 登记的"~1/3 次、无任何报错"一致；探针已加固（等旧 iframe 消失 + 等**新** iframe
+ 重试），命中时**跳过**相关断言而非误报 FAIL —— 它现在同时是这条旧账的**可重复复现器**。

**验证工具链（回归全靠它们）**：
- **`npm test`**（vitest）= **纯逻辑单测**（**86 断言**）：领域语义（anchor/location）+ **笔记流几何**
  （`noteLayout` 14 条）+ 分层依赖守卫 + 迁移/双队列。秒级、无需书。
  ⚠ 与 `npm run dev` / 任何探针一样受"esbuild 管道 stdio → 受限沙箱 `EPERM`"约束，**需放宽模式跑**。
  口径：**单测验判据、探针验链路**，两类设施互补不替代。
- **`npm run typecheck:all`** = 四个 tsconfig（node / web / test / **preview**）。
  ⚠ **preview 覆盖样式样张 —— 改数据层或组件 props 后必跑**：2026-09-16 的"样张整页黑屏"
  就是漏跑它造成的（15 处漂移它一个不漏）。
- **样式样张探针**：`npm run style` 起样张，另开终端
  `node_modules\electron\dist\electron.exe tools\style-gallery\smoke.cjs [url] [--scale=N] [--no-window]`
  → 判据 = 有面板 + 有文字 + **无页面错误** + 笔记卡片高度多档；`--scale` 另量窗口化规模，
  并**自检计时环境**（空闲 rAF > 60ms 直接 FAIL —— 防止再出"1.6 s 假数字"）。
- `TUREAD_USER_DATA=<目录>` = 独立 userData（**验证永远用它，别碰真实书库**）。
- `TUREAD_DEV_PROBE=library` + `TUREAD_DEV_BOOK=<书>` = 多库/書箱/笔记/**笔记读模型**探针
  （**56 断言**：20 多库与書箱 + 19 笔记 + **12 读模型** + 5 其他；读模型那批含
  "`kind=highlight` 但补过 body 的必须算批注"、LIKE 通配符转义、经 `holdings` 的库作用域）。
- `TUREAD_DEV_PROBE=note` + `TUREAD_DEV_BOOK=<文字类书>` = **笔记/划线全链路探针**（选区→锚点→引擎
  高亮回显→导航→重锚→删除→重开自动回挂→笔记面板→右键/批注/点击）。**唯一能验 Fragment 契约的地方**
  （单测碰不到引擎）。⚠ **样书首章陷阱**：`test_docs/高级运动营养学` 第一章是纯图片扉页、无正文可选，
  探针会自动逐章找有正文的章（与 2026-09-13「App 侧 EPUB 正文空」的测量假象同源）。
- `TUREAD_DEV_BOOK` 单跑 = 渲染自检；`TUREAD_DEV_SQLITE=1` = 原生模块 spike。
- 换 Electron 版本后 `npm run rebuild:sqlite`；打包走代理（`NETWORK.md`）。
- **发行版冒烟**（可重复）：独立 userData 起 `release/win-unpacked/TuRead.exe` →
  应落盘 `config.json`（引导文件）+ `store.db` + `covers/<editionId>.jpg`（导入→封面→落库整链成立）。
  （v0.4.0 前全局库曾叫 `turead.db`；因与旧默认库同名会撞 schema，已改名，见 `DATA_MODEL.md` §1。）

**⑮ 的真机验收（2026-09-14 用户实测：通过）**：全局禁选 ✓ / 鼠标侧键后退前进 ✓。
已知边界（既有行为）：**PDF 正文选不中** —— pdf.js 自带文本层 `user-select:none`；要放开另立条目。

**关键对象速查**：`LibraryManager`（引导文件 + store 句柄）｜`SqliteStore`（**全应用一个全局 `.db`**，
close 后可 init 重开）｜切库信号 = main 广播 `store:library-changed`；⚠ **`store:*` 不再"打到当前库"**
（v0.4.0 起库是库内实体，涉及收录/书箱的调用**显式带 `libraryId`**）｜**契约版本 v0.4.2**（CONTRACTS §8）｜
笔记链路：`domain/anchor.ts`（锚点纯函数权威）｜`TextAnchor` 二层（Norm + Fragment）｜
**`noteLayout.ts`（笔记流几何：装箱 + 窗口化，纯函数、有单测）**｜适配器 `renderedChapter`（高亮回显的过滤依据）｜
`context-menu` / `note-clicked`（适配器在**书文档**上听，UI 收）｜
**`readerTarget`（「带目标打开」载荷：笔记管理 → 阅读器跳转，tick 防重复消费）**。
