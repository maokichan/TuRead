/**
 * IMetadataExtractor —— 书籍元数据/封面提取的性能边界端口（2026-09-12）。
 *
 * 为什么独立于 IRenderService：kookit 的 getMetadata 是**全书解析**（EPUB 读 zip /
 * PDF 走 pdfjs），计算密集且必须在**非主窗口进程**跑 —— 主窗口渲染进程被它占住，
 * 书库上规模后 UI 会被饿死（328 本实测启动挂死）。离屏解析窗口（独立进程、DOM 齐全）
 * 是本端口的真实实现（OffscreenMetadataExtractor）；IRenderService.getMetadata 保留
 * （同进程、无依赖开销），但批量场景一律走本端口。
 */
import type { BookFormat, BookMetadata } from '@core/domain/types'

export interface IMetadataExtractor {
  /** 按文件路径提取元数据（含封面 data URL）。实现方负责读文件，调用方不碰字节。 */
  extractFromFile(path: string, format: BookFormat): Promise<BookMetadata>
}
