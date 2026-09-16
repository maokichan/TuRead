# 样式样张（style gallery）

渲染层风格基线 [`client/docs/STYLE.md`](../../docs/STYLE.md) 的**可视化基准**：不启动 Electron，
在浏览器里确认 token / 字号 / 中文排版 / 各组件状态的效果。

## 用法

```bash
cd client
npm run style          # → http://localhost:5199/tools/style-gallery/index.html
npm run typecheck:preview
```

改 `src/renderer/src/styles.css`（token）或任一组件，浏览器 HMR 秒级刷新。

## 设计纪律：**只导入真实件，不复制实现**

| 允许 | 禁止 |
|---|---|
| `import '@renderer/styles.css'`（真实 token） | 手写一份 CSS 副本 |
| `import { BookRow } from '@renderer/components/BookRow'` | 复制组件 JSX 到样张里 |
| mock 数据 + `noop` 回调 | 复制业务逻辑 / 状态机 |

理由：手写静态样张写起来最快，但**会与产品漂移**——一旦漂移，`STYLE.md` §8 的断言就失去意义。
本目录的代价是每个组件需要一份 mock props（`components/*` 是纯 props，成本很低）。

## 两道自检（**改数据层 / 组件 props 后必跑**）

> 起因（2026-09-16）：`npm run style` 曾**整页黑屏**很久没人发现 —— 黑屏不是"样式不对"，是**页面没了**：
> v0.4.0 把 `BookRecord` 拆成 `EditionRecord` + `ReadingState`，样张没跟着走，
> `LibraryToolbar` 的必填 prop `crumbs` 缺失 → 渲染期 `crumbs.map` 抛错 → React 卸掉整棵树，
> 只剩 body 的 `--bg`（一片黑）。而样张是 `STYLE.md` §8.0 的"效果确认第一手段"，基线因此瞎了一半。

```bash
cd client
npm run typecheck:preview      # ① 类型层：tsconfig.preview.json 覆盖样张，漂移当场列出（本次 15 处一个不漏）
npm run typecheck:all          #    与上面等价，但连带 node/web/test 三个 project 一起查
```

类型过了**不等于**能渲染（运行时照样可能抛），所以还有第二道：

```bash
npm run style                  # 终端 A：起 dev server（5199；被占则顺延，见打印的地址）
node_modules\electron\dist\electron.exe tools\style-gallery\smoke.cjs [url]   # 终端 B
# → 判定与全部控制台输出落盘 %TEMP%\turead-gallery-smoke.json；退出码 0 = OK
```

`smoke.cjs` 用 Electron 真载入页面，量 DOM 事实（面板数 / 文字长度 / 挂载线实例数 / 打包字体可用）
并抓控制台，判据 = **有面板 + 有文字 + 无页面错误**（只放行 Electron 的开发期 CSP 警告）。
**2026-09-16 起另有三条几何机检**（几何/对比度类判据一律机检，不靠肉眼）：

| 判据 | 量什么 | 通过条件 |
|---|---|---|
| `mirrorOk` | 两挂件（目录/笔记 ｜ 阅读参数）的外缘到页面中线、宽度、`max-height` | 两侧 gap 相等 ±2px、**同宽** ±1px、**高度上限同值** |
| `followedOk` | 目录滚动容器与"当前条目"（样张钉在第 12 章）的中心 | **先要求容器真能滚**（否则平凡成立 = 假通过），再要求偏差 ≤ 8px |
| `composerOk` | 批注输入栏（点 `#demo-composer-toggle` 挂载后量） | 零可见文字 + 无 placeholder + 非透明底 + 发丝描边 + 水平居中 ±2px + 挂载即聚焦 |

> ⚠ **两个会造成假 FAIL 的量法坑**（已写进脚本注释，别踩第二次）：
> ① **描边宽度不能断言字面 `1px`** —— 本机 DPR = 1.25（Windows 125% 缩放），1 CSS px 吸附成 1 设备 px，
> `getComputedStyle` 报 **0.8px**；
> ② **居中要跟 `documentElement.clientWidth` 比** —— `window.innerWidth` 含滚动条，页面一长就会把
> `fixed` 元素判成偏了 5~8px。
⚠ **环境约束**：Electron 的 Mojo 通道走**命名管道**，受限文件沙箱下必然
`FATAL: platform_channel.cc ... 拒绝访问` → 需在放宽模式下跑（与 `src/renderer/src/dev/selfCheck.ts` 同类）。

## 覆盖 / 不覆盖

- ✅ 覆盖：四套色彩取向 + 跟随系统、动作文字档（主/次/破坏性/禁用）、全局统一字体、字号白名单、
  中文排版（混排间距 / 标点禁则 / 段距 vs 缩进）、以及全部展示组件的真实渲染
  （BookRow / BookTile / FittedTitle / LibraryToolbar / TocPanel / StatePill / RoomRow /
  MemberList / ChatLog / BookDetailPanel / ConfirmDialog）。
- ❌ 不覆盖：Electron 专属行为（IPC、窗口、kookit 渲染、真实书库/服务器）。
  这些仍以 `src/renderer/src/dev/selfCheck.ts` 的 App 内自测为准。

## 已知注意点

1. **CJK 渐进增强依赖 Chromium 版本**：页面顶部会打印 `text-autospace` / `text-spacing-trim` 的支持状态。
   浏览器比 Electron（33 → Chromium 130）新时，样张可能显示应用里**尚未生效**的效果
   → 排版类最终判定必须在 Electron 内复核一次。
2. **Tailwind 内容探测**：`root` 故意保持 `client/`，否则 `src/renderer/src/**` 的类名不会被生成。
   若样张整页无样式，先查这一点。
3. 样张**不参与产品构建**（`npm run build` 不引用本目录）。
