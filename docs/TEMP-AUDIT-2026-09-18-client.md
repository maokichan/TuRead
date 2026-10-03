# 临时审计：TuRead client 程序健壮性与工程纪律（2026-09-18）

> ⚠ **性质**：**临时性审计快照**，不是契约文档，不进 `MAP.md` 文档导航。
> **状态（2026-10-03 更新）**：A-1 / A-2 / B-1 / B-5 及 C-3、§3 的 `storeCreateLibrary`
> 兼容 shim 已消化（修于 `429125ff`、`c6143de5`，连同另一轮独立代码审查的修复），
> 对应条目已从本文删除；**剩余条目 = B-2 / B-3 / B-4 / B-6 / C-1 / C-2 / C-4 / C-5**，
> 全部消化后删除本文件。
> **原审查基准**：client-v0.2.0（`ddff9c68`）。行号会随提交漂移，以描述定位。
> **未做**：真机运行、探针复跑、LibraryFeature / NotesFeature 全文。

## 0. 结论一句话

架构纪律执行得**相当好**（分层守卫、端口隔离、协议收拢、适配器代次守卫都是真材实料）。
**已消化的**：契约死代码（A-1）、传输层悬空 Promise（A-2）、renderTo 编排竞态（B-1）、
IME 组合缺陷（B-5）。**仍开放的**：房间连接生命周期一组（B-2/B-3/B-4 + C-2/C-4）、
单实例锁（B-6）、IPC 信任边界（C-1）与杂项（C-5）。

## 1. 遗留状态盘点（上一会话 / 工作树）

用户提示"今天下午有模型做同样任务被网络中断，可能存在更改"。**全盘核查结果**：

| 项 | 事实 | 定性 |
|---|---|---|
| 全盘 mtime 扫描（含隐藏目录 `-Force`） | **2026-09-18 当天整个 `D:\PROJECT` 没有任何文件被写入**（排除 node_modules/.git/缓存） | 中断会话**没有在磁盘留下产物**（或写入全部丢失）——不存在需要合并/回滚的半成品代码 |
| `server/cmd/server/main.go` 未提交 | +`NO ADMIN SET` 日志（无 admin token 时提示） | 无害的运维性补丁，来源不明但合理；**建议保留**，随下次 server 提交走账 |
| `server/internal/room/manager.go` 未提交 | gofmt 对齐 + 人类开发者留的提问注释 | **保留**（提问已在 STATUS §6 答复）；对齐改动随下次提交走账 |
| `server/internal/store/store.go` 未提交 | 注释 mojibake：`nick=''` 被写成 `nick=”`（全角右引号） | **建议单独 revert 这一个 hunk**——是输入/编码事故不是改动。按 STATUS §6 纪律"动 server 前先与用户确认"，本次**未动手**，仅登记 |
| `kookit/` 子模块 dirty | `package-lock.json`/`yarn.lock` 被改 + 未跟踪 `npm-install*.log`、`rollup.turead.config.mjs` | 安装噪音 + 一个来路不明的 rollup 配置；kookit 内禁止 commit/push（其规则），**建议与用户确认后清理**，本次未动 |
| `D:\PROJECT\.zcode\plans\*.md` | 属于 core / TagHit 项目 | 与 TuRead 无关，未动 |

## 2. 剩余发现清单

严重度：**A = 契约/正确性错误或可挂死**；**B = 有明确触发路径的缺陷**；**C = 低危/噪声/口径**。
每条：位置 → 现象 → 影响 → 依据 → 最小修法方向。已登记 TODO 的注明对账。
（已消化的 A-1 / A-2 / B-1 / B-5 / C-3 条目已删，见 git 历史 2026-10-03 前的版本。）

### B-2 房间位置上报不校验"是不是这本书" —— 业务规则缺一环

- **位置**：`core/usecases/RoomSession.ts`（joinRoom 订阅 `render.on('location-changed')`）、
  `onRenderLocation` 无书校验直接 `throttleSend`。
