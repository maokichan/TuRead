# server — Go 同步服务器

- 职责：
  - 房间管理（创建/加入/退出）
  - 成员在线状态与用户列表
  - 阅读位置（bookLocation）广播与持久化
  - 后续：笔记/划线同步、书籍共享
- 技术栈：Go（模块下载需先设 `GOPROXY=https://goproxy.cn,direct`，见 `D:\PROJECT\NETWORK.md`）
