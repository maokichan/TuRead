# 交接 · client v0.1.12 发版后（2026-09-11 夜）

> **临时交接，独立于 docs/ 体系**（不并入 MAP/STATUS）。下次会话**先读本文件**再接续。
> 后续项做完后删除本文件（进度已落在 `docs/STATUS.md` §3/§4 与 `TODO.md`）。
> 上一份交接（阅读器 MVP ／夜间模式，同名日期）已完成并删除，内容已并入 STATUS/TODO；
> 本文件是**当天第二份**，覆盖发版与打包之后的状态。

---

## 1. 现状（一句话）

**client v0.1.12 已发版并产出 64 位 Windows 发行包**；server 未动（v0.2.0）。
今日 5 个提交（**未 push** —— push 由真人执行，配方见 `NETWORK.md` §3.1）：

```
26f8d7b4  chore(release): 发行包产出（安装包 + 便携版）+ 记录本地镜像做法
13c577f2  chore(release): Windows x64 打包 + 文档收束 + 借物表退役
de0b4b77  fix(client): 自检判据按格式分开 —— 修 PDF 的两条假阴性（不改产品行为）
e3b7ce7d  docs: client v0.1.12 —— 版本滚动（沉浸态收官入册 / MAP 状态更新）
df076987  feat(client): 右侧阅读参数面板（字号/行距/段距/纸宽/内边距）+ 文档收尾
```
`tag: client-v0.1.12` → `26f8d7b4`（annotated；中途挪过一次，最终指向含打包配置的提交）。

**发行物**（`client/release/`，已 gitignore，不入库）：
- `TuRead-0.1.12-win-x64-setup.exe`（NSIS 安装包，90.8MB，`oneClick:false`、可选安装目录）
- `TuRead-0.1.12-win-x64-portable.zip`（133MB，解压即用）
- `win-unpacked/`（可直接运行）

**工作树**：干净；只剩 `kookit` 子模块的 npm 安装痕迹（**红线：禁止提交**）。

---

## 2. 今天做了什么

1. **阅读器沉浸态收官（v0.4~v0.8）**：全屏的是「桌」不是正文（`--desk-bg` + 纸 `--page-bg` + 1px `--page-edge`）；
   纸 = 居中定宽列（`--read-width`）+ 纸内边距（`--page-pad-x`，注入 `body{padding-inline}`）；
   **阅读页零控件**（无常驻栏、也不做"浮现栏"，退出 `Esc`）；滚动条 2px 且**短章节整条隐藏**；
   **阅读态侧边栏覆盖式**（打开左侧菜单不影响阅读器宽度）；目录 = 挂载线 + 垂挂列表（遮罩按鼠标距离高亮、默认展示、点条目不收起）；
   **右侧可召唤阅读参数面板**（字号/行距/段距/纸宽/内边距）。权威规则：`client/docs/STYLE.md` §5.8/§5.9。
2. **★ 深色「正文长度异常」销案**（上一份交接 §4 的悬案）：不是深色缺陷，是**指标错** ——
   拿 `innerText`（排版相关；同书同模式两次运行实测 70/109 漂移）当"正文长度"；浅/深两侧
   `bodyHtml=704`、`正文textContent=109` **完全一致**。自检改 `textContent` 判定，并新增
   「`applyTheme` 前后正文不许变」回归断言 + 注入事实输出（计算样式）。
3. **阅读参数分工固定**：宿主几何（纸宽/内边距）走 CSS 变量；正文排版（字号/行距/段距）走
   `IRenderService.applyTypography`（kookit `setStyle` 唯一注入口，一次注入全书生效）；
   **字段缺省 = 不注入**（尊重书自带排版）；数据层存 **px 数值**不存档位名。
4. **四格式自检全绿**（AZW3/EPUB/MOBI/PDF，独立 userData + 深色）：
   `渲染OK / 夜間注入=ok(或 PDF 跳过) / 封面=ok / 字体=ok / 恢复=ok`；并修掉 PDF 的两条**断言假阴性**
   （PDF 位图跳过注入断言；恢复判据对 PDF 数子 iframe 的 canvas，而非顶层 `textContent`）。
5. **文档收束**：STYLE §5.8/§5.9/§5.6/§8.1 去掉版本考古层改规范文本、修与实现不符处（滚动条 2px、
   短章节隐藏机制、删掉已废弃的 `--stage-overflow`）；FEATURES §11 同步（含修掉一处缺损行）；
   CONTRACTS §4.1 去重；STATUS §3 去掉与 §4 重复的长描述。
6. **借物表退役**（用户定）：`git rm --cached 借物表.md` + 根 `.gitignore` 收录（本地保留、文件头写明冻结）；
   STATUS §3 记录决定（含停摆证据）；散落六处"必须先登记"门禁改为"先核许可证与 AGPL 兼容性"。
7. **Windows x64 打包**：`client/electron-builder.yml` + `npm run dist` / `dist:dir`；两个网络坑的解法见 §4。

---

## 3. 下次可直接做的（按建议顺序）

1. **(用户实测，下个版本修) PDF 改变纸宽有预期之外的行为** —— `TODO.md`「渲染与阅读器」首条。
   先复现并写明现象再动手（候选：PDF 页容器/缩放由 kookit 按宿主 `clientWidth` 计算并落到具体像素，
   改 CSS 变量后是否触发重排/重算需实测，另需确认要不要"改纸宽后对 PDF 重渲染"）。
