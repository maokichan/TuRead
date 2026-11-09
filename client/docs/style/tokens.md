# §3 令牌（+ §5.6 深色专项）

> 本页承载风格基线 §3 与 §5.6。**token 值的唯一来源 = [`client/src/renderer/src/styles.css`](../../src/renderer/src/styles.css)**
> （`:root` = 纯色·深，`[data-theme=light|sepia-light|sepia-dark]` 各一套；文件头 = z-index 登记表）。
> 本页不复读代码可自证的现值（每个 `--dur/--z/--radius/--font/--ease`、颜色组的具体值），
> 只留代码说不出的：语义、纪律、why、禁区。改值先改 `styles.css`，再回头核对本页的语义是否仍成立。
> 同级子页：[typography.md](typography.md)·[components-reader.md](components-reader.md)·
>[components-shell.md](components-shell.md)·[components-reader.md](components-reader.md)·
>[acceptance.md](acceptance.md)。

## §3.1 字体（全局统一）

**界面 chrome 只有一套字体**：西文/数字 = Times New Roman（印刷体），中文 = 源流明體（打包，OFL 1.1，
许可语境见 [`client/src/renderer/src/assets/fonts/NOTICE.md`](../../src/renderer/src/assets/fonts/NOTICE.md)）。栈值 = `styles.css` 的 `--font-ui`，
`body` 继承；`--font-serif-cn` 为同值别名。

> ⚠ **顺序不可反**：Times New Roman 无 CJK 字形 → 汉字自动回退到源流明體；
> 若把源流明體放前面，它子集里的拉丁字形会抢走西文。
> ⚠ **阅读器正文不在此约束内**：kookit 在 iframe 内自建样式，宿主字体不会继承进去（§4.3）——
> 电子书的字体/字号由引擎与书本身决定，基线只保证"不改它"。
> ⚠ 源流明體只有 Bold 一个切面 → 中文**不能做字重对比**，层级只能靠字号/字距/颜色。

| 声部 | 字体 | 用在哪 |
|---|---|---|
| 统一界面字体 | Times New Roman + 源流明體 | 全部界面文字：导航、按钮、标题、字段、状态、日志 |
| 阅读正文 | 由 kookit / 电子书自身决定 | 阅读页 iframe 内 —— 基线**不干预** |

> `--mono` 保留为同值别名（现与正文字体同值）；要恢复"技术数据等宽对齐"时把它改回
> `monospace` 栈，并重新评估与 P2 的关系。

## §3.2 字号阶梯（px，白名单外禁止）

`11 · 12.5 · 13 · 14 · 15 · 17 · 18 · 19 · 22`，以及封面自适应 `10–120`
（[`client/src/renderer/src/components/FittedTitle.tsx`](../../src/renderer/src/components/FittedTitle.tsx) 二分搜索"不溢出的最大字号"；
`BASE_LEADING 1.02`，余量分给行距、上限 2.4）。

`22` 仅用于**底部状态栏**（书库 / 笔记管理）的文字按钮：`.text-action--lg` 与 `.view-switch`。

| 用途 | 字号 | 声部/字重 |
|---|---|---|
| 技术数据、辅助说明 | 11 / 12.5 | 400 |
| 表单、正文控件 | 13 | 400 |
| 面板标题 | 14 / 15 | 700 |
| 列表标题 | 17 | **700 但视觉不加粗**（唯一豁免，见 shell 页 §5.4） |
| 动作文字按钮 | 18 | 700 |
| 侧边栏符号 | 19 | 700 |
| 状态栏文字按钮 | 22 | 700，字距 `0.08em` |

## §3.3 字距 / 行距 / 留白 / 圆角 / 阴影 / 动效

