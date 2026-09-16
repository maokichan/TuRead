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
import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@renderer/styles.css'
import { FittedTitle } from '@renderer/components/FittedTitle'
import { BookRow } from '@renderer/components/BookRow'
import { BookTile } from '@renderer/components/BookTile'
import { BookDetailPanel } from '@renderer/components/BookDetailPanel'
import { LibraryToolbar } from '@renderer/components/LibraryToolbar'
import { ReaderRail, type LeftPanelKind } from '@renderer/components/ReaderRail'
import { ContextMenu, type ContextMenuItem } from '@renderer/components/ContextMenu'
import { NoteComposer } from '@renderer/components/NoteComposer'
import { NoteFlow, type NoteFlowItem } from '@renderer/components/NoteFlow'
import { DEFAULT_READER_PARAMS, type ReaderParams } from '@renderer/components/ReaderControls'
import { StatePill } from '@renderer/components/StatePill'
import { ChatLog } from '@renderer/components/ChatLog'
import { MemberList } from '@renderer/components/MemberList'
import { RoomRow } from '@renderer/components/RoomRow'
import { ConfirmDialog } from '@renderer/components/ConfirmDialog'
import type {
  ChatMessage,
  EditionRecord,
  Note,
  NoteColor,
  NoteTextFocus,
  NoteView,
  ReadingState,
  RoomInfo,
  RoomMember
} from '@core/domain/types'

/* ------------------------------ mock 数据 ------------------------------ */

/**
 * ⚠ v0.4.0 数据层换代的同步点（2026-09-16 修黑屏）：`BookRecord` **已退役**，
 * 拆成 `EditionRecord`（内容身份）+ `ReadingState`（阅读状态，逐 edition）。
 * 样张以前把 `lastReadAt`/`lastLocation` 塞在书行上 → 类型不过、组件 props 缺项，
 * 最终 `LibraryToolbar` 的 `crumbs` 为 undefined 在渲染期抛错，**整页黑屏**
 * （body 底色 = `--bg`，React 卸载后就是一片黑）。
 */
const BOOK: EditionRecord = {
  id: 'demo-1',
  fingerprint: {
    algorithm: 'md5-sample3-v1',
    hash: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    size: 15809857
  },
  metadata: { title: '高级运动营养学（第2版）' },
  format: 'EPUB',
  filePath: 'D:\\Books\\高级运动营养学（第2版）.epub',
  createdAt: Date.now() - 86400000 * 3
}

const BOOK_PDF: EditionRecord = {
  ...BOOK,
  id: 'demo-2',
  metadata: { title: '机器学习' },
  format: 'PDF',
  filePath: 'D:\\Books\\机器学习 (周志华).pdf'
}

/** 阅读状态（读模型里与 edition JOIN 好，`BookRow`/`BookDetailPanel` 各自收一份） */
const READING_STATE: ReadingState = {
  editionId: 'demo-1',
  lastReadAt: Date.now() - 3600000,
  lastLocation: {
    chapterDocIndex: 12,
    chapterHref: 'ch12.xhtml',
    count: 3,
    page: 0,
    percentage: 0.42,
    text: '糖原是运动中最容易被消耗的能源物质，其储备量直接决定高强度运动的持续时间……',
    chapterTitle: '第十二章 运动与糖代谢'
  },
  totalReadMs: 1000 * 60 * 42
}

/** 未读（`progressText` 给「未读」；drawer 的指标行给「共 —」） */
const READING_STATE_PDF: ReadingState | null = null

