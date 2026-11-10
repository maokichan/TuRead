# 阅读器（reader）—— feature 参照

> 本页 = 阅读域的**架构锚点与实现细节**；交互裁决（阅读页零控件、全局禁选、卡片页形态、
> 目录内嵌等）的权威在功能总纲阅读器节；接口形状 = [`contracts/ports.md`](../contracts/ports.md)；
> 视觉细则 = [`style/components-reader.md`](../style/components-reader.md)（一律以它为准）；kookit 逆向 = 渲染引擎逆向/渲染接口。

## 1. 架构锚点

| 层 | 归属 |
|---|---|
| Feature 组件 | [`src/renderer/src/features/ReaderFeature/`](../../src/renderer/src/features/ReaderFeature)：`index.tsx`（编排 + 键鼠意图 + JSX）+ 六钩子 `useReaderParams`（参数态与应用）、`useReaderOpening`（开书/关书与位置持久化）、`useReaderNotes`（笔记/划线全生命周期）、`useRoomFollow`（跟随三道闸门）、`useReaderFullscreen`（沉浸全屏）、`usePdfLayoutSync`（PDF 环境同步：resize/切主题 → 续帧重开）+ `pdfContinuityOverlay.ts`（缩放续帧置顶层）+ `readSessionRecorder.ts`（阅读时间，数据面归 [notes](notes.md) 域 ReadingStats）；域内组件 `ReaderRail`/`ReaderControls`/`TocPanel`/`iframeBridge`/`readerFollow`(+test) |
| usecases | 无独立 usecase——`render` 端口即用例 |
| [ports](../contracts/ports.md) | `render`（IRenderService：open/renderTo/翻页/goToChapter/goToPosition/applyTheme/applyTypography）；房间侧消费 render 的位置事件（解耦，互不 import） |
| adapters | `render/kookitRenderAdapter`（699 行，有状态编排）+ 纯模块 `render/kookitAnchor.ts`（选区→锚点原语/按搜索重锚）、`render/kookitNote.ts`（Note→引擎载荷）、`render/readerCss.ts`（注入 CSS 拼装）；`render/kookitLoader`、`render/pdfjsSetup`、`render/charset`（TXT 编码） |
| domain | `core/domain/location.ts`（三级角色 key/hint/display；与 room/library 共享）、`theme.ts`（与 [settings](settings.md) 共享）、`input.ts` 阅读段绑定 |
| 缝合件 | 右欄卡片页槽位宿主 = `ReaderRail`（插件格也挂此处）；`roomSession.ts` 共享投影（聊天页）；`readerCardBus`/`chromeSearchBus` 登记面 |

## 2. 实现细节

**布局几何**：外层全屏「桌」（`--desk-bg`）+ 内层居中定宽「纸」（`--read-width` 档位 620/760/920，
默认 760）；纸 1px `--page-edge` 边、`--page-pad-x` 内边距；宿主容器 `#page-area` 就是纸
（kookit 硬契约，`clientWidth` 决定排版宽度，见渲染引擎逆向 §5）；桌容器把滚轮转发给列（鼠标停两侧
留白也能滚）。滚动条 2px 静息几乎不可见；短章节（kookit 余量 +300px 内）整条隐藏。

**iframe 事件桥**（`components/iframeBridge.ts`）：kookit 正文渲染在 iframe 独立 document，
焦点进书页后键盘/滚轮到不了宿主 window——F11/Esc 失灵的根因。桥对同源 iframe 文档挂同一套监听
（MutationObserver 追踪懒加载章节），按键只看当前界面不看焦点；输入类目标让位。

**分页滚轮翻页**：接管范围 = 整个阅读器区（含左右点击翻页带——带压在纸面上方，挂纸上会漏；
目录/参数面板内部让位）；平滑滚轮短窗累积 + 过阈值翻页 + 冷却窗防连翻；scroll 模式不拦
（iframe 内原生滚动自管）。

**PDF 纸宽**：kookit PdfRender 渲染时刻定 canvas 像素、无重排入口 → 改纸宽 = 阅读器原地重开
（同布局模式的 `reopenTick` 机制，位置自动恢复）。

**PDF 环境同步**（`usePdfLayoutSync`，仅 PDF）：窗口 resize 与切主题对位图页面都不生效
（前者按渲染时刻定像素、后者烘焙按开书主题）→ 两事件汇入同一 350ms 防抖调度器：先把当前
可见画面快照置顶（`pdfContinuityOverlay`——定格旧帧、桌色打底、指针穿透；快照失败静默降级
为裸重开），防抖到点走既有 `reopenTick` 原地重开（按新宽度/新主题重新填充），落定（`opening`
真→假）撤层翻面。串行化 = 防抖合并 + 适配器 openToken 代次令牌，两事件撞车最后一次生效；
置顶层存在期间滚动立即撤层；8s 失败保险强制撤层（防「重开书偶发空白」变假状态）。
文字类不进本钩子（重排与注题均已工作）；设置里切主题后返回阅读器的失配由激活 effect 补判重开。

**翻页绑定**：`←/→`、`Space`（分页）、`PgUp/PgDn` + 鼠标点击左右 1/4 区域（仅分页模式）+ 侧键
（XButton1/2 = 上/下页，仅阅读态）。

**主题注入**：正文深色 = `IRenderService.applyTheme`（kookit `setStyle` 注入口，一次注入全书生效）；
排版（字号/行距/段距）= `applyTypography` 注入（kookit `KookitConfig` 无字体字段，vendor 内
`StyleHelper` 无调用点——注入是唯一通路，[contracts/ports.md](../contracts/ports.md)）；`data-theme` 不会自动跟上 iframe，
阅读中切主题必须同步调 `applyTheme`。

**卡片页几何**（实现面）：scrim 容器 = flex 行，阅读卡 flex-1 与槽位并排；`--page-w` 锚定视口、
`.reader-stage` 位移补偿 `--slot-w`×½（纸全程静止）；卡片内容经 portal 送进槽位，数据/状态仍归
ReaderFeature。召唤登记：`features/readerCardBus.ts` 登记页族清单，命令面板据此给「呼出X」。

**跟随当前位置**：判据 = `components/readerFollow.ts` 纯函数（+单测），打开/换书瞬时落位、跨章平滑
跟随；位置只到章（kookit 不给章内进度）。点正文高亮 = 卡片页切「筆記」定位（只读）。

**退出阅读器时序**：`Esc` 分流先退全屏再关当前标签（邻位激活/最后回书库）；离开阅读器若仍全屏 →
退出全屏并保持最大化（`win:set-maximized`）；全屏状态由 main 在 `enter/leave-full-screen` 广播，
渲染层只订阅跟随。

## 3. 验证路径

`dev/selfCheck.ts`（TUREAD_DEV_BOOK 无头渲染自检：导入→打开→渲染→位置，退出码经 main）·
`dev/pagedInteractProbe.ts`（分页交互）/ `dev/pdfWidthProbe.ts`（PDF 纸宽）——事实行探针 ·
`dev/noteProbe.ts` 渲染半链 · 单测 `readerFollow.test.ts` · 样张：ReaderRail/批注输入栏段落。
