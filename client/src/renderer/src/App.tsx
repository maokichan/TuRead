import { useCallback, useEffect, useRef, useState } from 'react'
import { createContainer, type ServiceContainer } from '@core/container'
import type { BookRecord, ChatMessage, ConnectionState, RoomInfo } from '@core/domain/types'
import { IPC } from '@shared/ipc'

const container: ServiceContainer = createContainer(window.turead)

function extToFormat(name: string): BookRecord['format'] {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, BookRecord['format']> = {
    epub: 'EPUB',
    pdf: 'PDF',
    mobi: 'MOBI',
    azw3: 'AZW3',
    azw: 'AZW',
    txt: 'TXT',
    md: 'MD',
    fb2: 'FB2',
    docx: 'DOCX',
    html: 'HTML',
    xml: 'XML',
    cbz: 'CBZ',
    cbr: 'CBR',
    cbt: 'CBT',
    cb7: 'CB7'
  }
  return map[ext] ?? 'TXT'
}

const STATE_LABEL: Record<ConnectionState, string> = {
  connected: '已连接',
  disconnected: '未连接',
  reconnecting: '重连中'
}

export default function App(): React.JSX.Element {
  const [url, setUrl] = useState('http://127.0.0.1:8080')
  const [token, setToken] = useState('')
  const [nick, setNick] = useState('alice')
  const [connState, setConnState] = useState<ConnectionState>('disconnected')
  const [memberId, setMemberId] = useState<string | null>(null)
  const [connError, setConnError] = useState<string | null>(null)

  const [books, setBooks] = useState<BookRecord[]>([])
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
  const [rooms, setRooms] = useState<RoomInfo[]>([])

  const [roomId, setRoomId] = useState('')
  const [joinedRoom, setJoinedRoom] = useState<string | null>(null)
  const [members, setMembers] = useState('')
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [log, setLog] = useState<string[]>([])
  const [tab, setTab] = useState<'server' | 'room' | 'reader'>('server')

  const [reading, setReading] = useState<BookRecord | null>(null)
  const [progress, setProgress] = useState<{ totalPage: number; currentPage: number } | null>(null)
  const readerRef = useRef<HTMLDivElement | null>(null)

  const logRef = useRef<string[]>([])
  const pushLog = useCallback((line: string) => {
    logRef.current = [...logRef.current, line].slice(-200)
    setLog(logRef.current)
  }, [])

  useEffect(() => {
    const unsubs = [
      container.net.on('connection-changed', (s) => {
        setConnState(s)
        if (s === 'connected') {
          void container.net.getMemberId().then((id) => {
            setMemberId(id)
            pushLog(`已连接，成员 token = ${id}`)
          })
        }
      }),
      container.room.on('presence-updated', (ms) => {
        setMembers(ms.map((m) => (m.isMe ? `${m.nickName}(我)` : m.nickName)).join(', '))
      }),
      container.room.on('chat-message', (msg) => {
        setChat((prev) => [...prev, msg])
      }),
      container.room.on('system-message', (msg) => pushLog(`[${msg.type}] ${msg.text}`)),
      container.room.on('book-mismatch', ({ local, room }) =>
        pushLog(`书不匹配：本地 ${local.hash} vs 房间 ${room.hash}`)
      ),
      container.render.on('location-changed', () => {
        setProgress(container.render.getProgress())
      })
    ]
    void container.books.list().then(setBooks)
    void container.store.getSetting<{ serverUrl?: string; nickName?: string }>('serverConfig', {}).then((cfg) => {
      if (cfg.serverUrl) setUrl(cfg.serverUrl)
      if (cfg.nickName) setNick(cfg.nickName)
    })
    return () => unsubs.forEach((u) => u())
  }, [pushLog])

  const connect = useCallback(async () => {
    setConnError(null)
    try {
      await container.net.connect({ serverUrl: url, accessToken: token, nickName: nick })
      void container.store.setSetting('serverConfig', { serverUrl: url, nickName: nick })
    } catch (err) {
      setConnError((err as Error).message)
    }
  }, [url, token, nick])

  const refreshRooms = useCallback(async () => {
    try {
      const list = await container.room.listRooms()
      setRooms(list)
      pushLog(`发现 ${list.length} 个房间`)
    } catch (err) {
      setConnError((err as Error).message)
    }
  }, [pushLog])

  const importBook = useCallback(async () => {
    try {
      const picked = (await window.turead.invoke(IPC.dialogPickBook)) as {
        path: string
        name: string
      } | null
      if (!picked) return
      await importBookFromPath(picked.path, picked.name)
    } catch (err) {
      setConnError((err as Error).message)
    }
  }, [pushLog])

  const importBookFromPath = useCallback(
    async (path: string, name?: string) => {
      const buffer = (await window.turead.invoke(IPC.fsReadFile, path)) as ArrayBuffer
      const displayName = name ?? path.split(/[\\/]/).pop() ?? path
      const book = await container.books.importBook(
        buffer,
        displayName,
        extToFormat(displayName),
        path
      )
      const list = await container.books.list()
      setBooks(list)
      setSelectedBookId(book.id)
      pushLog(`已导入：${book.metadata.title}（${book.format}，${book.fingerprint.hash.slice(0, 10)}…）`)
      return book
    },
    [pushLog]
  )

  // dev-only：TUREAD_DEV_BOOK 指定书时启动即导入并打开（无头验证渲染链路）
  const didAutoOpen = useRef(false)
  useEffect(() => {
    const devBook = window.turead.devBook
    if (!devBook || didAutoOpen.current) return
    didAutoOpen.current = true
    void (async () => {
      try {
        const book = await importBookFromPath(devBook)
        await openReader(book)
        const pos = container.render.getPosition()
        const chapters = container.render.getChapter().length
        pushLog(`[dev] 渲染成功：章节数=${chapters} 位置=第${pos.page}页/${pos.percentage} chapterDocIndex=${pos.chapterDocIndex}`)
      } catch (err) {
        pushLog(`[dev] 渲染失败：${(err as Error).message}`)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openReader = useCallback(
    async (book: BookRecord) => {
      try {
        setReading(book)
        setTab('reader')
        await container.render.open(book)
        if (readerRef.current) await container.render.renderTo(readerRef.current)
        setProgress(container.render.getProgress())
        pushLog(`已打开：${book.metadata.title}`)
      } catch (err) {
        setConnError((err as Error).message)
      }
    },
    [pushLog]
  )

  const closeReader = useCallback(async () => {
    await container.render.close()
    setReading(null)
    setProgress(null)
  }, [])

  const pageTurn = useCallback(async (dir: 'next' | 'prev') => {
    if (dir === 'next') await container.render.next()
    else await container.render.prev()
    setProgress(container.render.getProgress())
  }, [])

  const createRoom = useCallback(async () => {
    const book = books.find((b) => b.id === selectedBookId)
    if (!book) return
    try {
      const { roomId: rid } = await container.room.createRoom(book, nick)
      setRoomId(rid)
      pushLog(`已创建房间：${rid}`)
      void refreshRooms()
    } catch (err) {
      setConnError((err as Error).message)
    }
  }, [books, selectedBookId, nick, pushLog, refreshRooms])

  const joinRoom = useCallback(async () => {
    const book = books.find((b) => b.id === selectedBookId)
    if (!book || !roomId) return
    try {
      const res = await container.room.joinRoom(roomId, book)
      if (res.ok) {
        setJoinedRoom(roomId)
        pushLog(`已加入房间 ${roomId}`)
      } else {
        pushLog(`加入失败：${res.reason}`)
      }
    } catch (err) {
      setConnError((err as Error).message)
    }
  }, [books, selectedBookId, roomId, pushLog])

  const sendChat = useCallback(async () => {
    if (!chatInput.trim()) return
    await container.room.sendChat(chatInput)
    setChatInput('')
  }, [chatInput])

  const selectedBook = books.find((b) => b.id === selectedBookId)
  const bookInReader = reading

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">T</span>
          <div>
            <h1>TuRead</h1>
            <span className="sub">多人共读 v0.1.0</span>
          </div>
        </div>
        <div className="topbar-right">
          {memberId && <span className="chip">成员 {memberId}</span>}
          <span className={`pill pill-${connState}`}>
            <i />
            {STATE_LABEL[connState]}
          </span>
        </div>
      </header>

      <aside className="sidebar">
        <div className="side-head">
          <h2>书架</h2>
          <button className="import-btn" onClick={() => void importBook()}>
            ＋ 导入
          </button>
        </div>
        <div className="book-list">
          {books.map((b) => (
            <button
              key={b.id}
              className={`book-item${b.id === selectedBookId ? ' active' : ''}`}
              onClick={() => setSelectedBookId(b.id)}
            >
              <span className="book-title">{b.metadata.title}</span>
              <span className="book-meta">
                <b className="fmt">{b.format}</b>
                {b.fingerprint.hash.slice(0, 10)}
              </span>
            </button>
          ))}
          {books.length === 0 && <p className="empty">书架为空，点「＋ 导入」添加一本电子书</p>}
        </div>
        <div className="book-foot">
          {selectedBook ? (
            <>
              <span className="muted">
                已选：{selectedBook.metadata.title} · {(selectedBook.fingerprint.size / 1024).toFixed(0)} KB
              </span>
              <button className="open-btn" onClick={() => void openReader(selectedBook)} disabled={!!bookInReader}>
                打开阅读
              </button>
            </>
          ) : (
            <span className="muted">未选择书籍</span>
          )}
        </div>
      </aside>

      <main className="content">
        <nav className="tabs">
          <button className={`tab${tab === 'server' ? ' active' : ''}`} onClick={() => setTab('server')}>
            服务器
          </button>
          <button className={`tab${tab === 'room' ? ' active' : ''}`} onClick={() => setTab('room')}>
            房间
          </button>
          <button className={`tab${tab === 'reader' ? ' active' : ''}`} onClick={() => setTab('reader')}>
            阅读
          </button>
        </nav>

        {tab === 'server' && (
          <section className="card">
            <h2>服务器连接</h2>
            <div className="field-grid">
              <label>
                <span>地址</span>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://host:8080" />
              </label>
              <label>
                <span>二级令牌</span>
                <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="access_token（可留空）" />
              </label>
              <label>
                <span>昵称</span>
                <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={12} placeholder="≤ 12 字" />
              </label>
            </div>
            <div className="actions">
              <button className="primary" onClick={() => void connect()} disabled={connState === 'connected'}>
                连接
              </button>
              <button onClick={() => void container.net.disconnect()} disabled={connState === 'disconnected'}>
                断开
              </button>
              <button onClick={() => void refreshRooms()} disabled={connState !== 'connected'}>
                刷新房间
              </button>
            </div>
            {connError && <p className="error">{connError}</p>}

            <h3>房间大厅</h3>
            <div className="room-table">
              {rooms.map((r) => (
                <div key={r.roomId} className="room-row">
                  <span className="mono">{r.roomId}</span>
                  <span>{r.title || '无标题'}</span>
                  <b className="fmt">{r.ext}</b>
                  <span className="muted">{r.ownerNick}</span>
                  <span className="count">{r.memberCount} 人</span>
                </div>
              ))}
              {rooms.length === 0 && <p className="empty">（大厅为空，去「房间」标签创建一个）</p>}
            </div>
          </section>
        )}

        {tab === 'room' && (
          <section className="card">
            <h2>房间会话</h2>
            <div className="field-grid">
              <label>
                <span>房间号</span>
                <input value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="8 位 hex" />
              </label>
            </div>
            <div className="actions">
              <button className="primary" onClick={() => void createRoom()} disabled={!selectedBook}>
                创建房间
              </button>
              <button onClick={() => void joinRoom()} disabled={!selectedBook || !roomId || !!joinedRoom}>
                加入
              </button>
              <button onClick={() => void container.room.leaveRoom()} disabled={!joinedRoom}>
                离开
              </button>
            </div>

            <div className="room-info">
              <div className="info-line">
                <span className="muted">当前书籍</span>
                <span>{selectedBook ? selectedBook.metadata.title : '未选择'}</span>
              </div>
              <div className="info-line">
                <span className="muted">在线成员</span>
                <span>{members || '（无）'}</span>
              </div>
              {joinedRoom && (
                <div className="info-line">
                  <span className="muted">已加入</span>
                  <span className="mono">{joinedRoom}</span>
                </div>
              )}
            </div>

            <h3>聊天</h3>
            <div className="chat-box">
              {chat.map((c) => (
                <div key={c.id} className="chat-line">
                  <b>{c.nick}</b>
                  <span className="chat-text">{c.text}</span>
                  <span className="muted mono">#{c.id}</span>
                </div>
              ))}
              {chat.length === 0 && <p className="empty">（还没有消息）</p>}
            </div>
            <div className="chat-input">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void sendChat()}
                placeholder="发消息，回车发送…"
                disabled={!joinedRoom}
              />
              <button onClick={() => void sendChat()} disabled={!joinedRoom}>
                发送
              </button>
            </div>
          </section>
        )}

        {tab === 'reader' && (
          <section className="reader">
            <div className="reader-bar">
              <span className="reader-title">{bookInReader ? bookInReader.metadata.title : '未打开书籍'}</span>
              <div className="actions">
                <button onClick={() => void pageTurn('prev')} disabled={!bookInReader}>
                  上一页
                </button>
                <span className="progress">
                  {progress ? `${progress.currentPage} / ${progress.totalPage}` : '—'}
                </span>
                <button onClick={() => void pageTurn('next')} disabled={!bookInReader}>
                  下一页
                </button>
                {bookInReader && (
                  <button className="primary" onClick={() => void closeReader()}>
                    关闭
                  </button>
                )}
              </div>
            </div>
            <div className="reader-stage" ref={readerRef} />
          </section>
        )}
      </main>

      <footer className="logbar">
        <span className="log-title">日志</span>
        <pre className="log">{log.join('\n')}</pre>
      </footer>
    </div>
  )
}
