# TuRead

多人房间共读阅读器：多个用户进入同一个房间，共同阅读同一本书，实时同步彼此的阅读位置与聊天。

- **渲染**：基于 [kookit](https://github.com/koodo-reader/kookit)（Koodo Reader 的核心渲染引擎，AGPL-3.0，git submodule）
- **服务端**：Go 同步服务器（房间 / 书籍标定 / 电子版分发 / 位置广播 / 聊天），**v0.2.0 已实现**
- **客户端**：Electron 桌面应用，**v0.1.11**——本地阅读 MVP（渲染四格式全绿 + 书架增删 + 目录跳转 + 位置恢复）+ 功能组件标准容器与 UI 交互流 + **渲染层风格基线**（文字优先 / 全局统一字体 / 中文排版；契约、架构、风格见 `client/docs/`）

## 仓库结构

```
TuRead/
├── client/    # Electron 客户端（v0.1.11；契约/架构/FEATURES/STYLE 见 client/docs/）
├── server/    # Go 同步服务器（v0.2.0；独立 Go module，文档见 server/docs/）
├── kookit/    # 渲染引擎（唯一复用的上游代码，git submodule）
├── docs/      # 共同文档（书籍标定 / 仓库布局）
├── TODO.md    # 待办清单
├── MAP.md     # 项目地图与文档导航（模型会话自动加载）
```

## 快速开始（服务端）

```bash
cd server
cp turead.toml.example turead.toml   # 按需修改（配置说明见 server/docs/OPS.md）
go test ./...                        # 单测 + E2E 集成测试
go build -o turead-server ./cmd/server
./turead-server
```

## 客户端开发与打包（Windows）

```bash
cd client
npm install
npm run dev            # 开发（Electron + HMR）
npm run typecheck      # 类型检查（node + web 两个 project；样张另有 typecheck:preview）
npm run style          # 浏览器里的样式样张（改 styles.css 秒级看效果，不用起 Electron）
npm run dist           # 打包发行版 → release/（见下）
```

**发行版范围**：**只出 64 位 Windows**（NSIS 安装包，用户 2026-09-11 定），配置在
`client/electron-builder.yml`；产物 `client/release/TuRead-<version>-win-x64-setup.exe`（`release/` 已 gitignore）。

打包前置（本机网络，详见 `NETWORK.md`）：electron-builder 要从 GitHub 拉 Electron 发行版与 NSIS 组件，
本机 GitHub 直连被墙 → **构建前设代理**（Node 的 TLS 走 OpenSSL，环境变量即可）：

```powershell
$env:HTTP_PROXY  = "http://127.0.0.1:7897"
$env:HTTPS_PROXY = "http://127.0.0.1:7897"
npm run dist
```

> 无头自检（开发用）：`$env:TUREAD_DEV_BOOK="<书的绝对路径>"; npm run dev` —— 跑真实链路并打印
> `[TUREAD-TEST-OK/FAIL]`（渲染/注入/封面/字体/恢复等断言，细节见 `client/src/renderer/src/dev/selfCheck.ts`）。

## 文档导航

架构、契约、运维等全部文档的阅读顺序见 [MAP.md](MAP.md)；未完成事项见 [TODO.md](TODO.md)。

## 关于源项目与仓库

TuRead 的原型是 [V2tin19/TuRead](https://github.com/V2tin19/TuRead)（早期基于 Express/socket.io 的共享阅读原型，已弃用）。
本仓库是其重新实现（渲染基于 kookit、同步服务器用 Go），与原型的代码与提交历史无继承关系。

因管理原因，本项目取消了原有的 fork，重新开设了独立新仓库（2026-08-29）。

## 许可证

TuRead 以 **AGPL-3.0** 开源（因核心依赖 kookit 为 AGPL-3.0）。

> ⚠ **发行物缺件（待补）**：仓库目前**没有 LICENSE 文件**，源流明体的 OFL 全文也尚未随包 ——
> 对外发行前必须补（登记在 TODO.md）。
> `借物表.md`（第三方资源登记）已于 2026-09-11 **退役**并移出版本控制，见 `docs/STATUS.md` §3；
> 许可义务仍在：引入新依赖先核许可证与 AGPL 兼容性。
