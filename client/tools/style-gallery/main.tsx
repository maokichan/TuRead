/**
 * 样式样张（style gallery）—— 渲染层风格基线（`client/docs/STYLE.md`）的可视化基准。
 *
 * 为什么存在：确定风格效果时，**不该每次都启动 Electron**（要造书库/连服务器，分钟级反馈）。
 * 但也不能手写一份静态 HTML —— 那样会与真实组件漂移，基线验收（§8）随即失效。
 * 因此这里**只导入真实组件与真实 token**（`@renderer/styles.css` + `components/*`），
 * 用 mock props 铺出各种状态：改一处 token，浏览器里秒级看到全局效果。
 *
 * **它同时是"部件命名表"**：每节都标出真实源码路径，便于口头指认（"改 BookDetailPanel 的字段块"）。
 *
 * 覆盖：主题取向 / 动作文字档 / 三声部与字号阶梯 / 中文排版 / 真实组件全量。
 * 不覆盖：Electron 专属行为（IPC、窗口、kookit 渲染）—— 那些仍以 App 内自测为准。
 * 用法：`cd client && npm run style` → http://localhost:5199/tools/style-gallery/index.html
 */
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@renderer/styles.css'
import { FittedTitle } from '@renderer/components/FittedTitle'
import { BookRow } from '@renderer/components/BookRow'
import { BookTile } from '@renderer/components/BookTile'
import { BookDetailPanel } from '@renderer/components/BookDetailPanel'
import { LibraryToolbar } from '@renderer/components/LibraryToolbar'
import { TocPanel } from '@renderer/components/TocPanel'
import { StatePill } from '@renderer/components/StatePill'
import { ChatLog } from '@renderer/components/ChatLog'
import { MemberList } from '@renderer/components/MemberList'
import { RoomRow } from '@renderer/components/RoomRow'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import type { BookRecord, ChatMessage, RoomInfo, RoomMember } from '@core/domain/types'

/* ------------------------------ mock 数据 ------------------------------ */

const BOOK: BookRecord = {
  id: 'demo-1',
  fingerprint: {
    algorithm: 'md5-sample3-v1',
    hash: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    size: 15809857
  },
  metadata: { title: '高级运动营养学（第2版）' },
  format: 'EPUB',
  filePath: 'D:\\Books\\高级运动营养学（第2版）.epub',
  createdAt: Date.now() - 86400000 * 3,
  lastReadAt: Date.now() - 3600000,
  lastLocation: {
    chapterDocIndex: 12,
    chapterHref: 'ch12.xhtml',
    count: 3,
    page: 0,
    percentage: 0.42,
    text: '糖原是运动中最容易被消耗的能源物质，其储备量直接决定高强度运动的持续时间……',
    chapterTitle: '第十二章 运动与糖代谢'
  }
}

const BOOK_PDF: BookRecord = {
  ...BOOK,
  id: 'demo-2',
  metadata: { title: '机器学习' },
  format: 'PDF',
  filePath: 'D:\\Books\\机器学习 (周志华).pdf',
  lastLocation: undefined
}

/** 假封面（内容图，非界面 chrome）：纯色 SVG data URL，用于展示"有封面"的列表行 */
const FAKE_COVER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#2a2d30"/><text x="100" y="150" fill="#c2c8cf" font-size="26" text-anchor="middle">封面</text></svg>`
  )

const MEMBERS: RoomMember[] = [
  { id: 'Aaaa111', nickName: 'alice', isMe: true, location: BOOK.lastLocation },
  {
    id: 'Bbbb222',
    nickName: 'bob',
    location: { ...BOOK.lastLocation!, chapterDocIndex: 20, percentage: 0.6 }
  },
  { id: 'Cccc333', nickName: 'carol' }
]

