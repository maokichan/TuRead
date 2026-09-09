# 渲染层风格基线（Style Baseline v0.1）

> 归属：**client 专属**。权威范围：`client/src/renderer/**`（UI 外壳 + 展示组件 + `styles.css`）。
> **不约束** core（domain / ports / usecases / adapters）——风格是外壳的事，端口契约见 `CONTRACTS.md`。
> 状态：**v0.1 生效中（2026-09-09）**。本文是渲染层开发的**准则**：新组件先读本文，再动代码。
> 冲突裁决顺序：本文 > `FEATURES.md`（功能划分）> 组件内注释。改本文 = 契约先行，同 commit 更新。
> 登记位置：`MAP.md` 关键文档 §13；红线「渲染层开发先读本文」。

---

## 1. 风格定性

**文字即界面（typographic chrome）**：界面用"排印过的文字"承担导航、动作与状态，
把字体（而非边框、图标、色块）作为主要的视觉语汇。

三个来源，缺一不可：

| 来源 | 提供什么 | 本项目的落点 |
|---|---|---|
| 排版优先（iA Writer 谱系） | "chrome 可以不存在"的哲学；用一套字体解决专注 | 无顶栏/无 logo/无菜单栏；文字按钮 |
| 瑞士国际主义（栅格 + 层级） | 层级靠字号/字重/留白，而非颜色与装饰 | 灰阶 token + 单一 accent |
| 中文排版规范（赫蹏 / jlreq） | 汉字与西文混排、标点、行距的**硬规则** | §4（本基线的核心增量） |

> 当前事实基线：书库已落实文字优先（`LibraryToolbar.tsx:65` 的 18px 加粗衬线文字按钮），
> 房间/设置仍是"13px 无衬线 + 边框按钮"——两套语汇并存，本文就是为了消灭这个分裂。

## 2. 五条原则（冲突时按序裁决）

- **P1 文字优先**：功能入口、动作、状态**优先**以排印过的文字呈现。边框/图标/色块是**例外**，
  必须在 §5 的例外清单里列明；新增例外要改本文。
- **P2 三声部字体**：衬线 = 有语气的界面文字与标题；无衬线 = 表单、密集信息、正文控件；
  等宽 = 技术数据。**一个文字块只属于一个声部**，不混用。
- **P3 层级靠排版**：字号 → 字重 → 字距 → 行距 → 留白。颜色只做"**一次**强调"，不承担分类。
- **P4 内容优先**：chrome 可消失。不设常驻顶栏/logo/状态栏（诊断日志在设置里）。
- **P5 动效克制**：一屏一动作，同一时刻至多一个关键帧，时长 ≤ 650ms，无弹跳/无缩放。

## 3. 令牌（唯一来源 = `styles.css`）

**组件内禁止写死 hex/rgba/字体名**，一律走 token 或 Tailwind 的 `var(--*)` arbitrary value。

### 3.1 字体（2026-09-09 起：**全局统一**）

**界面 chrome 只有一套字体**：西文/数字 = `Times New Roman`（印刷体），中文 = 源流明體（打包，OFL 1.1）。
实现：`--font-ui: 'Times New Roman', 'GenRyuMin TW', …`，`body` 继承；`--font-serif-cn` 为同值别名。

> ⚠ **顺序不可反**：Times New Roman 无 CJK 字形 → 汉字自动回退到源流明體；
> 若把源流明體放前面，它子集里的拉丁字形会抢走西文。
> ⚠ **阅读器正文不在此约束内**：kookit 在 iframe 内自建样式，宿主字体不会继承进去（§4.3）——
> 电子书的字体/字号由引擎与书本身决定，基线只保证"不改它"。
> ⚠ 源流明體只有 Bold 一个切面 → 中文**不能做字重对比**，层级只能靠字号/字距/颜色。

| 声部 | 字体 | 用在哪 |
|---|---|---|
| 统一界面字体 | Times New Roman + 源流明體 | 全部界面文字：导航、按钮、标题、字段、状态、日志 |
| 阅读正文 | 由 kookit / 电子书自身决定 | 阅读页 iframe 内 —— 基线**不干预** |

> 原"三声部"（衬线 / 无衬线 / 等宽）已按用户决定收敛为**单一字体**。
> `--mono` 保留为**同值别名**（避免大范围改动）；若要恢复"技术数据等宽对齐"，
> 把该 token 改回 `monospace` 栈即可——但那时要重新评估与 P2 的关系。

