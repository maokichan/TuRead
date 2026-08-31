/**
 * pdf.js 注入模块（渲染进程侧）。
 *
 * 为什么需要：kookit vendor 单文件的 PDF 渲染依赖外部全局 `window.pdfjsLib`
 * （pdf.js，见 client/docs/KOOKIT.md §7/§8.1），且 kookit 在【模块顶层】
 * `const pdfjsLib = window.pdfjsLib` 捕获 —— 因此 pdfjs 必须在 kookit vendor
 * 模块求值【之前】注入。
 *
 * 实现：本模块被 KookitRenderAdapter 以动态 import 方式加载（在 import vendor 之前），
 * 通过 `import('pdfjs-dist')` 触发 pdfjs ESM 求值 —— pdfjs-dist 的 build 在模块
 * 求值时自动执行 `globalThis.pdfjsLib = {}`（webpack 导出赋值），无需手动挂载。
 * 随后显式设置 `GlobalWorkerOptions.workerSrc` 指向我们 serving 的静态资源
 * （dev: vite publicDir → /lib/pdfjs/；build: out/renderer/lib/pdfjs/）。
 *
 * CSP 注意：worker 经 `new Worker(workerSrc, {type:'module'})` 创建（同源）；
 * 若同源判定失败（file:// origin 为 null）走 blob wrapper → 需 `worker-src 'self' blob:`。
 */
export async function ensurePdfjs(): Promise<void> {
  if (typeof window !== 'undefined' && (window as unknown as { pdfjsLib?: unknown }).pdfjsLib) {
    // 已注入（可能是其他路径先加载了 pdfjs-dist）
    configureWorkerSrc()
    return
  }
  // 触发 pdfjs ESM 求值 → globalThis.pdfjsLib 被自动赋值
  await import('pdfjs-dist')
  configureWorkerSrc()
}

function configureWorkerSrc(): void {
  try {
    const pdfjs = (window as unknown as { pdfjsLib?: { GlobalWorkerOptions?: { workerSrc?: string } } })
      .pdfjsLib
    if (pdfjs?.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
      // 与 kookit pdfjsPath 一致：Electron 下前缀 "." → ./lib/pdfjs/<file>
      pdfjs.GlobalWorkerOptions.workerSrc = './lib/pdfjs/pdf.worker.mjs'
    }
  } catch {
    // workerSrc 设置失败不致命：pdf.js 会回退 fake worker（主线程 import）
  }
}
