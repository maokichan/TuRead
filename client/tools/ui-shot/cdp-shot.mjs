/**
 * ui-shot/cdp-shot.mjs —— CDP 直接截图（主真相通道；PrintWindow 对后台节流窗口会给出
 * 陈旧/空洞帧，已弃用为兜底）。用法：`node tools/ui-shot/cdp-shot.mjs 9223 out.png [js]`
 * 第 3 参可选：截图前在页面里 eval 的表达式（例如用 CDP 派发点击后再截）。
 */
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'

const port = process.argv[2] ?? '9223'
const out = process.argv[3] ?? 'cdp-shot.png'
const preJs = process.argv[4]

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = list.find((t) => t.type === 'page' && !/devtools|style-gallery/.test(t.url))
if (!page) {
  console.error('no page target; targets =', list.map((t) => `${t.type}:${t.url}`).join(' | '))
  process.exit(1)
}

const require = createRequire(import.meta.url)
const WebSocket = require('ws')
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false })
let seq = 0
const pending = new Map()
ws.on('message', (raw) => {
  const m = JSON.parse(raw)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
})
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)))
    ws.send(JSON.stringify({ id, method, params }))
  })

ws.on('open', async () => {
  try {
    await call('Runtime.enable')
    if (preJs) {
      const r = await call('Runtime.evaluate', { expression: preJs, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) console.error('pre-js exception:', JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text))
    }
    await new Promise((r) => setTimeout(r, 400))
    const shot = await call('Page.captureScreenshot', { format: 'png' })
    writeFileSync(out, Buffer.from(shot.data, 'base64'))
    console.log(`saved ${out}`)
    ws.close()
    process.exit(0)
  } catch (e) {
    console.error('failed:', e.message)
    process.exit(1)
  }
})
