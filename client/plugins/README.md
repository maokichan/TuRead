# client/plugins/ —— 官方插件开发工作区

> 契约（manifest / 插件模块 API / 注册点 / 信任模型）= [`../docs/CONTRACTS.md`](../docs/CONTRACTS.md) §9；
> 功能划分 = [`../docs/FEATURES.md`](../docs/FEATURES.md) §13；视觉 = [`../docs/STYLE.md`](../docs/STYLE.md) §5.8。
> 信任模型 v1 = **只装官方插件**：这里的每个文件夹随应用首发（dev 启动时主进程"缺则种"进
> `<userData>/plugins/`；打包经 electron-builder `extraResources` 进发行物）。

## 一个插件 = 一个文件夹

```
client/plugins/<id>/
├── plugin.json   # manifest：{ id, name, version, entry, description? }（判据 = shared/plugin.ts）
└── main.mjs      # 入口 ESM（manifest.entry 指向它）；无构建依赖时可与源码同文件
```

- `id` 必须与文件夹名一致（`/^[a-z0-9][a-z0-9-]*$/`）——它是运行时目录名与设置键的命名空间。
- 入口导出 `activate(api)`：`api.registerPanel({ id, label, title?, mount(el, ctx) })` 注册挂载线
  **右段面板格**；`api.storage`（`get`/`set`，落全局 settings 表 `plugin:<id>` 键）；`api.log`。
- `mount` 返回清理函数（卸载时调用）；`ctx.signal` 在收起/卸载/禁用时 abort——定时器与订阅据此自清。
- **渲染权在宿主**：插件只拿内容区元素；外壳（几何/页签/开合/滚动）是宿主的。样式优先复用
  `styles.css` 的 `.plugin-*` 公共层（颜色走 token、字号在白名单内），**不自创视觉语汇**。

## 需要构建的插件

无 import 的插件（如時鐘）源码即入口，不需要构建。要引依赖时：esbuild 打包成自包含 ESM
（依赖内联进 bundle），`manifest.entry` 指向产物（如 `dist/main.mjs`）——入口契约不变。

## 现有插件

| 插件 | 说明 |
|---|---|
| `clock/` | 時鐘——右段「時鐘」格，纯文字走时。**插件系统的第一个验证插件**：验收发现/加载/占格/token/启停全链路 |
| `ai/` | 問——AI 共读助手 v0.1.0：右段「問」格（`hideWhenInRoom`，进房让位聊天）。带着当前位置与目录对话，引用原文『…』可点跳回；OpenAI 兼容接口、key 走 safeStorage 保险库；非流式 + 打字机呈现 |
