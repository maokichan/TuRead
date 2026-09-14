/**
 * IRenderService —— 渲染（端口；适配器：kookit）。
 * 依据：client/docs/CONTRACTS.md §4.1。
 * 约束：kookit 依赖 DOM（iframe 渲染）→ 外壳必须提供 DOM 环境（Electron / 浏览器 / WebView）。
 */
import type { Listener, EventEmitter, Unsubscribe } from './events'
import type { ResolvedTheme } from '@core/domain/theme'
import type {
  BookFormat,
  BookLocation,
  BookMetadata,
  BookRecord,
  Chapter,
  Note,
  ReaderTypography,
  RenderOptions,
  TextAnchor
} from '@core/domain/types'

/**
 * 正文选区信息（v0.3.11）。
 * `rect` 是**宿主视口坐标**下的选区矩形 —— 由适配器从书 iframe 换算好再给出：
 * 选区矩形原本只在书文档的坐标系里有意义，UI 侧自己换算就得知道 iframe 的位置与内部滚动，
 * 那是适配器该操心的细节（UI 不该碰书文档）。色板据此摆放。
 */
export interface RenderSelection {
  anchor: TextAnchor
  rect: { x: number; y: number; width: number; height: number }
}

/**
 * 阅读区右键请求（v0.3.12）。
 * 为什么由适配器发：右键若落在**正文 iframe** 里，宿主收不到该事件（文档边界，同 iframeBridge 的根因）；
 * 而"右键点在哪条笔记上"只有书文档知道。故坐标换算与命中判定都在适配器做，UI 只管弹菜单。
 */
export interface RenderContextMenuRequest {
  /** 宿主视口坐标（菜单挂载线据此摆放） */
  x: number
  y: number
  /** 右键时的正文选区锚点；无选区（含单击已清空选区）→ null */
  anchor: TextAnchor | null
  /** 右键落在某条**已有笔记**的高亮上时给出其 id（否则 undefined）——供「編輯批註 / 移除」 */
  noteId?: string
}

export interface RenderServiceEvents {
  rendered: (chapterDocIndex: number) => void
  'location-changed': (location: BookLocation) => void
  /**
   * 正文选区变化（v0.3.9；v0.3.11 补 `rect`）—— 有选区给出锚点 + 宿主坐标矩形，
   * 清空/取不到给 null（UI 据此收起色板）。
   * 为什么由适配器发这条事件：选区落在**书的 iframe 内文档**里，事件跨不过文档边界
   * （同 `iframeBridge` 的理由），UI 无法自行观测 —— 观测必须发生在能碰到书文档的那一层。
   */
  'selection-changed': (selection: RenderSelection | null) => void
  /**
   * 阅读区右键（v0.3.12）—— 新建高亮/批注与编辑既有笔记的**主入口**（2026-09-14 用户定：
   * "新建无论是高亮还是批注，最好的方法还是右键"）。同一入口承载两种语义：
   * 有选区 → 新建；点在已有笔记上 → 编辑批注 / 移除。
   */
  'context-menu': (request: RenderContextMenuRequest) => void
  /**
   * 点击了某条已渲染的高亮（v0.3.12）—— 即 kookit 的 `handleNoteClick` 回调，
   * 我们从 `event.target.dataset.key` 取笔记 id（契约见 KOOKIT.md §5 #14）。
   * `x`/`y` = 该高亮元素在**宿主视口**里的下沿中点（由适配器量取），供批注面板就近弹在划线旁。
   * 缺省 = 量不到（元素已摘除等），调用方退到安全位。
   */
  'note-clicked': (payload: { noteId: string; x?: number; y?: number }) => void
}