| 项 | 规则（值 = `styles.css`） |
|---|---|
| 字距 | 中文界面 `0`；文字封面 `0.01em`；小标签/大写标签 `0.6px`；状态栏文字按钮 `0.08em`。组件不得自行设置（禁区 6） |
| 行距 | 界面 `1.35–1.6`；文字封面 `BASE_LEADING 1.02` → 余量分给行距，上限 `2.4` |
| 留白刻度 | `4 / 8 / 12 / 16 / 20`（Tailwind `1/2/3/4/5`），不出现奇数间距 |
| 圆角 | **四档语义 token（值随从属深度升档）**：`--radius-control`（输入框/小控件）→ `--radius-item`（行/卡）→ `--radius-panel`（浮出面板/页内面板盒）→ `--radius-modal`（模态对话框）。组件一律 `rounded-[var(--radius-*)]`，**字面档位类禁用**（[`client/src/tests/styleGrammar.test.ts`](../../src/tests/styleGrammar.test.ts) 守卫）；`rounded-full`（胶囊）豁免。内层 ≤ 外层 − padding。**圆角/直角两族裁定（用户定，按归属分族）**：圆角族 = chrome/卡片世界的一切实体表面（卡、浮出面板〔含命令面板〕、模态、输入、行卡）；直角族 = **挂载线家族**（阅读器正文上的动作浮层：右键挂载菜单、批注输入栏）——那是阅读器的识别性语汇。判定一句话：**长在正文纸上的 = 直角，长在底面/卡片上的 = 圆角**。两种东西不卷入：**选中标记**（负片矩形、面包屑拖入高亮——标记不是表面，随先例直角）与**条带语汇**（侧栏标签格/窗控的无框色温段——段不是盒，无圆角可言） |
| 阴影 | **两档 token**：`--shadow-panel`（面板层）/ `--shadow-modal`（对话层），按档位使用；暗色主题的层级仍以「边框 + panel-2 提亮」为主，阴影只做补强（纯阴影在深色上不可见） |
| 动效 | **动效 token 是唯一来源**：时长 `--dur-press/--dur-hover/--dur-veil/--dur-panel/--dur-flash/--dur-view`，曲线 `--ease-out`（进场/揭幕）、`--ease-inout`（同屏位移与主题切换渐隐）、色温/hover 用普通 `ease`。**组件禁写死时长/曲线、禁 `transition: all`**；组件里出现 `transition-*` 类的行必须带 `--dur-`（守卫）。纪律细则 = P5：**进比出慢**（揭幕 220ms，收回 160ms）；只动 `transform / opacity / clip-path / filter`（合成层）；**无弹跳/无缩放**；按压态必须有（shell 页 §5.1）；reduced-motion = 保留透明度/色温，去掉位移与揭幕。视图切换闪屏 = `--dur-flash` 且闪屏中可再点（[`client/src/renderer/src/components/viewSwitchFlash.ts`](../../src/renderer/src/components/viewSwitchFlash.ts) key 重挂重启）；大状态切换的"落定" = [`client/src/renderer/src/components/motion.ts`](../../src/renderer/src/components/motion.ts) 的 `playSettle`（200ms 短促模糊，仅此一瞬、永不常驻）；主题切换经 [`client/src/renderer/src/components/themeTransition.ts`](../../src/renderer/src/components/themeTransition.ts) 全局颜色渐隐 `--dur-view`。卡片页开合的单驱动 `--slot-w` 见 [reader](../features/reader.md) 页 §5.8 |

## §3.4 颜色

- 基底**灰阶**：`--bg / --panel / --panel-2 / --border / --border-soft / --text / --muted`。
- **单一强调**：`--accent`（+ `-soft/-ring`）。强调只用于"当前选中 + 主动作"。
- **语义状态色**：`--ok / --warn / --err`（+`-border`）——只表达状态，不做装饰。
- **主题模型（权威 = [`client/src/core/domain/theme.ts`](../../src/core/domain/theme.ts)）**：**2 主题 × 2 模式** ——
  主题（tone）＝ 纯色（黑灰白）｜羊皮纸（暖棕）；模式（mode）＝ 深｜浅。数据层沿用四值
  `dark / light / sepia-light / sepia-dark`。「跟随系统」只作用于**模式**，在**所选主题内**解析。
  **新增取向 = 复制整套 token**，不允许局部覆盖。
- **阅读页跟随模式**：`--page-bg/--page-text` 是正文页的纸色 —— **深色模式必须用该主题的深色纸**
  （用户定：夜间模式与深/浅选择挂钩，深色主题不留白纸）。
  非 PDF 正文的深色渲染由 `IRenderService.applyTheme` 注入（契约总纲 §4.1）；
  浅色不注入、保留书的外观。
- **阅读页的"桌"与"纸的边"（四套主题各一组）**：`--desk-bg`（纸外背景）+ `--page-edge`（纸的 1px 边）。
  **内容与背景靠颜色区分**——桌比纸暗一档，纸再有边线；不用阴影/圆角。新增取向时这两项随整套 token 一起复制。
