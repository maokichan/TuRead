# 房间（room）—— feature 参照

> 本页 = 房间域的**架构锚点与实现细节**；进房三路/补书链/跟随模式的交互语义权威在
> `FEATURES.md` 房间节；接口形状 = `contracts/ports.md`（连接粒度 = 房间）+
> `contracts/services-container.md`（joinRoom 编排）+ `server/docs/API.md`；服务器运维 =
> `server/docs/OPS.md`；连接模型裁定见 STATUS §3。

## 1. 架构锚点

| 层 | 归属 |
|---|---|
| Feature 组件 | `src/renderer/src/features/RoomFeature/index.tsx`（489 行，含连接配置 + 大厅 + 会话——连接是房间的一部分，非独立 Feature）；域内组件 `RoomRow`/`MemberList`/`ChatLog`/`ChatPanel`/`StatePill` |
| usecases | `RoomSession`（591 行：join/leave/chat/位置同步；+454 行单测）——消费 net + render + identity 三端口 |
| ports | `net`（INetService，本域独占）、`identity`（指纹，与 library 共享）、`render`（位置事件来源） |
| adapters | `net/ipcNetAdapter`（渲染层侧）+ `src/main/net/wsNetAdapter`（主进程 WS 实现） |
| domain | `core/domain/protocol.ts`（ROOM_MSG 消息契约/JoinFailureReason/chat 合并/presence 归一，+159 行单测）；`types.ts` Room*/Chat*/ConnectionState 段 |
| 缝合件 | `features/roomSession.ts`（126 行：IRoomSession 的渲染层共享投影——RoomFeature 会话视图与 ReaderFeature 聊天页同一份）；位置上报判据 = 指纹一致（与 library 的 identity 共用） |

## 2. 实现细节

**进房实现主体**：`RoomFeature.joinAndResolveBook`——创建房间（带书标定 + 建房即传副本，失败不挡
进房）/ 大厅行点击（无书进入 → join-ack 的 edition 补书）/ 手动房号（有选书 = 带书，无 = 无书）。

**补书链四步**：① 本地指纹匹配（`hash+size+algorithm`）→ 有直接打开；② 服务器 `downloadBookCopy`
→ `picker.saveBookCopy`（落 `userData/downloads`，重名加序号）→ `books.importBook` 入当前库 →
打开，下载中 `joining` 禁用按钮 + 日志逐行进度；③ 两端皆无 → 留在房间，日志说明等房主补传；
④ 下载/入库失败降级为无书成员，不回滚加入。

**位置同步与补书解耦**：打开的书与房间 edition 指纹一致即自动上报（CONTRACTS v0.4.7 的 B-2 判据）
——先进房后补书，补完打开，位置自然出现在其他成员房间。

**跟随模式三道闸门**（实现 = ReaderFeature 的 `location-updated` 订阅）：① 开关打开（ref 读取，
监听只挂一次）；② 当前书 = 房间 edition（指纹比对，与上报同口径——读别的书不会被拽走）；
③ 目标位置 ≠ 当前位置（同位不跳——防回执回声循环）。开关 = 聊天格「跟隨」，生命周期 = 本次房间
会话，不持久化。

**连接状态机**：`ConnectionState = connected/disconnected/reconnecting/failed`；断线自动回落
（net 适配器重连 2s×5 语义在端口内）；重连耗尽 = `failed` → 自动复位回大厅（可预期出口）；
join 代次守卫（并发 join 落败方 `superseded`，UI 静默）。

**聊天实现**：消息经 `roomSession.ts` 共享投影（`chat-history`/`chat-message` 按 id 合并去重），
发送走 `IRoomSession.sendChat`（server 落库后广播回执含发送者）；历史留服务器随房间级联清理。

## 3. 验证路径

`dev/roomProbe.ts`（对真 server 的链路断言：token/建房/join/聊天/历史，跑完即退）·
`dev/roomPeer.ts`（双开联调驻留型，独立 member token）· `scripts/swarm/`（A1 全员到齐 / A2 位置
广播不含发送者 / A3 聊天回执含发送者 / A4 离房不残留 / A5 无意外错误）· 单测 `RoomSession.test.ts`
（454 行）/ `protocol.test.ts`。
