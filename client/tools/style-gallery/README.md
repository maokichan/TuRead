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

## 覆盖 / 不覆盖

- ✅ 覆盖：四套色彩取向 + 跟随系统、动作文字档（主/次/破坏性/禁用）、三声部字体、字号白名单、
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
