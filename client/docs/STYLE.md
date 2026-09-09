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

### 3.1 字体三声部

| 声部 | 字体 | 允许字重 | 用在哪 |
|---|---|---|---|
| **衬线** | `--font-serif-cn`（源流明體 GenRyuMin2 TW Bold，打包，OFL 1.1） | **仅 700** | 侧边栏符号、动作文字按钮、列表标题、文字封面、面板标题 |
| **无衬线** | `system-ui` 栈（`styles.css:200`） | 400 / 500 / 600 | 输入框、表单标签、密集信息、辅助说明 |
| **等宽** | `--mono` | 400 | 指纹、文件路径、房间号、进度、连接标识、日志 |

> ⚠ **硬约束**：源流明體只有 Bold 一个切面（`assets/fonts/NOTICE.md`）——衬线**不能**做字重对比，
> 衬线文字的层级只能靠**字号 / 字距 / 颜色**。这是本基线所有排印决策的前提。
> ⚠ 生僻字（Ext-A/B）不在子集内，会回退到字栈下一档；**不要**用衬线体承载必须可读的正文。

### 3.2 字号阶梯（px，白名单外禁止）

`11 · 12.5 · 13 · 14 · 15 · 17 · 18 · 19`，以及封面自适应 `10–120`（`FittedTitle` 二分拟合）。

| 用途 | 字号 | 声部/字重 |
|---|---|---|
| 技术数据、辅助说明 | 11 / 12.5 | 等宽 400 / 无衬线 400 |
| 表单、正文控件 | 13 | 无衬线 400 |
| 面板标题 | 14 / 15 | 衬线 700 / 无衬线 600 |
| 列表标题 | 17 | 衬线 **700 但视觉不加粗**（现状，见 §5 注） |
| 动作文字按钮 | 18 | 衬线 700 |
| 侧边栏符号 | 19 | 衬线 700 |

### 3.3 字距 / 行距 / 留白

| 项 | 基线 |
|---|---|
| 字距 | 中文界面 `0`；文字封面 `0.01em`；小标签/大写标签 `0.6px` |
| 行距 | 界面 `1.35–1.6`；文字封面 `BASE_LEADING 1.02` → 余量分给行距，上限 `2.4` |
| 留白刻度 | `4 / 8 / 12 / 16 / 20`（Tailwind `1/2/3/4/5`），不出现奇数间距 |
| 圆角 | 小控件 `rounded`；行/按钮 `rounded-lg`；面板 `rounded-xl` |
| 阴影 | **仅**详情抽屉 `shadow-2xl`（`BookDetailPanel.tsx:52`）；其余一律无阴影 |

### 3.4 颜色

- 基底**灰阶**：`--bg / --panel / --panel-2 / --border / --border-soft / --text / --muted`。
- **单一强调**：`--accent`（+ `-soft/-strong/-ring/on-accent`）。强调只用于"当前选中 + 主动作"。
- **语义状态色**：`--ok / --warn / --err`（+`-border`）——只表达状态，不做装饰。
- 四套色彩取向（`styles.css:40-184`）：`dark / light / sepia-light / sepia-dark`，
  「跟随系统」只在 `dark ↔ light` 之间切换。**新增取向 = 复制整套 token**，不允许局部覆盖。

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
- 主要动作：導入、发送、打开阅读、创建房间、进入。
- 状态与计数：`3 本`、`提取封面 2/5`、连接状态、房间号。

**主/次动作的区分靠色温，不靠边框**：主动作 `--accent`，次动作 `--muted` → hover 升为 `--text`。

### 5.2 允许边框/底色的例外（必须在此列明）

| # | 例外 | 理由 |
|---|---|---|
| ① | **输入类**：`input` / `textarea` / 下拉 | 可点区域必须可见，文字无法表达"此处可输入" |
| ② | **破坏性动作**（移除、断开、删除）：文字形态 + `--err` 色 | 仍是文字按钮，**只允许用语义色**，不加红框红底 |
| ③ | **浮层**（详情抽屉、菜单） | 需要与内容区分层级 |
| ④ | **状态胶囊**（`StatePill`） | 语义色点 + 文字，属于 §3.4 的状态色 |

> 例外之外若想加边框，先改本文。

### 5.3 图标与符号

- **只允许**侧边栏的汉字单字符号（書/閱/房/設），单色，衬线体。
- **禁止**彩色 emoji、**禁止**引入图标字体或图标库（新增依赖须先过 `借物表.md`）。

### 5.4 现存的已知偏差（待收敛，逐条改）

| 偏差 | 位置 | 处置 |
|---|---|---|
| 房间/设置仍用 13px 无衬线边框按钮 | `RoomFeature/index.tsx:16-22`、`SettingsFeature/index.tsx:113-115` | 按 §5.1 改文字按钮（试点已开） |
| 列表标题 17px 用 `font-normal`，与"衬线只用 700"冲突 | `BookRow.tsx:83` | 保留视觉（700 在小字号偏重）；记为**唯一豁免**，其他衬线一律 700 |
| 中文字距/标点规则缺失 | `styles.css` 全文 | 按 §4 补 `.cjk-*` 区块 |

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
