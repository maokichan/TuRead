# 渲染层风格基线（Style Baseline）

> 归属：**client 专属**。权威范围：`client/src/renderer/**`（UI 外壳 + 展示组件 + `styles.css`）。
> **不约束** core（domain / [ports](contracts/ports.md) / usecases / adapters）——风格是外壳的事，端口契约见 [`client/docs/CONTRACTS.md`](CONTRACTS.md)。
> 状态：**生效中**。本文是渲染层开发的**准则**：新组件先读本文，再动代码。
> 本文只写**现行规则**；修订史与决策过程随版本管理（git tag / 提交信息），不入本文。
> 结构：本文 = 定性 + 原则 + **索引** + 禁区（红线级内容留守）；细则按 § 拆入 [`style/`](style) 子页
> （**原 § 编号全部保留**——其他文档引用「STYLE §5.8」这类写法依然可解析）。
> 冲突裁决顺序：本文 > [`client/docs/FEATURES.md`](FEATURES.md)（功能划分）> 组件内注释。改本文 = 契约先行，同 commit 更新。
> 登记位置：仓库根 [`AGENTS.md`](AGENTS.md) 阅读顺序表；红线「渲染层开发先读本文」。

---

## 1. 风格定性

**文字即界面（typographic chrome）**：界面用"排印过的文字"承担导航、动作与状态，
把字体（而非边框、图标、色块）作为主要的视觉语汇。

三个来源，缺一不可：

| 来源 | 提供什么 | 本项目的落点 |
|---|---|---|
| 排版优先（iA Writer 谱系） | "chrome 可以不存在"的哲学；用一套字体解决专注 | 无顶栏/无 logo/无菜单栏；文字按钮 |
| 瑞士国际主义（栅格 + 层级） | 层级靠字号/字重/留白，而非颜色与装饰 | 灰阶 token + 单一 accent |
| 中文排版规范（赫蹏 / jlreq） | 汉字与西文混排、标点、行距的**硬规则** |[style/typography.md](style/typography.md)（本基线的核心增量） |

> 现状：书库/阅读器/房间/设置的动作入口已统一为文字按钮（`.text-action`），
> 边框只剩输入类与浮层两类例外（[style/components-shell.md](style/components-shell.md) §5.2）。

### 1.1 空间语法术语

卡片层次化模型（[`docs/DIRECTION.md`](../../docs/DIRECTION.md) §2）的沟通词表，本文、代码注释与批次描述统一用这套名字：

| 术语 | 含义 |
|---|---|
| **chrome 底面**（base layer） | 窗口背景的连续一整面；导航图标与窗控是**住在它上面的内容**，不是"栏"。无分隔线、无栏间底色差，底面整面是窗口拖拽区。 |
| **inset / gutter** | 卡片与底面、区域与区域之间**不可见的结构性留白**；区域划分靠它声明，不靠视觉边界。token 落点 = [tokens](style/tokens.md) 页 §3.4。 |
| **卡片**（card / surface） | 浮在底面上的功能界面（书库/阅读/笔记/房间/设置五张）。统一卡面 = 桌色面 + `--radius-panel` + 1px 边 + `--shadow-panel`；阅读器的"纸"由阅读器自持。 |
| **elevation** | 卡与卡的上下关系。卡片叠置目前只允许一层（阅读卡 ⊃ 书库卡）；菜单/弹窗/命令面板走 [tokens](style/tokens.md) 页 §3.5 的浮层档位，不算卡片层。 |
| **scrim** | 叠置卡片下方压暗下层的遮罩（`--overlay-dim`），同时挡住下层交互。 |
| **卡片本地工具** | 卡片只持自己的语境工具；**搜索不住卡内**（搜索回底面顶条带，全局生命周期、按激活域分流，[`client/src/renderer/src/features/chromeSearchBus.ts`](../src/renderer/src/features/chromeSearchBus.ts)）；全局键盘路径 = 命令面板。底面全局件 = 窗控、**后退/前进**（恒在——职能按域分流，书库域 = 层级历史，未接历史机构的域恒禁用）、**全局搜索框**（无绑定域 = 禁用 + 域占位）。**阅读标签条住侧栏**（[`client/src/renderer/src/components/TagRail.tsx`](../src/renderer/src/components/TagRail.tsx)，用户定：功能组件之下、分界线之下，窄格首字 + 悬停揭示全题，见 [style/components-shell.md](style/components-shell.md) §5.2 ⑦），不住顶栏。 |

## 2. 五条原则（冲突时按序裁决）

- **P1 文字优先**：功能入口、动作、状态**优先**以排印过的文字呈现。边框/图标/色块是**例外**，
  必须在 [style/components-shell.md](style/components-shell.md) §5.2 的例外清单里列明；新增例外要改本文。
