/**
 * kookit 单体测试 —— 零依赖静态服务器。
 * 根目录 = client/（这样 src/vendor/kookit.esm.js 与 test_docs/ 都能被访问）。
 * 用法：node serve.mjs   → 打开 http://127.0.0.1:4173/tools/kookit-harness/
 */
import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PORT = process.env.PORT ? Number(process.env.PORT) : 4173

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.epub': 'application/epub+zip',
  '.pdf': 'application/pdf',
  '.mobi': 'application/x-mobipocket-ebook',
  '.azw3': 'application/vnd.amazon.ebook',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
}

const server = http.createServer((req, res) => {
  let urlPath
  try {
    urlPath = decodeURIComponent(new URL(req.url ?? '/', `http://${req.headers.host}`).pathname)
  } catch {
    res.writeHead(400)
    res.end('bad request')
    return
  }
  if (urlPath === '/') urlPath = '/tools/kookit-harness/'
  let filePath = join(ROOT, normalize(urlPath).replace(/^[/\\]+/, ''))
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    const idx = join(filePath, 'index.html')
    if (existsSync(idx)) {
      filePath = idx
    } else {
      res.writeHead(404)
      res.end(`not found: ${urlPath}`)
      return
    }
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' })
  createReadStream(filePath).pipe(res)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[harness] http://127.0.0.1:${PORT}/tools/kookit-harness/`)
  console.log('[harness] 浏览器打开上面地址即可（本页无 CSP，隔离测试 kookit 单体）')
})
