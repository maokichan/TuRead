/**
 * 封面缩略图生成（适配器层工具，依赖 DOM canvas）。
 *
 * 为什么自己生成而不是存原图：实测一本 EPUB 的封面 157KB，转 data URL ≈ 210KB；
 * 书库若把原图塞进 JSON 会被写放大拖垮（见 BookRecord.coverPath 注释）。缩略图目标宽 400px
 * （网格卡片 ~200px，2x 屏够用），JPEG q0.82，实测落到 20~40KB。
 * 不引第三方图像库。
 */
const DEFAULT_TARGET_WIDTH = 400
const JPEG_QUALITY = 0.82

export interface ThumbnailResult {
  bytes: ArrayBuffer
  ext: 'jpg'
}

/** 只缩小不放大：小封面保持原尺寸，避免插值糊图 */
export async function makeThumbnail(
  dataUrl: string,
  targetWidth = DEFAULT_TARGET_WIDTH
): Promise<ThumbnailResult> {
  const img = await loadImage(dataUrl)
  const scale = Math.min(1, targetWidth / (img.naturalWidth || targetWidth))
  const width = Math.max(1, Math.round((img.naturalWidth || targetWidth) * scale))
  const height = Math.max(1, Math.round((img.naturalHeight || targetWidth) * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d 上下文不可用')
  ctx.drawImage(img, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
  )
  if (!blob) throw new Error('缩略图编码失败')
  return { bytes: await blob.arrayBuffer(), ext: 'jpg' }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('封面解码失败'))
    img.src = src
  })
}