/** 笔记（给左挂件的「筆記」形态用；形状 = CONTRACTS §2 Note v2） */
const NOTES: Note[] = [
  {
    id: 'n-1',
    editionId: 'demo-1',
    kind: 'highlight',
    anchor: {
      norm: {
        chapterIndex: 12,
        progression: 0.34,
        quote: {
          exact: '糖原是运动中最容易被消耗的能源物质',
          prefix: '在长时间耐力运动中，',
          suffix: '，其储备量直接决定'
        }
      },
      fragment: { engine: 'kookit-rangy', key: 'eyJzdGFydCI6MTIzLCJlbmQiOjE0MH0=' }
    },
    color: 'yellow',
    body: '',
    createdAt: Date.now() - 7200000,
    updatedAt: Date.now() - 7200000
  },
  {
    id: 'n-2',
    editionId: 'demo-1',
    kind: 'note',
    anchor: {
      norm: {
        chapterIndex: 4,
        progression: 0.62,
        quote: { exact: '每日碳水摄入建议按每公斤体重 3–5 g 计', prefix: '', suffix: '，训练日取上限' }
      },
      fragment: { engine: 'kookit-rangy', key: 'eyJzdGFydCI6NDU2LCJlbmQiOjQ3OH0=' }
    },
    color: 'red',
    body: '这里说的是每公斤体重 3–5 g，我要回去核对训练日的剂量。',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 3600000
  }
]

/** 假封面（内容图，非界面 chrome）：纯色 SVG data URL，用于展示"有封面"的列表行 */
const FAKE_COVER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#2a2d30"/><text x="100" y="150" fill="#c2c8cf" font-size="26" text-anchor="middle">封面</text></svg>`
  )

