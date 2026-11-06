# 决策：文档编辑器引入 CodeMirror 6（Live Preview 内核）

Status: proposed

## Problem

文档编辑器的「所见即所得」是失焦反序列化的假所见即所得——编辑中语法字符全裸露，且
DOM→Markdown 往返有损。用户裁定 md 看齐 Obsidian：**实时渲染**（光标所在块显源码、
其余块实时渲染）是硬需求。自研 contenteditable 逐块隐藏 = 光标恢复/选区跨界/IME 合成
三大坑自趟，等于重写残缺版 CodeMirror——否决。

## Decision（用户本会话已同意引入）

引入 **CodeMirror 6**（Obsidian 编辑器同款内核）作为渲染进程 npm 依赖：

- `@codemirror/state` / `view` / `commands` / `language` / `autocomplete` /
  `lang-markdown` / `@lezer/markdown`
- 实时渲染实现 = lezer markdown 语法树 + 装饰器：不含光标的块以 BlockWidget 渲染
  （DOM 由既有 `markdownToDom` 构建，复用现成渲染器）；含光标的块内行内标记按
  「光标在 token 外隐藏定界符、移入显形」处理。
- 落点 = `renderer/src/components/mdEditor.tsx`（layering.test 允许；禁入
  domain/usecases/ports）。

## Alternatives considered

- **自研 contenteditable**：输在 IME/光标/选区三大坑的实现成本与长期维护，效果仍是
  半成品。
- **保持三孤岛现状**（textarea/只读预览/失焦 WYSIWYG）：输在用户的硬需求（及时渲染）
  未满足。
- **vendor 容器化**：否——vendor 是 AGPL kookit 子模块黑盒化特例（KOOKIT.md 可替换性
  决策）；MIT 的 npm 包走 pdfjs-dist/three 同款「dependencies + 直接 import + Vite 打
  进渲染 bundle」路径，无黑盒诉求。

## Consequences

- **许可证**：CM6 全家 = **MIT**，与 AGPL-3.0 兼容（vitest 先例同款论证）；随发行物
  分发需保留声明 → 计入 TODO「第三方声明随发行物」清单。
- 体积：渲染 bundle 增加约 300–400KB（min+gzip 更小），便携版代价可接受。
- 编辑语义继承 NoteComposer 约定（IME 友好——CM6 原生支持）；样式 token 化过
  styleGrammar 守卫；`@codemirror/view` 相关不进 vitest（无 DOM 环境），纯逻辑
  （块切分/inline token 范围）可测。
