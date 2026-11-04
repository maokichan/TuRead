# 客户端契约（Client Contracts）

> 范围：仅 client 的层与接口契约的**应然口径**。同步协议由 server 定义（`server/docs/API.md`）；类型 1:1 落到 `src/core/{domain,ports,usecases}/`。
> 写法纪律（洗稿判据）：**代码可自证的（类型形状、接口签名、配置值、行为细节）不再文档论证**——直接指认代码路径（路径提及即 docIndex 跟踪边，代码一改就触发漂移提醒把文档拉回来）；文档只留代码不能说的：语义、应然、用户裁决、why、入口指路。版本沿革归 git（提交消息与 tag），本文件群不留版本注记。
> 术语：六边形架构（端口-适配器）为骨架，DDD 命名为层内词汇（对照表见 `ARCHITECTURE.md` §1）。

## 子页索引（接口形状的入口指路）

| 子页 | 承载（语义/应然） | 形状权威 |
|---|---|---|
| [contracts/domain-types.md](contracts/domain-types.md) | 领域类型语义与裁决：书的身份四层拆分与不变量、笔记判据（body 非 kind）、设置全局纪律、wire 镜像注意点 | `src/core/domain/types.ts` |
| [contracts/ports.md](contracts/ports.md) | 能力服务端口：端口↔适配器↔职责一览、行为契约（不级联/不静默/信任边界/节流责任/协议词汇收拢） | `src/core/ports/` |
| [contracts/services-container.md](contracts/services-container.md) | 用例层编排语义：房间会话、两层导入、封面队列、映射库对账 + ServiceContainer 装配纪律 | `src/core/usecases/`、`src/core/container.ts` |
| [contracts/plugin-contract.md](contracts/plugin-contract.md) | 插件契约：manifest / activate / 宿主义务 / IPC / 信任模型 | `src/shared/plugin.ts` 等 |

旁系权威：数据表结构与 schema = `DATA_MODEL.md`；渲染引擎逆向事实 = `KOOKIT.md`；功能交互语义 = `FEATURES.md`；视觉 = `STYLE.md`；插件能力边界与生命周期 = `PLUGINS.md`；client 分层细化 = `ARCHITECTURE.md`。

## 1. 分层模型（应然）

```
UI（React 外壳）—— 只依赖 ServiceContainer（业务流走用例；简单查询可直接调能力服务）
应用服务 / 用例（use cases）   IRoomSession（房间会话） · IBookService（书架+导入）—— 编排 ↓
能力服务（ports）              IRenderService · INetService · IBookIdentityService · ILibraryStore 等 —— 实现 ↓
适配器（adapters）             kookit 渲染适配器 · IPC 桥适配器（net/storage/picker/clipboard） · FingerprintService · OffscreenMetadataExtractor · CanvasThumbnailer
领域层（domain，被所有层共享） BookLocation · EditionRecord · Holding · BookFingerprint · Note · RoomMember · 业务规则
```

**依赖规则**
- 领域层：纯类型与规则，零依赖。
- 能力服务：依赖领域类型 + 各自外部能力（kookit、网络、存储…）；彼此不依赖。
- 用例：依赖能力服务**接口**（不依赖实现）；一个用例可编排多个能力服务（如 RoomSession = net + render + identity）。
- UI：只依赖 ServiceContainer 与领域类型。
- kookit 不直接暴露——包进 `IRenderService`，其产物翻译成领域类型（BookLocation）。

## 2. 定位系统（BookLocation 语义权威）

> 全项目统一称「定位系统」：让「阅读位置」可解释、可比较的机制（笔记跟随/同步落点/进度恢复/跨端回跳）。
> **纪律（应然）**：任何组件不得自行比较/解释 `BookLocation` 字段，一律走原语——「哪个字段是主键、哪个是兜底」只允许一处定义。
> 唯一实现 = `src/core/domain/location.ts`（纯函数 + 单测）；字段形状 = types.ts 的 BookLocation。

**字段三级角色**（语义，不新增字段）：

| 角色 | 字段 | 规则 |
|---|---|---|
| key（主键） | PDF：`page`；文字类：`chapterDocIndex + count` | 精确回跳第一依据（PDF 每页一个 section、不依赖 OCR，跨端天然稳定——KOOKIT §8.1/§8.2） |
| hint（兜底） | `text`（可见块前 200 字）、`chapterHref`、`chapterTitle` | 主键因版本/结构差异失效时的重定位线索 |
| display（展示） | `percentage`、`chapterTitle` | 仅 UI 展示与粗粒度同步，**不得**作精确锚定 |

