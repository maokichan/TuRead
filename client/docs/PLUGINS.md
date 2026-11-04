# 插件开发规范（能力边界 / 标准 / 生命周期）

> 归属：**client 专属**。与 [`CONTRACTS.md`](CONTRACTS.md) §9 的分工：§9 承载**接口形状**
> （manifest 字段、`PluginHostApi` 类型、IPC 面），本文件承载**能力边界、开发标准与生命周期**
> （装载/启停/卸载）。形状打架先对 §9；本文不复制形状，只链接。
> 功能划分 = FEATURES §13；视觉 = STYLE §5.8。信任模型 v1 = **只装官方插件**。

## 1. 能力边界

**插件拿到什么**（全部，且仅这些）：

- `activate(api)` 一次性拿到 `PluginHostApi` 五件套：`registerPanel`（v1 唯一 UI 注册点）、
  `net.fetch`（https 代理）、`secrets`（safeStorage 保险库）、`storage`（私有键值）、`log`。
- `mount(el, ctx)` 拿到**内容区元素**与 `{ signal, reader? }`；渲染权在宿主——几何、页签、
  开合、滚动外壳都是宿主的。

**插件拿不到什么**：`ServiceContainer`、六边形 ports、文件系统、专用 IPC 面。渲染权与数据
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

**第三方开放的前置**：上表两处「弱」不补强（IPC 白名单 / 面板错误边界），第三方不得开放——
这不是实现项，是信任模型的硬前提。

## 2. 开发标准

- **一个插件 = 一个文件夹**：`client/plugins/<id>/`，`id` 与文件夹名一致（运行时目录名与
  设置键的命名空间）。manifest 判据 = `shared/plugin.ts`（缺字段/坏 id/越界 entry 一律拒绝
  并进日志，**不静默**）。
- **入口导出 `activate(api)`**；`mount` 返回清理函数；定时器与订阅必须挂 `ctx.signal`
  自清（收起/卸载/禁用时 abort）。`ai` 插件是全部能力的参照实现（storage/secrets/net/reader）。
- **需要构建的插件**：无 import 的源码即入口；引依赖时 esbuild 打自包含 ESM，`entry` 指向
  产物——入口契约不变。
- **样式**：优先复用 `styles.css` 的 `.plugin-*` 公共层（颜色走 token、字号在白名单内），
  不自创视觉语汇（STYLE §5.8 全文适用）。
- **日志**：`api.log` 走统一日志管道——探针态落 `<userData>/logs/app.jsonl`（scope 含插件名），
  内存 logStore 留给自检（见 `@shared/log` 与决策笔记 unified-logging）。
- **测试**：manifest 校验已有单测（`pluginManifest.test.ts` / `pluginCapabilities.test.ts` /
  `pluginManager.test.ts`）；插件自身逻辑尽量写成可测纯函数。

## 3. 生命周期

### 装载（现实现）

seed（官方件「缺则种」进 `<userData>/plugins/`）→ 主进程扫描 + manifest 校验（坏件跳过不
连坐）→ 渲染层按启用清单取入口源码 → Blob URL 动态 import → `activate` → `registerPanel`
登记 → 右欄卡片页按注册序渲染。失败件在设置页标「加載失敗」，其余不受牵连。

### 启停（现实现）

启用态落 settings 表 `plugins.enabled`（默认启用）；**切换任意插件 = 全量重载**——运行时
状态清零、启用件从头激活。硬约束（如实）：动态 import 的模块**无法逐出**，旧模块图驻留内存
直到窗口重开；v1 接受此代价，插件体量保持克制。

### 卸载（**方案，待实施**）

语义：卸载 = 文件 + 数据一并移除；禁用 ≠ 卸载（禁用只停激活）。卸载是宿主权力，不经插件
同意；正在启用的插件先禁用再卸。

- **IPC**：`plugins:uninstall({ id })`，主进程执行——① **官方种子件拒删**（「缺则种」会在
  下次启动复活，删了白删；将来如需可卸种子件，先给 seeder 加 opt-out）；② 删
  `<userData>/plugins/<id>/`；③ 删 settings 键 `plugin:<id>` 与 `plugin-secret:<id>:*`；
  ④ 回包后渲染层重跑 `loadPlugins`（同启停的全量重载语义）。
- **UI 落位**：设置页插件行加「卸載」文字动作（无图标、无二次弹窗确认——删除即移动语义
  在此不适用，数据清除不可逆，v1 以「官方件不可卸 + 启停可逆」兜底风险）。
- **版本兼容（开放问题，未定）**：manifest 版本只是形态字符串，无 compat 策略；「缺则种」
  不覆盖已装件，官方插件升级路径未定——开放前在 TODO 跟踪。

## 4. 数据落点（卸载清理清单的依据）

| 数据 | 落点 | 卸载时 |
|---|---|---|
| 插件代码 | `<userData>/plugins/<id>/` | 删目录（官方种子件拒删） |
| 私有键值 | settings 表 `plugin:<id>` 键 | 删键 |
| 密钥 | settings 表 `plugin-secret:<id>:<name>`（safeStorage 密文） | 删键 |
| 对话历史等业务数据 | 插件自管，物理上在上述键内 | 随键清 |

跟踪：[CONTRACTS §9](CONTRACTS.md) · [client/plugins/](../plugins/)