export interface IRenderService extends EventEmitter<RenderServiceEvents> {
  open(record: BookRecord, options?: RenderOptions): Promise<void>
  close(): Promise<void>
  renderTo(element: HTMLElement): Promise<void>
  /**
   * 向已打开的正文（kookit iframe）注入/更新主题样式（v0.3.0）。
   * 非 PDF 电子书正文是 HTML：深色模式在这里注入深色 CSS（`rendition.setStyle`，kookit 唯一样式注入口，
   * 默认 CSS 未注入 → 内容完全可控）；浅色不注入、保留书的自有外观。PDF 是位图，本方法无操作（后置像素处理）。
   * 颜色取自宿主 CSS 语义 token（`--page-bg/--page-text`），深色判定走 `core/domain/theme.ts`。
   */
  applyTheme(theme: ResolvedTheme): Promise<void>
  /**
   * 向正文注入**排版参数**（v0.3.3）—— 与 `applyTheme` 共用同一条注入通道（`setStyle`），
   * 可任意次调用（每次重建整份 reader style，避免多次注入互相覆盖）。
   *
   * 覆盖的元素集合是「保守但有效」的：字号/行距走 `html,body` + 常见块级元素（书若用相对单位会随之缩放），
   * 段距走 `p` 的下边距。字段缺省 = 该项不注入（尊重书自带排版）。
   * PDF 无操作（位图，后置像素处理）。可调参数清单见 `STYLE.md` §5.9。
   */
  applyTypography(typography: ReaderTypography): Promise<void>
  /**
   * 解析元数据（v0.1.8）—— kookit 是唯一解析器，故能力挂在渲染端口上。
   * **无状态**：内部构造临时 rendition（不 renderTo、不碰当前阅读会话），cover 为 data URL。
   * 失败（不支持/损坏）→ 抛错，由调用方决定兜底（书名兜底在 UI）。
   */
  getMetadata(buffer: ArrayBuffer, format: BookFormat): Promise<BookMetadata>
  next(): Promise<void>
  prev(): Promise<void>
  goToPage(page: number): Promise<void>
  goToPercentage(percentage: number): Promise<void>
  /** 目录跳转：跳转到 chapterDocIndex 对应章节起点（PDF=页码；无目录/越界 no-op）。参数取 getChapter().chapterDocIndex */
  goToChapter(chapterDocIndex: number): Promise<void>
  goToPosition(location: BookLocation): Promise<void>
  getPosition(): BookLocation
  getProgress(): { totalPage: number; currentPage: number }
  getChapter(): Chapter[]
  search(keyword: string): Promise<unknown>
  /**
   * 取当前正文选区为统一锚点（`fromSelection` 原语，DATA_MODEL §3.1.1）。
   * 无选区 / 该格式本轮未支持（PDF 是另一套坐标载荷，第二批）→ null。
   * **只读**：不改引擎状态、不落库。
   */
  getSelectionAnchor(): Promise<TextAnchor | null>
  /**
   * 跳到锚点（`resolveToView` 原语；笔记面板点击跳转 / 房间同步回跳）。
   * Fragment 可解 → 精确；缺失/失效 → 退到章级（Norm）。返回是否成功导航。
   * `revealNoteId` 给值时，导航后把该书签/划线的 DOM 元素滚到视野内（面板点击的精确揭示）。
   */
  resolveAnchor(anchor: TextAnchor, opts?: { revealNoteId?: string }): Promise<boolean>
  /**
   * 按 quote 重锚（`remeasure` 原语）：书被换版/重新解析后 Fragment 失效时，用原文快照找回位置。
   * ⚠ **诚实降级**：kookit 的搜索只给到「章 + 块文本窗口」，**不给字符偏移**
   *   → 产出的一定是**弱锚点**（Norm 级、`fragment = null`），只能回跳到章。
   * 找不到 → null（由调用方决定保留旧锚点还是标记失效）。
   * 代价：搜索会遍历全书各章（用户显式触发的恢复动作，可接受）。
   */
  remeasureAnchor(anchor: TextAnchor): Promise<TextAnchor | null>
  /**
   * 清掉正文里的当前选区（v0.3.11）。
   * 为什么必须由适配器提供：选区在**书文档**里，宿主 `document.getSelection()` 清不掉它 ——
   * 划完一条线后若不清，浏览器自带的选区高亮会一直盖在我们画的高亮上。
   */
  clearSelection(): void
  /**
   * 创建/回显一条笔记（v0.3.9：Note v2）。
   * 要求 `note.anchor.fragment` 就位 —— 无引擎载荷则引擎无从回显，此时**抛错**而非静默 no-op
   * （静默 no-op 是本项目已销案的反模式）。跨引擎/无载荷的弱锚点笔记不应走到这里。
   */
  createNote(note: Note): Promise<void>
  /** 删除笔记（按 `Note.id`）。适配器内部维护 id→渲染节映射 —— kookit `removeOneNote(key, chapterDocIndex)`
   *  要在**该笔记自身所属**的节内查找，拿"当前节"顶替会跨章删错。 */
  removeNote(noteId: string): Promise<void>
  /**
   * 批量回显高亮（重开书/切章后调用）。
   * ⚠ **只对"当前已渲染的那一节"生效**：kookit 文字类只有一个 iframe（`GeneralRender.getIframe()`
   * = `#page-area` 下第一个 iframe），`renderHighlighters` 直接在该 document 上按**字符偏移**重锚 ——
   * 跨节笔记套进当前 document 会错位或抛错。故：
   * ① 适配器按当前渲染节过滤；② 调用方应在每次 `rendered` 事件后重新调用（换章 = 换 document）。
   * 适配器传给引擎的数组是**拷贝**（kookit 内部 `notes.reverse()` 是原地修改，会破坏调用方数据）。
   * 无 `fragment` 的笔记被跳过（合法降级态，不抛错）。
   */
  renderHighlighters(notes: Note[]): Promise<void>
}

export type { Listener, Unsubscribe }
