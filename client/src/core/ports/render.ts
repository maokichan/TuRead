/**
 * IRenderService —— 渲染（端口；适配器：kookit）。
 * 依据：client/docs/CONTRACTS.md §4.1。
 * 约束：kookit 依赖 DOM（iframe 渲染）→ 外壳必须提供 DOM 环境（Electron / 浏览器 / WebView）。
 */
import type { Listener, EventEmitter, Unsubscribe } from './events'
import type { BookLocation, BookRecord, Chapter, Note, RenderOptions } from '@core/domain/types'

export interface RenderServiceEvents {
  rendered: (chapterDocIndex: number) => void
  'location-changed': (location: BookLocation) => void
}

export interface IRenderService extends EventEmitter<RenderServiceEvents> {
  open(record: BookRecord, options?: RenderOptions): Promise<void>
  close(): Promise<void>
  renderTo(element: HTMLElement): Promise<void>
  next(): Promise<void>
  prev(): Promise<void>
  goToPage(page: number): Promise<void>
  goToPercentage(percentage: number): Promise<void>
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
