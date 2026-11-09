# 设置（settings）—— feature 参照

> 本页 = 设置域的**架构锚点与实现细节**；设置页格局裁决（无标题/无提示/去线、布尔 =「關｜開」
> 文字选项等）的权威在 `style/components-shell.md` 与 `FEATURES.md` 设置节；插件注册表
> （一行一生死）语义 = `FEATURES.md` 插件节 + `client/plugins/PLUGINS.md` §3。

## 1. 架构锚点

| 层 | 归属 |
|---|---|
| Feature 组件 | `src/renderer/src/features/SettingsFeature/index.tsx`（299 行）；域内组件 `themeTransition` |
| usecases | 无——`store` settings 键读写（`patchSetting` 原子合并）+ 主题应用 |
| ports | `store`（appearance / librarySettings / plugins / deleteNotice / readerSettings 等键） |
| domain | `core/domain/theme.ts`（103 行：2 tone × 2 mode + system resolve，与 reader 共享）；`input.ts` 的 DEFAULT_BINDINGS（快捷键只读清单的数据面） |
| 缝合件 | `data-theme` 应用到 `<html>`（全局生效面）；插件启停 = 重载渲染层插件运行时（`client/plugins/PLUGINS.md` §3）；`system` 跟随 = `matchMedia` 解析并监听，只在暗/亮间切换 |

## 2. 实现细节

**主题应用**：四套取向（`dark`/`light`/`sepia-light`/`sepia-dark`）经 `data-theme` 落 `<html>`；
阅读中切主题必须同步调 `render.applyTheme`（正文 iframe 不会自动跟上，见 features/reader.md 注入节）；
`system` 只作用于深/亮模式选择，不引入色相。

**设置页格局**（批1.22/1.23 定）：无标题、无提示段落、分组去线；布尔 =「關｜開」文字选项
（原生 checkbox 禁用）；沉浸全屏「進入閱讀器時進入全屏」默认关；导入「含子文件夹」關｜開；
快捷键 = 只读清单（渲染意图绑定表，改键随配键体系批）；插件 = 注册表 + 获取动作（组头
「安裝插件…」= zip 导入，对话框收在主进程；一行：名稱 + 啟｜停 + 卸載 + 版本，
配置住使用处——卡片页面板，设置页不收配置项）。

**持久化口径**：设置一律全局（D9）；写入全走 `patchSetting` 原子合并（主进程侧防读-改-写竞态）；
本域不持有跨功能状态。

## 3. 验证路径

`src/tests/styleGrammar.test.ts`（视觉 token 纪律，含主题面）· 样张：theme/token 面板段落 ·
插件注册表链路 = `pluginManager.test.ts` / `pluginManifest.test.ts`（`client/plugins/PLUGINS.md` §3 验证面）。
