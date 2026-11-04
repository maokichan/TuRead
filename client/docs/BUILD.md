# 打包与发版（BUILD）

> **职能文档**：打包、滚版本、发版的全部口径在此，不到打包/发版环节不加载。
> 红线「打包只在用户明确要求时做、「滚了版本号」≠「该打包」」常驻仓库根 `AGENTS.md`；
> 本文详述口径。打包的机器配置 = `client/electron-builder.yml`（106 行，语境事实在本文引用）；
> 测试与冒烟 = `TESTING.md`。

## 范围与形态

- **只出 64 位 Windows**，形态 = **免安装便携版**（NSIS 暂不出，配置块保留备用）。
- 产物落 `client/release/`（gitignored，不进仓库）；仓库里最新已打包 = v0.1.15 便携版。
- extraResources：官方插件随包进 `resources/plugins`（运行时「缺则种」的种子源）。

## 打包配方（实测在案）

- **代理**：electron-builder 下载二进制走本地代理 `127.0.0.1:7897`（没开会连不上，报
  "Failed to connect … 127.0.0.1" 即此因；配方全文在 `STATUS.md` §5 网络配方）。
- **electronDist 指向本地** `node_modules/electron/dist`——GitHub 直下会静默挂起（实测规避，
  配置在案）。
- `npmRebuild: false` + better-sqlite3 `asarUnpack`：预编译 Electron ABI 直接用（better-sqlite3@12
  预编译可用、无 postinstall 需代理——DATA_MODEL 已验证）；换 Electron 大版本先
  `npm run rebuild:sqlite`；pdfjs 的 `canvas` 在 files 排除。
- NSIS 被墙组件的本地镜像出路（`ELECTRON_BUILDER_BINAARIES_MIRROR` 一族）配置在案备用。
- ⚠ 打包产物加 `TUREAD_DEV_BOOK` 跑自检**不自退**（开发态正常）→ 断言级验证拿不到输出与退出码，
  修复前打包验证只做发行版冒烟（见 `TESTING.md`）。

## 滚版本（发版节奏：功能确定后即滚，不长期堆改动）

滚版本时同步四处 + 打 tag：

1. `client/package.json` + `package-lock.json`（server 侧同理其 go.mod 语境）
2. `docs/STATUS.md` §4 版本历史
3. `README.md`（版本号与产物状态）
4. annotated tag：**两端独立滚动，带端名前缀** `client-v0.2.x` / `server-v0.2.x`

⚠ 未获指示的改动**并入当前版本**（「已提交但版本未滚」合法，此时不打 tag，STATUS §6 的
「未滚版本的增量」段承载）；tag 与 push 由用户定节奏。**产物（便携版 exe）不随版本列管**。

## 发行物缺件（对外发行前必修，行动项在 TODO）

仓库无 `LICENSE` 文件；OFL 全文未随包（源流明体要求保留声明）；第三方声明应随发行物。
做法与判据见 `TODO.md` 发行物缺件条（取官方全文走代理，不手抄；electron-builder 打进发行物）。
字体许可语境 = `STYLE.md` §3 与 `assets/fonts/NOTICE.md`。