- **阅读页布局尺寸 + 视图列宽（同一处登记 = `styles.css` `:root`，避免多处硬编码漂移）**：
  `--sidebar-w`（侧边栏宽度，AppShell 与内嵌目录几何共用）、`--read-width`（正文列宽，由「设置」写到
  documentElement）、`--page-pad-x`（**纸内边距**，由适配器注入 `body{padding-inline}`）、
  `--rail-panel-w`（内嵌目录与右卡**共用**的固定宽度 → "同宽"）、`--rail-panel-h`（高度上限）、
  `--rail-gap`（卡与纸/卡与卡之间必留的缝）、`--slot-w`（卡片页槽位宽 = `--rail-panel-w + --rail-gap`；
  `@property` 注册的可插值长度，开合的唯一驱动，见 [reader](../features/reader.md) 页 §5.8）、
  `--inset-top` / `--inset-x`（卡片层 inset，`.card-region` 唯一消费方）、
  `--tag-flyout-max-w`（标签揭示胶囊宽度上限，shell 页 §5.2 ⑦）、
  `--toc-press-ink` / `--toc-press-hi` / `--toc-press-lo`（目录压印字与两道边缘阴影，四主题各给）、
  `--scrim-blur`（聚焦舞台景深幕模糊半径，功能总纲 §10）、
  `--page-w`（纸宽的生效值，**唯一定义处**：`min(用户档位, 100vw − 侧边栏 − 2×inset − 2×(挂件 + 缝))`，
  全固定 token、锚定视口——**让位的是纸、不是线**；⚠ 算式必须含 `--sidebar-w`，
  挂件从侧边栏右缘起算，少算会压纸。[`client/src/renderer/src/AppShell.tsx`](../../src/renderer/src/AppShell.tsx) 的 `.reader-stage` 与
  [`client/src/renderer/src/components/NoteComposer.tsx`](../../src/renderer/src/components/NoteComposer.tsx)（宽 = 它的 0.9）**都读这一个值**，不许各自再算）、
  `--toc-veil-rest`（参数面/聊天行静息遮罩不透明度，越大越淡）、
  `--note-col-w`（笔记管理列宽，见 [notes](../features/notes.md) 页 §5.10）。
  ⚠ **面板宽度与位置一律不由 `--read-width` 派生**（线的长度不许是纸的函数）；
  右段 = **独立卡片页**（阅读卡的兄弟卡，与阅读卡之间一道沟 = `--rail-gap`、自带卡面），
  内嵌目录贴阅读卡左缘（top: 50% 半高起排）。
- **负片（反色矩形块）**：`--negative-bg: var(--text)` / `--negative-text: var(--bg)` ——
  派生自各主题的 text/bg，四套取向自动成立。语义 = 文字块成为"纸的反面"。
  **只允许 shell 页 §5.5 登记的用法**（负片底两处 + 窗控关闭键借 `--negative-text` 字色）。
- **笔记/划线四色 `--note-{yellow,green,blue,red}`**：**语义内容标记色**，性质同 `--ok/--warn/--err`
  （表达内容状态，**不做装饰**）——"读者标记内容"这一功能本身需要可区分的色。
  四套取向**各给一组具体值**（不派生：同一色在深纸与浅纸上不可通用）。
  - 值只在 `styles.css`（颜色唯一来源）；**库内只存语义名**（`Note.color` = 语义名，非 hex，
    契约总纲 §2 `NoteColor`）。
  - ⚠ **约束（决定取值口径）**：kookit 对非 PDF 高亮统一渲染为 `rgba(<该值>, 0.8)` 并叠在正文上
    → **深色取向必须用低亮度高饱和**，否则浅色块压浅色字糊成一片。故：
    纯色·深 = 冷调压暗 / 羊皮纸·深 = 暖调压暗；浅色两套才用经典荧光笔色。
  - ⚠ 适配器**不能**把 `var(--note-red)` 传给引擎：高亮 span 长在**书的 iframe** 内，
    宿主 CSS 变量不跨文档继承 → 由适配器解析成具体值再内联
    （[`client/src/core/adapters/render/kookitRenderAdapter.ts`](../../src/core/adapters/render/kookitRenderAdapter.ts) 的 `resolveNoteColor`）。
    宿主的色板 UI 本身照常用 `var()`。
