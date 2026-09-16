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
  // ————— 内容身份（edition；v0.4.0「书的身份」：全局唯一键 = 指纹）—————
  // 原 store:add-book / update-book / get-book / list-books / remove-book 已由下列取代
  storeUpsertEdition: 'store:upsert-edition',
  storeGetEdition: 'store:get-edition',
  storeFindEditionByFingerprint: 'store:find-edition-by-fingerprint',
  storeUpdateEdition: 'store:update-edition',
  storeRemoveEdition: 'store:remove-edition',
  // ————— 收录（holding）："哪个书库里有这本书" —————
  storeAddHolding: 'store:add-holding',
  storeRemoveHolding: 'store:remove-holding',
  storeGetHolding: 'store:get-holding',
  storeListHoldings: 'store:list-holdings',
  storeSetHoldingMissing: 'store:set-holding-missing',
  storeListItemsAtLevel: 'store:list-items-at-level',
  storeListAllHeldEditions: 'store:list-all-held-editions',
  storeMoveHolding: 'store:move-holding',
  storeGetSetting: 'store:get-setting',
  storeSetSetting: 'store:set-setting',
  storePatchSetting: 'store:patch-setting',
  storeSetCover: 'store:set-cover',
  storeGetCover: 'store:get-cover',
  storeRemoveCover: 'store:remove-cover',
  // ————— 阅读状态 / 阅读时间（③ 的落点）—————
  storeGetReadingState: 'store:get-reading-state',
  storePutReadingState: 'store:put-reading-state',
  storeAppendReadingSession: 'store:append-reading-session',
  storeTotalReadMsByWork: 'store:total-read-ms-by-work',
  storeGetLastReadEdition: 'store:get-last-read-edition',
  // 书库（组织模式，v0.4.0：库是库内实体；main 在切换/新建成功后广播 library-changed）
  storeListLibraries: 'store:list-libraries',
  storeCreateLibrary: 'store:create-library',
  storeSwitchLibrary: 'store:switch-library',
  storeRenameLibrary: 'store:rename-library',
  storeRemoveLibrary: 'store:remove-library',
  storeGetLibrary: 'store:get-library',
  storeLibraryChanged: 'store:library-changed',
  // 書箱/层级浏览（2026-09-13 用户定：书架 = 资源管理器式，書箱 = 文件夹；v0.4.0 起树在库内）
  storeListContainers: 'store:list-containers',
  storeCreateContainer: 'store:create-container',
  storeRenameContainer: 'store:rename-container',
  storeRemoveContainer: 'store:remove-container',
  storeMoveContainer: 'store:move-container',
  // 笔记/划线（2026-09-14）：笔记是**书外数据**，存笔记表（DATA_MODEL §2 notes），不写进电子书文件
  storeListNotes: 'store:list-notes',
  storeAddNote: 'store:add-note',
  storeUpdateNote: 'store:update-note',
  storeRemoveNote: 'store:remove-note',
  // 笔记**读模型**（v0.4.2，2026-09-16）：跨书管理用（列表 + 同口径计数）
  storeListAllNotes: 'store:list-all-notes',
  storeCountAllNotes: 'store:count-all-notes',
  // 在系统文件管理器中显示文件（库管理弹窗：「所在文件夾」）
  fsShowInFolder: 'fs:show-in-folder',
  // 列目录子目录（虚拟映射模式的层级浏览）
  fsListDirectories: 'fs:list-directories',
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
  /** 拖拽导入（2026-09-13）：Electron ≥29 移除 File.path，取真实路径须经 preload 的 webUtils */
  getPathForFile(file: File): string
  /** dev-only：TUREAD_DEV_BOOK 环境变量指定的书（启动即打开，用于无头验证渲染链路） */
  devBook?: string
  /** dev-only：TUREAD_DEV_PROBE 环境变量指定的探针名（如 pdf-width，无头复现专项现象） */
  devProbe?: string
}