const MEMBERS: RoomMember[] = [
  { id: 'Aaaa111', nickName: 'alice', isMe: true, location: READING_STATE.lastLocation },
  {
    id: 'Bbbb222',
    nickName: 'bob',
    location: { ...READING_STATE.lastLocation!, chapterDocIndex: 20, percentage: 0.6 }
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

/**
 * 目录（给左挂件用）。
 * ⚠ **刻意给到 20 条**：条目区必须真的能滚（`scrollHeight > clientHeight`），否则
 * "当前条目滚到正中"这件事在样张里根本量不出来（短列表看起来永远是对的）——
 * `smoke.cjs` 的居中断言也依赖这一点。
 */
const TOC = [
  { label: '第一章 能量代谢', depth: 0, chapterDocIndex: 0 },
  { label: '1.1 ATP 与磷酸原系统', depth: 1, chapterDocIndex: 1 },
  { label: '1.2 糖酵解', depth: 1, chapterDocIndex: 2 },
  { label: '第二章 碳水化合物', depth: 0, chapterDocIndex: 4 },
  { label: '2.1 糖原储备', depth: 1, chapterDocIndex: 5 },
  { label: '2.2 血糖调节', depth: 1, chapterDocIndex: 6 },
  { label: '第三章 脂肪代谢', depth: 0, chapterDocIndex: 7 },
  { label: '第四章 蛋白质与氨基酸', depth: 0, chapterDocIndex: 8 },
  { label: '第五章 维生素', depth: 0, chapterDocIndex: 9 },
  { label: '（无直达章节的分组标题）', depth: 1, chapterDocIndex: undefined },
  { label: '第六章 矿物质与水', depth: 0, chapterDocIndex: 10 },
  { label: '第七章 能量平衡', depth: 0, chapterDocIndex: 11 },
  { label: '第十二章 运动与糖代谢', depth: 0, chapterDocIndex: 12 },
  { label: '12.1 运动中糖的利用', depth: 1, chapterDocIndex: 13 },
  { label: '12.2 补糖策略', depth: 1, chapterDocIndex: 14 },
  { label: '第十三章 训练适应', depth: 0, chapterDocIndex: 15 },
  { label: '第十四章 特殊人群', depth: 0, chapterDocIndex: 16 },
  { label: '第十五章 补剂与伦理', depth: 0, chapterDocIndex: 17 },
  { label: '第十六章 运动营养实践', depth: 0, chapterDocIndex: 18 },
  { label: '附錄 常用数据表', depth: 0, chapterDocIndex: 19 }
]

/** 右键挂载菜单的样张项（阅读器域语义：標記四色子菜单 + 加批註 / 編輯 / 移除）——
 *  用来复核 2026-09-16 的对比度改动：**动作区纯色底 + 1px 描边 + 全强度文字** */
const MENU_ITEMS: ContextMenuItem[] = [
  {
    label: '標記',
    children: (['yellow', 'green', 'blue', 'red'] as NoteColor[]).map((c) => ({
      label: { yellow: '黃', green: '綠', blue: '藍', red: '赤' }[c],
      swatch: `var(--note-${c})`,
      onClick: noop
    }))
  },
  { label: '加批註', onClick: noop },
  { label: '編輯批註', onClick: noop },
  { label: '移除', onClick: noop }
]

/* --------------------- 笔记管理（跨书）的样张数据 --------------------- */

const mkNote = (
  id: string,
  chapterIndex: number,
  excerpt: string,
  body: string,
  color: NoteColor,
  updatedAt: number,
  /** 故意允许与 body 不一致 —— 见下面第 3 条 */
  kind: Note['kind'] = body ? 'note' : 'highlight'
): Note => ({
  id,
  editionId: 'demo-1',
  kind,
  anchor: {
    norm: { chapterIndex, progression: 0.5, quote: { exact: excerpt, prefix: '', suffix: '' } },
    fragment: null
  },
  color,
  body,
  createdAt: updatedAt,
  updatedAt
})

const DAY = 86400000
/**
 * 笔记流的样张数据：**长短刻意拉开**，用来验证"条目高度随内容变"与上限截断（摘录 ≤4 行 / 批注 ≤6 行）。
 * ⚠ 第 3 条刻意做成 `kind='highlight'` 但 `body` 非空 —— 这正是"划完线再补批注"的真实情形
 * （用户 2026-09-16："画完线后补 body，那这就是批注，很显然"）。所以**卡片照样按批注显示**：
 * 判据是 `body` 是否为空，不是 `kind`。
 */
const NOTE_FLOW_ITEMS: NoteFlowItem[] = [
  {
    editionTitle: '高级运动营养学（第2版）',
    note: mkNote('f-1', 12, '糖原是运动中最容易被消耗的能源物质', '', 'yellow', Date.now() - 2 * DAY)
  },
  {
    editionTitle: '高级运动营养学（第2版）',
    note: mkNote(
      'f-2',
      4,
      '每日碳水摄入建议按每公斤体重 3–5 g 计',
      '训练日取上限，休息日取下限。',
      'red',
      Date.now() - 3600000
    )
  },
  {
    editionTitle: '高级运动营养学（第2版）',
    note: mkNote(
      'f-3',
      7,
      '蛋白质的摄入时机对合成窗口的影响仍在争论',
      '这里说的和上一章的数字对不上：他前面写 1.6 g/kg，这里又写 2.2 g/kg。我倾向于按训练量与总热量来定，而不是死守一个数；回头把两处的原文都抄出来对比一遍，顺便查一下引用的那篇 2018 年的综述到底是不是这个结论，因为如果引用错了，后面整章的推算都要打折看，剂量的事不能含糊。',
      'green',
      Date.now() - 5 * DAY,
      'highlight' // ← body 非空但 kind 是 highlight：卡片仍按「批注」显示（判据 = body）
    )
  },
  {
    editionTitle: '机器学习',
    note: mkNote(
      'f-4',
      3,
      '奥卡姆剃刀：若无必要，勿增实体。模型复杂度应当与数据量匹配，否则方差会吃掉偏差下降带来的收益。',
      '',
      'blue',
      Date.now() - 9 * DAY
    )
  },
  {
    editionTitle: '机器学习',
    note: mkNote(
      'f-5',
      5,
      '交叉验证',
      '留一法在数据量小的时候方差很大，还是 k 折稳。',
      'yellow',
      Date.now() - 20 * DAY
    )
  },
  {
    editionTitle: '年代四部曲',
    note: mkNote('f-6', 1, '普遍的、总体的危机', '', 'red', Date.now() - 40 * DAY)
  }
]

/**
 * **压力场景的数据**（`?notes-scale=N`）：确定性伪随机生成 N 条笔记，长短贴近真实分布
 * （多数是短划线/短批注，少量长批注）。
 *
 * 为什么要它：书库域吃过"大规模数据刷新卡死"的亏（`useVirtualRange` 的头注记着"一次全量渲染
 * 几百个条目会卡顿"）。笔记管理目标规模是**近千条**，而 `NoteFlow` 目前**没有窗口化** ——
 * 到底要不要窗口化、要哪种，按项目纪律**先量化再选**（`STYLE.md` §5.10 已登记三条候选）。
 * 本场景只负责**产出数字**，不预设结论。
 */
function makeScaleItems(n: number): NoteFlowItem[] {
  // 线性同余伪随机（种子固定 → 每次量的是同一批数据，数字可比）
  let seed = 20260916
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const titles = ['高级运动营养学（第2版）', '机器学习', '年代四部曲', '疯狂的投资']
  const filler =
    '糖原储备与运动表现的关系需要结合训练强度与总热量来判断，单看一个数字容易得出错误的结论。'
  const items: NoteFlowItem[] = []
  for (let i = 0; i < n; i++) {
    const r = rnd()
    // 70% 短、25% 中、5% 长（长的那批会撞上 line-clamp 上限）
    const bodyLen = r < 0.7 ? 0 : r < 0.95 ? Math.floor(rnd() * 60) : Math.floor(rnd() * 400) + 120
    const excerptLen = 8 + Math.floor(rnd() * 90)
    const body = bodyLen > 0 ? filler.repeat(Math.ceil(bodyLen / filler.length)).slice(0, bodyLen) : ''
    items.push({
      editionTitle: titles[i % titles.length],
      note: mkNote(
        `s-${i}`,
        i % 98,
        filler.slice(0, excerptLen),
        body,
        (['yellow', 'green', 'blue', 'red'] as NoteColor[])[i % 4],
        Date.now() - i * 60000
      )
    })
  }
  return items
}

/** 压力场景的实测结果（探针读它；`smoke.cjs --scale=N` 用） */
interface ScaleMetrics {
  n: number
  commitMs: number
  settleMs: number
  refreshMs: number
  /** DOM 里真实的卡片数（**窗口化后应远小于 N** —— 这是"只渲染视口内"的直接证据） */
  cardCount: number
  /** 参与定位的条目数（同为窗口化证据） */
  placedCount: number
}

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
  /** 阅读器两个浮层的开关（右键挂载菜单 / 批注输入栏）—— 形态复核用，默认都关着 */
  const [overlay, setOverlay] = useState({ composer: false, menu: false })
  const toggleOverlay = (k: 'composer' | 'menu'): void =>
    setOverlay((o) => ({ ...o, [k]: !o[k] }))

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
        title="书库底部状态栏（视图切换 + 三角负片标记）"
        path="components/LibraryToolbar.tsx + styles.css · .view-switch"
        note="视图切换是单个文字按钮：显示**当前**视图名，点击播放 900ms 动画（旧文字被吞没 → 新文字浮出 → 复原）；动画期间按钮 disabled，连点无效。三角取 currentColor（墨色），四套主题都可见。⚠ 2026-09-16：`crumbs`（当前层级面包屑）是**必填** prop —— 缺了会在渲染期抛错、整页黑屏（样张曾因此黑屏）"
      >
        <LibraryToolbar
          view="list"
          onViewChange={noop}
          onImportFiles={noop}
          onImportFolder={noop}
          importing={null}
          onCancelImport={noop}
          coverProgress={{ done: 1, total: 2 }}
          onOpenManager={noop}
          onScan={noop}
          crumbs={[
            { label: '我的書庫', onGo: noop },
            { label: '運動營養', onGo: noop },
            { label: '訓練學', onGo: noop }
          ]}
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
            readingState={READING_STATE}
            active
            coverUrl={FAKE_COVER}
            onDetail={noop}
            onOpen={noop}
            onDelete={noop}
          />
          <BookRow
            book={BOOK_PDF}
            readingState={READING_STATE_PDF}
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
        title="阅读器 · 挂载线实体（ReaderRail：桌/纸 + 目录 / 笔记 + 参数）"
        path="components/ReaderRail.tsx（内含 TocPanel / NotesPanel / ReaderControls）"
        note="沉浸态（STYLE.md §5.8）：全屏的是「桌」不是「正文」—— 纸在居中定宽列里，靠 --desk-bg / --page-edge **用颜色区分**。一条横向挂载线贯穿页面：左段 = 目录 / 笔记垂挂（顶部「目錄 / 筆記」两格文字开关、当前格 --accent），右段 = 阅读参数，中段是纯线。⚠ 2026-09-16（用户定，v1.9 纠正）：**线是固定的一条**（--sidebar-w → 窗口右缘），两段**等宽**且**各贴线的一端** → 关于**线的中心**互为镜像；宽度**不许**由纸宽（--read-width）派生（v1.8 那样写会被判错：改纸宽会带着两条线段一起变）。**目录/笔记的当前条目自动滚到容器正中**（这里把位置钉在第 12 章：看「第十二章 运动与糖代谢」是否落在列表正中间）。参数面板**默认展开**（v1.0 起），折叠 = 向上收回线里；目录条目高亮 = **遮罩按到鼠标的距离**（把鼠标在列表上上下移动看过渡），静息更淡"
      >
        <div className="grid gap-6 md:grid-cols-2">
          <RailDemo label="只剩掛載線（左欄與參數都折疊）" />
          <RailDemo label="左欄 + 右欄都展開（鏡像與固定寬度的基準）" leftOpen controlsOpen />
          <RailDemo label="筆記垂掛（左掛件另一種內容，同樣跟隨位置）" leftPanel="notes" leftOpen />
          <RailDemo label="閱讀參數面板（右段垂掛，默認展開）" controlsOpen />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <StatePill state="connected" />
          <StatePill state="reconnecting" />
          <StatePill state="disconnected" />
        </div>
      </Panel>

      <Panel
        title="阅读器 · 右键挂载菜单与批注输入栏（形态复核）"
        path="components/ContextMenu.tsx / components/NoteComposer.tsx"
        note="2026-09-16（用户定）改的两处形态：① **右键菜单**原来是「线 + 纯文字、透明底」，用户报「整个容器太透明了」→ 动作区改**纯色底 + 1px 描边 + 全强度文字**（选项色仍只在色块上，见 STYLE §5.2 例外⑤/⑥）；② **批注输入栏**改为**屏幕底部居中**的**纯色带边框容器**、**一个字都没有**（无标题、无 placeholder、无按钮），焦点态由容器给强调边 —— 操作逻辑不变（Enter 提交 / Shift+Enter 换行 / Esc 取消）。两个按钮在下面，点开即在真实位置出现（输入栏是 `fixed`，会浮在本页底部 —— 与 App 内一致）"
      >
        <div className="flex flex-wrap items-center gap-6">
          <button
            id="demo-composer-toggle"
            className="text-action text-action--lg"
            onClick={() => toggleOverlay('composer')}
          >
            {overlay.composer ? '關閉批註輸入欄' : '打開批註輸入欄'}
          </button>
          <button className="text-action text-action--lg" onClick={() => toggleOverlay('menu')}>
            {overlay.menu ? '關閉右鍵菜單' : '打開右鍵菜單'}
          </button>
          <span className="text-[11px] text-[var(--muted)]">
            ← 判据由 smoke.cjs 机检：输入栏**零文字** + 纯色底 + 1px 描边 + 水平居中
          </span>
        </div>
        {overlay.menu && <ContextMenu x={220} y={140} items={MENU_ITEMS} onClose={() => toggleOverlay('menu')} />}
        {overlay.composer && (
          <NoteComposer
            value=""
            onChange={noop}
            onSave={() => toggleOverlay('composer')}
            onCancel={() => toggleOverlay('composer')}
          />
        )}
      </Panel>

      <Panel
        title="笔记管理 · 卡片与流（NoteCard / NoteFlow）"
        path="components/NoteFlow.tsx / components/NoteCard.tsx（视觉 = STYLE §5.10 立案）"
        note="视图两态（**瀑布流默认** / 網格）与文字主次两档（默认「批註為主」）都是真实的受控 props —— 点左上按钮切视图、点第二个按钮切主次。卡片高度**随内容长短变**（摘录 ≤4 行、批注 ≤6 行由 line-clamp 封顶，长批注截断）。点任意卡片看**选中态**（试验档：1px --accent-ring 直角矩形；卡片常驻 8px 内边距，所以选中不会抖）。⚠ 卡片零 chrome：无边框、无底色、无阴影、无圆角（书库封面格的 1px 边框是因为「图需要槽」，文字卡没有图）。单击选中 / 双击跳转 / 右键菜单由 NotesFeature 接，本页只验视觉"
      >
        <NotesDemo />
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
        note="封面 64×96（2:3 不拉伸）+ 三行各 32px（= 封面高度三等分）：标题条 / 数据行（含路径）/ 指标行；都不带标签（内容自述）；①② 单行超出才滚；外壳完全透明，关闭在底部"
      >
        <div className="relative h-[380px] overflow-hidden rounded-xl border border-[var(--border-soft)]">
          {/* 下层内容：用来验证抽屉的透明（抽屉只画文字块，不画底） */}
          <div className="flex flex-col gap-1 p-2">
            <BookRow book={BOOK} readingState={READING_STATE} active={false} coverUrl={FAKE_COVER} onDetail={noop} onOpen={noop} onDelete={noop} />
            <BookRow book={BOOK_PDF} readingState={READING_STATE_PDF} active={false} coverUrl={null} onDetail={noop} onOpen={noop} onDelete={noop} />
            <BookRow book={BOOK} readingState={READING_STATE} active={false} coverUrl={null} onDetail={noop} onOpen={noop} onDelete={noop} />
            <BookRow book={BOOK_PDF} readingState={READING_STATE_PDF} active={false} coverUrl={FAKE_COVER} onDetail={noop} onOpen={noop} onDelete={noop} />
          </div>
          <BookDetailPanel book={BOOK} readingState={READING_STATE} coverUrl={null} onClose={noop} onOpen={noop} onDelete={noop} />
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

/**
 * 挂载线实体的可交互样张（**只导入真实件**，不复制组件内部逻辑）。
 * 真实结构 = 桌（相对定位宿主）→ 纸（正文列）+ `ReaderRail`（**兄弟节点**，不参与纸的滚动）。
 * 纸宽靠 `--read-width` 等比缩小到样张宽度；`--sidebar-w` 在样张里置 0（没有真实侧边栏，
 * 否则"两段各贴线的一端"这条就量不准）；`--rail-panel-h` 收窄以免溢出演示框。
 * ⚠ 挂载线两段的宽度**与 `--read-width` 无关**（v1.9 起）—— 样张的 `smoke.cjs` 会现场改纸宽复核。
 */
function RailDemo({
  label,
  leftPanel = 'toc',
  leftOpen = false,
  controlsOpen = false,
  activeChapter = 12
}: {
  label: string
  leftPanel?: LeftPanelKind
  leftOpen?: boolean
  controlsOpen?: boolean
  /** 当前阅读位置（章号）：目录/笔记的"当前条目"据此滚到正中（2026-09-16 用户定） */
  activeChapter?: number
}): React.JSX.Element {
  const [tocOpen, setTocOpen] = useState(leftOpen)
  const [ctlOpen, setCtlOpen] = useState(controlsOpen)
  const [panel, setPanel] = useState<LeftPanelKind>(leftPanel)
  const [params, setParams] = useState<ReaderParams>(DEFAULT_READER_PARAMS)
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12.5px] text-[var(--muted)]">{label}</span>
      <div
        className="relative h-[300px] w-full"
        data-rail-demo={label}
        style={
          {
            '--read-width': '260px',
            /* 样张里没有真实侧边栏 → 置 0，这样"线"就是演示框本身（贴齐判据才量得准） */
            '--sidebar-w': '0px',
            /* "同高"：两个挂件的高度上限是同一个 token（样张里收窄以免溢出演示框） */
            '--rail-panel-h': '260px'
          } as React.CSSProperties
        }
      >
        <div className="reader-paper absolute inset-0">
          <div className="reader-stage">
            <p className="m-0 text-[13px] leading-[1.9] text-[var(--page-text)]">
              紙（正文列 = 宿主容器）：它的 clientWidth 就是 kookit 的排版寬度依據。點掛載線的左段 / 右段開合掛件。
            </p>
          </div>
        </div>
        <ReaderRail
          tocOpen={tocOpen}
          onTocToggle={() => setTocOpen((v) => !v)}
          tocRows={TOC}
          onTocJump={noop}
          controlsOpen={ctlOpen}
          onControlsToggle={() => setCtlOpen((v) => !v)}
          params={params}
          onParamsChange={(patch) => setParams((p) => ({ ...p, ...patch }))}
          leftPanel={panel}
          onLeftPanelChange={setPanel}
          notes={NOTES}
          onNoteJump={noop}
          onNoteRemove={noop}
          activeChapter={activeChapter}
        />
      </div>
    </div>
  )
}

