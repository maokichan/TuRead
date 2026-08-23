# TuRead

多人同步阅读器：多个用户进入同一个房间，共同阅读同一本书。
渲染/解析基于 [kookit](https://github.com/koodo-reader/kookit)（Koodo Reader 的核心渲染引擎），
同步服务器用 Go 开发。

## 仓库结构

```
TuRead/
├── client/   # Electron 客户端（UI 技术栈待定；渲染引擎 kookit）
├── server/   # Go 同步服务器（独立项目，规划中，本次不开发）
├── kookit/   # 渲染引擎（唯一复用的上游代码，koodo-reader/kookit，git submodule）
├── docs/     # 架构与契约文档（ARCHITECTURE.md / CLIENT-CONTRACTS.md）
└── README.md
```

> 开发范围：**当前只开发 client**；server 为 TuRead 计划中的另一个独立项目。
> 契约先行：同步协议未定，先以 `docs/CLIENT-CONTRACTS.md` 的接口为代码级契约。

## 设计参考

UI 布局与交互设计参考 [koodo-reader](https://github.com/koodo-reader/koodo-reader)，
仅参考设计、不复用代码；本地开发过程中如需要可随时用网络配方重新拉取。

## 网络环境

受限网络/沙箱环境下的代理与 TLS 配置，见 `D:\PROJECT\NETWORK.md`（git 走本地代理 +
OpenSSL 后端；Go 需切换 GOPROXY 到 goproxy.cn；npm registry 可直连）。
