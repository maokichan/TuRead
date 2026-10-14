// 問 —— AI 共读插件 v0.1.0（契约 = client/docs/CONTRACTS.md §9 + v1.1；功能 = TODO「插件系统与 AI 共读」组）。
//
// v0.1.0 范围（用户定）：只做「能对话 + 上下文注入」——没有工具循环（harness 随搜索器进）。
// - 上下文两段式：新建对话灌书目（标题/格式/章数/目录对照）；每次请求附当前位置标注（拉取式快照）；
// - 溯源：约定模型把引文单独成行包『』，渲染成可点 → ctx.reader.jumpToQuote（弱锚点，章级尽力）；
// - 联网走 api.net.fetch（https 代理）；key 走 api.secrets（safeStorage，落库是密文）；
// - 非流式获取 + **打字机呈现**（用户定：拿全响应后逐字蹦），「正在思考」状态行兜住首字等待；
// - 会话跨书籍（storage 持久化单线程 + 新對話按钮）；界面复用宿主的 .chat-row / .chat-composer 语汇。
//
// 纪律：零自创视觉语汇——颜色字号全部走宿主 styles.css（含本插件的 .plugin-ai-* 公共层），代码里不写样式。

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4o-mini'
const MAX_HISTORY = 400 // 条；超出丢最旧的（含截断说明，防止 storage 无限膨胀）
const MAX_TOC_LINES = 300