- **现象**：`location-changed` 是渲染端口的全局事件。在 A 书的房间里打开 B 书（书架→打开、
  或切库后重开），B 的位置会作为 A 房的 `room.location` 广播；服务器不校验直接转发
  （location 载荷本就不带书标识）。
- **影响**：同房成员的 presence 快照里出现"另一本书的章号"。`location-updated` 的消费方
  尚未实现（TODO 同步组），暂时无可见后果——但**埋着**：跟随模式一落地就是串书 bug。
- **最小修法**：`onRenderLocation` 校验当前书 ≡ `joinedBook` 再上报（ReaderFeature 已有
  同款判据 `roomId && editionId === readerBookId`，用例层应持有一份权威判断）。

### B-3 disconnect 绕过 leaveRoom —— usecase 层幽灵会话

- **位置**：`features/RoomFeature/index.tsx`（`disconnect` 直接 `net.disconnect()`）；
  对照 `RoomSession.ts`（只有 `leaveRoom` 清 joinUnsubs/state）。
- **现象**：会话中直接「断开」：WS 关了、共享态复位了（`endRoomSession`），但 RoomSession 的
  `joined/roomId/state/joinUnsubs` 全部残留，render 位置监听仍活着——期间每次翻页都走
  `onRenderLocation` → `net.send` 抛"未连接"被空 catch 吞掉。下一次 `joinRoom` 才隐性修复。
- **影响**：状态机的"断开"迁移没有走完，靠"下次 joinRoom 先 leaveRoom"兜底。生命周期
  归属不清（net 层死了、usecase 层没死）；与 B-2 叠加时幽灵 state 还会更新成他书位置。
- **最小修法**：`RoomFeature.disconnect` 先 `await container.room.leaveRoom()` 再
  `net.disconnect()`（leaveRoom 幂等，成本为零）。

### B-4 重连耗尽后的"半死态"没有出口

- **位置**：`main/net/wsNetAdapter.ts`（5 次重连后 `emitState('disconnected')`；
  `roomId` 保留、`explicitlyClosed` 仍为 false）。
- **现象**：耗尽后 UI 显示 disconnected，但 RoomSession 仍 `joined=true`、state 仍是
  "在房间里"；无恢复动作，聊天发送抛错进日志、位置上报被吞。用户唯一出路是手动离房重进。
- **最小修法**：重连耗尽时向上层发**可区分**的事件（如 system-message / 独立状态值），
  由 UI 引导"重新进入房间"；或 RoomSession 收到 disconnected 后自动 `leaveRoom()` 复位
  （牺牲自动恢复换取状态一致——按产品哲学"可预期"二选一）。

### B-6 无单实例锁

- **位置**：`main/index.ts`（`whenReady` 流程无 `app.requestSingleInstanceLock()`）。
- **现象**：双开 exe = 两个主进程共写同一 `userData` 的 `store.db` + `config.json` 引导文件
  （读写竞态、状态互踩），WS 侧同 token 互踢（`API.md` 登记的 NAT 限制；dev 的
  `TUREAD_DEV_MEMBER_TOKEN` 只是探针设施，不是产品答案）。
- **最小修法**：加单实例锁 + `second-instance` 聚焦已有窗口；dev 双开走显式
  `TUREAD_USER_DATA` 分离（已支持），互不冲突。

### C-1 `fs:read-file` 任意路径读取（已知债务的确认与量化）

- **位置**：`main/ipc.ts`；`preload/index.ts`（泛化 `invoke(channel, …)` 桥）。
- **事实**：渲染层可 invoke 任意已注册通道；`fs:read-file` 对任意路径 readFile；
  `net:request` 可对 baseUrl 下任意 path 携带 member token 发 POST/DELETE。
  TODO「IPC 桥信任边界过宽」已登记，preload 注释称白名单化"第一步"只做了剪贴板；
  叠加 PDF iframe 无 sandbox（TODO P2 已登记，`KOOKIT.md` §5.4 逆向事实），
  "恶意 PDF → `window.turead.invoke` 读本地文件"这条链路**成立**（文字类被 sandbox 挡住）。
