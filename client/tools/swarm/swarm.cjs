/**
 * 蜂群编排器（单机 服务-客户端 测试机制，dev-only）。
 *
 * 一条命令做完：编译机器人 → 编译并起**一次性 server**（临时数据目录）→ REST 建房 →
 * 撒 N 只 roombot（翻页手/聊天手/退房者/围观者，真人节奏不洪泛）→ 按语义事件断言 → 收尾。
 * 退出码 = 结论（0 全绿 / 1 有失败），可直接进回归脚本。
 *
 * 断言口径（全部挂在语义事件上，不比拼毫秒 —— 洪泛测试的时序教训）：
 *   A1 全员到齐      每只 bot 都进房，且都见过 n=<N> 的成员快照
 *   A2 除发送者外    翻页手的位置广播到其余每只 bot ≥3 次；翻页手**从不**收到自己的位置
 *                    （= TODO「presence 除发送者在三人以上未验」的机制化验证）
 *   A3 聊天回执      聊天手的消息其余每只都收到；聊天手自己也收到（server 权威回执语义）
 *   A4 离房不残留    退房者离开后，其余 bot 的成员快照变 n=N-1 且名单不再含它
 *   A5 无意外错误    任何 bot 打出 SYS[error] / STATE fatal 即失败
 *
 * 用法：npm run swarm [-- --bots 6 --duration 9000]
 * 覆盖边界（立项时与用户对齐）：同步逻辑/协议/传输适配器；渲染、UI、IPC 桥不进蜂群
 * （真窗口探针与手感另层负责）。
 */
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')

// ---------- 参数 ----------
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] != null ? String(process.argv[i + 1]) : fallback
}
const BOTS = parseInt(arg('bots', '4'), 10)
const PORT = arg('port', '18234')
const DURATION = parseInt(arg('duration', '9000'), 10)
const HERE = __dirname
const CLIENT = path.join(HERE, '..', '..')
const SERVER_ROOT = path.join(CLIENT, '..', 'server')
const EXE = path.join(os.tmpdir(), `turead-swarm-${Date.now()}`)
const SERVER_EXE = `${EXE}-server.exe`
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'turead-swarm-'))
const BASE = Date.now()

const out = (s) => process.stdout.write(`[swarm] ${s}\n`)

// ---------- 进程台账 ----------
const procs = []
function register(child) {
  procs.push(child)
  return child
}
function teardown(code) {
  for (const p of procs) {
    try {
      p.kill()
    } catch {
      /* 已退出的进程 kill 报错可忽略 */
    }
  }
  setTimeout(() => {
    fs.rmSync(TMP, { recursive: true, force: true })
    try {
      fs.rmSync(SERVER_EXE, { force: true })
    } catch {
      /* 同上 */
    }
    process.exit(code)
  }, 300)
}

