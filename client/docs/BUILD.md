# 打包与发版（BUILD）

> **职能文档**：打包、滚版本、发版的全部口径在此，不到打包/发版环节不加载。
> 红线「打包只在用户明确要求时做、「滚了版本号」≠「该打包」」常驻仓库根 [`AGENTS.md`](AGENTS.md)；
> 本文详述口径。打包的机器配置 = 打包配置（106 行，语境事实在本文引用）；
> 测试与冒烟 = [`TESTING.md`](../../docs/TESTING.md)。

## 范围与形态

- **只出 64 位 Windows**，形态 = **免安装便携版**（NSIS 暂不出，配置块保留备用）。
- 产物落 `client/release/`（gitignored，不进仓库）；仓库里最新已打包 = v0.2.8 便携版。
- **插件不随包**（用户 裁定：官方插件手动安装）：发行物内无 plugins；官方插件经
  GitHub Release 分发 zip，用户在设置页「安裝插件…」导入（[`PLUGINS.md`](../plugins/PLUGINS.md) §4）。

## 打包配方（实测在案）

- **代理**：electron-builder 下载二进制走本地代理 `127.0.0.1:7897`（没开会连不上，报
  "Failed to connect … 127.0.0.1" 即此因）。
- **electronDist 指向本地** [`node_modules/electron/dist`](../node_modules/electron/dist)——GitHub 直下会静默挂起（实测规避，
  配置在案）。
- `npmRebuild: false` + better-sqlite3 `asarUnpack`：预编译 Electron ABI 直接用（better-sqlite3@12
  预编译可用、无 postinstall 需代理——[DATA_MODEL](DATA_MODEL.md) 已验证）；换 Electron 大版本先
  `npm run rebuild:sqlite`；pdfjs 的 `canvas` 在 files 排除。
- NSIS 被墙组件的本地镜像出路（`ELECTRON_BUILDER_BINAARIES_MIRROR` 一族）配置在案备用。
- ⚠ 打包产物加 `TUREAD_DEV_BOOK` 跑自检**不自退**（开发态正常）→ 断言级验证拿不到输出与退出码，
  修复前打包验证只做发行版冒烟（见 [`TESTING.md`](../../docs/TESTING.md)）。

## 滚版本（发版节奏：功能确定后即滚，不长期堆改动）

滚版本时同步四处 + 打 tag：

1. 包清单 + 锁文件（server 侧同理其 [go.mod](../../server/go.mod) 语境）
2. 项目自述（版本号与产物状态）
3. annotated tag：**两端独立滚动，带端名前缀** `client-v0.2.x` / `server-v0.2.x`
4. **GitHub Release（用户定：每版本都发）**：以该 tag 发 release，asset = 本机打包的
   便携版 exe，说明 = 该版 tag 消息要点；**官方插件有版本变动时，同 release 附插件 zip**
   （用户裁定：插件分发 = GitHub Release，手动安装）；`API` 走代理（节奏 = 随 push 由用户定）。

⚠ 未获指示的改动**并入当前版本**（「已提交但版本未滚」合法，此时不打 tag）；tag 与 push 由用户定节奏。**产物（便携版 exe）不进仓库**
（对外列管于 GitHub Release asset）。

## 许可文件随发行物（已补）

- 仓库根 `LICENSE` = AGPL-3.0 官方全文（gnu.org 原文，走代理下载不手抄）；字体目录
  `assets/fonts/OFL.txt` = OFL 1.1 官方明文（openfontlicense.org 原文）。
- 两件经打包配置 `extraResources` 进发行物 `resources/`（与 electron 自带的
  LICENSE.electron.txt / LICENSES.chromium.html 同层）；pdfjs 第三方声明（LICENSE / LICENSE_FOXIT /
  LICENSE_LIBERATION）随 `public/lib/pdfjs/` 进包。
- 字体许可语境 = [`STYLE.md`](STYLE.md) §3 与 `assets/fonts/NOTICE.md`。
