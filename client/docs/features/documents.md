# 文檔（documents）—— feature 参照

> 本页 = 文档域的**架构锚点**。**归属裁定（用户定）：文档 = 消费笔记所生产的内容，归筆记区管——
> 不是独立功能组件，侧栏不设「文檔」**；由「筆」工具栏的「文檔」动作切入。
> 产品定位与编辑器特性支持矩阵的权威 = 决策笔记
> [.agents/notes/implemented/arch/2026-11-06-notes-v3-data-model.md](../../../.agents/notes/implemented/arch/2026-11-06-notes-v3-data-model.md)
> （三层模型之「文档层」）；数据形态 = `DATA_MODEL.md` §3.2（body = 原生 Markdown）；
> IPC 围栏 = `src/main/ipc.ts` vault 组。

## 1. 架构锚点

| 层 | 归属 |
|---|---|
| 视图 | `src/renderer/src/features/NotesFeature/DocumentsPanel.tsx`（`NotesFeature` 的 `docsOpen` 视图，工具栏「文檔/返回筆記」切换） |
| 生成器 | `features/NotesFeature/notesDocs.ts`（纯函数：彙編/筆記檔案构建 + vault 文件名净化/防撞名） |
| ports | 无新端口——vault 走 `window.turead.invoke` 直调（`IPC.vault*` 五通道含 delete，main 侧白名单兜底） |
| 缝合件 | `container.store.listAllNotes`（档案生成的数据源）；Markdown 渲染/序列化 = `components/noteMarkdown.tsx` |

## 2. 实现细节

**vault** = `<userData>/vault`，**真实 .md 文件**——用 Obsidian 打开这个資料夾即双向流通
（不取代 Obsidian）。渲染层只给文件名不给路径；main 侧文件名白名单（单段、无路径分隔、
不以点开头）。文件**可刪除**（列表右键 → 确认弹窗）。

**两类文件**：彙編（用户所有，`![[note-<id>]]` 引用）与筆記檔案（生成物，每书一份，
节标题 = `note-<id>` = 引用解析目标，重生成整体覆盖——"生成物勿手改"写进文件头注释）。

**编辑器三态**：源碼（textarea）/ 預覽（`renderNoteMarkdown` 渲染子集）/
所見即所得（contenteditable，**失焦/切态时序列化回源码**——源码是唯一真相，进入时从源码建 DOM、
编辑期 state 更新不重建 DOM 防光标跳动）。渲染子集与序列化 = `noteMarkdown.tsx`
（段落/标题/粗斜体/行内码/链接/列表/引用，双向一致）。

## 3. 验证路径

typecheck + 单测（`noteMarkdown.test.ts` 覆盖渲染子集）；vault 通道与生成器的真机验证
（新建/刪除/编辑三态/生成档案/Obsidian 打开反链）列入笔记 v3 真机复看清单。