- **选区 `--selection-bg`**：默认选区是浏览器系统蓝，与"纯色取向不引入色相"直接冲突（用户判定不美观）。
  四套取向各一组：纯色两套 = **中性灰淡扫**（不引入色相）；羊皮纸两套 = **暖调淡扫**。
  - **只给背景、不给前景色** —— 做成低饱和"淡扫"而非反色块：阅读更温和，且不必担心在深色纸上把
    正文色配错。
  - 两处都要覆盖，**它们是两个文档**：① 宿主侧可选区域（输入框等）→ `styles.css` 的全局
    `::selection`；② **书文档内的正文** → 宿主 CSS 跨不过文档边界，必须由适配器读同一 token 后
    **内联注入**（`buildReaderCss` ④）。缺 token 时告警并回落浏览器默认（不静默）。
- **其余功能性 token（登记）**：`--input-bg` / `--log-bg` / `--log-text`（输入框/诊断日志）、
  `--scrollbar`（滚动条滑块）、`--overlay-dim` / `--overlay-soft`（浮层压暗两档）、
  `--flash-bg` / `--flash-text`（视图切换闪屏反色对，§5.6）、`--reader-dip-peak`（开书暗场峰值）、
  `--note-card-edge` / `--note-flow-edge`（笔记卡片边界显形，[notes](../features/notes.md) 页 §5.10）。

## §3.5 交互状态语言与层级档位（机器守卫 = [`client/src/tests/styleGrammar.test.ts`](../../src/tests/styleGrammar.test.ts)）

**配色合理化交互**：同一根鼠标在全应用得到同一种"我指到了"的反馈；层级档位有名字、有登记。

| 状态 | 语言 | 备注 |
|---|---|---|
| hover | **底色轻叠加** `--state_hover`（内容色 8%，M3 state-layer 口径）——全应用唯一的悬浮隐喻 | 图像卡（书库网格封面/書箱格）图面吃掉底色，允许**边框升档**作辅助信号；浮层菜单项保留 `--accent`+`--accent-soft`（= 选中同语言）；窗控关闭键红底 = 破坏动作例外；侧栏符号格（功能导航/标签格）hover = 色温升档、不着底 |
| active | 按压下沉（shell 页 §5.1，色温/位移 0ms 到位） | 不变 |
| selected | `--accent-soft` 底 + accent 系边框/ring —— **全应用唯一强色时刻** | accent 纪律：非选中、非主动作不得常驻 accent。例外一处：侧栏标签格选中 = `--panel-2` 满格轻底 + `--text`（shell 页 §5.2 ⑦——标签是"开着的书"，不用 accent 也不用负片） |
| disabled | **全局单档降透明** `--disabled-opacity`（0.4） | "空态提示"是内容不是禁用，不吃本 token |
| focus | 输入类 border → `--accent`；键盘焦点 ring | 已统一，不变 |

**层级三件套**：
- **圆角四档** = 从属深度（§3.3 行）：值随"谁包含谁"升档；族归属按 §3.3 的两族裁定。
- **阴影两档** = 浮起深度（§3.3 行）：面板层 / 对话层；挂载线家族继续无阴影。
- **z-index 五档命名档位**（`--z-chrome/--z-drawer/--z-menu/--z-modal/--z-command`，
  登记表 = `styles.css` 文件头注释）：组件与样式一律 `var(--z-*)`，字面值禁用；**阅读器内部微序**
  （线1/纸2/垂挂15/16、toc-row 内部 label/veil）是 [acceptance](acceptance.md) 页 §8 机检守护的本地几何，
  保留字面值、不占档位。

## §5.6 深色主题专项（**专项，部分未完成**）

深色主题的问题是**专项**，不在普通样式迭代里顺手改。

| 项 | 状态 |
|---|---|
| 视图切换动画在暗色下不可见 | **已修**：`--flash-bg/--flash-text` 为反色对（`dark` / `sepia-dark` 两套，派生自 text/bg） |
| 「阅读器内部分文字被吞没」 | **已销案**：隔离测试证实非深色注入吞正文 —— 症状来自**指标错**（拿 `innerText` 当"正文长度"，它是排版相关量，同模式两次运行实测 70/109 漂移）。内容量一律用 `textContent`。非 PDF 深色注入本身有效（[reader](../features/reader.md) 页 §5.8） |
| 其余动效与状态色的暗色表现 | **待复核** |

**剩余做法**：① 全 token 对比度审计（四套取向 × 每个文字色，含 muted/状态色/负片）；
② 阅读页实测四套取向（EPUB + PDF 各一本）；③ 结论回写本页并把规则补进 §3.4。
登记：唯一待办清单「渲染层风格与验收」组。
