# TuRead 抽象架构（草稿 v0.1）

> 状态：需求讨论期草稿。**同步协议尚未确定**，本阶段只定模块边界与接口（契约），实现后填。
> 原则：核心（core）与外壳（shell）分离；端口（接口）先立；传输 / UI / 存储可替换。
> 术语：本仓库中 "service" = 面向用例封装能力并提供接口的模块（koodo-reader 内部同款叫法：ConfigService / SyncHelper）。
> **开发范围：本次开发只做 client**。server 是 TuRead 计划中的**另一个独立项目**（后续单独启动），本文第 4 节仅作规划参考。

---

## 1. 分层总览

```
┌──────────────────────────── 外壳层 Shell（可替换） ────────────────────────────┐
│  Desktop Shell（Electron + React）          ← v1 目标                          │
│  Web Shell（浏览器）/ Android Shell（RN + WebView） ← 未来，复用 core           │
└───────────────────────────────────────────────────────────────────────────────┘
                                  │ 只依赖服务接口（ports）
┌──────────────────────────── 核心服务层 core（框架无关 TS） ────────────────────┐
│  RenderService · BookService · BookIdentityService · SyncService · LibraryStore │
│  接口定义在 core/ports，实现放在 core/adapters                                   │
└───────────────────────────────────────────────────────────────────────────────┘
                                  │ HTTP / WebSocket / 自定义（协议待定）
┌──────────────────────────── 服务端 server（Go） ──────────────────────────────┐
│  room（房间） · book（书籍标定注册表） · sync（事件分发） · store（DB） · api     │
└───────────────────────────────────────────────────────────────────────────────┘
```

## 2. 书籍标定（同一本书 = 同一电子版）

**目标**：房间内所有成员读的是同一本书的**同一电子版**。

- **指纹（主）**：文件哈希 + 文件大小。大文件用**部分哈希**策略（参考 koodo-reader 的 `getBookPartialMd5`），kookit 的 `Book` 模型自带 `md5` 字段但**计算是调用方职责**。
- **元数据（次）**：ISBN / 标题 / 作者。epub、fb2 等有结构化元数据；pdf、txt 不一定有 → 作为二级匹配，不做强约束。
- **服务端 book 注册表**：`{ bookId, hash, size, isbn?, title, author, cover, createdAt }`。
- **房间绑定 bookId**；加入房间时客户端上报指纹 → 服务端比对 → 一致放行 / 不一致拒绝或警告。
- **客户端本地书库**同样记录 hash（导入时计算，crypto-js / Web Crypto / Node crypto）。

## 3. 客户端服务接口（草案）

### RenderService（port: IRenderService）— 适配器：kookit
```
open(file, config) / close() / renderTo(el)
next() / prev() / goToPage(n) / goToPercentage(p) / goToPosition(loc)
getPosition(): BookLocation   // { chapterDocIndex, chapterHref, count, page, percentage }
getChapter() / getProgress()
on('location-changed') / on('rendered')
```
> 约束：kookit 依赖 DOM（iframe 渲染）→ 外壳必须提供 DOM 环境（Electron / 浏览器 / WebView）。

### BookService（port: IBookService）
```
importBook(file) / list() / remove(id) / getMetadata(id) / getCover(id)
```

### BookIdentityService（port: IBookIdentityService）
```
computeFingerprint(file): { hash, size }          // 部分哈希
extractMetadata(file): { isbn?, title, author, format }
verify(roomBook, localBook): match | mismatch
```

### SyncService（port: ISyncService）— 传输适配器待定（协议未定不影响接口）
```
joinRoom(roomId, bookFingerprint) / leaveRoom()
emitLocation(loc) / onLocation(cb)
onPresence(users) / onSystemMessage(cb)
emitNote(note) / onNote(cb)              // 后续迭代
```

### LibraryStore（port: ILibraryStore）
本地书库持久化（Electron：better-sqlite3，koodo-reader 同款）。

## 4. 服务端模块（Go，规划参考 —— 独立项目，本次不开发）

> server 不在本次开发范围，以下仅记录规划，避免后续重复设计。

| 模块 | 职责 |
|---|---|
| `room` | 房间状态机：成员、绑定书籍（bookId）、当前阅读位置；内存 + 持久化 |
| `book` | 书籍标定注册表：hash/isbn 查询、注册、比对 |
| `sync` | 同步事件分发（房间内广播）；传输层可换（WS / HTTP+SSE） |
| `store` | SQLite（modernc.org/sqlite，纯 Go 无 cgo）起步，规模上来再换 Postgres |
| `api` | REST（房间/书籍管理）+ 实时通道（同步） |

## 5. 平台与 UI（决策记录）

- **Electron = 桌面三平台**（Win/macOS/Linux），不支持移动端。
- **React(DOM) ≠ React Native**：移动端渲染层与交互逻辑不同，不是同一套代码（组件逻辑可部分共享）。
- **kookit 依赖 DOM** → 任何平台壳都必须提供 DOM/WebView；移动端方案 = RN + WebView + kookit-mobile 构建（koodo-reader 移动版同款做法）。
- **v1 只做 Desktop Shell**；core 接口为未来 Web/Android 壳预留，核心零改动。
- **多端构建**："构建时 ban 不用的" = 平台入口 + tree-shaking + 构建配置（打包期排除目标平台无关代码）。

## 6. 待定事项

- [ ] 同步协议细节（消息集 / 传输方式）
- [ ] 房间生命周期（空房间保留？房主权限？）
- [ ] 笔记 / 划线同步范围（v1 是否包含）
- [ ] 书籍来源（仅本地导入 vs 服务器共享书库）
- [ ] 账号体系（游客昵称 vs 注册）
