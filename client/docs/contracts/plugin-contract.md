# 契约 · 插件（v1：官方插件专用）

> 接口形状权威 = `src/shared/plugin.ts`（manifest / 校验判据 / 阅读上下文类型）；宿主实现 = `src/renderer/src/plugins/runtime.ts`（渲染层外壳）+ `src/main/plugins.ts`（种子/扫描/入口读取/卸载/保险库）；通道白名单 = `src/shared/ipc.ts`。能力边界、开发标准与生命周期（装载/启停/卸载方案）= `PLUGINS.md`；功能划分 = FEATURES §13，视觉红线 = STYLE §5.8。

## 定位与信任模型

- 插件**不是**六边形端口：运行在**渲染层外壳**（模块级单例 + 订阅，同 roomSession / logStore 一族），经宿主 API 注册 UI 位面；内核（domain/ports/usecases/adapters）零改动，**ServiceContainer 不收插件**。
- **信任模型 v1 = 只装官方插件**：随应用首发种进运行时插件文件夹，加载不做沙箱；第三方开放远期。插件代码经 Blob URL 动态 import → CSP `script-src` 放行 `blob:`；联网走主进程代理，**CSP 的 connect-src 不为此开口**（渲染层对插件联网无直连能力）。

## manifest（plugin.json，插件文件夹根）

- 字段语义：`id` = 文件夹名（= 运行时目录与设置键的命名空间）；`entry` = 插件目录内的相对 `.mjs`（ESM 入口；禁绝对路径与 `..`）；`version` semver 形态字符串（v1 种子策略 =「缺则种」，版本比较后置）。
- 校验 = `validatePluginManifest`（`src/shared/plugin.ts` 纯函数；单测 `src/tests/pluginManifest.test.ts`）：缺字段 / 坏 id / 越界 entry 一律拒绝并进诊断日志，**不静默**。主进程扫描与渲染层展示共用同一判据；坏 manifest / 坏文件夹跳过不中断其余插件。

## 插件模块：activate(api)

入口 ESM 导出 `activate(api)`（缺 activate = 激活失败，可见不静默）。api 形状（registerPanel / net.fetch / secrets / storage / log）= `src/shared/plugin.ts` 与 runtime.ts 的 `makeApi`；本页只留裁决与边界：

- **registerPanel（v1 唯一 UI 注册点）**：可注册多个，页签 key = `plugin:<manifest.id>:<panel.id>`；`hideWhenInRoom: true` = 进房间让位（AI 的「問」与聊天互斥；其他插件格不受影响）。`mount` 收到**内容区元素**（几何/页签/开合/滚动外壳都归宿主）；返回清理函数（卸载时调用）；`ctx.signal` 在面板收起/卸载/插件禁用时 abort。无效注册（缺 id / mount）忽略并进日志，不静默。
- **net.fetch**：联网代理，**只许 https**（主进程校验 + 超时 + 体积上限）。走主进程而不是渲染层直连——CSP 不为此开口；URL 判据 = `assertFetchableUrl`（纯函数，长度 ≤2048）。
- **secrets**：safeStorage 系统级加密（Windows = DPAPI），**落库是密文**（全局 settings 表 `plugin-secret:<id>:<name>` 键，base64 密文）；明文只在取用瞬间回到插件手里（渲染层内存），不落盘、不进日志。键名判据 = `assertSecretName`。
- **storage**：插件私有键值，持久化于全局 settings 表 `plugin:<manifest.id>` 键（patchSetting 原子合并；D9 设置一律全局）。⚠ 卸载清数据 = **写 null 清值**（store 无删键原语，键壳残留）——如实偏差记录在 `PLUGINS.md` §3；读侧按空对象兜底，不让 null 击穿。
- **log**：进内存 logStore（环形缓冲，探针 selfCheck 读尾部）+ 同步 console（dev 可见）。**不落盘**——统一日志 app.jsonl 只收主进程转发的 error/warn。（旧版「走统一日志管道」与实现不符，以本条为准。）

## 宿主义务（渲染权在宿主）

- 插件只能落在**程序定义的位置**：v1 唯一 UI 位置 = **右欄卡片页面板格**；插件内容**不得自创视觉语汇**（STYLE §5.8 红线同样约束插件）。页签序归宿主外壳（插件格追加在宿主页签之后）。
- **阅读上下文句柄 `ctx.reader`**（书未打开时缺省）：`snapshot()` = 拉取式快照（editionId / 标题 / 格式 / 章数 / 目录[章节标题 ↔ chapterDocIndex 对照——目录 label 可能是印刷页码等非真实位置]/ 当前位置[章号 + 可见文本前 200 字]）——**请求发出前调用**，保证是此刻位置；`jumpToQuote(exact, chapterIndex?)` = 溯源跳回（按引文重锚成弱锚点 → 章级尽力，同笔记面板路径）。宿主实现 = ReaderFeature（快照）+ 适配器 `remeasureAnchor` / `resolveAnchor`（跳转）。
- **IPC 清单**（`src/shared/ipc.ts`）：`plugins:list`（种子后扫描 + 校验，回清单；每项带 `seeded` 官方种子件标记——设置页据此区分「卸載」与「官方隨附，不可卸載」）、`plugins:read-entry`（回入口源码文本）、`plugins:net-fetch`（https 代理）、`plugins:secret-{set,get,delete}`（保险库）、`plugins:uninstall`（卸载 = 主进程拒删官方种子件 + 目录围栏后删运行时目录；settings 清理由渲染层接手）。
- ⚠ **渲染层不传路径**：只发 id，入口路径由主进程按自己的扫描结果解析（信任边界收在主进程）。
- **运行时目录** = `<userData>/plugins/<id>/`；**开发工作区** = `client/plugins/`（dev 启动时主进程把缺的插件种进运行时目录；打包经 extraResources 进发行物 resources/plugins）。数据落点见 `DATA_MODEL.md` §1。
