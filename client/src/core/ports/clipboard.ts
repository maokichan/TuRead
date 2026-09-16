/**
 * IClipboard —— 剪贴板写入（端口）。依据：`CONTRACTS.md` §4.6（v0.4.2）。
 *
 * 为什么立端口、而不让 UI 直接调 `navigator.clipboard`：
 * ① 纪律一致 —— UI 只依赖 `ServiceContainer`、不直接摸桥（`IBookPicker` 就是为**一个**用途立的先例）；
 * ② `navigator.clipboard` 依赖"安全上下文 + 权限"，在 Electron 的加载协议下**行为随版本变**，
 *    不宜作为契约前提；Electron 的 `clipboard.writeText` 是同步且可靠的。
 *
 * 桥的形状 = **具名方法**（`window.turead.writeClipboardText`），不是泛化 `invoke(channel,…)`
 * —— 与 `TODO.md`「IPC 桥信任边界过宽」那条的收敛方向一致（具名方法天然是白名单）。
 */
export interface IClipboard {
  /** 写纯文本到系统剪贴板（笔记管理的「複製批註」：**只複製批注正文**） */
  writeText(text: string): Promise<void>
}
