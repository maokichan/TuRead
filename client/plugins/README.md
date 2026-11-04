# client/plugins/ —— 官方插件开发工作区

> 规范的权威 = [`../docs/PLUGINS.md`](../docs/PLUGINS.md)（能力边界 / 开发标准 / 生命周期）；
> 接口形状 = [`../docs/CONTRACTS.md`](../docs/CONTRACTS.md) §9；视觉 = [`../docs/STYLE.md`](../docs/STYLE.md) §5.8。
> 本目录 = 工作区事实：官方件源码随应用首发（dev「缺则种」进 `<userData>/plugins/`；
> 打包经 electron-builder `extraResources` 进发行物）。

## 现有插件

| 插件 | 说明 |
|---|---|
| `clock/` | 時鐘——右段「時鐘」格，纯文字走时。**插件系统的第一个验证插件**：验收发现/加载/占格/token/启停全链路 |
| `ai/` | 問——AI 共读助手 v0.1.0：右段「問」格（`hideWhenInRoom`，进房让位聊天）。带着当前位置与目录对话，引用原文『…』可点跳回；OpenAI 兼容接口、key 走 safeStorage 保险库；非流式 + 打字机呈现 |

新插件 = 本目录加一个文件夹（布局与标准见 PLUGINS.md §2）；启停/卸载语义见 PLUGINS.md §3。

跟踪：[clock](clock) · [ai](ai)