- **P2 一套字体**：界面 chrome 只用**一套字体**（西文 Times New Roman + 中文源流明體，[tokens](style/tokens.md) 页 §3.1）；
  **阅读器正文由 kookit / 电子书决定，基线不干预**。字体不承担层级，层级交给 [tokens](style/tokens.md) 页 §3.2 的字号。
- **P3 层级靠排版**：字号 → 字重 → 字距 → 行距 → 留白。颜色只做"**一次**强调"，不承担分类。
- **P4 内容优先**：chrome 可消失。不设常驻顶栏/logo/状态栏（诊断日志在设置里）。
- **P5 动效有据**：动效的裁决不是「要不要」而是「**为什么 / 多快 /
  什么曲线**」—— 高频键盘动作（上百次/天）不做动画；时长与曲线一律走 [tokens](style/tokens.md) 页 §3.3 的动效 token，
  组件禁写死；**进比出慢**（揭幕 220ms，收回 160ms）；只动 `transform / opacity / clip-path / filter`
  （合成层），禁 `transition: all`；**无弹跳/无缩放**；按压态必须有（[style/components-shell.md](style/components-shell.md) §5.1）；
  reduced-motion = 保留透明度/色温，去掉位移与揭幕。

## 索引（细则按原 § 编号拆入子页；本文只持 §1/§2/§6/§7）

| 原 § | 内容 | 子页 |
|---|---|---|
| §3 令牌（+ §5.6 深色专项） | 字体 / 字号白名单 / 字距行距留白圆角阴影动效 / 颜色 / 交互状态语言与层级档位 |[style/tokens.md](style/tokens.md)|
| §4 中文排版 | 混排间距 / 标点禁则 / 行宽行距 / 段距与缩进 / 纵排预留 |[style/typography.md](style/typography.md)|
| §5.1–5.5 / §5.7 外壳组件 | 文字动作与按压 / 边框底色例外清单 / 图标符号 / 已知偏差 / 负片 / 设置页 |[style/components-shell.md](style/components-shell.md)|
| §5.8 / §5.9 阅读器 | 沉浸态准则（纸与桌 / 卡片页 / 聊天 / 批注输入栏 / 目录内嵌） / 参数清单与预留 |[style/components-reader.md](style/components-reader.md)|
| §5.10 笔记管理 | 两态视图 / 列宽与装箱 / 文字层级 / 选中与右键 / 统计段 / 窗口化 |[style/components-notes.md](style/components-notes.md)|
| §8 验收 | 样张与机检判据 / 无头自检 / grep 断言 / 新组件检查表 |[style/acceptance.md](style/acceptance.md)|

> 令牌值的唯一来源 = [`client/src/renderer/src/styles.css`](../src/renderer/src/styles.css)（`:root` + 三套主题块）；
> 语法守卫 = [`client/src/tests/styleGrammar.test.ts`](../src/tests/styleGrammar.test.ts)（圆角/动效/z 档位，进 `npm test`）。

## 6. 禁区（机器可断言）

1. 组件内写死颜色（`#hex` / `rgb(` / `rgba(`）——只允许出现在 `styles.css`。
2. 白名单外的字号（[style/tokens.md](style/tokens.md) §3.2）。
3. 衬线体使用非 700 字重（唯一豁免见 [style/components-shell.md](style/components-shell.md) §5.4）。
4. 引入图标字体/图标库/彩色 emoji。
5. 多色强调、渐变；**阴影只允许 `--shadow-panel` / `--shadow-modal` 两档 token**
   （组件不得另写 `box-shadow`）。
6. 组件内自行设置 `letter-spacing` / `text-indent` / `line-break`（归 [style/typography.md](style/typography.md) 集中管理）。
7. 圆角字面档位类、`z-<数字>` 字面档位、缺 `--dur-` 时长的 `transition-*` 类
   （机器断言 = [`client/src/tests/styleGrammar.test.ts`](../src/tests/styleGrammar.test.ts)，进 `npm test`）。

## 7. 激进档与回退机制

**当前取向：激进文字化**——大幅度以文字取代图形语汇。
为保证**时刻可回退**，遵守三条纪律：

1. **提交粒度 = 回退单元**：一次交付一个 commit，提交信息前缀 `style(client):`。
   回退单次：`git revert <sha>`；回退到某个时间点：`git checkout <sha> -- client/src/renderer`。
2. **逐组件推进**，不做批量全局替换（避免一次改坏全部界面且难以定位）。
3. **不删除旧语汇的代码路径**：被替换的样式若仍可能复用（如边框按钮），
   以注释形式保留在文件顶部（`// 旧档（framed）：...`），便于快速回填。
