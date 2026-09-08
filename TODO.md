# TuRead 待办（TODO）

> 全项目唯一待办清单：server / client / 跨端。完成一项即删除或移入 `docs/STATUS.md` 版本历史；
> 新增待办先登记这里。带 (P1/P2/P3) 的是债务优先级。

## client

- [ ] **(P2) 书籍标题仍来自文件名**：`FingerprintService.extractMetadata` 只去扩展名，故书名带
  "(作者)" 之类后缀（如 `高级运动营养学（第2版） (丹·贝纳多特)`，而 EPUB 的 `dc:title` 是干净的）。
  **封面已由 `CoverQueue` 解决**（`IRenderService.getMetadata()` 已在用）；剩下的是：要不要用解析出的
  title 覆盖显示标题（一行代码），还是留给「标准化」确认 —— 作者/出版社按决策**不采集**，ISBN 归标准化
- [ ] **(P3) `Note.notes` 类型与 kookit 不匹配**：domain 是 `string`（笔记正文），kookit
  `createOneNote` 期望数组 —— 适配器当前 `notes: note.notes || []` 会**静默丢弃**用户笔记内容
  （笔记功能落地前必须定形状，见 `CONTRACTS.md` §2 Note）
- [ ] **(P3) 适配器方法静默 no-op**：`next/prev/goTo*/search` 用 `this.rendition?.` 可选链，
  未 open 时静默返回（`renderTo` 却是抛错）—— 调用方无法区分"成功"与"什么都没发生"
- [ ] **(P2) join 握手无超时**：`pendingJoin` 只被 room.join-ack resolve，断线/丢包时挂死；
  加 10s 超时走 `server-error`（`usecases/RoomSession.ts:101`）
- [ ] **(P3) 协议形状收拢**：信封 type 字符串与 payload 形状散落在 RoomSession 的
  switch-case 与 REST body 里 → 抽 `core/domain/protocol.ts`（常量 + 归一化），
  防止"各处自行解释"的腐化（与定位系统同类问题）
- [ ] **(P3) JoinResult 类型重复**：domain 与 RoomSession 各一份、reason 枚举不一致 → 收敛 domain
- [ ] **(P3) emitLocation 绕过节流**：手动路径直接 send，与 onRenderLocation 的 300ms 节流不一致 → 统一走 throttleSend
- [ ] **更多设置项**：文字大小/行距/字体（RenderOptions.fontSize/lineHeight/fontFamily 需先扩 kookit config 映射 + 重开书生效提示）
- [ ] **详情抽屉操作清单**：当前只有「打开 + 删除」（书库重做待定项，FEATURES §10）
- [ ] **PDF 夜间模式（像素处理）**：PDF 页面是位图，改文字颜色无效 → 对页面 canvas 做
  `getImageData` → 反相/降亮度 → `putImageData`（或容器 `filter: invert` + 色相补偿）；
  扫描版同理。方案已记录在 `client/docs/KOOKIT.md` §7，正式实现单独立项
- [ ] **多书架（考虑中）**：当前只有单一书库；将来可支持多个书架（分组/不同来源/不同设备同步）。
  ⚠ 会影响 `ILibraryStore` 与 `BookRecord`（需 bookId → shelfId 归属）、导入目标、视图状态与
  房间标定选书流程 —— 动手前先定模型，见 `client/docs/FEATURES.md` §10 待定项
- [ ] **文字封面的艺术化（后话）**：无封面时"文字封面"本身就是标题，列表行右侧还会再显示一遍标题
  → 同一串字出现两次。除"是否隐藏右侧标题"外，更想做的是让封面文字具备**艺术效果**
  （字号/字距/行距构成感、可能的竖排或字面造型），让它像一张封面而不是放大的标题。
  与 `FittedTitle` 同一处演进（`client/docs/FEATURES.md` §10 待定 7）
- [ ] **location-updated 同位 UI（跟随模式）**：RoomFeature 消费 ReaderFeature 的跳转回调（FEATURES §9）
- [ ] **vitest 引入**：客户端零测试设施；`domain/location.ts` 这类语义模块需要单元断言兜底（组件化前做）
- [ ] **笔记/划线实现**（契约已立：`Note` + `IRenderService` 三原语 + 定位系统，链路见
  `client/docs/RENDER_INTERFACE.md` §5）：① `ILibraryStore` 笔记存取（JSON 起步）② UI 选段 →
  createNote / renderHighlighters ③ 同步（`room.note` 信封）——v1 后置
- [ ] **PDF 可见窗口交互抽查**：无头自检已含翻页断言（2026-09-07 全绿），缺真人窗口下的翻页/进度抽查
- [ ] **client 管理界面**：admin 操作（删房间/删副本）在客户端完成——协议已支持（REST + admin token）
- [ ] **(P3) harness 侧 PDF canvas 渲染待定位**：`renderPdfPage → handleRenderPDFChapter →
  section.load()/render()` 链路断点；自检断言需按 PDF 语义特判（查 canvas 数 + 页位置）——
  App 侧已不受影响，优先级低
- [ ] **OCR（ISBN 提取）是否进 v1**：`IOcrService` 草案；技术路线 PP-OCRv5 纯本地
  （OCR-buddy 路线，见借物表候选）

## server

- [ ] **房主权限（转让）**：`owner_token` 转让给房内另一成员（协议待设计：`POST /rooms/{id}/transfer`）；
  删房已 v0.2.0 完成
- [ ] **部署形态**（VPS/Docker）——不影响代码，仅配置；之后补 `cmd/smoke` 通电检查
- [ ] **服务器地址运维细节**（公网 IP / 端口映射 / HTTPS）——与服务器负责人讨论
- [ ] **用户系统（剩余）**：昵称/bio 编辑、`limited` 角色语义、token 加盐哈希 —— **搁置**（2026-08-29 决定）

## 跨端

- [ ] **书籍来源**：仅本地导入 vs 服务器共享书库
- [ ] **账号体系**：游客昵称 vs 注册——影响 `RoomMember.id` 语义；服务端签发 token 已铺路
- [ ] **语音通话（远期挂起，2026-08-31 定案）**：SFU 中继（服务器只转发音频），编解码在客户端，
  不加密；同步走 WS:8080，媒体另起 UDP/RTP；client v1 落地后再评估