**原语**：normalizeLocation（归一：容错 string 数值/缺字段/越界；进域层的位置——适配器产出、持久化读回、网络载荷——先过这里）/ locationKey（主键规范化键，格式相关）/ sameLocation / compareLocation（同书排序；不可比返回 null）/ anchorStrength（strong/weak/none，笔记与恢复选路用）/ isZeroLocation / describeLocation——全在 `src/core/domain/location.ts`，签名与判定细节以实现与单测为准。

**零位置语义**：「未渲染」≠「首章首块」——首章首块（chapterDocIndex=0、count=0、chapterHref 已就绪）是**有效位置**，判据必须含 chapterHref，否则回跳到书的开头会被误拒。

**已知时序约束**（消费方必须遵守，实测见 KOOKIT §9）：kookit 文字类渲染不监听宿主容器 scroll，`next()` 的 smooth 滚动刚开始就 `record()`——**滚动/翻页停稳后须补一次 record() 再取位置**，否则拿到旧位置（PDF 例外，自带 scroll 监听）。

## 3. 选区级锚点（笔记「标在哪」的语义）

> **「读到哪」（进度级 BookLocation）≠「标在哪」（选区级 TextAnchor）**——两者都叫位置但不是同一个物：进度语义 = 恢复/同步/进度条；选区语义 = 划线回显/笔记跟随/溯源跳回。

- **两层结构**（关键裁决：**统一信封 + 引擎原生载荷**，不做「通用定位语言」让引擎来回翻译——翻译有损会破坏选区 round-trip）：
  - **Norm（归一化层）**：跨格式可比的语义字段（chapterIndex / progression / quote）——笔记层/存储/同步**只看这层**；
  - **Fragment（引擎载荷层）**：engine 标识 + 不透明编码串——**只有适配器能生成/解释**；落库逐字节原样存、不套壳（防转义事故）。
- **quote（原文快照）是定位证据，不是笔记内容**：归锚点侧、不归 Note 侧；权威在 `anchor.norm.quote.exact`，notes 表 excerpt 列只是投影。
- **比较次序：先 Fragment 后 Norm**（先精确后模糊，避免文本比较的歧义成本污染精确路径），产出 exact / strong / weak / unrelated 强弱标注。
- **纯函数权威** = `src/core/domain/anchor.ts`（归一/比较/相似度阈值，含单测）；**引擎侧原语**（fromSelection / resolveToView / remeasure）在渲染适配器，行为契约见 [contracts/ports.md](contracts/ports.md)。remeasure 的诚实降级：kookit 搜索只到「章 + 块文本」→ 产出必是弱锚点（fragment=null）。
- 建模与批复 = `DATA_MODEL.md` §3.1/§3.1.1。

## 4. 待定 / 明确排除

- [ ] 笔记 / 划线同步：**明确排除在 v1 假设之外**（Note 类型先立，同步后续加）
- [ ] 光标在场（他人选中/阅读进度热区）：**明确排除在 v1 假设之外**
- [ ] 账号体系（游客昵称 vs 注册）→ 影响 `RoomMember.id` 语义（根 `TODO.md`）
- [ ] `IRenderService.search()` 返回形状（端口已留位）
- [ ] OCR（ISBN 提取）是否进 v1、`IOcrService` 接口草案（根 `TODO.md`）
- [x] ~~同步协议消息集与传输细节~~ ——已定（server 定义：`server/docs/API.md`；客户端适配已就位）

## 5. 冲突裁决与维护

- 冲突裁决：**CONTRACTS（本文件 + contracts/ 子页）> FEATURES / STYLE > 其余**——接口形状与交互语义打架时先对契约；改契约必须连动实现与测试，改语义必须连动 FEATURES 对应节。
- 接口形状以代码为权威：领域类型 = `src/core/domain/types.ts`；端口 = `src/core/ports/`；用例 = `src/core/usecases/`；装配 = `src/core/container.ts`；IPC 通道白名单 = `src/shared/ipc.ts`。本文件群与代码不一致 = 文档不实，**当场修正**。
- 修订史：逐版变更随 git（提交消息与 tag）——过程不进文档。
