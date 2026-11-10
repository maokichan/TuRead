# 插件（PLUGINS）——能力边界 / 开发标准 / 接口与宿主义务 / 生命周期

> 归属：**[client/plugins/](client/plugins) 子树**——插件开发的一切在本目录与本文（只开发插件的 agent 读到
> 这里即可开工）。形状权威 = [`src/shared/plugin.ts`](../src/shared/plugin.ts)（manifest / 校验判据 / 阅读上下文类型）；
> 宿主实现 = [`src/renderer/src/plugins/runtime.ts`](../src/renderer/src/plugins/runtime.ts)（渲染层）+ [`src/main/plugins.ts`](../src/main/plugins.ts)（主进程）；
> 通道白名单 = [`src/shared/ipc.ts`](../src/shared/ipc.ts)。功能裁决 = [`client/docs/FEATURES.md`](../docs/FEATURES.md)（§5/§13）；视觉 =
> [`client/docs/STYLE.md`](../docs/STYLE.md) §5.8；数据落点 = [`client/docs/DATA_MODEL.md`](../docs/DATA_MODEL.md) §1。信任模型 v1 =
> **官方独占，不防恶意只防误用**（第三方契约开放、自担风险——用户 裁定，见 §1）。

## 1. 能力边界

**插件不是六边形端口**：运行在渲染层外壳（模块级单例 + 订阅，同 roomSession / logStore 一族），
经宿主 `API` 注册 UI 位面；内核（domain/ports/usecases/adapters）零改动，**ServiceContainer 不收插件**。

**插件拿到什么**（全部，且仅这些）：

- `activate(api)` 一次性拿到 `PluginHostApi` 五件套：`registerPanel`（v1 唯一 UI 注册点）、
  `net.fetch`（https 代理）、`secrets`（safeStorage 保险库）、`storage`（私有键值）、`log`。
- `mount(el, ctx)` 拿到**内容区元素**与 `{ signal, reader? }`；渲染权在宿主——几何、页签、
  开合、滚动外壳都是宿主的。

**插件拿不到什么**：`ServiceContainer`、六边形 [ports](../docs/contracts/ports.md)、文件系统、专用 IPC 面。渲染权与数据
权分离：数据只能经 `storage`/`secrets` 两个键值通道，网络只能经 `net.fetch`。

**强制现状（如实）**——v1 信任模型 = **不防恶意，只防误用**：

| 判据 | 强制点 | 强制强度 |
|---|---|---|
| 入口不越界 | 主进程只从自己的扫描结果解析 entry，拒绝越出插件目录 | 强（主进程校验） |
| 网络只许 https | `assertFetchableUrl`（20MB / 120s 上限） | 强（主进程代理前拦截） |
| 密钥名格式 | `assertSecretName`；safeStorage 落库即密文 | 强 |
| CSP | `script-src 'self' blob:`；`connect-src` 未为插件放宽 | 强（但 blob 导入是豁免口） |
| **IPC 通道** | **未隔离**：插件代码与宿主同源，技术上可直调 `window.turead.invoke` 全部通道 | **弱——信任模型的前提是官方独占** |
| 运行时隔离 | 无沙箱、无错误边界：mount 内抛错可击穿渲染窗口 | **弱（激活期 try/catch 不连坐，运行期不设防）** |

**第三方立场（用户 裁定）**：**契约开放**——第三方照本文与 [`src/shared/plugin.ts`](../src/shared/plugin.ts)
的形状做出的插件，走同一 zip 安装管道即可装，管道只认形状不认作者身份；「艺高人胆大给自己
做插件我们当然支持」。上表两处「弱」（IPC 未隔离 / 无运行时隔离）随之**降级为已知边界**
如实保留：信任模型官方独占 = 不防恶意只防误用，装第三方 = 授予其 api 面全部能力，自担风险。
插件代码经 Blob URL 动态 import → CSP `script-src` 放行 `blob:`；联网走主进程代理，
`connect-src` 不为此开口。

## 2. 开发标准

- **一个插件 = 一个文件夹**：`client/plugins/<id>/`，`id` 与文件夹名一致（= 运行时目录名与
  设置键的命名空间，`/^[a-z0-9][a-z0-9-]*$/`）。
