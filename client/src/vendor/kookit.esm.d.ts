/**
 * kookit 单文件 ESM（黑盒引用）的声明。
 * 产物由 kookit/rollup.turead.config.mjs 生成（依赖全内联）；类型按本项目实际用到的方法声明。
 */

export interface KookitConfig {
  format: string
  readerMode: string
  charset: string
  animation: string
  convertChinese: string
  parserRegex: string
  isDarkMode: string
  isMobile: string
  password: string
  isConvertPDF: string
  backgroundColor: string
  isScannedPDF: string
  ocrEngine: string
}

export interface KookitPosition {
  chapterDocIndex: number | string
  chapterHref: string
  count: number | string
  page: number | string
  percentage: number | string
  text: string
  chapterTitle?: string
}

export interface KookitRendition {
  renderTo(element: HTMLElement, bookLocation?: unknown): Promise<void>
  on(event: string, callback: (...args: any[]) => void): void
  getPosition(): KookitPosition
  getProgress(): { totalPage?: number; currentPage?: number; percentage?: number }
  getChapter(): Array<{ label: string; href: string; index?: number; subitems?: any[] }>
  getMetadata(): Promise<{ name?: string; author?: string; description?: string; publisher?: string; cover?: string }>
  next(): Promise<void>
  prev(): Promise<void>
  goToPage(page: number): Promise<void>
  goToPercentage(percentage: number): Promise<void>
  goToPosition(bookLocationStr: string): Promise<void>
  goToChapterIndex(index: number): Promise<void>
  goToChapterDocIndex(index: number): Promise<void>
  record(): Promise<void>
  removeContent(): void
  setStyle(css: string): void
  renderHighlighters(notes: unknown[], handleNoteClick: (...args: any[]) => void): Promise<void>
  createOneNote(item: unknown, handleNoteClick: (...args: any[]) => void): Promise<void>
  removeOneNote(key: string, chapterDocIndex: number): Promise<void>
  doSearch(keyword: string): Promise<unknown>
  getDocument(): Document | null
  getIframe(): HTMLIFrameElement | null
}

export interface KookitNamespace {
  CacheRender: new (buffer: ArrayBuffer, config: any) => KookitRendition
  EpubRender: new (buffer: ArrayBuffer, config: any) => KookitRendition
  MobiRender: new (buffer: ArrayBuffer, config: any) => KookitRendition
  PdfRender: new (buffer: ArrayBuffer, config: any) => KookitRendition
  PdfTextRender: new (buffer: ArrayBuffer, config: any) => KookitRendition
  TxtRender: new (buffer: ArrayBuffer, config: any) => KookitRendition
  ComicRender: new (buffer: ArrayBuffer, config: any) => KookitRendition
  Fb2Render: new (buffer: ArrayBuffer, config: any) => KookitRendition
  DocxRender: new (buffer: ArrayBuffer, config: any) => KookitRendition
  MdRender: new (buffer: ArrayBuffer, config: any) => KookitRendition
  HtmlRender: new (buffer: ArrayBuffer, config: any) => KookitRendition
}

/** 渲染类的统一形态（KookitNamespace 的 value 类型，供适配器 buildNamespace 使用） */
export type KookitRenderClass = new (buffer: ArrayBuffer, config: any) => KookitRendition

export const BookHelper: {
  getRendition(result: ArrayBuffer, config: KookitConfig, Kookit: KookitNamespace): KookitRendition
}

export const StyleHelper: any

export declare class CacheRender {}
export declare class EpubRender {}
export declare class MobiRender {}
export declare class PdfRender {}
export declare class PdfTextRender {}
export declare class TxtRender {}
export declare class ComicRender {}
export declare class Fb2Render {}
export declare class DocxRender {}
export declare class MdRender {}
export declare class HtmlRender {}
