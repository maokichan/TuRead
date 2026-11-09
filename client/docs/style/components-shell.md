# §5.1–5.5 / §5.7 外壳组件（文字动作 · 例外 · 负片 · 设置页）

> 本页承载风格基线 §5 的外壳部分（阅读器/笔记两域见各自专页）。
> 样式统一定义在 [`client/src/renderer/src/styles.css`](../../src/renderer/src/styles.css)；组件只挂类名，不得自行写字号/颜色。

## §5.1 必须用文字（P1 默认）

- 导航：侧边栏（功能符号 + 阅读标签格）、视图切换。
- **侧边栏选中态 = 负片块**（`.feature-nav--active`，反色），**不用圆角按钮/底色/描边**；
  未选中 = 单色汉字，hover 只变色温。
- **列表类导航一律是纯文字行**：阅读器目录（[`client/src/renderer/src/components/TocPanel.tsx`](../../src/renderer/src/components/TocPanel.tsx)）、
  房间大厅（[`client/src/renderer/src/components/RoomRow.tsx`](../../src/renderer/src/components/RoomRow.tsx)）——
  无边框、无圆角、无分隔线，靠**留白分行**；明暗表达：目录走**压印字 + 字色显影**
  （[reader](../features/reader.md) 页 §5.8；参数面/聊天行仍走遮罩按距离），大厅行走**底色轻叠加**
  （统一悬浮隐喻，[tokens](tokens.md) 页 §3.5；纯文字加 8% 底不碍扫读）。
- 主要动作：導入、发送、打开阅读、创建房间、进入。
- 状态与计数：`3 本`、`提取封面 2/5`、连接状态、房间号。

**主/次动作的区分靠色温，不靠边框**：主动作 `--accent`，次动作 `--muted` → hover 升为 `--text`。
样式统一定义在 `styles.css` 的 `.text-action` / `.text-action--primary` / `.text-action--danger`，
**组件只挂类名**。

**按压态（交互的重量）**：所有可按压元素必须有 `:active` 反馈 —— 文字按钮 = 按压**瞬时**
（0ms）达到 hover 色温、释放按 `--dur-hover` 回落；大目标（`.text-action--lg` / `.view-switch` /
`.feature-nav`）另加 `translateY(1px)` 下沉（transform，不动布局）。印刷世界的按压 = **墨色压深**，
不是缩放——不破「无弹跳/无缩放」的禁令。

**三角负片标记（唯一例外）**：只有**「视图切换」这一个功能**的按钮带右下角三角
（`.view-switch::after`，`mix-blend-mode: difference` 的**真负片**）——
**书库底部状态栏**与**笔记管理底部状态栏**（[notes](../features/notes.md) 页 §5.10）各一个；
两处的**行为也共用**：`view-switch-flash` 闪屏（`--dur-flash`、动画期间可连点）+ 动画期间 `disabled`。
它**压在文字本身上**（不是贴在按钮外侧）——压到的字形会被反相。
理由：该按钮的职责是**引导用户点击切换视图**；其他文字按钮（状态、筛选、循环切换）**都不需要**。
新增带三角的按钮必须先改本文。

**状态栏布局**：底部状态栏**所有元素统一左对齐**（不再左右对称分布），
分割线随内容区宽度铺开，`pt-4` 让分割线相对内容区上移。
状态栏文字按钮放大到 22px + 字距 0.08em（`.text-action--lg` / `.view-switch`）。
**书库状态栏不显示书目数量**。

**按钮盒必须紧贴文字**：`.view-switch` 用 `padding: 0` + `line-height: 1.1` + `width: fit-content`。
原因：动画的背景块画在按钮盒上 —— 盒若被 padding 撑大，文字就"填不满背景"，
三角标记也会落到字外面。**任何带背景动画的文字按钮都要遵守这条。**

## §5.2 允许边框/底色的例外（必须在此列明）