### 3.2 字号阶梯（px，白名单外禁止）

`11 · 12.5 · 13 · 14 · 15 · 17 · 18 · 19 · 22`，以及封面自适应 `10–120`（`FittedTitle` 二分拟合）。
`22` 仅用于书库底部状态栏的两个文字按钮（`.text-action--lg` / `.view-switch`）。

| 用途 | 字号 | 声部/字重 |
|---|---|---|
| 技术数据、辅助说明 | 11 / 12.5 | 400 |
| 表单、正文控件 | 13 | 400 |
| 面板标题 | 14 / 15 | 700 / 600 |
| 列表标题 | 17 | **700 但视觉不加粗**（现状，见 §5.4） |
| 动作文字按钮 | 18 | 700 |
| 侧边栏符号 | 19 | 700 |
| 状态栏文字按钮 | 22 | 700，字距 `0.08em` |

### 3.3 字距 / 行距 / 留白

| 项 | 基线 |
|---|---|
| 字距 | 中文界面 `0`；文字封面 `0.01em`；小标签/大写标签 `0.6px`；状态栏文字按钮 `0.08em` |
| 行距 | 界面 `1.35–1.6`；文字封面 `BASE_LEADING 1.02` → 余量分给行距，上限 `2.4` |
| 留白刻度 | `4 / 8 / 12 / 16 / 20`（Tailwind `1/2/3/4/5`），不出现奇数间距 |
| 圆角 | 小控件 `rounded`；行/按钮 `rounded-lg`；面板 `rounded-xl` |
| 阴影 | **无阴影**（抽屉已于 2026-09-09 去掉 `shadow-2xl`）；层级靠底色与留白 |
| 动效 | 全应用**唯一**动画 = 视图切换 900ms（`view-switch-flash`）；**动画期间按钮 disabled**（防连点导致动画不出现） |

### 3.4 颜色

- 基底**灰阶**：`--bg / --panel / --panel-2 / --border / --border-soft / --text / --muted`。
- **单一强调**：`--accent`（+ `-soft/-strong/-ring/on-accent`）。强调只用于"当前选中 + 主动作"。
- **语义状态色**：`--ok / --warn / --err`（+`-border`）——只表达状态，不做装饰。
- 四套色彩取向（`styles.css:40-184`）：`dark / light / sepia-light / sepia-dark`，
  「跟随系统」只在 `dark ↔ light` 之间切换。**新增取向 = 复制整套 token**，不允许局部覆盖。
- **负片（反色矩形块）**：`--negative-bg: var(--text)` / `--negative-text: var(--bg)` ——
  派生自各主题的 text/bg，所以四套取向自动成立。语义 = 文字块成为"纸的反面"
  （页面白 → 块黑字白）。**只允许详情抽屉的文字块使用**（§5.5）。

## 4. 中文排版（本基线核心增量）

