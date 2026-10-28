/**
 * ui-shot/dom.mjs —— CDP DOM 真相查询（PrintWindow 抓到陈旧帧时的兜底手段）。
 * 用法：TUREAD_DEV_CDP=9223 起 dev 后，`node tools/ui-shot/dom.mjs 9223 '<js 表达式>'`
 * 表达式在主窗口页面里 eval，结果 JSON 打到 stdout（Electron stdout 抓不到 → 走 Node）。
 */
import { createRequire } from 'node:module'

const port = process.argv[2] ?? '9223'
const expr = process.argv[3] ?? 'document.title'

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = list.find((t) => t.type === 'page' && !/devtools|style-gallery/.test(t.url))
if (!page) {
  console.error('no page target; targets =', list.map((t) => `${t.type}:${t.url}`).join(' | '))
  process.exit(1)
}

const require = createRequire(import.meta.url)
const WebSocket = require('ws')
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false })

const send = (id, method, params) => ws.send(JSON.stringify({ id, method, params }))
const once = (id) =>
  new Promise((resolve, reject) => {
    const onMsg = (raw) => {
      const m = JSON.parse(raw)
      if (m.id === id) {
        ws.off('message', onMsg)
        if (m.error) reject(new Error(m.error.message))
        else resolve(m.result)
      }
    }
    ws.on('message', onMsg)
  })

ws.on('open', () => {
  send(1, 'Runtime.enable', {})
  send(2, 'Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true
  })
  once(2)
    .then((r) => {
      console.log(JSON.stringify(r.result?.value ?? r, null, 2))
      ws.close()
      process.exit(0)
    })
    .catch((e) => {
      console.error('eval failed:', e.message)
      process.exit(1)
    })
})
