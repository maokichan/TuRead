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
  storePatchSetting: 'store:patch-setting',
  storeSetCover: 'store:set-cover',
  storeGetCover: 'store:get-cover',
  storeRemoveCover: 'store:remove-cover',
  // 多书库（2026-09-13）：库列表/新建/切换/更名（管理弹窗，Obsidian 仓库管理页风格）；
  // main 在切换/新建成功后广播 library-changed（含发起方——渲染层统一以广播为
  // "当前库已变"的信号，重载各自状态；更名不改当前库，不广播，弹窗自行刷新列表）
  storeListLibraries: 'store:list-libraries',
  storeCreateLibrary: 'store:create-library',
  storeSwitchLibrary: 'store:switch-library',
  storeRenameLibrary: 'store:rename-library',
  storeLibraryChanged: 'store:library-changed',
  // 在系统文件管理器中显示文件（库管理弹窗：「所在文件夾」）
  fsShowInFolder: 'fs:show-in-folder',
  fsReadFile: 'fs:read-file',
  pickerPickFiles: 'picker:pick-files',
  pickerPickDirectory: 'picker:pick-directory',
  pickerListEbooks: 'picker:list-ebooks',
  // 离屏解析（封面/元数据提取专用，2026-09-12）：主窗口 → main（请求）→ 解析窗口（任务）→
  // main → 主窗口（结果）。jobId 配对；解析页就绪后发 ready，main 才派发（防早派丢任务）
  metadataParseRequest: 'metadata:parse-request',
  metadataParseJob: 'metadata:parse-job',
  metadataParseResult: 'metadata:parse-result',
  metadataParseReady: 'metadata:parse-ready',
  // 无边框窗口（2026-09-12）：自绘控制键 → main 调窗口 API；main 广播最大化状态
  winMinimize: 'win:minimize',
  winMaximizeToggle: 'win:maximize-toggle',
  winClose: 'win:close',
  winMaximizedChanged: 'win:maximized-changed',
  // 沉浸全屏（2026-09-13）：渲染层（阅读器/标题栏）请求切换 OS 全屏；main 广播状态回渲染层
  winSetFullScreen: 'win:set-fullscreen',
  winFullScreenChanged: 'win:fullscreen-changed'
} as const

/** 可导入的电子书扩展名（对话框过滤 + 目录扫描共用，唯一定义处） */
export const EBOOK_EXTENSIONS = [
  'epub', 'pdf', 'mobi', 'azw3', 'azw', 'txt', 'md', 'fb2',
  'docx', 'html', 'mhtml', 'xml', 'cbz', 'cbr', 'cbt', 'cb7'
] as const

/** preload 通过 contextBridge 暴露到 window.turead 的桥接口 */
export interface TureadBridge {
  invoke(channel: string, payload?: unknown): Promise<unknown>
  subscribe(channel: string, listener: (payload: unknown) => void): () => void
  /** dev-only：TUREAD_DEV_BOOK 环境变量指定的书（启动即打开，用于无头验证渲染链路） */
  devBook?: string
  /** dev-only：TUREAD_DEV_PROBE 环境变量指定的探针名（如 pdf-width，无头复现专项现象） */
  devProbe?: string
}
