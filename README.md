# TuRead

多人房间共读阅读器：几个人进同一个房间，共读同一本书，实时同步彼此的阅读位置与聊天。

**当前状态**：本地阅读侧已端到端可用（四格式渲染 / 书架 / 沉浸态阅读器 / 笔记与划线 /
**跨书笔记管理**）；云端同步的服务端已实现，客户端与真实服务器的对接**尚未打通**。
逐版本明细见 [`docs/STATUS.md`](docs/STATUS.md)。

## 它是什么

- **本地阅读器**——不管理源文件：导入 = 建索引不拷贝，移除 = 只删索引。
- **笔记与划线**——锚在正文范围上（可选批注正文）；**跨书管理**：一个侧栏入口列出全部笔记，
  網格 / 瀑布流两态、按批注或划线筛、检索、双击跳回原书原处。
- **共读房间**——同一房间内同步阅读位置与聊天（v1 明确不做笔记同步）。
- **书库是组织方式**，不是文件夹的副本：同一本书可以出现在多个书库里，笔记与阅读进度跟着**内容**走。

## 技术构成

| 部分 | 说明 |
|---|---|
| `client/` | Electron + React 桌面客户端。六边形架构（端口—适配器）；渲染与解析**整体交给 kookit**，客户端只提供容器、注入样式与调用引擎原语 |
| `server/` | Go 同步服务器（房间 / 书籍标定 / 副本分发 / 位置广播 / 聊天），独立 Go module |
| `kookit/` | 渲染引擎（[Koodo Reader](https://github.com/koodo-reader/kookit) 的核心，AGPL-3.0，git submodule） |
| `docs/` | 项目状态与共同架构 |

数据存在本地：一个 SQLite 库 + 一个极小的 JSON 引导文件；封面是跟内容走的缩略图。

## 上手

**客户端**（Windows，需要 Node）：

```bash
cd client
npm install
npm run dev            # 开发（Electron + HMR）
npm test               # 单测（纯逻辑判据，秒级，不需要书）
npm run typecheck      # 类型检查
npm run style          # 浏览器里的样式样张（改样式不用起 Electron）
npm run dist           # 打包免安装便携版 → release/（只出 64 位 Windows；构建要走代理，见 NETWORK.md）
```

> `npm test` 与 `npm run dev` 都经 esbuild 走管道 stdio，**受限文件沙箱下会 `EPERM`**，
> 需在放宽模式下执行。无头验证另有探针：`TUREAD_DEV_BOOK=<书的绝对路径> npm run dev`
> 会跑真实渲染链路并打印 `[TUREAD-TEST-OK/FAIL]`。

**服务端**：

```bash
cd server
cp turead.toml.example turead.toml   # 按需修改
go test ./...
go build -o turead-server ./cmd/server
./turead-server
```

配置与排障见 [`server/docs/OPS.md`](server/docs/OPS.md)；打包与代理见 [`NETWORK.md`](NETWORK.md)。

## 文档从哪读

读文档请从 [`MAP.md`](MAP.md) 出发（它是导航地图，含阅读顺序与红线）；
待办只有一份：[`TODO.md`](TODO.md)。各端细节在各端 `docs/` 下。

## 关于源项目

TuRead 的原型是 [V2tin19/TuRead](https://github.com/V2tin19/TuRead)（早期 Express/socket.io 原型，已弃用）。
本仓库是重新实现（渲染基于 kookit、同步服务器用 Go），与原型的代码与提交历史无继承关系。

## 许可证

TuRead 以 **AGPL-3.0** 开源（因核心依赖 kookit 为 AGPL-3.0）。

> ⚠ **发行物缺件（对外发行前必修）**：仓库尚无 `LICENSE` 文件，源流明体的 OFL 全文也未随包。
> 引入新依赖请**先核许可证与 AGPL-3.0 兼容性**。登记在 [`TODO.md`](TODO.md)。