| # | 例外 | 理由 |
|---|---|---|
| ① | **输入类**：`input` / `textarea` / 下拉 | 可点区域必须可见，文字无法表达"此处可输入" |
| ② | **破坏性动作**（移除、断开、删除）：文字形态 + `--err` 色 | 仍是文字按钮，**只允许用语义色**，不加红框红底 |
| ③ | **浮层**（导入菜单、命令面板、模态弹窗） | 需要与内容区分层级，保留浮层边框；**目录挂载列表容器全透明**（[reader](../features/reader.md) 页 §5.8） |
| ④ | **状态胶囊**（[`client/src/renderer/src/components/StatePill.tsx`](../../src/renderer/src/components/StatePill.tsx)） | 语义色点 + 文字，属于 [tokens](tokens.md) 页 §3.4 的状态色 |
| ⑤ | **色块 = 功能信息** | 规则：**颜色本身就是信息**时才允许色块，且**文字仍承担"叫什么"**（不写"叫什么"的纯色圆点不允许）。现行三处：① **右键菜单的色块项**（[`client/src/renderer/src/components/ContextMenu.tsx`](../../src/renderer/src/components/ContextMenu.tsx) 的 `swatch`：这一项落哪种标记色）；② 阅读器笔记行（卡片页筆記页）的**标记块**（`.note-row__mark`，9×9 + 1px `--border-soft` 边）；③ **笔记管理卡片的标记块**（`.note-card__mark`，8×8 同口径，[notes](../features/notes.md) 页 §5.10）。⚠ **禁止把色块升级为色条 / 彩色边框 / 彩色背景** —— 那是装饰（P3） |
| ⑥ | **阅读器两个"动作浮层"：右键挂载菜单 + 批注输入栏** | 这两个是**挂在正文纸上的动作区**（不是界面 chrome 的一部分）：靠"内容与背景同色"会**读不出来**。故允许**纯色底（`--panel-2`）+ 1px `--border` 描边**，项文字用 `--text`（hover → `--accent` + `--accent-soft` 底）。**仍然不给圆角、不给阴影**（挂载线语汇，[tokens](tokens.md) 页 §3.3 的圆角两族不适用于本形态）；批注输入栏另有"**零文字**"要求（无标题、无 placeholder、无按钮，[reader](../features/reader.md) 页 §5.8）。 |
| ⑦ | **侧栏标签区（[`client/src/renderer/src/components/TagRail.tsx`](../../src/renderer/src/components/TagRail.tsx)）两处底色**：① 悬停**衬底胶囊**（`.tag-cell__flyout`：揭示的全题 + `--panel-2` 底 + 1px `--border` 边；宽随标题自适应、上限 `--tag-flyout-max-w`，到顶仍显示不完的**胶囊内无缝滚动**——[`client/src/renderer/src/components/Marquee.tsx`](../../src/renderer/src/components/Marquee.tsx)，同套上下册前缀相同截断就分不出）；② **选中态** `--panel-2` 满格轻底（`.tag-cell--active`） | ① 揭示的全题**越过格界叠在卡片层上**——同 ⑥ 的理由，"内容与背景同色"读不出来；胶囊是"托着字的一片影"：直角、无阴影（条带语汇），随揭示渐显。② 标签是"开着的书"不是"功能位置"——选中**不用负片**（负片留给功能导航，§5.5），色温 + 满格轻底与顶栏选中语言同源。 |

> 例外之外若想加边框，先改风格基线。
> ⚠ **"透明"与"读不出来"是两件事**：目录垂挂列表可以全透明（它是**内容的延伸**，靠排版与留白表达层级）；
> 而**动作区**（可点的功能项、可输入的框）必须自己成一层 —— 这是 ① 与 ⑥ 的共同理由。

## §5.3 图标与符号

- **只允许**侧边栏的汉字单字符号（書/閱/房/筆/設），单色，衬线体。
- **禁止**彩色 emoji、**禁止**引入图标字体或图标库（新增依赖须先核许可证与 AGPL 兼容性）。

## §5.4 现存的已知偏差（待收敛，逐条改）