const CHAT: ChatMessage[] = [
  {
    id: 1,
    roomId: 'a1b2c3d4',
    member: 'Bbbb222',
    nick: 'bob',
    text: '这一段讲糖原储备，和上一章呼应。',
    createdAt: 1756300000
  },
  {
    id: 2,
    roomId: 'a1b2c3d4',
    member: 'Aaaa111',
    nick: 'alice',
    text: '我把进度拖到 42% 了，你们跟一下。',
    createdAt: 1756300060
  }
]

const ROOMS: RoomInfo[] = [
  {
    roomId: 'a1b2c3d4',
    editionId: 1,
    title: '高级运动营养学（第2版）',
    ext: 'epub',
    ownerNick: 'alice',
    memberCount: 3,
    createdAt: 1756300000
  },
  {
    roomId: 'deadbeef',
    editionId: 2,
    title: '机器学习',
    ext: 'pdf',
    ownerNick: 'bob',
    memberCount: 1,
    createdAt: 1756290000
  }
]

const TOC = [
  { label: '第一章 能量代谢', depth: 0, chapterDocIndex: 0 },
  { label: '第二章 碳水化合物', depth: 0, chapterDocIndex: 4 },
  { label: '2.1 糖原储备', depth: 1, chapterDocIndex: 5 },
  { label: '第十二章 运动与糖代谢', depth: 0, chapterDocIndex: 12 },
  { label: '（无直达章节的分组标题）', depth: 1, chapterDocIndex: undefined }
]

/* ------------------------------ 主题切换 ------------------------------ */

const THEMES = ['system', 'dark', 'light', 'sepia-light', 'sepia-dark'] as const
type Theme = (typeof THEMES)[number]
const THEME_LABEL: Record<Theme, string> = {
  system: '跟随系统',
  dark: '暗色',
  light: '亮色',
  'sepia-light': '羊皮纸·亮',
  'sepia-dark': '羊皮纸·暗'
}

/* ------------------------------ 页面 ------------------------------ */

