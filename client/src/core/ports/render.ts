/**
 * IRenderService —— 渲染（端口；适配器：kookit）。
 * 依据：client/docs/CONTRACTS.md §4.1。
 * 约束：kookit 依赖 DOM（iframe 渲染）→ 外壳必须提供 DOM 环境（Electron / 浏览器 / WebView）。
 */
import type { Listener, EventEmitter, Unsubscribe } from './events'
import type {
  BookFormat,
  BookLocation,
  BookMetadata,
  BookRecord,
  Chapter,
  Note,
  RenderOptions
} from '@core/domain/types'

export interface RenderServiceEvents {
  rendered: (chapterDocIndex: number) => void
  'location-changed': (location: BookLocation) => void
}

export interface IRenderService extends EventEmitter<RenderServiceEvents> {
  open(record: BookRecord, options?: RenderOptions): Promise<void>
  close(): Promise<void>
  renderTo(element: HTMLElement): Promise<void>
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
  createNote(note: Note): Promise<void>
  removeNote(key: string): Promise<void>
  renderHighlighters(notes: Note[]): Promise<void>
}

export type { Listener, Unsubscribe }