- **定性**：非新发现；审计确认其仍开放，并建议**收敛顺序**：先收 `fs:read-file`
  （导入/扫描之外的调用方为零），再谈 `net:request` 的 path 校验。

### C-2 `joinRoom` 无代次守卫（UI 部分遮挡）

- **位置**：`RoomSession.ts`；`RoomFeature/index.tsx`（大厅 `RoomRow` 的 onEnter
  不受 `joining` 禁用，只有底部两按钮受）。快速连点两个房间行 = 并发 joinRoom 互相
  `resetJoinState`，叠加原 A-2 的悬空 Promise 可产生难解释的中间态
  （A-2 的悬空本身已修于 `429125ff`，本条仍开放）。
- **最小修法**：用例层给 joinRoom 加代次（与 pendingJoin 同款机制）+ RoomRow 在 joining 时禁用。

### C-4 连接状态噪声

- `closeRoom()`（`wsNetAdapter.ts`）无条件广播 `disconnected`；`connect()` 开头的
  `await this.closeRoom()` 使**每次连接都先广播一次 disconnected**，转发链路
  （RoomSession → roomSession.ts → 两处 UI）全走一遍。加"状态未变不广播"即可。

### C-5 杂项（一句话级）

- `RoomSession.leaveRoom` 不清 `pendingEmit`（只清了 emitTimer）——重进房间后的
  节流尾发可能带出上一会话的旧位置。一行修复。
- `ChatPanel.formatTime` 假设 `createdAt` 存在，而 `isChatMessage` 形状守卫只查
  `id/text` → 脏数据显示 `NaN:NaN`。守卫补 `typeof m.createdAt === 'number'` 即可对齐。
- `TypedEmitter.emit`（`ports/emitter.ts`）无监听器异常隔离：一个 listener 抛错中断
  后续。消费方均为自家代码，风险低；**不建议**顺手加 try/catch（对自家 listener 属过度防御），
  仅记录口径即可。
- `SqliteStore.init()` 的 `initPromise` 失败后不重置——一次性故障（文件被短暂占用）
  会固化成"直到重启都打不开"。可接受（应用级单例、错误信息已可行动），登记备查。

### C-6 交互口径核对结果（与 STYLE/FEATURES 对账，均为确认一致而非新问题）

- Esc 分流（全屏优先 → 退出阅读器；不收参数面板）与 `reader.back` 实现一致 ✓
- `p` 键在「聊天」页签先切回參數、`c` 键切聊天、不在房间无此面——与 v1.12 口径一致 ✓
- `F11` = 幂等进入全屏；离开阅读器保持最大化（`win:set-maximized` 的
  leave-full-screen 挂钩处理了竞态）✓
- 鼠标侧键按功能态分工（书库=后退前进 / 阅读器=翻页）✓
- 目录/笔记跟随居中（`readerFollow` 纯函数）、`focusNote` tick 防重复消费 ✓
- **两处已知口径漂移不改**（TODO 已登记，引用备查）：点击翻页带 `w-1/4` vs `STYLE.md` §5.8
  写的 1/3；聊天自动滚到底打断上翻（待真机复看）。

## 3. "过度防御性编程"专项结论

按用户点名的要求单独给结论：**本项目整体不偏向过度防御，反而有几处"欠防御"**（§2 的 B 组）。
逐类核查：

- **空 catch**：全源码共 6 处，每处都有注释说明为何吞（传输层非法 JSON、关已死连接、
  断线期位置上报）。**这是有纪律的吞**，不算问题；唯一例外是 B-3 提到的
  "幽灵会话期 send 失败被吞"——根因在状态机不在 catch。