export function activate(api) {
  let conversation = []
  let usageTokens = 0
  let configured = false
  let pending = false

  api.registerPanel({
    id: 'chat',
    label: '問',
    title: 'AI 共讀',
    hideWhenInRoom: true, // 进房间时让位给房间聊天（用户定的互斥）
    mount(el, ctx) {
      let view = null // 当前渲染根（setup / chat 两态）

      const loadState = async () => {
        const [endpoint, model, convo, usage] = await Promise.all([
          api.storage.get('endpoint', DEFAULT_ENDPOINT),
          api.storage.get('model', DEFAULT_MODEL),
          api.storage.get('conversation', []),
          api.storage.get('usageTokens', 0)
        ])
        usageTokens = Number(usage) || 0
        conversation = Array.isArray(convo) ? convo.slice(-MAX_HISTORY) : []
        try {
          await api.secrets.get('api-key')
          configured = true
        } catch {
          configured = false // 未设置密钥 → 首屏即配置表单
        }
        return { endpoint, model }
      }

      // ————— DOM 小工具（不引依赖；样式全在宿主 styles.css）—————
      const h = (tag, className, text) => {
        const node = document.createElement(tag)
        if (className) node.className = className
        if (text !== undefined) node.textContent = text
        return node
      }

      const render = async () => {
        const state = await loadState()
        el.textContent = ''
        view = state.configured || configured ? renderChat(el, ctx, state) : renderSetup(el, state)
      }

      // ————— 配置表单（未配置 key 时首屏即此；「設置」按钮也从这里进）—————
      const renderSetup = (root, state) => {
        const form = h('div', 'plugin-ai__form')
        form.appendChild(h('div', 'plugin-ai__hint', '接入 OpenAI 兼容接口（密钥经系统级加密保存，不会明文落盘）。'))

        const mkInput = (labelText, value, type, placeholder) => {
          const row = h('label', 'plugin-ai__field')
          row.appendChild(h('span', 'plugin-ai__label', labelText))
          const input = document.createElement('input')
          input.className = 'plugin-ai__input'
          input.type = type
          input.value = value
          if (placeholder) input.placeholder = placeholder
          row.appendChild(input)
          form.appendChild(row)
          return input
        }
        const endpointInput = mkInput('接口地址', state.endpoint, 'text', DEFAULT_ENDPOINT)
        const modelInput = mkInput('模型', state.model, 'text', DEFAULT_MODEL)
        const keyInput = mkInput('API 密鑰', '', 'password', state.configured || configured ? '（已保存，留空 = 不改）' : '')

        const err = h('div', 'plugin-ai__err')
        const save = h('button', 'text-action text-action--primary', '保存並開始')
        save.addEventListener('click', async () => {
          err.textContent = ''
          const endpoint = endpointInput.value.trim()
          const model = modelInput.value.trim()
          const key = keyInput.value
          if (!/^https:\/\//.test(endpoint)) {
            err.textContent = '接口地址必須是 https://'
            return
          }
          if (!model) {
            err.textContent = '請填模型名'
            return
          }
          try {
            if (key) await api.secrets.set('api-key', key)
            else await api.secrets.get('api-key') // 留空 = 沿用已存的
            await api.storage.set('endpoint', endpoint)
            await api.storage.set('model', model)
            configured = true
            await render()
          } catch (e) {
            err.textContent = e.message
          }
        })
        form.appendChild(save)
        form.appendChild(err)

        // 已配置过 → 顶部给一个「返回對話」
        if (conversation.length > 0 || configured) {
          const back = h('button', 'text-action', '返回對話')
          back.addEventListener('click', () => {
            configured = true
            void render()
          })
          form.appendChild(back)
        }
        root.appendChild(form)
        return { kind: 'setup' }
      }

      // ————— 對話視圖 —————
      const renderChat = (root, ctxRef, state) => {
        const wrap = h('div', 'plugin-ai')

        const log = h('div', 'plugin-ai__log')
        const meta = h('div', 'plugin-ai__meta')
        const textarea = document.createElement('textarea')
        textarea.className = 'chat-composer__input'
        textarea.rows = 1
        const composer = h('div', 'chat-composer')
        const send = h('button', 'text-action text-action--primary', '送出')

        // — 行渲染：role → 抬头（你 / 問）；引文行（『…』）渲染成可点 → 跳回原文 —
        const appendRow = (role, text, at) => {
          const row = h('div', 'chat-row')
          const head = h('div', 'chat-row__head')
          head.appendChild(h('span', 'chat-row__nick', role === 'user' ? '你' : '問'))
          head.appendChild(h('span', 'chat-row__time', formatTime(at)))
          row.appendChild(head)
          const body = h('div', 'chat-row__text')
          appendBody(body, text)
          row.appendChild(body)
          log.appendChild(row)
          log.scrollTop = log.scrollHeight
          return body
        }

        // 正文：按行渲染；『…』包裹的行 = 溯源引用（可点）。纯文本（v0.1.0 不渲染 Markdown）
        const appendBody = (body, text, clickable) => {
          body.textContent = ''
          for (const line of String(text).split('\n')) {
            const m = clickable && /^『.+』$/.test(line.trim())
            if (m) {
              const quote = h('span', 'ai-quote', line)
              quote.setAttribute('data-quote', line.trim().slice(1, -1))
              quote.addEventListener('click', () => {
                const snap = ctxRef.reader && ctxRef.reader.snapshot()
                ctxRef.reader
                  ? ctxRef.reader.jumpToQuote(quote.getAttribute('data-quote'), snap && snap.location.chapterDocIndex)
                  : api.log('當前沒有打開的書，無法跳回原文')
              })
              body.appendChild(quote)
            } else {
              body.appendChild(h('div', null, line))
            }
          }
        }

        // 打字机呈现（用户定的玩笑转正）：响应已拿全，前端逐字蹦。pending 中断 = 立即补完
        const typeOut = (body, full) =>
          new Promise((resolveType) => {
            let i = 0
            const timer = window.setInterval(() => {
              i = Math.min(full.length, i + 4)
              appendBody(body, full.slice(0, i), false)
              log.scrollTop = log.scrollHeight
              if (i >= full.length) {
                window.clearInterval(timer)
                appendBody(body, full, true) // 完整渲染一次（引文此时才可点）
                resolveType()
              }
            }, 12)
            ctx.signal.addEventListener('abort', () => {
              window.clearInterval(timer)
              appendBody(body, full, true)
              resolveType()
            }, { once: true })
          })

        const metaText = () => {
          meta.textContent = pending
            ? '正在思考…'
            : `會話 ${conversation.length} 條 · 累計 ${usageTokens} tokens`
        }

        // — 发送：上下文两段式注入 + OpenAI 兼容 chat/completions（非流式） —
        const doSend = async () => {
          const text = textarea.value.trim()
          if (!text || pending) return
          textarea.value = ''
          const at = Date.now()
          conversation.push({ role: 'user', content: text, at })
          appendRow('user', text, at)
          pending = true
          metaText()
          try {
            const snap = ctxRef.reader ? ctxRef.reader.snapshot() : null
            const answer = await complete(text, snap)
            const row = appendRow('assistant', '', at)
            await typeOut(row, answer)
            conversation.push({ role: 'assistant', content: answer, at: Date.now() })
            conversation = conversation.slice(-MAX_HISTORY)
            await api.storage.set('conversation', conversation)
          } catch (e) {
            const row = appendRow('assistant', `（出錯：${e.message}）`, Date.now())
            row.parentElement.classList.add('ai-row--err')
            api.log(`請求失敗：${e.message}`)
          } finally {
            pending = false
            metaText()
          }
        }

        const complete = async (userText, snap) => {
          const endpoint = (await api.storage.get('endpoint', DEFAULT_ENDPOINT)).replace(/\/+$/, '')
          const model = await api.storage.get('model', DEFAULT_MODEL)
          const key = await api.secrets.get('api-key')
          const messages = [
            { role: 'system', content: systemPrompt(snap) },
            ...conversation.map((m) => ({ role: m.role, content: m.content })),
            { role: 'system', content: locationLine(snap) }
          ]
          const res = await api.net.fetch(`${endpoint}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({ model, messages })
          })
          if (!res.ok) {
            let detail = res.body.slice(0, 200)
            try {
              detail = JSON.parse(res.body).error?.message ?? detail
            } catch { /* 保持原文 */ }
            throw new Error(`接口 ${res.status}：${detail}`)
          }
          const data = JSON.parse(res.body)
          const answer = data.choices?.[0]?.message?.content
          if (!answer) throw new Error('接口没有返回回答')
          if (data.usage?.total_tokens) {
            usageTokens += data.usage.total_tokens
            await api.storage.set('usageTokens', usageTokens)
          }
          return answer
        }

        // 顶部两枚文字动作：新對話 / 設置
        const actions = h('div', 'plugin-ai__actions')
        const newChat = h('button', 'text-action', '新對話')
        newChat.addEventListener('click', async () => {
          if (conversation.length > 0 && !window.confirm('開新對話會清空當前會話記錄，確定？')) return
          conversation = []
          await api.storage.set('conversation', conversation)
          log.textContent = ''
          metaText()
        })
        const settings = h('button', 'text-action', '設置')
        settings.addEventListener('click', () => {
          el.textContent = ''
          renderSetup(el, state)
        })
        actions.appendChild(newChat)
        actions.appendChild(settings)

        const composerSubmit = () => void doSend()
        send.addEventListener('click', composerSubmit)
        textarea.addEventListener('keydown', (e) => {
          if (e.isComposing) return // IME 组合中的 Enter = 确认候选词（审计 B-5 同款守卫）
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            composerSubmit()
          }
        })
        composer.appendChild(textarea)
        composer.appendChild(send)

        wrap.appendChild(actions)
        wrap.appendChild(log)
        wrap.appendChild(meta)
        wrap.appendChild(composer)
        root.appendChild(wrap)

        // 回放历史会话（跨书籍持久）
        if (conversation.length === 0) {
          log.appendChild(h('div', 'toc-list__empty', snapLine(ctxRef)))
        } else {
          for (const m of conversation) appendRow(m.role, m.content, m.at)
        }
        metaText()
        return { kind: 'chat' }
      }

      // ————— 上下文注入（两段式）—————
      const systemPrompt = (snap) => {
        const lines = [
          '你是用户的共读助手：陪用户读一本书、讨论内容、解释概念、提供别的观点。',
          '回答规则：用纯文本（不要用 Markdown 标记，如 **、#、`），用空行分段；',
          '引用书中原文时，单独成行并用『』包裹整段引文——用户点击它会跳回原文位置。'
        ]
        if (snap) {
          lines.push(`当前书：《${snap.title}》（${snap.format}，共 ${snap.chapterCount} 章）。`)
          if (snap.toc.length > 0) {
            const rows = snap.toc
              .slice(0, MAX_TOC_LINES)
              .map((r) => `${r.chapterDocIndex}=${r.label}`)
              .join('；')
            lines.push(`目录（真实位置 chapterDocIndex=章标题）：${rows}${snap.toc.length > MAX_TOC_LINES ? '；…（其余略）' : ''}。`)
          }
          lines.push(
            '注意：纸书页码/目录里出现的页码是印刷页码，与 chapterDocIndex 不是一回事；' +
              '提到位置时用章节标题或 chapterDocIndex。用户没有提到位置时，以「当前阅读位置」为准。'
          )
        } else {
          lines.push('当前没有打开的书：只做通用对话，不要假装知道书的内容。')
        }
        return lines.join('\n')
      }

      const locationLine = (snap) => {
        if (!snap) return '【當前閱讀位置】（未打開書）'
        const loc = snap.location
        const where = `第 ${loc.chapterDocIndex + 1}/${snap.chapterCount} 章${
          loc.chapterTitle ? `「${loc.chapterTitle}」` : ''
        }（chapterDocIndex=${loc.chapterDocIndex}）`
        return `【當前閱讀位置】${where}，當前讀到：「${loc.visibleText || '（本章開頭）'}」`
      }

      const snapLine = (ctxRef) =>
        ctxRef.reader ? '問問這本書裡的事，或任何想討論的。' : '當前沒有打開的書——仍是通用對話。'

      const formatTime = (ms) => {
        const d = new Date(ms)
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      }

      void render()
      // 卸载/收起/禁用：ctx.signal abort → 打字机计时器自清（见 typeOut）；DOM 随宿主清空
    }
  })
  api.log('插件「問」已載入')
}
