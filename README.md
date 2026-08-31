# TuRead

多人房间共读阅读器：多个用户进入同一个房间，共同阅读同一本书，实时同步彼此的阅读位置与聊天。

- **渲染**：基于 [kookit](https://github.com/koodo-reader/kookit)（Koodo Reader 的核心渲染引擎，AGPL-3.0，git submodule）
- **服务端**：Go 同步服务器（房间 / 书籍标定 / 电子版分发 / 位置广播 / 聊天），**v0.2.0 已实现**
- **客户端**：Electron 桌面应用，**尚未开发**（契约与架构已定稿）

## 仓库结构

```
TuRead/
├── client/    # Electron 客户端（未开发；契约与架构见 client/docs/）
├── server/    # Go 同步服务器（v0.2.0；独立 Go module，文档见 server/docs/）
├── kookit/    # 渲染引擎（唯一复用的上游代码，git submodule）
├── docs/      # 共同文档（书籍标定 / 仓库布局）
├── TODO.md    # 待办清单
├── MAP.md     # 项目地图与文档导航（模型会话自动加载）
└── 借物表.md   # 第三方资源与许可证
```

## 快速开始（服务端）

```bash
cd server
cp turead.toml.example turead.toml   # 按需修改（配置说明见 server/docs/OPS.md）
go test ./...                        # 单测 + E2E 集成测试
go build -o turead-server ./cmd/server
./turead-server
```

## 文档导航

架构、契约、运维等全部文档的阅读顺序见 [MAP.md](MAP.md)；未完成事项见 [TODO.md](TODO.md)。

## 关于源项目与仓库

TuRead 的原型是 [V2tin19/TuRead](https://github.com/V2tin19/TuRead)（早期基于 Express/socket.io 的共享阅读原型，已弃用）。
本仓库是其重新实现（渲染基于 kookit、同步服务器用 Go），与原型的代码与提交历史无继承关系。

因管理原因，本项目取消了原有的 fork，重新开设了独立新仓库（2026-08-29）。

## 许可证

TuRead 以 **AGPL-3.0** 开源（因核心依赖 kookit 为 AGPL-3.0）；第三方资源清单见 `借物表.md`。
