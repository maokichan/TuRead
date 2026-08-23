# client — Electron 客户端

- 渲染引擎：kookit（`../kookit`，构建产物见集成方式决策）
- UI 技术栈：**待定**（React / Vue / 原生，需求讨论后确定）
- 职责：
  - 书架与本地电子书导入
  - 阅读器渲染（kookit：epub / pdf / mobi / azw3 / txt / fb2 / docx / md / html / 漫画）
  - 房间连接与同步（WebSocket → `server`），接收/广播阅读位置（bookLocation）
