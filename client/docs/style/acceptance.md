# §8 验收

> 本页承载风格基线 §8。口径总纲 = [`docs/TESTING.md`](../../../docs/TESTING.md)；探针全集的触发方式与沙箱事实也在那里。

## §8.0 效果确认（第一手段）

`cd client && npm run style` —— **样式样张**（[`client/scripts/style-gallery/`](../../scripts/style-gallery)）：浏览器里看 token / 字号 /
中文排版 / 各组件状态，**不启动 Electron**。样张只导入真实组件与真实 `styles.css`，
因此"样张所见 = 组件实现"，不会漂移。改 token → HMR 秒级刷新。
（Electron 内的最终复核仍走 [`client/src/renderer/src/dev/selfCheck.ts`](../../src/renderer/src/dev/selfCheck.ts)；样张不覆盖 IPC/窗口/kookit 渲染。）

> ⚠ **样张也会漂移，且失效方式是"整页黑屏"**：数据层/组件 props 换代而样张没跟着走时，
> 渲染期抛错会卸掉整棵树 —— **不是"样式不对"，是"页面没了"**，而样张是第一手段，基线验收随之瞎掉。
> **两道防线（改数据层 / 组件 props 后必跑）**：
> ① `npm run typecheck:preview`（= `typecheck:all` 的后半）—— 样张代码也在该命令的 TS 检查范围内，
> 漂移当场列出；
> ② `[node_modules\electron\dist\electron.exe](../../node_modules/electron/dist/electron.exe) [client/scripts/style-gallery/smoke.cjs](../../scripts/style-gallery/smoke.cjs)`（需先 `npm run style`）
> —— 真载入页面、量 DOM 事实、抓控制台，判据 = 有面板 + 有文字 + **无页面错误**
> （类型过了不等于能渲染）。细节见 [`client/scripts/style-gallery/README.md`](../../scripts/style-gallery/README.md)。

**几何/对比度类判据一律机检，不靠肉眼**（`smoke.cjs` 里逐条独立、失败时一眼看出是哪条）：

| 判据 | 量什么 | 通过条件 |
|---|---|---|
| `cardOk` | 右欄卡片页（兄弟卡）：与内嵌目录的宽度、内嵌目录贴阅读区左缘、卡贴演示框右缘、与阅读区之间的沟、圆角/描边 | **与内嵌目录同宽**（逐字节相等）、目录贴阅读区左缘 ±1px、**卡贴演示框右缘 ±1px**、**与阅读区的沟 = `--rail-gap`** ±1px、圆角 = `--radius-panel`、**1px 边**（>0 且 ≤1.5px） |
| `widthIndependentOk` | 把演示框的 `--read-width` 从 260px 改成 520px 后再量两件宽 | **一点不变**（宽度不许是纸宽的函数） |
| `paperClearOk` | 纸（`#page-area`）与左垂挂/右卡的矩形 | **横向不相交**（纸让位，[reader](../features/reader.md) 页 §5.8；真机侧 note 探针有同名判据） |
| `tabsSymOk` | 卡片页顶部页签行的中心与**卡片中心**（样本 = 參數/筆記 两格） | 页签行中心 = 卡片中心 ±1px + 页签含 參數/筆記（**前缀匹配**——标签带计数后缀） |
| `chatDrawerOk` | **聊天卡片页**：三格页签、页签行对**卡片中心**、与参数卡同宽同高上限、聊天行、输入框 | 三格（參數/筆記/聊天）+ 页签行居中 ±1px + **与参数卡同宽、`max-height` 同值**（同一对 token）+ `.chat-row` ≥1 + 输入框**发丝描边**（>0 且 ≤1.5px，属 shell 页 §5.2 例外①） |
| `noRoomTabsOk` | **非房间阅读时**卡片页族页签里是否有「聊天」 | **必须没有** —— 没有经房间进入的书就没有这一项；这条防的是"聊天页签泄漏到本地阅读" |
| `followedOk` | 目录滚动容器与"当前条目"（钉在第 12 章）的中心 | **先要求容器真能滚**（`scrollHeight - clientHeight > 40`，否则平凡成立 = 假通过），再要求偏差 ≤ 8px |
| `composerOk` | 批注输入栏 | 零可见文字 + 无 placeholder + 非透明底 + 发丝描边（> 0 且 ≤ 1.5px）+ 水平居中 ±2px + **宽 = 纸宽 × 0.9**（±2px）+ **空态 1.7~2.9 行**、**灌 8 行后 4.2~5.9 行且 `scrollHeight > clientHeight`**（自增长 + 五行封顶转滚动）+ 挂载即聚焦 |
| `paperStillOk` | **开合过渡进行中**的纸视口位置（真实开合经 `window.__railDemoToggleCtl` 拨动，rAF 全程采样） | 纸左缘与收回态基线差 ≤ 1px（开、收两程）+ 停稳态前后一致 + 每帧「槽位实测宽 ≈ 2 × 纸位移」≤ 1px（同源于 `--slot-w`；旧双过渡机制中途必然量出大偏差，此判据能抓回归） |