- **防御性形状守卫**：`isChatMessage`、`looksLikeLegacyStore`、`resolveRenderedChapter`
  的"不信事件载荷"——都是**有实测事故背书**的守卫，属于把外部边界
  （kookit、网络）的不确定性挡在适配器层，**方向正确**。
- **真正可删的冗余防御**：`storeCreateLibrary` 的"兼容旧调用（直接传字符串）"分支
  —— **已删（`d468f1b4`）**。
- **过度防御的反例（值得点名表扬的克制）**：`resolveAnchor` 原实现"找不到就只到章级，
  不报错"的分寸感是对的（该处已另修为等 rendered 事件，见 `429125ff` 前的 `c6143de5`）。

## 4. 值得保留的工程实践（审计确认"做得对"的部分，后续改动请勿回退）

1. **适配器代次守卫**（`openToken`；`renderTo` 亦已配同款令牌，`429125ff`）——
   恰好是 RoomSession/ReaderFeature 还缺的东西，模式可复制。
2. **`renderHighlighters` 传拷贝**（kookit 内部 `notes.reverse()` 原地改入参）——
   把外部库的脏行为挡在适配器内。
3. **协议词汇收拢** `core/domain/protocol.ts` + reason 容错归一 + 15 单测——
   对"服务器与文档不一致"的正确应对姿势。
4. **WS 握手失败不越权发 `connected`**（`opened` 标志）——TODO P2 销案的实现是干净的。
5. **SqliteStore 形状守卫**（旧库误用给出可照做的错误信息）与 `close()` 后可重开的
   initPromise 语义。
6. **metadata relay 的故障路径**：render-process-gone 快速失败在途任务、排队/ready
   握手防早派丢任务。
7. **分层守卫测试**（`tests/layering.test.ts`）+ `typecheck:all` 四 project——
   架构红线有机器看着。
8. **AppShell `navigate` 恢复上次阅读的显式兜错注释**——把"无 catch 候选"写进代码，
   正是"解释优先"纪律的落地样例。

## 5. 测试缺口对账

- `RoomSession`（504 行核心用例）**已有首批单测**（`RoomSession.test.ts`，2026-10-03，
  FakeNet 3 条：无书成员 / 带书指纹 / 失败归一）。**仍缺**：rejoin（重连重入）、
  节流合并、presence diff 的用例层断言——跟随模式（B-2 修后）动工前建议补齐。
- `wsNetAdapter` 无测试（需要 mock `ws`）——A-2 已修，回归防线仍靠补测。

## 6. 剩余处理顺序（供用户裁决）

1. **B-3**（disconnect 先 leaveRoom）——一行级，先做。
2. **C-5 前两条**（`pendingEmit` 清理、`formatTime` 守卫）——随手批处理。
3. **B-2**（位置上报书校验）——跟随模式动工前的必做前置。
4. **B-4 + C-2 + C-4**（重连耗尽出口 / joinRoom 代次 / 状态噪声）——同一状态机，
   建议一次做掉，分散修会互相打架。
5. **B-6**（单实例锁）——随打包发版前收口。
6. **C-1**（先收 `fs:read-file`，再谈 `net:request` path 校验）。
7. §1 的遗留清理（store.go mojibake revert、kookit 噪音）——**动 server 前与用户确认**。
8. 全部消化后：删除本文件。

## 7. 不确定性声明（剩余条目）

- B-2/B-3/B-4 的现象链基于代码走读，未真机复现；B-4 的"半死态"触发需要真实断网环境。
- 行号以原审查基准（`ddff9c68`）描述，现工作树已多轮提交，按符号名定位。
- LibraryFeature / NotesFeature / SettingsFeature 仅做过生命周期抽查
  （2026-10-03 的独立代码审查已覆盖其取数/防抖/渲染层问题，见当次提交）。
