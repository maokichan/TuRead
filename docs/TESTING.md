# 测试与验证口径（TESTING）

> **职能文档**：回归与验证的全部口径在此，不到验证环节不加载。专项细节不夺位——各专项
> `README` 是其领域权威（见下声明）；本页只做总口径、判据要点与指路。

## 环境事实（跑不起来的先看这里）

- **沙箱**：`npm test` / `npm run dev` / 任何探针经 esbuild 管道 stdio 或 Electron Mojo 命名管道 →
  受限沙箱下**必然 EPERM/FATAL，需放宽沙箱**；dev 启动必须脱离沙箱——沙箱化启动会损坏 GPU
  路径（WebGL 探测失败静默回落）。
- **`TUREAD_USER_DATA`**：探针/自检一律 `<工作区内独立目录的绝对路径>` 隔离（相对路径主进程
  拒载），**别碰真实书库**；`TUREAD_USER_DATA` 要落在工作区内。
- **Electron ABI**：better-sqlite3 是 electron-v130 ABI，系统 Node `require` 会 `ERR_DLOPEN_FAILED`
  → 碰原生模块的临时脚本用 `[client/node_modules/electron/dist/electron.exe](../client/node_modules/electron/dist/electron.exe) <脚本.cjs>` 跑；
  Windows 下 Electron 的 stdout 抓不到 → **结果写文件再读**（统一日志落地后，生产诊断走
  `<userData>/logs/app.jsonl`，见 `@shared/log`）；脚本末尾 `app.quit()` 的 FATAL 噪音不影响结论。
- 换 Electron 大版本后 `npm run rebuild:sqlite`。

## 单元与静态

- **`npm test`** = 纯逻辑单测（vitest 秒级、无需书）：anchor/location 语义、`compareNoteOrder`、
  `readerFollow`、`noteLayout`、`protocol`、分层守卫（`layering.test.ts`）、迁移/双队列、
  RoomSession、插件三件、日志轮转。
- **`npm run typecheck:all`** = 四个 tsconfig（node / web / test / **preview**）。
  ⚠ **preview 覆盖样式样张——改数据层或组件 props 后必跑**（「样张整页黑屏」就是漏跑它）；
  ⚠ [`tsconfig.test.json`](../client/tsconfig.test.json) 不设 `jsx` → 纯 `.ts` 不能 import `.tsx` 的类型（数据形状住纯模块里）。
- 渲染层视觉守卫：`styleGrammar.test.ts`（transition 走 `--dur-*`、z-index 档位、字号白名单），
  随 `npm test` 跑。

## 渲染链路（真窗口探针，均需沙箱放宽 + 隔离 userData）

| 探针 | 触发 | 断言口径 |
|---|---|---|
| 渲染自检 | `TUREAD_DEV_BOOK=<书>` | 导入→打开→渲染→位置；`[TUREAD-TEST-OK/FAIL]` 驱动退出码 |
| [library](../client/docs/features/library.md) | `TUREAD_DEV_PROBE=library`（需 `TUREAD_DEV_BOOK`） | 多库/書箱/收录/edition 复用读模型 |
| note | `TUREAD_DEV_PROBE=note` | 选择→锚点→高亮→跳转→删除全链路 ①–⑥ |
| link | `TUREAD_DEV_PROBE=link`（需 `TUREAD_DEV_BOOK` 指向**脚注样书**，构造器 [`client/test_docs/build-footnote-repro.mjs`](../client/test_docs/build-footnote-repro.mjs)） | 书内链接三分支不导航 iframe：同文件锚点原地滚 / 跨文件脚注跳章定锚 / 外链发 `link-external`（Issue #2 白屏回归） |
| pdf-note | `TUREAD_DEV_PROBE=pdf-note`（需 `TUREAD_DEV_BOOK` 指向 PDF） | PDF 笔记全链路：选区→context-menu anchor→kookit-pdf-rect 载荷→回显/删除；几何框選（合成拖曳→geom-captured→落库→回显） |
| [room](../client/docs/features/room.md) | `TUREAD_DEV_PROBE=room` | **唯一要真 server**：token/建房/标定/聊天/历史 16 断言；负向断言留 `net:send` 报错日志是预期的 |
| paged-interact / pdfWidth | `TUREAD_DEV_PROBE=…` | 事实行探针（无产品断言，看数字） |
| room-peer | `TUREAD_DEV_PROBE=room-peer` + `TUREAD_DEV_KEEPALIVE=1` | 双开联调驻留型（独立 member token） |

超时用 `TUREAD_DEV_TIMEOUT_MS` 放宽；样书首章纯图片扉页时探针自动逐章找正文。探针只留生命周期
边界与日志通道（用户裁：自主点击不可靠，CDP 终审不投入）。

## 样张与蜂群

- **样式样张**：`npm run style`（:5199）+ 无头机检 `smoke.cjs`（判据与量法坑的**权威** =
                                                                   ；[STYLE.md](../client/docs/STYLE.md) §8.0 是视觉验收口径）。
  ⚠ **探针的假数字/假绿比 FAIL 更危险**：`--scale` 自检计时环境；受控组件必须自持 state；
  模板字符串不写反引号（改完 `node --check`）。
- **蜂群**：`npm run swarm`（纯 Node，退出码即结论）——A1 全员到齐 / A2 位置不含发送者 /
  A3 聊天回执含发送者 / A4 离房不残留 / A5 无意外错误；覆盖边界 = 同步逻辑/协议/传输。
  判据权威 =                                                  （每房上限 20，别超）。

## server 侧

`go test ./...`（白盒在源码旁）+ [`server/test/e2e/`](../server/test/e2e)（黑盒走 HTTP/WS）；e2e 洪泛
`TestE2EFloodNoDrop` 本机既有不稳（非回归，登记 TODO）。

## 发行版冒烟（打包之后才做）

独立 userData 起 [`release/win-unpacked/TuRead.exe`](../client/release/win-unpacked/TuRead.exe) → 应落盘 `config.json` + `store.db` +
`covers/<editionId>.jpg`。打包配方与红线 = [`client/docs/BUILD.md`](../client/docs/BUILD.md)。
