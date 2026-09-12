/**
 * IImageThumbnailer —— 封面缩略图生成端口（2026-09-12 架构审查补立）。
 *
 * 为什么立：CoverQueue（应用层）此前直接 import `@core/adapters/image/thumbnail` ——
 * 依赖方向倒置（usecases → adapters）。应用层编排"提取→缩略→落盘"，但"怎么缩"
 * （canvas/尺寸策略）是适配器能力，须藏在端口后。
 */
export interface ThumbnailResult {
  bytes: ArrayBuffer
  ext: string
}

export interface IImageThumbnailer {
  /** 输入封面 data URL，输出缩略图字节与扩展名（落盘用） */
  make(coverDataUrl: string): Promise<ThumbnailResult>
}
