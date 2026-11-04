# 契约 · 应用服务（用例层）与服务装配

> 形状权威 = `src/core/usecases/*.ts`；装配 = `src/core/container.ts`（ServiceContainer 形状 1:1）。本页 = 编排语义与装配纪律（why、应然、边界）。
> 事件机制与 TypedEmitter 见 [ports.md](ports.md)；协议词汇 = `src/core/domain/protocol.ts`。

## IRoomSession —— 房间会话（同步业务逻辑本体）

编排 = `INetService` + `IRenderService` + `IBookIdentityService`。**状态转发而非操作转发**：只同步 BookLocation 与聊天，翻页/滚动操作不转发；IRoomSession 不自己翻页（翻页是 UI 的事，跟随模式开关也在 UI）。

- **joinRoom 编排**：按房间建连（`net.openRoom`，握手带 room+nick——服务器要求）→ 上报指纹（`book: null` = **无书成员**，服务器本就支持 `fingerprint: null`：允许加入并返回 edition 供下载；位置比较的格式键从 join-ack 的 edition 扩展名推）→ 等 join-ack（超时归 `server-error`，不挂死；**并发 join 单槽 + 代次**：旧的那次在每个 await 恢复点自检、立即作废为 `superseded`——不是服务器的失败，UI 应静默处理）→ 成功后预载聊天历史（chat-history）。`lastLocation` 由调用方给（阅读状态在 ReadingState）。
- **位置上报**：翻页由内部监听 render.location-changed 自动广播；手动 `emitLocation` 与自动路径**同一节流出口、同一归属校验**。上报前校验「打开的书 ≡ 房间的书」（指纹口径 = `identity.verify`；渲染未打开书时不上报）。节流窗口等常量见 `src/core/usecases/RoomSession.ts`（广播节流是 **client 职责**）。
- **远端位置派生**：server 不单独下发 room.location，而是广播 `room.presence` **全量成员快照**（含每人位置）→ 以 join-ack members 为基线、逐次 presence diff，位置变化才 emit location-updated；位置先过 `normalizeLocation`、比较走 `sameLocation`（定位系统纪律，不自行解释字段）。
- **订阅生命周期**：net 订阅属构造期、随实例存活；joinRoom 期只挂 render.location-changed，leaveRoom 只解绑 join 期订阅 → 离开后可重新 join。leaveRoom 同时断开房间连接——**聊天的生命周期归属于房间**（离开即断开，历史留在服务器、随房间级联清理）。
- **断线重连**：适配器按房间自动重连（握手地址不变），但服务器侧成员/订阅是瞬态的 → 用例层在 `connected` 且已入房时**重发 room.join**，随后按最后一条 id 增量补拉聊天（不重发的后果 = 「在房间里却不是成员」的幽灵）。`failed` = 重连耗尽：会话**自动复位**（自动 leaveRoom + system-message 告知）——消费方不必也不应再对半死态的会话做操作。
- **聊天合并**：广播（WS，**含发送者** = server 权威回执）与历史（REST 追加日志，加入 = 最近一页全量；重连 = `after=<最后一条 id>` 增量）来源不同，同一 id 会两头来 → 消费者一律走 `protocol.mergeChatMessages`（按 id 去重、升序）。
- **补书链路**：`downloadBookCopy`（服务器 `localCopy=1` 时可用；404 = 副本未上传）→ 调用方落盘（`picker.saveBookCopy`）→ 导入（`books.importBook`）→ 打开。
- `createRoom` 协议固定 `content-hash-v1`（edition 内容指纹，server 只登记不重算）；`uploadBookCopy` 幂等去重（分发源）。
- 形状（RoomSessionEvents / RoomState / JoinResult / SystemMessage）= `src/core/usecases/RoomSession.ts` 与 `src/core/domain/types.ts`；失败 reason 词汇与归一判据 = `src/core/domain/protocol.ts`。

## IBookService —— 书架 + 导入

