# 笔记管理（notes）—— feature 参照

> 本页 = 笔记域的**架构锚点与实现细节**；交互裁决（入口形态、不引入 kind、视图两态、
> 用词纪律「移除/刪除」等）的权威在 `FEATURES.md` 笔记节；接口形状 = `contracts/ports.md`
> 读模型 + clipboard；数据建模 = `DATA_MODEL.md` §3/§5 问题 6；视觉 = `style/components-notes.md`。

## 1. 架构锚点

| 层 | 归属 |
|---|---|
| Feature 组件 | `src/renderer/src/features/NotesFeature/index.tsx`（293 行）；域内组件 `NotesPanel`（阅读器内当书笔记页）/`NoteFlow`/`NoteCard`/`NoteComposer`/`NotesToolbar`/`ReadingStats`/`noteLayout`(+test) |
| usecases | 无（纯查询域）——**激活时重读**保证新鲜（与阅读器不同屏，见 FEATURES §12.5） |
| ports | `clipboard`（複製批註）、`store` 读模型（`listAllNotes`/`countAllNotes`/`readMinutesByDay`/`topReadEditions`） |
| adapters | `clipboard/ipcClipboardAdapter` |
| domain | `core/domain/anchor.ts`（353 行：TextAnchor 归一/比较/排序——划线渲染与笔记列表共用，+301 行单测） |
| 缝合件 | `chromeSearchBus`（笔记检索绑定注入）；`openReader(editionId, { revealNoteId })` 跳转通道（AppShell 持 `readerTarget`，递增 tick 防重复消费）；阅读时间数据由 reader 域 `readSessionRecorder` 写、本域 ReadingStats 读 |

## 2. 实现细节

**跳转链路时序**（做错会静默落空）：reveal 依赖 DOM 里那条高亮（`.kookit-note[data-key=…]`），
高亮由 `renderHighlighters` 画、只对当前渲染节生效 → 必须**等 ①书已打开 ②笔记载入完成 ③目标章
`rendered`** 之后再 `resolveAnchor(anchor, { revealNoteId })`；失败补重试。弱锚点（`fragment=null`）
也能落章级落点。文件缺失（映射库 `missing`）打开失败 → 进日志不静默。

**窗口化**（近千条性能）：自实现装箱 + 按列二分；实测 1000 条时 DOM 只留 42 张卡、首屏 22ms、
整片重渲染 21ms（实现期坑与 A/B 见 STYLE §5.10）。

**筛选实现口径**：筛选判据 = `body` 是否为空（不是 `kind`——两者实现里可互相矛盾，NoteFilter 契约
注明）；排序默认 `updated` 倒序；计数显示筛选后条数；空态必须报出被隐藏的划线数。

**閱讀统计段**：`readMinutesByDay`（跨书全库逐日）+ 今日/本週 + Top5（`topReadEditions` 投影倒序
含迁移旧账）；逐日数据自记录器接入起才有形状，旧账画不进格子（段内有注记）；格子无点击、榜行
不跳书（v1 只读不做假交互）。

**检索接线**：笔记激活时经 `chromeSearchBus` 注册底面全局搜索绑定（检索词 NotesFeature 自持），
搜 `excerpt`+`body` 子串；`Ctrl+F` 聚焦 / `Esc` 清空复用。与阅读器书内检索（`IRenderService.search`）
是两回事；跨书库全文搜索无待办（属新专题）。

**动作**：卡片右键 = `跳轉`/`複製批註`（仅 body 非空；只复制批注正文走 `IClipboard.writeText`）/
`刪除`（真实删除，确认弹窗写明不可恢复且不提供免确认）；卡片内无 hover 动作区、不放开拖选。

## 3. 验证路径

`dev/noteProbe.ts`（TUREAD_DEV_PROBE=note，选择→锚点→高亮→resolveAnchor→reveal 全链 ①–⑥）·
单测 `noteLayout.test.ts` / `anchor.test.ts`（301 行）· 样张：NoteComposer/NoteFlow/ReadingStatsView 段。
