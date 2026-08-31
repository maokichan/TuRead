/**
 * IPC 共享契约（main ↔ preload ↔ renderer）。
 * 渲染进程的 core 适配器通过 `window.turead`（preload 注入）调用主进程实现；
 * 主进程通过 webContents.send 推送事件。本文件只定义通道名与桥接口，不含任何实现。
 */
export const IPC = {
  netConnect: 'net:connect',
  netDisconnect: 'net:disconnect',
  netSend: 'net:send',
  netRequest: 'net:request',
  netGetMemberId: 'net:get-member-id',
  netMessage: 'net:message',
  netConnectionChanged: 'net:connection-changed',
  storeAddBook: 'store:add-book',
  storeUpdateBook: 'store:update-book',
  storeGetBook: 'store:get-book',
  storeListBooks: 'store:list-books',
  storeRemoveBook: 'store:remove-book',
  storeGetSetting: 'store:get-setting',
  storeSetSetting: 'store:set-setting',
  fsReadFile: 'fs:read-file',
  dialogPickBook: 'dialog:pick-book'
} as const

/** 主进程文件选择结果 */
export interface PickedBookFile {
  path: string
  name: string
  size: number
}

/** preload 通过 contextBridge 暴露到 window.turead 的桥接口 */
export interface TureadBridge {
  invoke(channel: string, payload?: unknown): Promise<unknown>
  subscribe(channel: string, listener: (payload: unknown) => void): () => void
  /** dev-only：TUREAD_DEV_BOOK 环境变量指定的书（启动即打开，用于无头验证渲染链路） */
  devBook?: string
}