/**
 * 笔记管理的可交互样张：视图两态 + 文字主次两档 + 选中态（**只给 mock 与回调，不复制组件逻辑**）。
 * 两个控件的形态与真实状态栏一致（视图切换带三角负片；主次切换是普通文字按钮）——
 * 真实位置在笔记管理的**底部状态栏**（STYLE §5.10 的 5 件套），这里为便于试而排在一起。
 */
function NotesDemo(): React.JSX.Element {
  const [view, setView] = useState<NoteView>('masonry')
  const [focus, setFocus] = useState<NoteTextFocus>('body')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** 边界排查开关（用户 2026-09-16 要的"随时改出边缘来"）：见 styles.css 的 `.note-edges` */
  const [edges, setEdges] = useState(false)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-7">
        <button
          className="view-switch"
          title="切换显示模式"
          onClick={() => setView((v) => (v === 'masonry' ? 'grid' : 'masonry'))}
        >
          {view === 'masonry' ? '瀑布流' : '網格'}
        </button>
        <button
          className="text-action text-action--lg"
          title="切换卡片内的文字主次"
          onClick={() => setFocus((f) => (f === 'body' ? 'excerpt' : 'body'))}
        >
          {focus === 'body' ? '批註為主' : '摘錄為主'}
        </button>
        <button
          className="text-action text-action--lg"
          title="显示卡片盒 / 网格跨行盒的边界（排查用，不引起重排）"
          onClick={() => setEdges((v) => !v)}
        >
          {edges ? '隱藏邊界' : '顯示邊界'}
        </button>
        <span className="text-[11px] text-[var(--muted)]">
          ← 三个循环按钮（视图切换带三角负片）。单击卡片 = 选中，双击 = 跳转（本页不跳）
        </span>
      </div>
      {/* 边界开关挂在祖先上即可（两个 token 是继承的 CSS 变量）—— 见 styles.css 的 .note-edges */}
      <div className={edges ? 'note-edges' : ''}>
        <NoteFlow
          view={view}
          items={NOTE_FLOW_ITEMS}
          selectedId={selectedId}
          textFocus={focus}
          onSelect={(it) => setSelectedId(it.note.id)}
          onOpen={noop}
          onContextMenu={noop}
        />
      </div>
    </div>
  )
}

