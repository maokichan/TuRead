/**
 * 正文注入 CSS 的拼装（kookit 唯一注入口 `setStyle`，一次注入全书生效；自
 * kookitRenderAdapter 拆出）。换章只重写 `body`、我们的 `<style>` 留在 `head`。
 * 三部分：
 * ① **纸内边距**（`--page-pad-x`）：正文与纸边之间的距离。
 *    注入到 `body` 而不是宿主容器 —— 见 styles.css `--page-pad-x` 的注释（kookit 排版宽度算术）。
 * ② **排版参数**（`applyTypography`）：字号/行距/段距；**缺省项不注入**（尊重书自带排版）。
 *    字号/行距同时打到 `html,body` 与常见块级元素 —— 书若用相对单位（em/%）会随之缩放，
 *    而写成 px 的那些元素只有显式覆盖才动得了（"保守但有效"）。
 * ③ **深色正文颜色**（仅深色模式）：颜色取自宿主语义 token `--page-bg/--page-text`。
 * ④ **选区配色**：`::selection` 也只能在这份注入 CSS 里定（宿主 CSS 跨不过文档边界）；颜色取宿主 token
 *    `--selection-bg`（四套取向各一组，低饱和、跟主题）→ **在任何主题下都不再是系统蓝**。
 */
import { isDarkResolvedTheme, type ResolvedTheme } from '@core/domain/theme'
import type { ReaderTypography } from '@core/domain/types'

/** 读取宿主 CSS 变量（页面配色单一来源 = styles.css token） */
export function readCssVar(name: string, fallback = ''): string {
  return (getComputedStyle(document.documentElement).getPropertyValue(name) || fallback).trim()
}

export function buildReaderCss(theme: ResolvedTheme | null, typography: ReaderTypography | null): string {
  const cs = getComputedStyle(document.documentElement)
  const readVar = (name: string): string => (cs.getPropertyValue(name) || '').trim()
  const padX = readVar('--page-pad-x') || '44px'
  const parts = [`body{padding-inline:${padX}!important;}`]

  // ④ 选区：**始终注入**（与颜色不同——它不是"书自有外观"的一部分，而是我们接手的选择反馈）。
  // 只给背景不给前景色：做成一层低饱和"淡扫"，而不是反色块 —— 阅读时更温和，且不必担心
  // 在深色纸上把正文色配错。token 缺失时留空（退回浏览器默认），并在控制台留痕。
  const selectionBg = readVar('--selection-bg')
  if (selectionBg) {
    parts.push(`::selection{background:${selectionBg}!important;}`)
  } else {
    console.warn('[render] 缺少 --selection-bg token（styles.css 未定义？）——选区将回落浏览器默认色')
  }

  const t = typography
  const blocks = 'body,p,div,li,dd,blockquote,td'
  if (t?.fontSize) parts.push(`html,body{font-size:${t.fontSize}px!important;}`)
  if (t?.lineHeight) parts.push(`html,body,${blocks}{line-height:${t.lineHeight}!important;}`)
  if (t?.paragraphSpacing !== undefined) {
    parts.push(`p{margin-top:0!important;margin-bottom:${t.paragraphSpacing}px!important;}`)
  }

  const dark = theme ? isDarkResolvedTheme(theme) : false
  if (dark) {
    const bg = readVar('--page-bg') || '#141619'
    const text = readVar('--page-text') || '#d8dbe0'
    parts.push(
      `body,html{background-color:${bg}!important;color:${text}!important;-webkit-text-fill-color:${text}!important;}` +
        `a{text-decoration:underline!important;}` +
        `code,pre{background-color:transparent!important;}` +
        `img{opacity:0.85;}` +
        `table{border-color:currentColor!important;}`
    )
  }
  return parts.join('')
}
