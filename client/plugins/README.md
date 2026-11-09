# [client/plugins/](client/plugins) —— 插件开发工作区

> 规范的权威 =[`PLUGINS.md`](PLUGINS.md)（能力边界 / 开发标准 / 接口与宿主义务 / 生命周期，本目录自持）；
> 接口形状 =[`../src/shared/plugin.ts`](../src/shared/plugin.ts)；视觉 =[`../docs/STYLE.md`](../docs/STYLE.md)§5.8。
> 本目录 = 工作区事实：插件源码住这里。**产品获取 = 手动安装**（官方插件经 GitHub Release 分发
> zip、设置页「安裝插件…」导入——不随包、无自动补齐，用户 裁定）；**dev 豁免** =
> 非打包启动时本目录被覆盖同步进 `<userData>/plugins/`（改完源码重启 dev 即生效，见 [PLUGINS.md](PLUGINS.md) §4）。

## 现有插件

| 插件 | 说明 |
|---|---|
| [`clock/`](clock) | 時鐘——右段「時鐘」格，纯文字走时。**插件系统的第一个验证插件**：验收发现/加载/占格/token/启停全链路 |
| [`ai/`](ai) | 問——AI 共读助手 v0.1.0：右段「問」格（`hideWhenInRoom`，进房让位聊天）。带着当前位置与目录对话，引用原文『…』可点跳回；OpenAI 兼容接口、key 走 safeStorage 保险库；非流式 + 打字机呈现 |

新插件 = 本目录加一个文件夹（布局与标准见 [PLUGINS.md](PLUGINS.md) §2；发布 = 打 zip 走安装管道或随 GitHub Release）；
启停/卸载语义见 [PLUGINS.md](PLUGINS.md) §4。