- **manifest（`plugin.json`）**：`id` / `name` / `version`（semver 形态字符串；安装管道按
  `comparePluginVersions` 做防降级比较）/ `entry`（插件目录内的相对 `.mjs`，禁绝对路径与 `..`）/
  `description?`。
  校验 = `validatePluginManifest`（[`src/shared/plugin.ts`](../src/shared/plugin.ts) 纯函数，单测 [`src/tests/pluginManifest.test.ts`](../src/tests/pluginManifest.test.ts)）：
  缺字段 / 坏 id / 越界 entry 一律拒绝并进日志，**不静默**；坏文件夹跳过不中断其余插件。
- **打包与安装（zip，唯一产品获取管道）**：一插件一 zip；`plugin.json` 须在 zip 根（目录名 =
  manifest.id）或唯一顶层文件夹内（文件夹名必须 = manifest.id）。用户在设置页「安裝插件…」导入
  （对话框收在主进程，渲染层零路径）。**显式声明（数值与语义，用户要求显式化）**：
  ① 体积上限 = zip ≤ 50MB、解压后总量 ≤ 100MB；② 版本比较（`comparePluginVersions`）=
  同版本拒（「重装请先卸载」）、低版本拒（防降级）、高版本覆盖 = 升级；③ 已装 manifest 损坏
  按 0.0.0 处理 → 允许覆盖（修复通道）；④ 原子落位（临时目录解压 → 入口实物校验 → 换名，
  失败清暂存）。**更新检查不存在**（用户裁定）——升级 = 下载新 zip 重新导入。官方插件 zip
  随版本 GitHub Release 发布（[BUILD.md](../docs/BUILD.md) 滚版本第 4 步）。
- **入口导出 `activate(api)`**（缺 activate = 激活失败，可见不静默）；`mount` 返回清理函数；
  定时器与订阅必须挂 `ctx.signal` 自清（收起/卸载/禁用时 abort）。`ai` 插件是全部能力的参照实现。
- **需要构建的插件**：无 import 的源码即入口；引依赖时 esbuild 打自包含 ESM，`entry` 指向
  产物——入口契约不变。
- **样式**：优先复用 `styles.css` 的 `.plugin-*` 公共层（颜色走 token、字号在白名单内），
  不自创视觉语汇（[STYLE](../docs/STYLE.md) §5.8 红线同样约束插件）。
- **日志**：`api.log` 进内存 logStore（环形缓冲，探针 selfCheck 读尾部）+ 同步 console（dev
  可见）。**不落盘**——统一日志 app.jsonl 只收主进程转发的 error/warn（见 [`src/shared/log.ts`](../src/shared/log.ts)）。
- **测试**：`pluginManifest.test.ts` / `pluginCapabilities.test.ts` / `pluginManager.test.ts`；
  插件自身逻辑尽量写成可测纯函数。

## 3. 接口与宿主义务

- **registerPanel（v1 唯一 UI 注册点）**：可注册多个，页签 key = `plugin:<id>:<panel.id>`；
  `hideWhenInRoom: true` = 进房间让位（AI 的「問」与聊天互斥）。无效注册（缺 id / mount）
  忽略并进日志，不静默。页签序归宿主（插件格追加在宿主页签之后）。
- **net.fetch**：联网代理，**只许 https**（主进程校验 + 120s 超时 + 20MB 上限）。走主进程
  而非渲染层直连——CSP 不为此开口；URL 判据 = `assertFetchableUrl`（长度 ≤2048）。
- **secrets**：safeStorage 系统级加密（Windows = DPAPI），**落库是密文**（[settings](../docs/features/settings.md) 表
  `plugin-secret:<id>:<name>` 键）；明文只在取用瞬间回到插件手里，不落盘、不进日志。
- **storage**：私有键值持久化于 [settings](../docs/features/settings.md) 表 `plugin:<id>` 键（patchSetting 原子合并；设置
  一律全局）。⚠ 卸载清数据 = **写 null 清值**（store 无删键原语，键壳残留——如实偏差）；
  读侧按空对象兜底，不让 null 击穿。
