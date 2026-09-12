import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@core': resolve('src/core'),
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        // 双入口：index = 应用；parse = 离屏解析页（隐藏窗口 = 独立进程跑 kookit
        // getMetadata，把全书解析挪出主窗口渲染进程，2026-09-12）
        input: {
          index: resolve('src/renderer/index.html'),
          parse: resolve('src/renderer/parse.html')
        }
      }
    },
    resolve: {
      alias: {
        '@core': resolve('src/core'),
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer/src'),
        '@vendor': resolve('src/vendor')
      }
    }
  }
})