/**
 * 压力场景（`?notes-scale=N`）—— **只产出数字，不预设结论**。
 *
 * 量三件事（都是"刷新"这一类成本的三个面）：
 * - `commitMs`：首屏从挂载到第一帧（N 张卡片的 React 提交 + 布局）；
 * - `settleMs`：瀑布流**跨行数收敛**用时（首帧是文本长度估算值，`ResizeObserver` 实测纠正后才稳）；
 * - `refreshMs`：**整片重渲染**用时（切换文字主次档 = 全部卡片重新渲染，等价于筛选/重读后的刷新）。
 * 结果挂到 `window.__notesScale`，由 `tools/style-gallery/smoke.cjs --scale=N` 读走。
 */
function ScaleProbe({ n, windowing = true }: { n: number; windowing?: boolean }): React.JSX.Element {
  const [items] = useState<NoteFlowItem[]>(() => makeScaleItems(n))
  const [focus, setFocus] = useState<NoteTextFocus>('body')
  const t0 = useRef(performance.now())
  const m = useRef<Partial<ScaleMetrics>>({})

  /** 等位置稳定（连续 250ms 无变化即认为收敛）—— 不碰组件内部，纯从 DOM 观测。
   *  ⚠ 窗口化后 DOM 里只有视口内的条目，所以这里量的是"这一屏"的位置稳定性。 */
  const waitSpansStable = useCallback((cb: () => void) => {
    let last = ''
    let since = performance.now()
    const id = window.setInterval(() => {
      const sig = [...document.querySelectorAll('.note-flow__item')]
        .map((e) => (e as HTMLElement).style.top)
        .join('|')
      const now = performance.now()
      if (sig === '' || sig !== last) {
        last = sig
        since = now
        return
      }
      if (now - since > 250) {
        window.clearInterval(id)
        cb()
      }
    }, 50)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let stop: (() => void) | undefined
    const raf = requestAnimationFrame(() => {
      m.current.commitMs = Math.round(performance.now() - t0.current)
      stop = waitSpansStable(() => {
        m.current.settleMs = Math.round(performance.now() - t0.current)
        // 「刷新」成本：切一次文字主次档 → 全部卡片重渲染
        const t1 = performance.now()
        setFocus((f) => (f === 'body' ? 'excerpt' : 'body'))
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            m.current.refreshMs = Math.round(performance.now() - t1)
            m.current.cardCount = document.querySelectorAll('.note-card').length
            m.current.placedCount = document.querySelectorAll('.note-flow__item').length
            ;(window as unknown as { __notesScale?: ScaleMetrics }).__notesScale = {
              n,
              commitMs: m.current.commitMs ?? -1,
              settleMs: m.current.settleMs ?? -1,
              refreshMs: m.current.refreshMs ?? -1,
              cardCount: m.current.cardCount ?? -1,
              placedCount: m.current.placedCount ?? -1
            }
          })
        )
      })
    })
    return () => {
      cancelAnimationFrame(raf)
      stop?.()
    }
  }, [n, waitSpansStable])

  return (
    <div className="cjk-ui min-h-screen bg-[var(--bg)] px-8 py-7 text-[var(--text)]">
      <p className="m-0 mb-4 text-[12px] text-[var(--muted)]">
        压力场景：{n} 条笔记 · 瀑布流（{windowing ? '窗口化' : '**全量渲染（A/B 对照）**'}）
        —— 结果在 window.__notesScale
      </p>
      <NoteFlow
        view="masonry"
        items={items}
        selectedId={null}
        textFocus={focus}
        windowing={windowing}
        onSelect={noop}
        onOpen={noop}
        onContextMenu={noop}
      />
    </div>
  )
}

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

/** 入口：带 `?notes-scale=N` 时只跑压力场景（测量要干净，不与样张其它节混在一起）。
 *  `&no-window=1` = 关掉窗口化（**A/B 对照**，见 smoke.cjs --no-window）。 */
function Root(): React.JSX.Element {
  const params = new URLSearchParams(window.location.search)
  const scaleN = Number(params.get('notes-scale') ?? '')
  if (!Number.isFinite(scaleN) || scaleN <= 0) return <Gallery />
  return <ScaleProbe n={scaleN} windowing={params.get('no-window') !== '1'} />
}

createRoot(document.getElementById('root') as HTMLElement).render(<Root />)
