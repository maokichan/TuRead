/**
 * kookit vendor 懒加载（供两处使用：KookitRenderAdapter【主窗口】与离屏解析页【parse.html】）。
 *
 * PDF 注入口（KOOKIT.md §8.1）：kookit 在模块顶层 `const pdfjsLib = window.pdfjsLib` 捕获全局，
 * 因此 vendor 必须【动态加载】且先 `ensurePdfjs()`（import('pdfjs-dist') 求值时自动挂
 * globalThis.pdfjsLib）再 `import('@vendor/kookit.esm')` —— 不能静态 import vendor。
 */
import type {
  KookitConfig,
  KookitNamespace,
  KookitRenderClass
} from '@vendor/kookit.esm'
import { ensurePdfjs } from './pdfjsSetup'

export type KookitModule = typeof import('@vendor/kookit.esm')

/**
 * kookit config 的唯一构造处（2026-09-12 架构审查去重）——此前主窗口适配器（toKookitConfig）
 * 与离屏解析页各写一份内联字面量，字段漂移只能靠人眼。调用方给**已解析的值**
 * （主题/纸色等宿主关注点在各自入口解析），这里只负责字段全集与缺省。
 */
export function buildKookitConfig(
  format: string,
  o: {
    readerMode?: 'single' | 'double' | 'scroll'
    animation?: 'sliding' | 'mimical' | 'none'
    charset?: string
    convertChinese?: boolean
    parserRegex?: string
    isDarkMode?: boolean
    isMobile?: boolean
    password?: string
    isConvertPDF?: boolean
    backgroundColor?: string
    isScannedPDF?: boolean
    ocrEngine?: string
  } = {}
): KookitConfig {
  return {
    format: format.toUpperCase(),
    readerMode: o.readerMode || 'scroll',
    charset: o.charset ?? '',
    animation: o.animation || 'none',
    convertChinese: o.convertChinese ? 'yes' : 'no',
    parserRegex: o.parserRegex || '',
    isDarkMode: o.isDarkMode ? 'yes' : 'no',
    isMobile: o.isMobile ? 'yes' : 'no',
    password: o.password || '',
    isConvertPDF: o.isConvertPDF ? 'yes' : 'no',
    backgroundColor: o.backgroundColor || 'rgba(255,255,255,1)',
    isScannedPDF: o.isScannedPDF ? 'yes' : 'no',
    ocrEngine: o.ocrEngine || ''
  }
}

/** vendor 懒加载（每个 JS context 只加载一次）；先注入 pdfjs 再 import vendor（顺序不可反） */
let kookitPromise: Promise<KookitModule> | null = null
export function loadKookit(): Promise<KookitModule> {
  if (!kookitPromise) {
    kookitPromise = (async () => {
      await ensurePdfjs()
      return await import('@vendor/kookit.esm')
    })()
  }
  return kookitPromise
}

/** kookit 约定的渲染类命名空间（黑盒透传，见 KOOKIT.md §3） */
export function buildNamespace(Kookit: KookitModule): KookitNamespace {
  const cls = (c: unknown) => c as KookitRenderClass
  return {
    CacheRender: cls(Kookit.CacheRender),
    EpubRender: cls(Kookit.EpubRender),
    MobiRender: cls(Kookit.MobiRender),
    PdfRender: cls(Kookit.PdfRender),
    PdfTextRender: cls(Kookit.PdfTextRender),
    TxtRender: cls(Kookit.TxtRender),
    ComicRender: cls(Kookit.ComicRender),
    Fb2Render: cls(Kookit.Fb2Render),
    DocxRender: cls(Kookit.DocxRender),
    MdRender: cls(Kookit.MdRender),
    HtmlRender: cls(Kookit.HtmlRender)
  }
}
