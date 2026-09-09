/**
 * 样式样张（style gallery）的 Vite 配置 —— **不参与产品构建**（产品走 `electron.vite.config.ts`）。
 *
 * 设计要点：
 * - `root` 保持 `client/`（而不是样张目录）：Tailwind v4 的自动内容探测以项目根为基准，
 *   这样 `src/renderer/src/**` 里真实组件的类名才会被生成；否则样张会整页无样式。
 * - 别名与产品渲染进程一致，样张因此能直接 import 真实组件（`@renderer/components/*`）。
 * - 只提供 dev server，不做 build（样张不是产物）。
 *
 * 用法（在 `client/` 下）：`npm run style`
 */
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: resolve('.'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@core': resolve('src/core'),
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src'),
      '@vendor': resolve('src/vendor')
    }
  },
  server: {
    port: 5199,
    open: '/tools/style-gallery/index.html'
  }
})