- **ctx.reader**（书未打开时缺省）：`snapshot()` = 拉取式快照（editionId / 标题 / 格式 / 章数 /
  目录对照[目录 label 可能是印刷页码等非真实位置] / 当前位置[章号 + 可见文本前 200 字]）——
  **请求发出前调用**；`jumpToQuote(exact, chapterIndex?)` = 溯源跳回（重锚成弱锚点 → 章级尽力，
  同笔记面板路径）。宿主实现 = ReaderFeature（快照）+ 适配器 `remeasureAnchor` / `resolveAnchor`。
- **IPC 清单**（[`src/shared/ipc.ts`](../src/shared/ipc.ts)）：`plugins:list`（扫描 + 校验）、`plugins:read-entry`、
  `plugins:install-zip`（对话框收在主进程，渲染层零参数零路径；取消回 null）、
  `plugins:net-fetch`、`plugins:secret-{set,get,delete}`、`plugins:uninstall`（目录围栏后删
  运行时目录；[settings](../docs/features/settings.md) 清理由渲染层接手）。
- ⚠ **渲染层不传路径**：只发 id，入口路径由主进程按自己的扫描结果解析（信任边界收在主进程）。
- **运行时目录** = `<userData>/plugins/<id>/`（与 store.db / covers 平级，随数据目录整体迁移）；
  **开发工作区** = [`client/plugins/`](client/plugins)（dev 豁免 = 装配点覆盖同步进运行时目录，见 §4；
  打包**不带**插件——获取走手动安装）。

## 4. 生命周期

- **获取 = 手动安装（用户 裁定，无任何自动补齐）**：官方插件经 GitHub Release 分发
  zip（[BUILD.md](../docs/BUILD.md) 滚版本第 4 步），用户在设置页「安裝插件…」导入（见 §2 打包与安装）。新装机
  零插件；卸载后的重装 = 重新下载 zip 再导入。**dev 豁免**（政策住装配点 `main/index.ts`）：
  `!app.isPackaged` 时把工作区 [`client/plugins/`](client/plugins) **覆盖同步**进运行时目录（`syncFrom`）——
  改完源码重启 dev 即生效；单向覆盖不删多余；打包路径物理触达不到同步。
- **装载（现实现）**：主进程扫描 + manifest 校验（坏件跳过不连坐）→ 渲染层按启用清单取入口
  源码 → Blob URL 动态 import → `activate` → `registerPanel` 登记 → 右欄卡片页按注册序渲染。
  失败件在设置页标「加載失敗」，其余不受牵连。
- **启停（现实现）**：启用态落 [settings](../docs/features/settings.md) 表 `plugins.enabled`（默认启用）；**切换任意插件 =
  全量重载**——运行时状态清零、启用件从头激活。硬约束（如实）：动态 import 的模块**无法逐出**，
  旧模块图驻留内存直到窗口重开；v1 接受此代价，插件体量保持克制。
- **卸载（现实现）**：语义 = 文件 + 数据一并移除；禁用 ≠ 卸载。`plugins:uninstall({ id })`：
  目录围栏 → 删 `<userData>/plugins/<id>/` → 渲染层清 `plugin:<id>`（写 null）→ 重跑
  loadPlugins。所有插件一视同仁可卸（无自动补齐，不存在「复活」问题）。已知残留：
  `plugin-secret:<id>:*` 密文清不掉（store 无按前缀列举原语）——干净清理待 store 补
  「按前缀删键」，登记唯一待办清单。卸载是宿主权力，不经插件同意。
- **版本兼容（开放问题，未定）**：manifest 版本只是形态字符串，无 compat 策略；zip 导入有
  版本比较防降级，官方插件的升级/覆盖策略未定——开放前在待办跟踪。

## 5. 数据落点（卸载清理清单的依据）

| 数据 | 落点 | 卸载时 |
|---|---|---|
| 插件代码 | `<userData>/plugins/<id>/` | 删目录（无自动补齐，不存在「复活」问题） |
| 私有键值 | [settings](../docs/features/settings.md) 表 `plugin:<id>` 键 | 写 null 清值（键壳残留） |
| 密钥 | [settings](../docs/features/settings.md) 表 `plugin-secret:<id>:<name>`（safeStorage 密文） | **暂清不掉**（无按前缀删键原语，见待办） |
| 对话历史等业务数据 | 插件自管，物理上在上述键内 | 随键清 |
