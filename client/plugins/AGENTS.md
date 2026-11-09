# [client/plugins/](client/plugins) —— 官方插件开发（agent 子树入口）

> 插件开发**不是源程序侧**：插件运行在渲染层外壳的宿主 `API` 上（不进 ServiceContainer、
> 不碰六边形内核），本子树自持全部规范与工作区事实——只开发插件的 agent 读到这里即可开工，
> 无需进入 [client/docs](../docs) 的主程序文档群（除非任务触及宿主侧）。
> 全局红线在仓库根 [`AGENTS.md`](../../AGENTS.md)；提交过门控链（pre-commit 三守卫自动跑）。

## 本子树地图

- [`PLUGINS.md`](PLUGINS.md) —— **规范权威**：能力边界、开发标准、接口与宿主义务、生命周期、数据落点。
  先读它，读完即可写插件；宿主实现细节在 [`src/renderer/src/plugins/runtime.ts`](../src/renderer/src/plugins/runtime.ts) +
  [`src/main/plugins.ts`](../src/main/plugins.ts)（只读参照，改动归源程序侧）。
- [`README.md`](README.md) —— 工作区事实：现有插件清单（時鐘 = 首个验证件、問 = 全能力参照实现）。
- `<id>/plugin.json` + 入口 ESM —— 一个插件一个文件夹；dev 启动时主进程把缺的插件自动种进
  运行时目录（`<userData>/plugins/`，运行时目录不进仓库）。

## 增量红线（插件域）

- **manifest 校验不静默**：坏字段/坏 id/越界 entry 一律拒绝并进日志；`id` = 文件夹名。
- **渲染权在宿主**：插件只拿内容区元素，不自创视觉语汇（[STYLE](../docs/STYLE.md) §5.8 红线同样约束插件）。
- **联网只走 `net.fetch`（https-only，主进程代理）**；密钥只走 `secrets`（落库即密文）；
  私有数据只走 `storage`——不碰文件系统、不直连网络、不打其他 IPC 通道的主意（v1 信任模型
  = 不防恶意只防误用，前提是官方独占）。
- **所有插件可卸载；获取 = 手动安装**（ 用户裁定：无任何自动补齐，官方件经
  GitHub Release 分发 zip 走设置页导入；dev 侧豁免 = 装配点 `!app.isPackaged` 时 `syncFrom`
  覆盖同步工作区）；禁用 ≠ 卸载；`mount` 必须返回清理函数并挂 `ctx.signal` 自清。
- kookit 子模块红线（禁 commit/push）与本子树无关但全局生效（见根 [`AGENTS.md`](../../AGENTS.md)）。

## 验证与发版

- `npm test`（manifest/能力/PluginManager 单测随全仓跑；插件自身逻辑写成可测纯函数）。
- 实机验证 = dev 启动后设置页「插件」注册表（一行一生死）+ 右欄卡片页页签；`api.log` 进
  内存 logStore（探针态经统一日志落盘）。
- 打包随应用 `extraResources` 进发行物（配方 = [`client/docs/BUILD.md`](../docs/BUILD.md)）。

## 宿主侧牵连时的读序（按需，不属于本子树日常）

manifest/api 形状变更 → [`src/shared/plugin.ts`](../src/shared/plugin.ts) + [`client/docs/CONTRACTS.md`](../docs/CONTRACTS.md)（总纲）；
数据落点 → [`client/docs/DATA_MODEL.md`](../docs/DATA_MODEL.md) §1；卡片页插槽 → [`client/docs/features/reader.md`](../docs/features/reader.md)；
设置页注册表 → [`client/docs/features/settings.md`](../docs/features/settings.md)。