**压力场景**：`smoke.cjs --scale=N`（可加 `--no-window` 关窗口化做 A/B 对照）读
`window.__notesScale` —— 笔记管理瀑布流的规模回归判据见 [notes](../features/notes.md) 页 §5.10。

> ⚠ **两个会造成假 FAIL 的量法坑**（已写进脚本注释，别踩第二次）：① **描边宽度不能断言字面 `1px`** ——
> 本机 DPR = 1.25（Windows 125% 缩放）时 1 CSS px 吸附成 1 设备 px，`getComputedStyle` 报 **0.8px**；
> ② **居中要跟 `documentElement.clientWidth` 比**，`window.innerWidth` 含滚动条，页面一长就会把
> `fixed` 元素判成偏了 5~8px。

> ⚠ **两个会造成假绿/假卡死的坑**：
> ③ **样张里的受控组件必须由样张自己持有 state** —— 传 `value="" onChange={noop}` 时 React 会立刻把值
> 重置为空，"输入栏自增长"这类**依赖输入内容**的判据在样张里根本测不出来（假绿）；
> ④ **探针脚本的模板字符串里不能写反引号** —— 会提前截断模板 → Electron 弹出 JS 错误框 → 表现为
> "探针卡死"（`node --check <脚本>` 可以秒级发现，改完探针务必先跑它）。
> ⑤ **分段也是判据**：不依赖某个不稳定步骤的断言，**不许挂在那一步上**（noteProbe 曾把 9 条断言
> 挂在"重开书成功"上，而那条路径本身有间歇性故障 → 一命中就整段被跳过，判据等于不存在）。

> ⚠ **探针计时口径（笔记规模 A/B 的数字可信度）**：隐藏窗口不出帧 → rAF 间隔被拉到 ~850 ms，
> 用 rAF 计的 `commitMs`/`refreshMs` 会量出假高值（计时器不受影响）。修法 = 探针关后台节流 +
> `showInactive()` 出帧，并自带**计时环境自检**（空闲 rAF 间隔 > 60 ms 直接判 FAIL）。
> 判定：**探针的假数字/假阴性比 FAIL 更危险** —— 它把真回归盖住。

## §8.1 机器断言（在 [`client/src/renderer/src/dev/selfCheck.ts`](../../src/renderer/src/dev/selfCheck.ts)）

**已实现**（跑一次无头自检即覆盖）：

- `字体=ok` —— 打包衬线体可用：`document.fonts.check('700 16px "GenRyuMin TW"')`。
- `文字封面=ok` —— `FittedTitle` 撑满（字号与填充率双向判据）。
- `夜間注入=ok` —— 正文样式注入前后**正文不许变**（`textContent` 与元素数相同）且注入确实落地；
  **PDF 跳过**（`applyTheme` 对位图本就是 no-op）。
- `注入樣式=` 事实行 —— 注入字符数 + body 的**计算样式**（字号/行距/内边距），证明参数真的进了 iframe。
- `滚动条=隐藏/显示(溢出NNN)` —— 是否真有内容溢出（扣除 kookit 的 +300px 余量）。
- `恢复=ok` —— 走真实用户路径（点侧边栏「阅读」）后**正文确实回来**；判据按格式分（PDF 数子 iframe 的 canvas）。
- 渲染主判据：`可滚动 > 0` 且翻页生效，内容量一律用 `textContent`（**不用 `innerText`**，[tokens](tokens.md) 页 §5.6）。

**未实现**（待办见唯一待办清单）：

- **无边框文字按钮存在性**：书库视图切换 / 導入按钮的 `borderColor` 为 `transparent`。
- **字号白名单扫描**：遍历渲染树，`fontSize` 必须落在 [tokens](tokens.md) 页 §3.2 阶梯内（封面自适应除外）。

## §8.2 grep 断言（CI/审查用；**尚未接入，待办见唯一待办清单**）

- `#hex` 只出现在 `styles.css`；
- `font-family` 只出现在 `styles.css`；
- 组件里不出现 `letter-spacing` / `text-indent`。

## §8.3 新组件检查表（5 条）

1. 这个入口/动作**必须**是文字吗？能不能去掉边框？（shell 页 §5.1）
2. 文字属于哪个声部？字重是否合规？（[tokens](tokens.md) 页 §3.1）
3. 颜色是否全部走 token？是否只强调了一次？（[tokens](tokens.md) 页 §3.4）
4. 层级是否靠字号/留白而非颜色？（P3）
5. 动效是否必要、是否 ≤ 650ms 且只有一个？（P5）