export function Gallery(): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>('dark')
  const [showDialog, setShowDialog] = useState(false)

  useEffect(() => {
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme
    document.documentElement.setAttribute('data-theme', resolved)
  }, [theme])

  const cjk = [
    ['text-autospace', CSS.supports('text-autospace', 'normal')],
    ['text-spacing-trim', CSS.supports('text-spacing-trim', 'trim-start')]
  ] as const

  return (
    <div className="cjk-ui min-h-screen bg-[var(--bg)] px-8 py-7 text-[var(--text)]">
      <header className="mb-7 flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--border)] pb-4">
        <h1 className="m-0 font-[var(--font-serif-cn)] text-[22px] font-bold">TuRead 样式样张</h1>
        <div className="flex flex-wrap items-center gap-4">
          {THEMES.map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`font-[var(--font-serif-cn)] text-[18px] font-bold ${
                theme === t ? 'text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {THEME_LABEL[t]}
            </button>
          ))}
        </div>
      </header>

      <p className="m-0 mb-6 font-[var(--mono)] text-[11px] text-[var(--muted)]">
        UA：{navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 90)} ·{' '}
        {cjk.map(([k, ok]) => `${k}=${ok ? 'on' : 'off'}`).join(' · ')}
        <span className="ml-2 text-[var(--warn)]">
          （排版类特性依赖 Chromium 版本，最终判定需在 Electron 内复核）
        </span>
      </p>

      {/* 1. 动作文字档 */}
      <Panel
        title="动作文字档"
        path="styles.css · .text-action / .text-action--primary / --danger"
        note="动作即文字：18px 加粗衬线、无框无底色；主/次靠色温区分，破坏性动作仍是文字"
      >
        <div className="flex flex-wrap items-center gap-7">
          <button className="text-action text-action--primary">主动作 · 导入</button>
          <button className="text-action">次动作 · 刷新</button>
          <button className="text-action text-action--danger">破坏性 · 移除</button>
          <button disabled className="text-action">
            禁用态
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            className="rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] outline-none focus:border-[var(--accent)]"
            placeholder="例外① 输入类保留边框"
          />
          <span className="text-[12px] text-[var(--muted)]">← 唯一保留边框的控件</span>
        </div>
      </Panel>

      {/* 2. 视图切换按钮（唯一带三角负片标记） */}
      <Panel
        title="视图切换按钮（三角负片标记）"
        path="components/LibraryToolbar.tsx + styles.css · .view-switch"
        note="点击播放 900ms 动画（旧文字被吞没 → 新文字浮出 → 复原）；动画期间按钮 disabled，连点无效。三角取 currentColor（墨色），四套主题都可见"
      >
        <LibraryToolbar
          view="list"
          onViewChange={noop}
          onImportFiles={noop}
          onImportFolder={noop}
          importing={null}
          onCancelImport={noop}
          coverProgress={{ done: 1, total: 2 }}
        />
        <p className="mt-3 mb-0 text-[11px] text-[var(--muted)]">
          ↑ 点左下角「列表」试一次：注意三角标记与 900ms 动画，动画期间再点无效。
        </p>
      </Panel>

      {/* 2.5 侧边栏功能导航 */}
      <Panel
        title="侧边栏功能导航（选中 = 负片）"
        path="AppShell.tsx + styles.css · .feature-nav / .feature-nav--active"
        note="未选中=单色汉字；选中=负片块（反色），不再用圆角按钮/底色/描边。样式取自同一 CSS 类，未复制组件逻辑"
      >
        <div className="flex items-center gap-2">
          {(
            [
              ['書', true],
              ['閱', false],
              ['房', false],
              ['設', false]
            ] as const
          ).map(([icon, active]) => (
            <button
              key={icon}
              title={icon}
              className={`feature-nav ${active ? 'feature-nav--active' : ''}`}
            >
              {icon}
            </button>
          ))}
        </div>
      </Panel>

      {/* 3. 字体（全局统一）+ 字号阶梯 */}
      <Panel
        title="字体（全局统一）与字号阶梯"
        path="styles.css · --font-ui = 'Times New Roman' + 'GenRyuMin TW'"
        note="界面 chrome 只有一套字体：西文 Times New Roman、中文源流明體（顺序不可反）；阅读器正文在 kookit iframe 内，不受此约束"
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Specimen voice="中文 · 源流明體（仅 Bold 一个切面）">
            <span className="text-[19px]">書閱房設 高级运动营养学</span>
          </Specimen>
          <Specimen voice="西文 / 数字 · Times New Roman">
            <span className="text-[17px]">TuRead · Room a1b2c3d4 · 42%</span>
          </Specimen>
          <Specimen voice="中西混排（同一行自动分工）">
            <span className="text-[15px]">第 12 章 EPUB / PDF · 15809857 bytes</span>
          </Specimen>
        </div>
        <div className="mt-4 flex flex-wrap items-baseline gap-5 border-t border-[var(--border-soft)] pt-4">
          {[11, 12.5, 13, 14, 15, 17, 18, 19, 20].map((s) => (
            <span key={s} style={{ fontSize: `${s}px` }} className="text-[var(--muted)]">
              {s}
            </span>
          ))}
          <span className="text-[11px] text-[var(--muted)]">← 字号白名单（§3.2）</span>
        </div>
      </Panel>

      {/* 4. 负片（反色矩形块） */}
      <Panel
        title="负片（反色矩形块）"
        path="styles.css · --negative-bg / --negative-text"
        note="用途仅两处（§5.5）：① 详情抽屉的标题与字段 ② 侧边栏选中项。文字块成为纸的反面：页面白 → 块黑字白"
      >
        <div className="flex flex-col items-start gap-2">
          <span className="inline-block bg-[var(--negative-bg)] px-1.5 py-1 text-[var(--negative-text)]">
            <span className="block font-[system-ui] text-[10px] opacity-60">字段标签</span>
            <span className="block text-[12.5px]">字段值（左对齐，块宽随内容）</span>
          </span>
          <span className="inline-block max-w-full bg-[var(--negative-bg)] px-1.5 py-1 text-[var(--negative-text)]">
            <span className="block font-[system-ui] text-[10px] opacity-60">长文本会换行</span>
            <span className="block font-[var(--mono)] text-[11px] break-all">
              a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
            </span>
          </span>
        </div>
      </Panel>

      {/* 5. 中文排版 */}
      <Panel
        title="中文排版"
        path="styles.css · .cjk-ui / .cjk-body"
        note="混排间距 / 标点禁则 / 段距与缩进二选一（默认段距、不缩进）"
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div className="cjk-body text-[14px]">
            <p className="m-0 mb-3">
              糖原（glycogen）储备约 400–500 g，可提供约 1600–2000 kcal 能量。混排时汉字与 Latin、数字之间应留约 1/4 em 空隙。
            </p>
            <p className="m-0">
              标点禁则示例：行首不得出现「，。」」等标点，行尾不得出现「（『」等开引号。中英文之间不插空格，也不写全角数字 １２３。
            </p>
          </div>
          <div className="cjk-body text-[14px]">
            <p className="m-0 mb-3">段距版（本项目默认）：段落之间用间距分隔，首行不缩进。</p>
            <p className="m-0">第二段紧接上一段，靠段距形成节奏，而不是靠两格缩进。</p>
            <p className="m-0 mt-4 text-[12px] text-[var(--muted)]">
              ⚠ 缩进版只属于将来的"纸书排版"档，两者不得并用（§4.1-5）。
            </p>
          </div>
        </div>
      </Panel>

      {/* 6. 真实组件 */}
      <Panel
        title="书库 · 列表行（BookRow）"
        path="components/BookRow.tsx"
        note="有封面 / 无封面（文字封面）—— 两者同等对待"
      >
        <div className="flex flex-col gap-1">
          <BookRow
            book={BOOK}
            active
            coverUrl={FAKE_COVER}
            onDetail={noop}
            onOpen={noop}
            onDelete={noop}
          />
          <BookRow
            book={BOOK_PDF}
            active={false}
            coverUrl={null}
            onDetail={noop}
            onOpen={noop}
            onDelete={noop}
          />
        </div>
      </Panel>

      <Panel
        title="书库 · 网格（BookTile）与文字封面（FittedTitle）"
        path="components/BookTile.tsx / components/FittedTitle.tsx"
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-x-4 gap-y-5">
          <BookTile book={BOOK} active coverUrl={FAKE_COVER} onDetail={noop} onOpen={noop} onDelete={noop} />
          <BookTile book={BOOK_PDF} active={false} coverUrl={null} onDetail={noop} onOpen={noop} onDelete={noop} />
          <div className="flex flex-col gap-1.5">
            <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel-2)]">
              <FittedTitle text="年代四部曲" />
            </div>
            <span className="text-[12.5px] text-[var(--muted)]">FittedTitle 大字</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel-2)]">
              <FittedTitle text="论持久战与人民战争" maxSize={60} />
            </div>
            <span className="text-[12.5px] text-[var(--muted)]">FittedTitle 长标题</span>
          </div>
        </div>
      </Panel>

      <Panel
        title="阅读器 · 目录（TocPanel）"
        path="components/TocPanel.tsx"
        note="目录项是导航文字、不是按钮：无边框/无底色，靠留白分行，hover 只变色温"
      >
        <div className="flex flex-wrap items-start gap-6">
          <div className="h-[220px]">
            <TocPanel rows={TOC} onJump={noop} />
          </div>
          <div className="flex flex-col gap-2">
            <StatePill state="connected" />
            <StatePill state="reconnecting" />
            <StatePill state="disconnected" />
          </div>
        </div>
      </Panel>

      <Panel
        title="房间 · 大厅行（RoomRow）"
        path="components/RoomRow.tsx"
        note="同样是导航文字：无边框/无底色/无分隔线，靠留白分行（五列对齐不变）"
      >
        {ROOMS.map((r) => (
          <RoomRow key={r.roomId} room={r} onEnter={noop} />
        ))}
      </Panel>

      <Panel title="房间 · 会话（MemberList / ChatLog）" path="components/MemberList.tsx / components/ChatLog.tsx">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h4 className="mb-1.5 mt-0 text-[12.5px] tracking-[0.6px] text-[var(--muted)] uppercase">成员</h4>
            <MemberList members={MEMBERS} />
          </div>
          <div className="flex h-[200px] flex-col">
            <h4 className="mb-1.5 mt-0 text-[12.5px] tracking-[0.6px] text-[var(--muted)] uppercase">聊天</h4>
            <ChatLog messages={CHAT} />
          </div>
        </div>
      </Panel>

      <Panel
        title="浮层 · 详情抽屉（BookDetailPanel）与确认弹窗（ConfirmDialog）"
        path="components/BookDetailPanel.tsx + components/Marquee.tsx / components/ConfirmDialog.tsx"
        note="平面结构：封面（左列）+ 三行文本列（标题条 / 数据行 / 指标条，左对齐封面右缘、撑满宽度）→ 满宽信息块（描述 / 文件路径）。标题与数据行**单行**，超出才滚（Marquee 先量宽度）；外壳完全透明，下层列表从块间透出"
      >
        <div className="relative h-[380px] overflow-hidden rounded-xl border border-[var(--border-soft)]">
          {/* 下层内容：用来验证抽屉的透明（抽屉只画文字块，不画底） */}
          <div className="flex flex-col gap-1 p-2">
            <BookRow book={BOOK} active={false} coverUrl={FAKE_COVER} onDetail={noop} onOpen={noop} onDelete={noop} />
            <BookRow book={BOOK_PDF} active={false} coverUrl={null} onDetail={noop} onOpen={noop} onDelete={noop} />
            <BookRow book={BOOK} active={false} coverUrl={null} onDetail={noop} onOpen={noop} onDelete={noop} />
            <BookRow book={BOOK_PDF} active={false} coverUrl={FAKE_COVER} onDetail={noop} onOpen={noop} onDelete={noop} />
          </div>
          <BookDetailPanel book={BOOK} coverUrl={null} onClose={noop} onOpen={noop} onDelete={noop} />
        </div>
        <button onClick={() => setShowDialog(true)} className="text-action text-action--primary mt-4">
          打开确认弹窗
        </button>
        {showDialog && (
          <ConfirmDialog
            title="从书库移除？"
            message="《高级运动营养学（第2版）》只会从书库索引中移除，源文件不会被删除。"
            confirmLabel="移除"
            rememberLabel="下次不再提示"
            onConfirm={() => setShowDialog(false)}
            onCancel={() => setShowDialog(false)}
          />
        )}
      </Panel>

      <footer className="mt-8 border-t border-[var(--border)] pt-4 font-[var(--mono)] text-[11px] text-[var(--muted)]">
        基线：client/docs/STYLE.md v0.1 · 本页只用于**确认效果**与**指认部件**，不参与产品构建
      </footer>
    </div>
  )
}

/* ------------------------------ 小工具 ------------------------------ */

function noop(): void {}

function Panel({
  title,
  path,
  note,
  children
}: {
  title: string
  /** 真实源码路径（部件命名表用） */
  path?: string
  note?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="mb-6 rounded-xl border border-[var(--border-soft)] bg-[var(--panel)] p-5">
      <h3 className="m-0 font-[var(--font-serif-cn)] text-[15px] font-bold">{title}</h3>
      {path && (
        <code className="mt-1 block font-[var(--mono)] text-[10.5px] text-[var(--accent)]">{path}</code>
      )}
      {note && <p className="mt-1 mb-4 text-[12px] text-[var(--muted)]">{note}</p>}
      {children}
    </section>
  )
}

function Specimen({
  voice,
  cls = '',
  children
}: {
  voice: string
  cls?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className={`rounded-lg border border-[var(--border-soft)] bg-[var(--panel-2)] p-4 ${cls}`}>
      <div className="mb-2 text-[11px] text-[var(--muted)]">{voice}</div>
      {children}
    </div>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(<Gallery />)