> 此前源流明體只被当"好看的标题字体"用，汉字与西文混排、标点、段距**没有任何规则**。
> 参照：[赫蹏 heti](https://github.com/sivan/heti)（中文排版规范实现）、
> [W3C jlreq](https://www.w3.org/TR/2012/NOTE-jlreq-20120403/ja/)（日文组版要求，CJK 通用）、
> [Typotheque · CJK 組版](https://www.typotheque.com/articles/typesetting-cjk-text-jp)。

### 4.1 硬规则

1. **中西混排间距**：汉字与西文/数字之间应有约 `1/4 em` 空隙。
   优先用 CSS `text-autospace` / `text-spacing-trim`；**浏览器不支持时不做处理**，
   **禁止**用 JS 往文本里插空格（污染数据、破坏复制与搜索）。
2. **标点**：中文用全角标点；数字/英文用半角（不写全角数字）。
   行首禁则（`、。，）」` 等不出现在行首）、行尾禁则（`（「` 不出现在行尾）：
   用 `line-break: strict` + `word-break: normal`；`text-spacing-trim` 支持时启用挤压。
3. **行宽**：中文正文 **28–40 字/行**（超出即增大容器内边距或收窄版心）。
4. **行距**：中文正文比西文松——`1.6–1.8`；界面文字块按 §3.3。
5. **段距 vs 首行缩进：二选一，不得并用**。
   本项目默认 **段间距、不缩进**（界面与阅读页一致，避免"半格缩进"错觉）；
   若将来提供"纸书排版"档，才启用 `text-indent: 2em` 且段距归零。
6. **纵排预留**：容器抽象不得假设横排（避免把宽度写死成"字数 × 字号"）；
   `writing-mode: vertical-rl` 的实装**不在 v1**，但新组件不得阻断它。

### 4.2 落地位置

所有中文排版规则集中在 `styles.css` 的一个区块（`.cjk-body` / `.cjk-ui` 两个类），
**组件不自行设置** `letter-spacing` / `text-indent` / `line-break`。

## 5. 组件规则

### 5.1 必须用文字（P1 默认）

- 导航：侧边栏、视图切换、标签页切换。
- **侧边栏选中态 = 负片块**（`.feature-nav--active`，反色），**不用圆角按钮/底色/描边**
  （2026-09-09 用户定）；未选中 = 单色汉字，hover 只变色温。
- **列表类导航一律是纯文字行**：阅读器目录（`TocPanel`）、房间大厅（`RoomRow`）——
  无边框、无底色、无圆角、无分隔线，靠**留白分行**；hover 只做色温变化。
- 主要动作：導入、发送、打开阅读、创建房间、进入。
- 状态与计数：`3 本`、`提取封面 2/5`、连接状态、房间号。

**主/次动作的区分靠色温，不靠边框**：主动作 `--accent`，次动作 `--muted` → hover 升为 `--text`。
样式统一定义在 `styles.css` 的 `.text-action` / `.text-action--primary` / `.text-action--danger`，
**组件只挂类名**，不得自行写字号/颜色。

**三角负片标记（唯一例外）**：只有**书库底部状态栏的视图切换按钮**带右下角三角
（`.view-switch::after`，`mix-blend-mode: difference` 的**真负片**）。
它**压在文字本身上**（不是贴在按钮外侧）——压到的字形会被反相。
理由：该按钮的职责是**引导用户点击切换视图**；其他文字按钮不需要。
新增带三角的按钮必须先改本文。

**状态栏布局（2026-09-09 定）**：底部状态栏**所有元素统一左对齐**（不再左右对称分布），
分割线随内容区宽度铺开，`pt-4` 让分割线相对内容区上移。
两个文字按钮放大到 22px + 字距 0.08em（`.text-action--lg` / `.view-switch`）。
**不显示书目数量**（无关紧要，2026-09-09 用户定）。

**按钮盒必须紧贴文字**：`.view-switch` 用 `padding: 0` + `line-height: 1.1` + `width: fit-content`。
原因：动画的背景块画在按钮盒上 —— 盒若被 padding 撑大，文字就"填不满背景"，
三角标记也会落到字外面（2026-09-09 修）。**任何带背景动画的文字按钮都要遵守这条。**

### 5.2 允许边框/底色的例外（必须在此列明）

| # | 例外 | 理由 |
|---|---|---|
| ① | **输入类**：`input` / `textarea` / 下拉 | 可点区域必须可见，文字无法表达"此处可输入" |
| ② | **破坏性动作**（移除、断开、删除）：文字形态 + `--err` 色 | 仍是文字按钮，**只允许用语义色**，不加红框红底 |
| ③ | **浮层**（详情抽屉、导入菜单） | 需要与内容区分层级。**抽屉已于 2026-09-09 去掉边框/阴影**（§5.5），只剩「导入菜单」保留浮层边框 |
| ④ | **状态胶囊**（`StatePill`） | 语义色点 + 文字，属于 §3.4 的状态色 |

> 例外之外若想加边框，先改本文。

### 5.3 图标与符号

- **只允许**侧边栏的汉字单字符号（書/閱/房/設），单色，衬线体。
- **禁止**彩色 emoji、**禁止**引入图标字体或图标库（新增依赖须先过 `借物表.md`）。

### 5.4 现存的已知偏差（待收敛，逐条改）

| 偏差 | 位置 | 处置 |
|---|---|---|
| 列表标题 17px 用 `font-normal`，与"衬线只用 700"冲突 | `BookRow.tsx:83` | 保留视觉（700 在小字号偏重）；记为**唯一豁免** |
| 输入框/表单仍保留边框 | `RoomFeature/index.tsx`、`SettingsFeature` | 属 §5.2 例外①，**保留**（输入类必须可见可点） |
| 浮层容器保留边框/底色 | 导入菜单、确认弹窗、连接卡片 | 属 §5.2 例外③，**保留**（内部按钮与菜单项已是文字） |

### 5.5 负片（反色矩形块）—— 仅两处

**用途（2026-09-09 定）**：① 书库详情抽屉的标题与字段；② **侧边栏选中项**（`.feature-nav--active`）。

**抽屉（`BookDetailPanel`）—— 平面结构（2026-09-09 用户定）**

```
┌────────┬───────────────────────────────────┐
│        │ ① 标题条（负片，过长自己滚）        │  ← 三行**等高、同字号**，
│  封面   │ ② 数据行（格式·大小·导入时间·路径）  │     左对齐「封面右缘」，
│        │ ③ 指标行（进度｜上次阅读｜总时长）   │     撑满抽屉宽度
├────────┴───────────────────────────────────┤
│ 描述块（满宽负片）                            │
└────────────────────────────────────────────┘
```

- **三行等高（52px）+ 字号一致（12.5px）**：行高由竖排标签决定（4 字 × 12.5px ≈ 50px）。
- **单行硬约束**：① ② 用 `Marquee`（超出才滚，绝不换行向下生长）；文件路径并入 ②。
- **③ 行宽度按内容分配**：进度块**不带标签**（"已读 42%" 自明）；
  「上次阅读 / 总阅读时间」的标签**竖排在块左侧**（`.vertical-label` =
  `writing-mode: vertical-rl` + `text-orientation: upright`）—— 标签不占额外行高，
  三行才能真正等高。**不要**用 `transform: rotate(90deg)`（那会把字形横倒）。
- 外壳**完全透明**（无边框、无阴影、无底色），下层书库内容从文字块之间透出来。
- 动作按钮用 `.text-action`；**关闭按钮在底部**（Esc / 点抽屉外是主要关闭路径，
  底部按钮只是可见兜底）。
- 占位待实现：总阅读时间（`TODO.md`）、描述内容（`TODO.md`）。

> 为什么不做"全应用负片"：负片是高对比的强调手段，用多了会失去层级（P3）。
> 若要扩大使用范围，先改本文并重新评估对比度。

### 5.7 设置页的分组结构（2026-09-09 定）

设置页**不使用圆角容器**（设置项会持续增加，容器会变成一堆盒子）。
分组 = **副标题（14px 700）+ 上分割线**（`Field` 组件，`border-t` + `pt-4`）；
说明文字用 11px `--muted`。诊断日志同样用分组标题，日志块只保留底色、无边框无圆角。

### 5.6 深色主题专项（**未完成，单独立项**）

用户 2026-09-09 指出：**暗色下问题很多**，例如"阅读器内部分文字被吞没"。这是**专项**，
不在普通样式迭代里顺手改。已修与待查：

| 项 | 状态 |
|---|---|
| 视图切换动画在暗色下不可见（`--flash-bg` 与 `--bg` 几乎同色） | **已修**：`--flash-bg/--flash-text` 改为反色对（`dark` / `sepia-dark` 两套） |
| 阅读器内部分文字被吞没 | **待定位**：候选 = kookit iframe 内容色 / 宿主 `--page-bg`·`--page-text` / EPUB 自带深色样式三者叠加 |
| 其余动效与状态色的暗色表现 | **待复核** |

**做法**（下次专项时）：① 全 token 对比度审计（四套取向 × 每个文字色，含 muted/状态色/负片）；
② 阅读页实测四套取向（EPUB + PDF 各一本）；③ 结论回写本节并把规则补进 §3.4。
登记：`TODO.md` client 首条。

## 6. 禁区（机器可断言）

1. 组件内写死颜色（`#hex` / `rgb(` / `rgba(`）——只允许出现在 `styles.css`。
2. 白名单外的字号（§3.2）。
3. 衬线体使用非 700 字重（唯一豁免见 §5.4）。
4. 引入图标字体/图标库/彩色 emoji。
5. 多色强调、渐变、阴影（除抽屉）。
6. 组件内自行设置 `letter-spacing` / `text-indent` / `line-break`（归 §4 集中管理）。

## 7. 激进档与回退机制

**当前取向：激进文字化**（用户 2026-09-09 决定）——"大幅度使用文字取代，激进尝试以查看效果"。
为保证**时刻可回退**，遵守三条纪律：

1. **提交粒度 = 回退单元**：一次交付一个 commit，提交信息前缀 `style(client):`。
   回退单次：`git revert <sha>`；回退到某个时间点：`git checkout <sha> -- client/src/renderer`。
2. **逐组件推进**，不做批量全局替换（避免一次改坏全部界面且难以定位）。
3. **不删除旧语汇的代码路径**：被替换的样式若仍可能复用（如边框按钮），
   以注释形式保留在文件顶部（`// 旧档（framed）：...`），便于快速回填。

> 版本号是否滚动由用户决定（`docs/STATUS.md` §2）；本档改动并入当前版本，不自行发版。

## 8. 验收

### 8.0 效果确认（第一手段）

`cd client && npm run style` —— **样式样张**（`tools/style-gallery/`）：浏览器里看 token / 字号 /
中文排版 / 各组件状态，**不启动 Electron**。样张只导入真实组件与真实 `styles.css`，
因此"样张所见 = 组件实现"，不会漂移。改 token → HMR 秒级刷新。
（Electron 内的最终复核仍走 `dev/selfCheck.ts`；样张不覆盖 IPC/窗口/kookit 渲染。）

### 8.1 机器断言（可进 `dev/selfCheck.ts`）

- `document.fonts.check('700 16px "GenRyuMin TW"')` —— 衬线体可用（已有）。
- **无边框文字按钮存在性**：书库视图切换 / 導入按钮的 `borderColor` 为 `transparent`。
- **字号白名单扫描**：遍历渲染树，`fontSize` 必须落在 §3.2 阶梯内（封面自适应除外）。

### 8.2 grep 断言（CI/审查用）

- `#hex` 只出现在 `styles.css`；
- `font-family` 只出现在 `styles.css`；
- 组件里不出现 `letter-spacing` / `text-indent`。

### 8.3 新组件检查表（5 条）

1. 这个入口/动作**必须**是文字吗？能不能去掉边框？（§5.1）
2. 文字属于哪个声部？字重是否合规？（§3.1）
3. 颜色是否全部走 token？是否只强调了一次？（§3.4）
4. 层级是否靠字号/留白而非颜色？（P3）
5. 动效是否必要、是否 ≤ 650ms 且只有一个？（P5）

## 9. 参考谱系

**哲学 / 规则集**
- [iA Writer · From Monospace to Duospace](https://ia.net/topics/in-search-of-the-perfect-writing-font/) —— 一套字体解决专注。
- [Butterick's Practical Typography · Summary of key rules](https://practicaltypography.com/summary-of-key-rules.html) ／ [Typography in ten minutes](https://practicaltypography.com/public/typography-in-ten-minutes.html) ／ [Maxims of page layout](https://practicaltypography.com/public/maxims-of-page-layout.html)。
- [Swiss International Style 规则集](https://github.com/zeke/swiss-design-skill) ／ [Implementing Swiss Design Principles in Modern App UI](https://tunmie.bearblog.dev/implementing-swiss-design-principles-in-modern-app-ui/)。

**中文 / 日文排版**
- [赫蹏 heti](https://github.com/sivan/heti) —— 中文排版规范实现（标点挤压/悬挂、混排间距）。
- [W3C 日本語組版処理の要件（jlreq）](https://www.w3.org/TR/2012/NOTE-jlreq-20120403/ja/) ／ [W3C 纵排文本指南](https://www.w3.org/International/articles/vertical-text/index.en)。
- [Typotheque · CJK 組版](https://www.typotheque.com/articles/typesetting-cjk-text-jp)。
- [源流明體官方](https://buttaiwan.github.io/font/) ／ [genryu-font](https://github.com/ButTaiwan/genryu-font)（OFL 1.1，仅 Bold 切面）。
- [qiaomu-design · chinese-typography](https://github.com/joeseesun/qiaomu-design/blob/main/references/chinese-typography.md)。

**同类阅读器（对照）**
- [Anx Reader](https://anx.anxcye.com)（[评测](https://lemmy.ahhh251.xyz/c/android/p/77135/i-found-my-ideal-reading-app-anx-reader-review)）—— CJK 阅读器排版可调的成熟样本。
- [Legado 阅读 · 内容排版优化方案](https://blog.gitcode.com/a9303b682da15bfc8eb65e9f29705349.html) ／ [主题美化的三条路子](https://post.smzdm.com/p/a5rdz383/)—— 中文读者对字距/行距/段距的真实诉求。
- [Thorium Web · Reader Styling](https://deepwiki.com/edrlab/thorium-web/7.1-reader-styling)—— 界面样式与正文样式分层的工程做法。
- [Readwise Reader 的品牌美学](https://blakecrosley.com/zh-Hans/guides/design/readwise-reader)。

## 10. 修订记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.1 | 2026-09-09 | 首版：五条原则 / 三声部字体 / 字号阶梯 / 中文排版 §4 / 例外清单 / 禁区与断言 / 激进档回退机制 / 参考谱系 |