| 偏差 | 位置 | 处置 |
|---|---|---|
| 列表标题 17px 用 `font-normal` —— 源流明體只有 Bold 切面，浏览器会取该切面（视觉仍偏粗） | `[client/src/renderer/src/components/BookRow.tsx](../../src/renderer/src/components/BookRow.tsx):121` | 记为**唯一豁免**（其余文字块不写 `font-normal`） |
| 输入框/表单仍保留边框 | [`client/src/renderer/src/features/RoomFeature`](../../src/renderer/src/features/RoomFeature)、`SettingsFeature` | 属 §5.2 例外①，**保留**（输入类必须可见可点） |
| 浮层容器保留边框/底色 | 导入菜单、确认弹窗、连接卡片 | 属 §5.2 例外③，**保留**（内部按钮与菜单项已是文字） |

## §5.5 负片（反色矩形块）—— 两处底 + 一处借字色

> 单击详情的常态是「聚焦舞台」（功能总纲 §10）。

**用途**：
① **侧边栏选中项**（`.feature-nav--active`，反色块，直角）；
② **面包屑拖入高亮**（[`client/src/renderer/src/components/LibraryToolbar.tsx`](../../src/renderer/src/components/LibraryToolbar.tsx) 的 crumb `dropHover`，
负片一律**直角**，与 ① 同先例）。
另有窗控关闭键 hover = `--err` 底 + `--negative-text` 字（破坏动作的红，**借负片字色**，不是负片底）。

> 为什么不做"全应用负片"：负片是高对比的强调手段，用多了会失去层级（P3）。
> 若要扩大使用范围，先改风格基线并重新评估对比度。

## §5.7 设置页的分组结构（用户定"无标题/不过多引导/去线"）

**无页面标题**（侧栏「設」已宣示位置）；**无提示段落**——优秀的交互不需要引导文案，
选项的自明性由"标签（13px `--muted` 注脚）+ 值（17px 主声部，选中 = `--accent`）"的
对比承担，层级靠**值是内容、标签退后**。
分组 = **副标题（17px 700）+ 纯留白**（`Group` 组件；全宽 `border-t` 分割线随去线方向退役）。
**布尔语汇 = 「關｜開」两枚文字选项**（`.set-opt` 17px，app 自己 on/off 语汇的
唯一定义处；原生 checkbox 禁用）。文字按钮按压 = `scale(0.97)`（`.text-action` 同口径）。
**键值对贴排版（用户纠偏）**：快捷键清单 = 域/条目**两级缩进**承担层级，
行内 = 意图名（15px 注脚）+ 键位（15px 值）**相邻一道小缝**——键值对的数据特征是键值一体，
不做全宽两端对齐的"左右两望"。
**诊断日志不进设置页**（用户定"用户不会看"；logStore 管道保留给探针）。
**清单裁定的归属**：设置页只收**全局、低频、行为基调**项（主题/阅读器行为/
导入行为/快捷键/插件注册表）；高频与上下文项各归其位（阅读参数 → 卡片页參數面，
视图切换 → 书库工具栏，库目录 → 書庫管理对话框）；未立项的候选（字体/对齐/标点、
滚轮手感、数据面）随底层特性落地时进 §5.9 各自轨道。
**快捷键 = 只读清单**：直接渲染意图绑定表（[`client/src/core/domain/input.ts`](../../src/core/domain/input.ts)），空键位标
「未設」；改键/捕获/冲突检测/恢复默认随配键体系批（前置 = 交互模式目标形态对齐，待办在档）。
**插件 = 注册表**（用户定）：每插件一行（名称 + 啟｜停 + 版本，信息量恒定），
**配置住使用处**（卡片页面板）——设置页不收插件配置项；"插件声明 config schema、宿主在
设置与面板两处渲染同一张表" = 插件贡献点 v2（远期）；插件数量增长后可收缩为一行 +
「管理…」对话框（書庫管理同款语汇，挤了再造，不预支空盒）。
