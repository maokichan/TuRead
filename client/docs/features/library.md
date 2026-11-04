# 书库（library）—— feature 参照

> 本页 = 书库域的**架构锚点与实现细节**；交互裁决（聚焦舞台形态、移除语义、面包屑规则等）
> 的权威在 `FEATURES.md` §10（裁决与本页是上下级，本文不复读裁决）；接口形状 = `CONTRACTS.md`
> §4.4/§4.5；存储布局 = `DATA_MODEL.md` §1/§2；视觉 = `STYLE.md`。

## 1. 架构锚点

| 层 | 归属 |
|---|---|
| Feature 组件 | `src/renderer/src/features/LibraryFeature/index.tsx`（1102 行）；域内组件 `BookRow`/`BookTile`/`ContainerItem`/`LibraryToolbar`/`LibraryManagerDialog`/`FittedTitle`/`FocusStage`(+`focusStageEngine`)/`useVirtualRange`/`viewSwitchFlash` |
| usecases | `BookService`（edition+holding+lastRead）、`ImportQueue`（串行导入）、`CoverQueue`（封面异步提取）、`ScanService`（映射库对账）——`src/core/usecases/` |
| ports | `picker`（选文件/目录/扫描/读文件）、`image`（缩略图）、`metadata`（离屏提取）；store 跨域共享 |
| adapters | `picker/ipcPickerAdapter`、`image/thumbnail`、`render/offscreenMetadataExtractor`、`identity/fingerprint`（与 room 共享） |
| domain | `core/domain/format.ts`（`extToFormat`）；`types.ts` 的 book/holding/container 段 |
| 缝合件 | 选中 `selectedBookId` 是 Room 标定与 Reader 打开的单一真相（见 `ARCHITECTURE.md` 缝合件表）；`coverCache.ts`/`format.ts` 住 features/ 根 |

## 2. 实现细节

**导入**：文字按钮「導入」→ 小菜单「导入文件…/导入文件夹…」（Electron 不允许文件与目录同框选择，
upstream issue #26885）；「含子文件夹」持久化 `librarySettings.importRecursive`；批量串行 + 进度 +
可取消；失败逐条进日志；指纹去重持续生效；递归扫描上限 2000 本 / 12 层。

**封面管线**：canvas 生成缩略图（目标宽 400px、JPEG q0.82，157KB 原图 → 38KB 实测）→
`userData/covers/<bookId>.jpg`，`coverPath` 只存文件名——字节绝不进 JSON；渲染侧经 IPC 取字节 →
Blob → objectURL（CSP 放行 `blob:`），模块级缓存。提取时机 = 导入后异步（CoverQueue 串行/进度/可取消/
单本失败不连坐）；存量书启动后延迟 20s 后台补齐（dev 自检跳过）。

**文字封面（FittedTitle）**：二分搜索不溢出的最大字号（只按高度拟合，宽度靠容器 +
`overflow-wrap: anywhere`）；字号定后剩余垂直空间给行距（上限 2.4）；`ResizeObserver` +
`requestAnimationFrame` + `document.fonts.ready` 三重重拟合（打包字体加载后度量会变）；
源流明體加粗；与图片封面同槽同渐隐。

**打包字体**：GenRyuMin2 TW Bold 切面子集化（BMP CJK + 拉丁 + 标点，去提示指令），18.8MB →
10.95MB，Vite 资源管线（`assets/fonts/`），`@font-face` 在 `styles.css`；许可 SIL OFL 1.1
（见 `assets/fonts/NOTICE.md`；许可全文随包是 TODO）；Ext-A/B 极生僻字回退字栈下一个明体。

**视图切换动画**：`.view-switch-flash`（240ms，`--dur-flash`）三拍——区域变深色 → 浅色新文字浮出 →
同时复原；闪屏中再点 = 重开一轮，状态切换不被动画挡住；四主题各自 `--flash-bg/--flash-text`。

**层级历史栈**：`LibraryFeature` 内 `histRef`（stack + idx），条目 = 位置 + 整条面包屑，后退/前进
一起还原；`enterContainer`/`enterFolder`/`goToLevel` 全走 `pushEntry`（新导航截断前进分支）；
`commitNav`（移动/导入）原地重载不入栈；切库广播重置为根。两个出口：`ChromeControls` 底面按钮
（书库域接管，其余域恒禁用）与鼠标侧键（XButton1/2 仅书库态接管并 `preventDefault`）；
跨兄弟组件经 `features/libraryNavBus.ts`（ChromeControls 用 `useSyncExternalStore` 订阅可用性）。

**全库检索**：底面全局搜索·书库作用域；SQL 侧 `searchHoldings`（标题/来源路径/收录路径子串、
大小写不敏感、不含来源缺失）；不看当前层，清词回层；防抖 ~200ms；检索态空态优先于「書架為空」。

**持久化**：全局 SQLite 单库，`config.json` 只剩引导文件（旧版自动迁移）。

**端口收敛事实**：UI 层不直用 `window.turead` 桥——选文件/目录/扫描/读文件收敛为 `IBookPicker`；
批量导入下沉 `IImportQueue`（与 CoverQueue 同构）；设置写入走 `patchSetting`（主进程原子合并，
消除读-改-写竞态）。已知例外仅 `dev/selfCheck.ts`（开发工具非产品代码）。

## 3. 验证路径

`dev/libraryProbe.ts`（TUREAD_DEV_PROBE=library，多库/收录/edition 复用断言）·
`scripts/style-gallery/`（BookRow/BookTile/LibraryToolbar/FittedTitle 样张 + smoke）·
单测 `CoverQueue.test.ts` / `ImportQueue.test.ts` · 渲染自检 `dev/selfCheck.ts` 的导入步。
