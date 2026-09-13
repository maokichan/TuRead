# 项目状态与决策记录（会话交接）

> 目的：让下一次会话/模型以最低成本恢复上下文。
> 阅读顺序：本文件 → `MAP.md`（自动加载）→ `TODO.md` → 各端架构文档（见 MAP）。
> 更新：2026-09-13（**client v0.1.15 已发版**（tag 后增补⑨~⑮ 合并叙述；v0.1.13/v0.1.14 的客户端内容
> **从未打包**，随本次一并交付）：SQLite 单库落地 + 一次性迁移器 / 多书库（config.json=引导文件）+
> 書庫管理弹窗 / 书库双模式（虚拟映射+自建書箱）+ 资源管理器式层级浏览 / 書箱交互按资源管理器语义重做 /
> 书与書箱移动全量交互（拖拽双向 + 右键「移動到」）/ Esc 分流纠正 + 搜索栏两修 /
> **书架三则（全局禁选 · 层级后退前进 · 面包屑根固定）**。**下一步主线见 §6 交接快照**）

## 1. 一句话

TuRead = **多人房间共读阅读器**：多个用户进入同一房间，共同阅读同一本书。
渲染/解析复用 [kookit](https://github.com/koodo-reader/kookit)（AGPL-3.0，git submodule）；
同步服务器用 Go，**v0.2.0 已实现**（仓库内 `server/`）；**client v0.1.14**。

## 2. 仓库与提交（`D:\PROJECT\TuRead`）

- git 仓库：本地 `main`，`origin = https://github.com/maokichan/TuRead.git`（独立仓库，非 fork）
- 结构：`client/`（Electron 客户端）｜`server/`（独立 Go module）｜`kookit/`（submodule，HEAD `6e18465`）｜`docs/`｜`TODO.md`（`借物表.md` 已退役，见 §3）
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
| **发行版范围（2026-09-11 定）** | **只出 64 位 Windows**（NSIS 安装包）：`client/electron-builder.yml` + `npm run dist` → `client/release/TuRead-<version>-win-x64-setup.exe`（`release/` 已 gitignore）；不出 mac/linux。两条实测约束：① 打包要走本地代理（electron-builder 从 GitHub 拉 Electron/NSIS 组件，见 `NETWORK.md`）② **关掉原生重建**（`npmRebuild: false`）并把 pdfjs 的可选依赖 `canvas` 排除出包 —— 运行时没有需要编译的原生依赖，而本机缺 cairo/GTK 会直接编译失败 | `client/electron-builder.yml`；`README.md`；`借物表.md` |
| 插件 | v1 不做插件运行时；ports 即插件边界（官方插件 = 适配器注册进 ServiceContainer） | `client/docs/ARCHITECTURE.md` §4 |
| UI 功能组件（2026-09-08 落地） | UI 按 Feature 划分标准化（Library/Reader/**Room[含 Server 连接]**/Settings + 展示组件 + AppShell 宿主）；**标准容器**：`FeatureDescriptor` + `registry.ts` + `AppShell`（侧边栏=单色符号图标栏 + 主面板宿主，功能常驻挂载/非激活隐藏 → 状态继承，settings 钉置底）；跨功能跳转走 `FeatureHost`（navigate/openReader/closeReader/selectBook/pushLog）；**纯 React 状态 + props**；Tailwind 与拆组件同步迁移；颜色语义 token 标准化（第三方覆盖 token 建主题）；官方插件 = 追加 descriptor 进 registry | `client/docs/FEATURES.md` |
| 书库重做（v0.1.8 起，v0.1.9/v0.1.10 细化） | **去容器外壳** + **两视图**（列表/網格；瀑布流并入）+ **底部状态栏**（文字按钮：左=视图切换单按钮，右=导入；"含子文件夹"在设置里配置）+ 详情抽屉（**只在内容区弹出**）+ 移除=**只删索引不删源文件**（首次确认可勾不再提示）+ 封面**缩略图落盘** + 文字封面（`FittedTitle` 撑满） | `client/docs/FEATURES.md` §10 |
| 主题色取向（2026-09-08 定，**四套**） | **暗色/亮色**一律黑灰白（不引入色相；高亮=灰阶两端）+ **羊皮纸·亮 / 羊皮纸·暗**（同一暖棕取向的明暗两版）；状态色（ok/warn/err）保留语义色相 | `client/src/renderer/src/styles.css` |
| 书籍身份模型（2026-09-08 定术语） | **作品身份**（Work：`protocol` + `code`，如 ISBN）＋ **电子版身份**（Edition：`fingerprint`）；**标准化** = 补齐作品身份（入口在房间功能，短期手填、远期 OCR）；**标定** = 加入房间时的**比对**动作。本地**不采集/不显示** author·publisher（与 server Work 模型一致） | `docs/ARCHITECTURE.md` §1 |
| 跨层改动授权（2026-09-08） | 书库重做等改动**允许修改应用层与领域层**（前提：不违背六边形依赖规则、契约文档先行） | — |
| 许可 | kookit AGPL-3.0 → TuRead 以 **AGPL-3.0** 开源；新依赖**先核许可证与 AGPL 兼容性**（登记仪式已退役，见下） | `client/docs/…`；`docs/STATUS.md` §3 |
| **借物表退役（2026-09-11 用户定）** | 手维护的第三方登记仪式自 **v0.1.6/v0.1.7 前后实际停摆**（v0.1.0 就在用的 Electron/React 一直躺在「候选」表里，自带"登记滞后，待补入已采用表"的注记；文件最后一次内容更新 = 2026-09-08 打包源流明体）。用户定：**先不维护、注明、移出版本控制**（`借物表.md` 进根 `.gitignore`，文件留本地作参考）。**保留的只有义务**：引入新依赖仍须核许可证与 AGPL 兼容性；kookit（AGPL-3.0）与源流明体（OFL 1.1）的声明义务仍在 —— **发行物缺件（LICENSE / OFL 全文 / 第三方声明随包）登记在 `TODO.md`**。⚠ 此前"必须先登记"的门禁散布在 MAP/STATUS/FEATURES/STYLE/TODO 六处，已一并改为"先核许可、不登记" | `.gitignore`；`借物表.md`（本地，已冻结）；`TODO.md` |
| **发版节奏（2026-09-13 用户定）** | **功能确定后即滚版本号 + 出 release**（不再把多个版本的改动长期堆在"已提交未发版"状态）：本机 `npm run dist`（走代理，见 `NETWORK.md`）→ `client/release/TuRead-<version>-win-x64-setup.exe` + `client-v<version>` annotated tag。版本号滚动仍由用户决定（见 §2），agent 按指示执行并同步 `package.json` / `package-lock.json` / 本文 §4 / `MAP.md` / `README.md` | `client/electron-builder.yml`；`docs/STATUS.md` §2/§4 |
| 仓库形态 | 单仓库 monorepo（server 可零成本拆出） | `docs/ARCHITECTURE.md` §2 |
| 开发原则 | **解释优先**；大改前写理由（Rule of Three） | — |
| 跳转历史（2026-09-09 群聊定案） | **行动树驳回**：注释/跳转会打断线性阅读，但人的体验归根结底是线性的 → 跳转历史用**状态机**（前进/后退栈，undo/redo），不做"世界树/时间树"树状可视化；随笔记/划线落地后实施 | `TODO.md` client；`client/docs/FEATURES.md` §9 |
| **无边框窗口 + 自绘标题栏（2026-09-12 用户定）** | `frame:false`，不用系统控制键——自绘 min/max/close（主题 token，关闭 hover = `--err` 负片；`win:*` IPC 走 `ipcMain.handle`）。标题栏内嵌**全局搜索栏**（绝对定位几何居中；作用域随功能：书库搜书已接线、阅读器搜书内内容/房间搜房间占位待接线；Ctrl+F 聚焦、Esc 清空） | `client/src/renderer/src/components/TitleBar.tsx`；`FEATURES.md` §11 |
| **挂载线实体（2026-09-12 用户定，二次纠正定稿）** | 目录（左）与阅读参数（右）同处**一条横向挂载线**：线**延伸整个页面宽度、被书页压着**（纸列 z2 建层，横线仅左右留白可见）；左段可点 = 目录开合，右段可点 = 参数开合，参数面板底部「折疊」与目录同款；**折叠 = 向上收回线里**；参数内容中间对齐、**低透明度 = 遮罩按鼠标距离**（与目录同款，废静态灰字）。原右侧独立召唤条与面板内「收起」废除 | `client/src/renderer/src/components/ReaderRail.tsx`；`STYLE.md` §5.8 |
| **键鼠意图层机制（2026-09-12 骨架落地）** | 键盘 = **意图**：`core/domain/input.ts` 纯函数绑定表（normalizeKey/resolveIntent/**assertNoConflict 一键一意**）+ `DEFAULT_BINDINGS`（先原样收拢现状键位）+ `useKeyIntents`（ref 装载防过期闭包；**常驻挂载组件必须带 enabled 守卫**）。已迁移：Reader 全部键、TitleBar Ctrl+F。待收编：书库行内键（元素级）、用户自定义表 | `client/src/core/domain/input.ts`；`client/src/renderer/src/components/useKeyIntents.ts` |
| **数据分层存储（2026-09-12 批复；同日二次批复改为统一 SQLite）** | **v2：单一 SQLite 库文件 = 一份书库**——书籍/阅读状态/书箱/笔记/库级设置全在一个 .db（JSON 的"单文件可携带"理由不成立，SQLite 本身就是单文件）；JSON **退役为引导文件**（极小：已知库注册表 + 当前库路径可配置 + 窗口状态）。**多书库**：多 .db + 库管理（新建/切换/移除引用），每库两种组织并存（真实路径虚拟映射 + 纯书箱）。封面缩略图（400px/q0.82）随库目录。**owner 字段建模预留**（本地 NULL，同步上线回填）；书签进 note 表。建模与 schema 见 `client/docs/DATA_MODEL.md`（收束版）；实施前先做 better-sqlite3 打包 spike | `client/docs/DATA_MODEL.md`；`docs/STATUS.md` §3 |
| **PDF 纸宽填充 + 单页交互核查（2026-09-13 用户定）** | ① **PDF 改纸宽应当填充**（用户定）——kookit PdfRender 渲染时刻定 canvas 像素、无重排入口（`dev/pdfWidthProbe.ts` 量化存档），修法 = **PDF 改纸宽时阅读器原地重开**（`reopenTick` 机制，位置自动恢复；将来 kookit 出重排入口可换轻量路径）② **单页模式交互核查**：无头探针 `dev/pagedInteractProbe.ts`（`TUREAD_DEV_PROBE=paged-interact`）实证 EPUB 单页模式键盘/滚轮/目录三路全部正常（合成事件派发，位置均移动、目录落点精确）——用户报障的两处真根因 = **桥的嵌套 iframe 盲区**（PDF 每页是顶层 iframe 里再嵌的子 iframe，已修：桥递归扫描+递归观察）与**左右点击翻页带的滚轮死区**（已修：滚轮接管上移到整个阅读器区，目录/参数面板让位）。⚠ 若 EPUB 真实鼠标滚轮仍有异常，属原生滚动与翻页的竞态，需用户复现步骤 | `client/src/renderer/src/components/iframeBridge.ts`；`ReaderFeature`；`dev/pagedInteractProbe.ts` |
| **iframe 事件桥 + 分页滚轮翻页（2026-09-13 用户定/实测修）** | **根因**：kookit 正文渲染在 iframe 里，焦点进书页后键盘/滚轮事件落在 iframe document 上，**到不了宿主 window**（文档边界）——实测点进书页后 F11 失灵。修法 = `components/iframeBridge.ts`：对同源 iframe 文档挂同一套监听（MutationObserver 追懒加载章节），按键**只看当前界面不看焦点**（用户定：无状态实现）；useKeyIntents 全量接入 + 输入类目标让位。**分页模式滚轮翻页**同批落地（默认键盘、无按钮控件，滚轮像 koodo 可翻页；留白走宿主 onWheel、正文走 iframe 桥；平滑滚轮累积 + 冷却防连翻；scroll 模式不拦） | `client/src/renderer/src/components/iframeBridge.ts`；`useKeyIntents.ts`；`ReaderFeature`；`FEATURES.md` §11 |
| **沉浸全屏落地 + 模糊立项（2026-09-13 用户定）** | **全屏**：`F11`（意图 `reader.toggleFullscreen`，绑定表收编）+ 设置开关「進入閱讀器時進入全屏」（默认关，`appearance.readerFullscreen`，SettingsFeature 经 patchSetting 写——appearance 键自此改原子合并）= OS 全屏 + 标题栏退场（TitleBar 订阅 `win:fullscreen-changed` 返回 null）；`Esc` 分流（**2026-09-13 用户纠正**：面板是常伴工具，Esc 不收面板）= 全屏→退阅读器；离开阅读器自动还原窗口。新增 IPC `win:set-fullscreen` / `win:fullscreen-changed`（main 于 enter/leave-full-screen 广播）。**模糊（blur）立项**：页面模糊作注意力工具（大状态切换的过渡模糊 + 定向聚焦模糊），实现路径与形态待定项见 TODO | `client/src/main/index.ts`；`shared/ipc.ts`；`ReaderFeature`；`TitleBar`；`SettingsFeature`；`TODO.md` 模糊条目 |
| **阅读器交互三则（2026-09-13 用户定）** | ① **阅读参数面板默认展开**（废 v0.1.12"默认收起"——参数是阅读的常伴工具，不该每次伸手召唤；折叠仍是临时动作，重开书回展示态）② **布局模式从设置页移入参数面板**（滾動/單頁/雙頁，改 = 重开书生效；`readerSettings` 的唯一写者 = 面板，设置页不再写该键）③ **空目录占位**：无目录索引的书也展开目录垂挂区、显示「本書沒有目錄索引」（缺失要可见，不静默）④ **TODO 开设 PDF 专区**（改纸宽不重排/页面旋转/分页模式验证/夜间反相/交互抽查集中登记），**PDF 页面旋转立项**（±90°，修法候选与形态待定见 TODO） | `client/src/renderer/src/components/ReaderControls.tsx`；`STYLE.md` §5.8/§5.9；`FEATURES.md` §11；`TODO.md` PDF 专区 |
| **渲染内核可替换性（2026-09-12 用户提出，架构考量入册）** | kookit（连同 pdfjs 等解析/渲染工具）整体封装在 vendor 单文件 ESM 容器内，UI/应用层**只经端口**（`IRenderService` / `IMetadataExtractor` / `buildKookitConfig` 等收敛点）触达——**未来更换渲染内核 = 重写适配器层，UI/usecases/domain 零改动**。纪律：任何 kookit 专属概念（kookit config 字段、rendition 事件名）不得越过适配器边界上行 | `client/docs/KOOKIT.md`；`client/docs/CONTRACTS.md` §4.1 |
| **全局禁选（2026-09-13 用户定）** | **文字选择 = 阅读正文专属**：除阅读页正文外，宿主 UI 任何内容都不响应按住鼠标拖选（`body{user-select:none}`，`input/textarea` 豁免——更名/搜索/新建命名仍可选中复制）。正文在 kookit iframe（独立 document）内，天然不受宿主规则影响，选择能力原样保留。顺带删除 `LibraryFeature` 内容区原有的局部 `select-none`（被全局覆盖，冗余） | `client/src/renderer/src/styles.css`；`client/docs/FEATURES.md` §10/§11 |
| **书库层级后退/前进（2026-09-13 用户定）** | 对齐**文件资源管理器**逻辑：① **鼠标侧键** XButton1/2 = 后退/前进（仅 `activeFeature==='library'` 接管，`preventDefault` 压掉 Chromium 默认历史导航）② **标题栏返回/前进按钮**，左缘 = `var(--sidebar-w)`（与左侧边栏右缘对齐），只在书库态渲染，不可用禁用（opacity-30）。**历史栈在 `LibraryFeature`**（`histRef` = stack + idx）：条目 = `{containerId, folder, trail}`——**面包屑整条随条目存取**，后退/前进一起还原；`enterContainer`/`enterFolder`/`goToLevel` 全走 `pushEntry`（新导航截断"前进"分支，资源管理器语义），移动/导入等 `commitNav` 是**原地重载、不入栈**；切库广播时历史重置为根。跨兄弟组件用**模块总线** `features/libraryNavBus.ts`（TitleBar 与 LibraryFeature 是 AppShell 兄弟，props 穿 Shell 不值当——`logStore` 先例；TitleBar 以 `useSyncExternalStore` 订阅可用性） | `client/src/renderer/src/features/LibraryFeature/index.tsx`；`features/libraryNavBus.ts`；`components/TitleBar.tsx`；`FEATURES.md` §10/§11 |
| **面包屑根固定（2026-09-13 用户定）** | 状态栏右下角"当前层级路径"：**根（库名）显示位置固定、子节点向右增生**（原实现容器宽度随内容 + `ml-auto`，路径变深时整体左移、根会跑）。实现 = 容器改**固定宽度** `w-[420px]` + `ml-auto`，内容从左往右流 → 容器左缘锚死。⚠ 过长处理**暂不做**（登记 TODO）。顺带修一个分隔符 bug：`/` 原先渲染在根段**之前**（箱内显示「/ 書庫 測試箱A」）会把根推右 → 改 `index > 0` 才渲染 | `client/src/renderer/src/components/LibraryToolbar.tsx`；`FEATURES.md` §10 |
| **阅读器功能边界判断（2026-09-12 用户定，产品哲学层；同日二次澄清收窄）** | ① **不管理源文件**：阅读器对书籍实体（源文件）不做资产管理——导入=建索引不拷贝、移除=只删索引（现状即如此）；⚠ **不延伸到索引组织层**：容器/书架系统照常演进（2026-09-09 已定案，用户总要用一种方式索引信息），也不依赖/不绑定任何外部管理程序；② **参数控制有必要，但形态克制**：剩余排版参数照常评估落地，形态上坚持召唤式、默认收起、默认暴露集最小，不做 Koodo 式参数墙分散注意力；③ **阅读界面=注意力焦点模式**：不做功能抽屉，不用的功能透明度逐渐提高（淡出）——淡出要慢、召回路径恒定、仅限阅读页。效力高于行业惯例；待吸收进 `STYLE.md` §5.8 | `docs/LANDSCAPE.md` §6 |

## 4. 版本历史

### client

| 版本 | 日期 | 内容 |
|---|---|---|
| v0.1.15 | 2026-09-13 | **首个打包发行版（用户 2026-09-13 定"功能确定后滚版本放 release"）——把此前 v0.1.13/v0.1.14 只提交未打包的客户端内容一次交付**（逐项明细见 git log，此处按"实现了某某功能"收敛）：① **无边框窗口 + 自绘标题栏**（主题化控制键；标题栏内嵌居中**全局搜索栏**，书库搜书已接线，阅读器/房间占位）② **挂载线实体**（目录左段 + 阅读参数右段共用一条横向线，线延伸整页宽、被纸压着；折叠 = 向上收回线里；遮罩按鼠标距离）③ **阅读器沉浸态**（全屏的是「桌」不是正文 / 纸居中定宽 + 纸内边距 / 阅读页零控件 / 覆盖式侧边栏 / 挂载线目录与参数面板 / 空目录占位 / PDF 改纸宽原地重开）④ **沉浸全屏**（`F11` + 设置开关 + 标题栏退场 + Esc 分流 + 离开阅读器自动还原）⑤ **键鼠意图层骨架**（`domain/input.ts` 绑定表 + `useKeyIntents`）⑥ **iframe 事件桥**（键盘/滚轮被文档边界挡住的根修；分页模式滚轮翻页）⑦ **离屏封面/元数据解析** + TXT 编码修复 + 书库窗口化渲染 ⑧ **SQLite 单库落地 + one-shot 迁移器**（用户实机 327 本已迁移）+ **多书库**（一库一 .db，config.json = 引导文件）+ 書庫管理弹窗 ⑨ **书库双模式（虛擬映射 / 自建書箱）+ 资源管理器式层级浏览 + 書箱一等条目交互**（computer-use 实机验证）⑩ **书/書箱移动全量交互**：拖拽双向 + 右键「移動到」子菜单，`moveContainer` 防成环（CONTRACTS v0.3.8）⑪ **书架三则**：全局禁选（正文专属）、层级后退/前进（历史栈 + 标题栏按钮 + 鼠标侧键）、面包屑根固定。验证：typecheck 双绿；`library` 探针 **20 断言全过**（含書箱移动/防成环）；EPUB 无头自检无回归。⚠ 分页模式交互用户复测仍异常（待复现细节，见 TODO 渲染组）；鼠标侧键与拖选待用户真机实测 |
| v0.1.14 | 2026-09-13 | **（已 tag，从未打包）** 沉浸全屏 + 交互根修 + 数据地基 + 书架层级化。实现了：① 阅读器交互三则（参数面板默认展开 / 布局模式入面板 / 空目录占位）+ TODO 开设 PDF 专区 ② 沉浸全屏（F11 + 设置开关 + 标题栏退场 + Esc 分流 + 离开阅读器自动还原）③ iframe 事件桥（键盘/滚轮被文档边界挡住的根修，按键只看界面不看焦点）④ 分页模式滚轮翻页 ⑤ PDF 改纸宽原地重开（填充）⑥ **SQLite 单库落地 + one-shot 迁移器**（用户实机 327 本已迁移）⑦ **多书库 + 書庫管理弹窗**（config.json=引导文件，一库一 .db）⑧ **书库双模式（虛擬映射/自建書箱）+ 资源管理器式层级浏览 + 書箱一等条目交互**（computer-use 实机验证）⑨ **书/書箱移动全量交互**：書箱可拖拽（拖箱入箱 / 拖到面包屑段），右键「移動到」子菜单，面包屑拖入段高亮，`moveContainer` 防成环（CONTRACTS v0.3.8）⑩ Esc 分流纠正 + 搜索栏两修 + 书架 select-none。⚠ 内容随 v0.1.15 一并交付 |
| v0.1.13 | 2026-09-12 | **（已 tag，从未打包）** 窗口与阅读器交互大版本（本地侧）：① **无边框窗口 + 自绘标题栏**（`frame:false`，min/max/close 经 `win:*` IPC（`handle`，用 `.on` 会 No handler——实测踩坑），最大化状态广播切 □/❐；标题栏 h-11 且内嵌**全局搜索栏**（按功能域作用域：书库=标题/路径过滤已接线，阅读器=引擎内搜索占位、房间=搜房间占位；Ctrl+F 聚焦/Esc 清空）② **挂载线实体**（`ReaderRail`）：横向挂载线**延伸整个页面宽度**（左段目录/中段纯线跨正文上方/右段参数），目录左段垂挂、**阅读参数挂右段下方——点右段开合、折叠向上收回线里、内容中间对齐、面板内「收起」废除**、原右侧独立召唤条废除；目录折叠时点线（左段）=展开 ③ **键鼠意图层骨架**：`domain/input.ts` 纯函数绑定表 + `useKeyIntents`（ref 装载防过期闭包），Reader/TitleBar 全部迁移 ④ **离屏解析**：kookit getMetadata 移独立进程（封面/元数据提取期间主窗口 CPU~10%，328 本积压一轮收敛）；TXT 全格式打不开修复（chardet 编码检测）⑤ **书库窗口化渲染**（`useVirtualRange`，328 本流畅）⑥ **架构审查三修**：CoverQueue 依赖倒置 / ReaderSettings 提升领域层 / buildKookitConfig 去重 ⑦ 数据建模立项：`DATA_MODEL.md` v2（统一 SQLite 单库，待批复）。⚠ 内容随 v0.1.15 一并交付 |
| v0.1.13 | 2026-09-12 | **窗口与阅读器交互大版本（本地侧）**：① **无边框窗口 + 自绘标题栏**（`frame:false`，min/max/close 经 `win:*` IPC（`handle`，用 `.on` 会 No handler——实测踩坑），最大化状态广播切 □/❐；标题栏 h-11 且内嵌**全局搜索栏**（绝对定位几何居中；按功能域作用域：书库=标题/路径过滤已接线，阅读器=引擎内搜索占位、房间=搜房间/服务器占位；Ctrl+F 聚焦/Esc 清空）② **挂载线实体**（`ReaderRail`）：横向挂载线**延伸整个页面宽度**（左段目录/中段纯线跨正文上方/右段参数），目录左段垂挂、**阅读参数挂右段下方——点右段开合、折叠向上收回线里、内容中间对齐、面板内「收起」废除**、原右侧独立召唤条废除；目录折叠时点线（左段）=展开 ③ **键鼠意图层骨架**：`domain/input.ts` 纯函数绑定表（规范化/解析/冲突自检）+ `useKeyIntents`（ref 装载防过期闭包），Reader/TitleBar 全部迁移（常驻挂载必须带 enabled 守卫——书库按 t 会误触阅读器）④ **离屏解析**：kookit getMetadata 移独立进程（`IMetadataExtractor` 端口 + parse.html 双入口 + main 中继），封面提取期间主窗口 CPU~10%，328 本积压一轮收敛；TXT 全格式打不开修复（chardet 编码检测注入 charset，GBK/UTF-8 实测分章 OK）⑤ **书库窗口化渲染**（`useVirtualRange`，可视区 ±4 行，328 本流畅）⑥ 书库返回闪封面首修（离场收起详情抽屉——后报未命中，待复现）⑦ **架构审查三修**：CoverQueue 依赖倒置（IImageThumbnailer 端口）/ ReaderSettings 提升领域层 / buildKookitConfig 去重 ⑧ 数据建模立项：`DATA_MODEL.md` v2（统一 SQLite 单库/书箱/多书库/Note 实体 v2/跨格式锚点判断/墨迹建模，待批复）。验证：typecheck 双绿；窗口控制/两主题/挂载线/328 本书库实机核验 |
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
- kookit 子模块的 `CLAUDE.md` 规则：**禁止在其仓库内 git commit / push**

## 6. 交接快照（2026-09-13 会话末更新）

**工作区状态**：全部已提交；版本 = **client v0.1.15 已发版**（tag `client-v0.1.15`；
产物 `client/release/TuRead-0.1.15-win-x64-setup.exe` —— v0.1.13/v0.1.14 的客户端内容一并交付）。
kookit 子模块的 `m` 是其自身工作树噪音，勿动。

**当前主线：书架页向文件资源管理器对齐（全部探针验证过）**：
- 存储层 = 单一 SQLite 库（一库一 .db；config.json = 引导文件；迁移器用户实机已跑完 327 本）。
- 书库双模式：虛擬映射（真实文件夹树）/ 自建書箱（自建树）；書箱 = 一等条目（选中/进入/F2/右键/拖拽）。
- **移动全量交互（⑭）**：书与書箱均可拖拽（拖入箱、拖出箱到根段、拖到面包屑段）；
  右键「移動到」子菜单（上一層/根層/兄弟書箱）；`moveContainer` 后端防成环；面包屑拖入段高亮。
- **书架三则（⑮，用户三条决策）**：① 全局禁选（正文除外；输入类豁免）② 层级后退/前进
  （历史栈 + 标题栏按钮 + 鼠标侧键；总线 `libraryNavBus`）③ 面包屑根固定（固定宽度容器，根锚死）。

**下一步（按 TODO，动手前先与用户对齐）**：
- **「可见性与追踪」讨论（用户点名要参与）**：虚拟映射的书被外部增删改/在 TuRead 内移除后怎么办——
  快照/惰性重扫/fs watch 三档 + "丢失书"的呈现语义。
- 書箱排序（container_books.sort 已建模未接 UI；资源管理器语义 = 拖动重排或排序菜单，形态待定）。
- 笔记/划线落地（Note 实体 + TextAnchor + 定位转换机制，契约均已立）。
- 库管理完善（移除引用的 UI/确认流程、库目录可配置）；**迁移器退役**（发版滚一轮后删）。
- 旧账：分页模式交互用户复测仍异常（待复现细节）；「重开书偶发空白」两处候选均已埋日志待复现。
  **⑮ 挂账 = 鼠标侧键（无头环境模拟不了 XButton 事件）+ 全局禁选的拖选，需用户真机实测。**

**验证工具链（回归全靠它们）**：
- `TUREAD_USER_DATA=<目录>` = 独立 userData（**验证永远用它，别碰真实书库**）。
- `TUREAD_DEV_PROBE=library` + `TUREAD_DEV_BOOK=<书>` = 多库/書箱无头探针（**20 断言**，含移动/防成环；
  ⚠ 断言数是 20，此前文档与提交信息写过的"21"是数错，已更正）；
  `TUREAD_DEV_BOOK` 单跑 = 渲染自检；`TUREAD_DEV_SQLITE=1` = 原生模块 spike。
- UI 交互验证：computer-use 真实点击；换 Electron 版本后 `npm run rebuild:sqlite`；打包走代理（NETWORK.md）。
  ⚠ **沙箱提示**：`npm run dev` 走 esbuild 的管道 stdio，在受限文件沙箱下 spawn 直接 `EPERM`
  —— 起 Electron 验证需要在放宽模式下跑（本轮实测确认）。

**⑮ 的真机验证清单（用户执行；agent 环境无 computer-use，侧键 XButton 也合成不出来）**：
1. 用安装包启动（或 `TUREAD_USER_DATA=<临时目录> npm run dev`）→ 进书架，
   在标题栏/状态栏/列表任意**非输入框文字**上按住拖动：应当**没有选区**（正文与输入框之外全域禁选）。
2. 在搜索栏、書箱更名、新建库命名里拖选：应当**可以选中/复制**（输入类豁免生效）。
3. 打开一本书（EPUB 或 TXT），在正文里拖选：应当**可以选中**（正文在 kookit iframe 内，未受影响）。
   ⚠ 已知：PDF 文本层的 `user-select:none` 来自 pdf.js 自带样式（非本轮规则），PDF 正文里选不中属既有行为。
4. 鼠标侧键：书库页按**侧键后退/前进**应当切换层级（等效标题栏按钮），且**不触发窗口历史导航**；
   标题栏按钮与面包屑回跳也应当同步更新可用态（不可用时禁用）。
5. 若 1/4 有异常，回报"哪一步 + 现象"即可（例如拖动后出现选区、侧键无反应或翻错层）。

**关键对象速查**：`LibraryManager`（主进程库管理器）｜`SqliteStore`（一库一实例，close 后可 init 重开）｜
`store:*` IPC 一律打「当前库」｜切库信号 = main 广播 `store:library-changed`｜契约版本 v0.3.8（CONTRACTS §8）。