// ---------- 输出采集 ----------
const T = 60 * 1000
function pump(child, tag, sink) {
  for (const stream of [child.stdout, child.stderr]) {
    let buf = ''
    stream.on('data', (chunk) => {
      buf += chunk.toString()
      let idx
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (line) sink({ tag, t: Date.now() - BASE, line })
      }
    })
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

function healthzOnce() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/healthz`, { timeout: 1500 }, (res) => {
      res.resume()
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}
async function waitServer(deadlineMs) {
  const deadline = Date.now() + deadlineMs
  while (Date.now() < deadline) {
    if (await healthzOnce()) return true
    await wait(300)
  }
  return false
}

function rest(method, reqPath, token, body) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : JSON.stringify(body)
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        method,
        path: reqPath,
        headers: {
          'X-Turead-Access': '',
          Authorization: `Bearer ${token}`,
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {})
        },
        timeout: 8000
      },
      (res) => {
        let buf = ''
        res.on('data', (c) => (buf += c))
        res.on('end', () => resolve({ status: res.statusCode, body: buf }))
      }
    )
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

const tokenFor = (i) => `Swarm${String(i).padStart(2, '0')}`.slice(0, 7)

// ---------- 断言 ----------
function evaluate(lines, roomId, bots) {
  const byBot = Object.fromEntries(lines.map((b) => [b.tag, b.lines]))
  const results = []
  const check = (name, ok, detail) => results.push({ name, ok, detail })

  // A1 全员到齐
  const a1 = bots.map((tag) => {
    const ls = byBot[tag] ?? []
    const joined = ls.some((l) => new RegExp(`STATE joined room=${roomId} members=`).test(l.line))
    const sawFull = ls.some((l) => new RegExp(`(STATE joined room=${roomId} members=${BOTS}\\b|EVT presence n=${BOTS} )`).test(l.line))
    return joined && sawFull
  })
  check(
    'A1 全员到齐（每只都进房且见过满员快照）',
    a1.every(Boolean),
    a1.map((ok, i) => `${bots[i]}=${ok ? '✓' : '✗'}`).join(' ')
  )

  // A2 除发送者外（翻页手 = bots[0]，其余收得到、自己收不到）
  const flipper = bots[0]
  const flipperEcho = (byBot[flipper] ?? []).filter((l) => /EVT location-updated /.test(l.line))
  const othersGot = bots.slice(1).map((tag) => ({
    tag,
    n: (byBot[tag] ?? []).filter((l) => /EVT location-updated from=bot1 /.test(l.line)).length
  }))
  check(
    'A2 除发送者外（位置广播到其余各 ≥3 次；翻页手零回声）',
    flipperEcho.length === 0 && othersGot.every((o) => o.n >= 3),
    `翻页手回声=${flipperEcho.length}；${othersGot.map((o) => `${o.tag}=${o.n}`).join(' ')}`
  )

  // A3 聊天回执（聊天手 = bots[1]）
  const chatter = bots[1]
  const gotChat = bots.map((tag) => ({
    tag,
    n: (byBot[tag] ?? []).filter((l) => new RegExp(`EVT chat from=${chatter} `).test(l.line)).length
  }))
  const receipt = (byBot[chatter] ?? []).some((l) => new RegExp(`EVT chat from=${chatter} mine=1`).test(l.line))
  check(
    'A3 聊天回执（其余每只都收到；聊天手收到自己的回执）',
    gotChat.every((g) => g.n >= 1) && receipt,
    `${gotChat.map((g) => `${g.tag}=${g.n}`).join(' ')} 回执=${receipt ? '✓' : '✗'}`
  )

  // A4 离房不残留（退房者 = bots[2]，仅当 BOTS ≥ 3 才安排）
  if (BOTS >= 3) {
    const quitter = bots[2]
    const left = (byBot[quitter] ?? []).find((l) => /STATE left/.test(l.line))
    if (!left) {
      check('A4 离房不残留', false, `${quitter} 没有 STATE left`)
    } else {
      const survivors = bots.filter((b) => b !== quitter)
      const ok = survivors.map((tag) => {
        const after = (byBot[tag] ?? []).filter((l) => l.t >= left.t)
        const shrunk = after.some(
          (l) => new RegExp(`EVT presence n=${BOTS - 1} `).test(l.line) && !/names=.*(^|,)quitter(,|$)/.test(l.line)
        )
        const namesClean = after
          .filter((l) => new RegExp(`EVT presence n=${BOTS - 1} `).test(l.line))
          .every((l) => !l.line.includes(quitter))
        return { tag, ok: shrunk && namesClean }
      })
      check('A4 离房不残留（快照减一且名单干净）', ok.every((o) => o.ok), ok.map((o) => `${o.tag}=${o.ok ? '✓' : '✗'}`).join(' '))
    }
  }

  // A5 无意外错误
  const errors = lines.flatMap((b) =>
    (b.lines ?? []).filter((l) => /^SYS\[error\]/.test(l.line) || /STATE fatal/.test(l.line)).map((l) => `${b.tag}: ${l.line}`)
  )
  check('A5 无意外错误', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : '干净')
  return results
}

// ---------- 主流程 ----------
async function main() {
  out(`蜂群配置：bots=${BOTS} port=${PORT} duration=${DURATION}ms`)

  // ① 编译机器人
  const build = spawnSync(process.execPath, [path.join(HERE, 'build.cjs')], { stdio: 'inherit' })
  if (build.status !== 0) throw new Error('roombot 构建失败')

  // ② 编译并起一次性 server（临时数据目录；GOCACHE/GOPROXY 有默认兜底，可用环境覆盖）
  const goEnv = {
    ...process.env,
    GOCACHE: process.env.GOCACHE || path.join(os.tmpdir(), 'turead-swarm-gocache'),
    GOPROXY: process.env.GOPROXY || 'https://goproxy.cn,direct'
  }
  const gb = spawnSync('go', ['build', '-o', SERVER_EXE, './cmd/server'], { cwd: SERVER_ROOT, env: goEnv, stdio: 'pipe' })
  if (gb.status !== 0) throw new Error(`server 编译失败：${gb.stderr?.toString().slice(0, 400)}`)
  const server = register(
    spawn(SERVER_EXE, [], {
      env: { ...process.env, TUREAD_ADDR: `127.0.0.1:${PORT}`, TUREAD_DATA_DIR: path.join(TMP, 'data') },
      stdio: ['ignore', 'ignore', 'pipe']
    })
  )
  if (!(await waitServer(20000))) throw new Error('server 20s 内未就绪（/healthz 不通）')
  out(`server 就绪（127.0.0.1:${PORT}，数据目录 ${TMP}/data）`)

  // ③ 领 token + 建房（合成书：server 只登记不算指纹 —— 蜂群不需要真文件）
  const tk = await rest('POST', '/auth/token', tokenFor(99))
  if (tk.status !== 200) throw new Error(`领 token 失败：${tk.status} ${tk.body.slice(0, 120)}`)
  const orchToken = JSON.parse(tk.body).token
  const hash = Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')
  const cr = await rest('POST', '/rooms', orchToken, {
    owner: 'orchestrator',
    book: { protocol: 'content-hash-v1', code: hash, title: '蜂群測試書', ext: 'epub', hash, size: 12345 }
  })
  if (cr.status !== 200) throw new Error(`建房失败：${cr.status} ${cr.body.slice(0, 120)}`)
  const roomId = JSON.parse(cr.body).roomId
  out(`已建房 ${roomId}（合成 edition，无副本 —— 蜂群只验同步）`)

  // ④ 撒机器人：bot1 翻页手 / bot2 聊天手 / bot3 退房者 / 其余围观
  const botLines = []
  const spawnBot = (tag, token, extra) => {
    const child = register(
      spawn(process.execPath, [path.join(HERE, 'roombot.cjs'),
        '--server', `http://127.0.0.1:${PORT}`,
        '--room', roomId,
        '--tag', tag,
        '--nick', tag,
        '--token', token,
        '--duration', String(DURATION),
        ...extra
      ], { stdio: ['ignore', 'pipe', 'pipe'] })
    )
    const entry = { tag, lines: [] }
    pump(child, tag, (e) => {
      const line = { t: e.t, line: e.line }
      entry.lines.push(line)
      if (!process.argv.includes('--quiet-out')) out(`${tag} ${e.line}`)
    })
    botLines.push(entry)
  }
  for (let i = 0; i < BOTS; i++) {
    const tag = `bot${i + 1}`
    const extra = []
    if (i === 0) extra.push('--flip-every', '900')
    if (i === 1) extra.push('--chat-every', '1600')
    if (i === 2) extra.push('--leave-after', String(Math.max(4000, Math.floor(DURATION / 2))))
    spawnBot(tag, tokenFor(i), extra)
    await wait(250) // 错峰进房，让 presence 增长路径被真实走过
  }

  // ⑤ 等收场 → 断言
  await wait(DURATION + 3000)
  const results = evaluate(botLines, roomId, Array.from({ length: BOTS }, (_, i) => `bot${i + 1}`))
  let failed = 0
  for (const r of results) {
    out(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ` —— ${r.detail}`}`)
    if (!r.ok) failed++
  }
  out(failed === 0 ? `蜂群全绿（${results.length} 条断言）` : `蜂群 ${failed}/${results.length} 条失败`)
  teardown(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  out(`蜂群中止：${err.message}`)
  teardown(1)
})