2. **剩余阅读参数**（改法都已定 = 注入；按 `STYLE.md` §5.9 频率表决定进右侧面板还是设置页）：
   字距、字体（打包字体，引新先核许可证）、对齐、首行缩进、中文标点开关。
3. **(发行物缺件，对外发行前必修) 许可文件随包**：仓库**无 `LICENSE`**（全史都没有）、OFL 全文未随包、
   第三方声明未随包 → 取官方全文（**走代理用 Node 取，不要手抄**）→ 根 `LICENSE` + 字体目录 `OFL.txt`
   + 让 electron-builder 打进包。见 `TODO.md`「工程与测试设施」。
4. **打包产物跑自检不自退** → 拿不到断言文本与退出码（发行版"断言级"验证的前置）。
5. **(P2) 重开书偶发空白**（间歇 ~1/3；已在代次守卫命中处补 `console.warn`，复现即可判定；
   自检失败信息已带应用日志尾）。
6. 自检时序脆弱（`waitScrollSettle` 常吃满）+ `getChapter()` 同书同模式给过 0/7 项 + vitest 引入。
7. **同步半边**：三处静默失败型协议漂移（WS 握手缺 `?room=&nick=`、presence 载荷形状、join-ack reason），
   见 `docs/STATUS.md` §4。

---

## 4. 环境与操作要点（今天新学到，能省下次半小时）

- **沙箱升级**：下列命令类别会因"工作区外写入 / 管道子进程"失败，需一次性 `danger-full-access` 并写明理由 ——
  Electron 自检与打包（写 `%APPDATA%\turead-client`、`%LOCALAPPDATA%` 缓存）、`npm install`（npm 缓存）、
  Vite dev server（esbuild spawn EPERM）。纯文件/shell 操作（git、读文档、改文件）**无需**升级。
- **打包两条硬约束**（详见 `client/electron-builder.yml` 注释）：
  ① `electronDist: node_modules/electron/dist` —— electron-builder 自带下载器在本地代理上会**静默挂起**
     （不报错也不超时；实测进程 6 分钟 CPU 仅 0.5s），而 Electron 发行版本来就在本地。
  ② NSIS/winCodeSign 组件走**本地镜像**：`ELECTRON_BUILDER_BINARIES_MIRROR=http://127.0.0.1:8788/`。
     组件与脚本已备在 `D:\PROJECT\_turead-probe\`（`mirror/`、`fetch-binaries.mjs`、`serve-mirror.mjs`）；
     同一个 URL 用 Node fetch 一次就成功 —— 代理对 electron-builder 的 got 下载器不稳。
     镜像需同时提供扁平与 `<name>-<version>/` 两种层级。
- **无头自检**：`$env:TUREAD_DEV_BOOK="<书绝对路径>"; npm run dev`（输出 `[TUREAD-TEST-*]`）。
  **务必用独立 userData**：`npm run dev -- -- --user-data-dir=<临时目录>`，别把测试写进真 appData。
- **git 纪律**：agent 只 `commit` / `tag`，**不 push**；**版本号是否滚动由用户决定**。
- **沙箱 pwsh 的 `$env:TEMP` 是会话临时目录**，与写文件工具解析的真实 `%TEMP%` 不是一处 →
  跨工具传文件用工作区内的绝对路径（本次统一用 `D:\PROJECT\_turead-probe\`）。

---

## 5. 遗留状态（用户数据 / 临时件）

- **用户 appData**（`%APPDATA%\turead-client`）：`config.json` 是**对象形态**主题值（≡ 原字符串 `"sepia-light"`）；
  AZW3 的 `lastLocation` 被隔离测试清过一次。**不要盲目还原**（其后真人用过那个窗口，盲还原会盖掉较新状态）；
  备份在 `_turead-probe\config.json.bak` / `library.json.bak`。
- **脚手架** `D:\PROJECT\_turead-probe\`（14.7MB）：备份 / 各轮自检日志 / 打包镜像 / 复现脚本 / commit 信息。
  不需要可整目录删（`mirror/` 建议留着，便于下次离线重打包）。
- `client/test_docs/`（真实样书）、`client/out/`、`client/release/` 均已 gitignore。

---

## 6. 今天定的决策（别再被"洗掉"）

| 决策 | 权威位置 |
|---|---|
| 借物表退役（不逐依赖登记、移出版本控制；**许可义务仍在**） | `docs/STATUS.md` §3；根 `.gitignore` |
| 发行版**只出 64 位 Windows**（NSIS 安装包 + 便携 zip） | `docs/STATUS.md` §3；`client/electron-builder.yml`；`README.md` |
| 阅读态侧边栏**覆盖式**，且**只给阅读态**（其他功能态保持占位；将来扩成显式能力标记） | `STYLE.md` §5.8；`AppShell.tsx` 注释 |
| 阅读参数分工：宿主几何走 CSS 变量 / 正文排版走注入；高频在右侧面板、低频在设置页 | `CONTRACTS.md` §2/§4.1；`STYLE.md` §5.9 |
| **高频参数"随手可及"不得退化成常驻栏**（浮动出来的栏同样是状态栏） | `STYLE.md` §5.8 |
| 自检内容判定用 `textContent`、**不用 `innerText`**；判据按格式分开（PDF 特判） | `STYLE.md` §8.1；`dev/selfCheck.ts` |