- **导入 = 两层写入**：① 按指纹 upsert edition（全局去重：同指纹复用既有行并更新 filePath）；② 往目标书库加 holding（落在库根层；入箱由 UI 后续 moveHolding）。「是否复用」由用例给出（`ImportResult.reused`），UI 不用快照反推。
- ⚠ **映射库（`mode='mapped'`）不得调 importBook**——映射库的书只能靠扫描真实文件夹进来（DATA_MODEL D5/F4）；这条由调用方（UI）按库模式把关，用例层不替它判断。
- `remove` 只删收录：真实文件、笔记与阅读状态都不动（不变量③）。
- `getLastRead`：优先最近阅读，无阅读记录回退最近入库（排序口径收敛在存储层的一条查询里）。
- 编排对象 = `IBookIdentityService`（指纹+元数据）与 `ILibraryStore`（持久化）；OCR 提 ISBN 是**可插拔步骤**（候选 `IOcrService`，v1 未定，见根 `TODO.md`）。

## IImportQueue —— 批量导入编排

- **为什么是用例**：串行、进度、取消、失败逐条上报属于**编排**，不是 UI 展示——此前写在 LibraryFeature 里，与同构的 CoverQueue 位置不一致（UI 应是 driving adapter）。编排链：`IBookPicker.readFile` → `IBookService.importBook`；`extToFormat` 随之从 UI 层移到 `src/core/domain/format.ts`（领域词汇映射，用例可依赖）。
- 语义：同一路径只入队一次；运行中可继续入队；**同一批次只进一个库**（enqueue 时给定）；cancel 只取消剩余（正在处理的那本跑完）；失败逐条带「哪本、为什么」（与扫描对账的 failures 同口径）。

## ICoverQueue —— 封面提取

- **为什么异步 + 队列**：封面提取要读整个文件 + 解析（大 PDF 可达秒级），导入时同步做会把「选完文件」变成「卡住不动」。串行（一次一本，避免 N 个大文件同时进内存）+ 可取消 + 单本失败不影响其余（事件上报）。
- 失败落 `coverFailed` **负缓存**（不随启动重试，否则书库一大「存量补封面」每次启动重解析一遍）；队列元素 = **edition id**（封面由内容决定，是 edition 级数据，与库无关）；已有 coverPath / 已负缓存的跳过。

## IScanService —— 映射库对账

- **对账语义**（不是「重新导入一遍」）：磁盘有、库无 → 读文件 `importBook(origin='scan')`（指纹去重仍生效）；库有、磁盘无 → **标 missing（只标不删**——收录/笔记/阅读状态都留着，文件回来自动重现）；又回来了 → 清 missing；路径变指纹同 → upsert 更新 filePath、收录路径随之更新。
- ⚠ **不做 fs.watch**（用户裁决：监听开销不会更低，且与「阅读器不管理源文件」张力最大）。扫描是**显式动作**：状态栏「掃描」/ 建库后自动一次 / 进库惰性对账（后续接）。
- 只有映射库可扫（自建库的书靠导入）；逐条失败带原因（failures，日志/诊断用，不进库）。

## ServiceContainer —— 装配纪律

- 形状 = `src/core/container.ts`（能力服务六件 + 应用服务五件）。**构造函数注入**依赖：`RoomSession(net, render, identity)`、`BookService(identity, store)`、`CoverQueue(metadata, thumbnailer, store)`、`ImportQueue(readFile, books)`、`ScanService`（复用 picker 的列目录 + 读文件能力）。
- **UI 只依赖 ServiceContainer**：不直接 import kookit / better-sqlite3 / WebSocket 实现。适配器目录约定：`src/core/adapters/{render,net,storage,identity,picker,clipboard,image}`。
- `IMetadataExtractor` / `IImageThumbnailer` 参与装配（CoverQueue 的依赖）但**不暴露在容器上**——没有 UI 消费方；后续有（如插件要解析）再议。
