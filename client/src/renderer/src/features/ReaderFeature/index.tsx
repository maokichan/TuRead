/**
 * 功能组件：阅读器（ReaderFeature）—— 编排层。域逻辑住同目录钩子：
 *   useReaderParams（参数态与应用）· useReaderOpening（开书/关书与位置持久化）·
 *   useReaderNotes（笔记/划线全生命周期）· useReaderLinks（外链交系统浏览器）·
 *   useRoomFollow（跟随三道闸门）·
 *   useReaderFullscreen（沉浸全屏）· readSessionRecorder（阅读时长）。
 * 打开/关闭受 readerBookId 驱动（状态继承：Library「打开阅读」或 RoomFeature 加入后 host.openReader 触发）。
 *
 * 沉浸态（style/components-reader.md / FEATURES.md 阅读器节）：
 * - **全屏的是"纸"不是"正文"**：外层全屏纸（--page-bg）+ 内层**居中定宽正文列**（--read-width，
 *   由「设置」写入 documentElement）；列宽 = kookit 排版宽度依据（宿主 clientWidth）→ 决定"一行多长"。
 * - **阅读页上没有任何栏**：书名/页码/翻页/目录/关闭都不常驻、也不做"浮现栏"（浮动出来的栏同样是状态栏）。
 *   退出 = Esc（鼠标路径：底面图标栏「書」——卡片模型下图标栏恒可见、阅读态常亮）；翻页 = 键盘 + 分页模式点击区。
 * - 目录 = 阅读卡左缘的**内嵌件**（TocPanel；容器全透明）。
 * - 滚轮在两侧留白上也要能滚 → 纸容器把 wheel 转发给正文列。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BookRecord, NoteColor, NoteMarkStyle, TextAnchor } from '@core/domain/types'
import type { RenderContextMenuRequest } from '@core/ports/render'
import type { PluginReaderContext } from '@shared/plugin'
import type { FeatureProps } from '../types'
import { useReadSessionRecorder } from './readSessionRecorder'
import type { TocRow } from '../../components/TocPanel'
import { ReaderRail, type CardPageKind } from '../../components/ReaderRail'
import type { ReaderParams } from '../../components/ReaderControls'
import { useKeyIntents } from '../../components/useKeyIntents'
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu'
import { NoteComposer } from '../../components/NoteComposer'
import { bridgeIframeDocuments } from '../../components/iframeBridge'
import { sendRoomChat, setRoomFollow, useRoomView } from '../roomSession'
import { readerCardBus, type ReaderCardItem } from '../readerCardBus'
import { usePluginPanels } from '../../plugins/runtime'
import { IPC } from '@shared/ipc'
import { currentTheme, useReaderOpening } from './useReaderOpening'
import { useReaderParams } from './useReaderParams'
import { useReaderLinks } from './useReaderLinks'
import { useReaderNotes } from './useReaderNotes'
import { useRoomFollow } from './useRoomFollow'
import { useReaderFullscreen } from './useReaderFullscreen'

export function ReaderFeature({
  container,
  host,
  readerBookId,
  activeFeature,
  readerTarget
}: FeatureProps): React.JSX.Element {
  // —— 共享态（多个钩子要读写，所有权在本组件）——
  const [book, setBook] = useState<BookRecord | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  /** 目录内嵌件开关（TocPanel）。**默认展示**：只有当用户 `t` 强隐藏时才临时收起；
   *  点条目跳转**不**改变它，且不持久化（重开书回到展示态）。 */
  const [tocOpen, setTocOpen] = useState(true)
  /** 右欄卡片页开合。**默认收起**（卡片页是呼出工具：默认视野 = 纯正文 + 目录，
   *  工具卡召之即来挥之即去）；呼出 = 「卡」按钮 / `` ` ``（总开关）/ `p` / `c` / 命令面板，重开书保持收起。 */
  const [controlsOpen, setControlsOpen] = useState(false)
  /** 布局模式改动 = 重开书（kookit config 只在 open 时消费）；tick 触发打开 effect 重跑 */
  const [reopenTick, setReopenTick] = useState(0)
  /**
   * 右欄卡片页当前内容（单槽位：參數 / 筆記 / 聊天 / 插件格，页签切换）。
   * 默认「參數」（阅读参数是常伴工具，不该被聊天挤掉默认位）；聊天室**只在经房间进入的这本书**上
   * 存在（判据见下面的 `railChat`）。
   */
  const [rightPanel, setRightPanel] = useState<CardPageKind>('params')
  /** 聊天草稿（受控：内容归本组件持有，便于将来键盘意图直接提交；发送成功才清空） */
  const [chatDraft, setChatDraft] = useState('')
  /**
   * 阅读区右键菜单（新建/编辑/移除的主入口）。
   * `anchor` = 右键时的选区锚点（决定「新建」是否可用）；`noteId` = 点在了哪条笔记上。
   */
  const [menu, setMenu] = useState<RenderContextMenuRequest | null>(null)

  const { params, paramsRef, applyParams } = useReaderParams(container)
  useReaderLinks(container)
  const { notes, notesRef, composer, setComposer, focusNote, selection, createMark, armGeom, saveAnnotation, jumpNote, editNote, removeNote } =
    useReaderNotes({ container, host, book, readerTarget, setMenu, setRightPanel, setControlsOpen })
  const { toc, opening, readerMode, setReaderMode, currentChapter } = useReaderOpening({
    container,
    host,
    readerBookId,
    reopenTick,
    applyParams,
    paramsRef,
    setBook,
    setTocOpen,
    setComposer,
    setMenu,
    setRightPanel,
    setChatDraft,
    stageRef
  })
  const { fullscreen } = useReaderFullscreen({ container, activeFeature, readerBookId })

  /**
   * 房间会话共享态 —— 聊天室的**生命周期归属于房间**：
   * - `roomId` 有值 = 正在某个房间里；`editionId` = 这次会话绑定的本地 edition；
   * - **聊天室只在"经房间进入的那本书"的阅读页出现** → 判据 = `roomId && editionId === readerBookId`；
   * - 消息/成员与「房间」功能组件**共用同一份**（`features/roomSession.ts`），不各持一份。
   */
  const room = useRoomView()
  const chatAvailable = Boolean(room.roomId && room.editionId && room.editionId === readerBookId)
  useRoomFollow({ container, host, following: room.following })
  const railChat = chatAvailable && room.roomId
    ? {
        roomId: room.roomId,
        messages: room.messages,
        draft: chatDraft,
        onDraftChange: setChatDraft,
        onSend: (text: string) => {
          void sendRoomChat(text)
            .then(() => setChatDraft(''))
            .catch((err) => host.pushLog(`發送失敗：${(err as Error).message}`))
        },
        following: room.following,
        onToggleFollow: () => setRoomFollow(!room.following)
      }
    : null

  /** 改参数：先应用（当场生效）再原子落库（readerSettings；设置页不再写此键，本面板是唯一写者） */
  const changeParams = useCallback(
    (patch: Partial<ReaderParams>) => {
      const prev = paramsRef.current
      const next = { ...prev, ...patch }
      paramsRef.current = next
      applyParams(next, book?.format === 'PDF')
      // 布局模式是 kookit 渲染配置（open 时消费）→ 落库后重开书（阅读参数分工口径）。
      // readerMode 已含在本包 patch 里，重开等落库完成再触发，保证重开时读到的是新档位
      const saved = container.store.patchSetting('readerSettings', {
        readerWidth: next.readerWidth,
        readerWidthPdf: next.readerWidthPdf,
        pagePadX: next.pagePadX,
        fontSize: next.fontSize,
        lineHeight: next.lineHeight,
        paragraphSpacing: next.paragraphSpacing,
        readerMode: next.readerMode
      })
      if (patch.readerMode !== undefined && patch.readerMode !== prev.readerMode) {
        setReaderMode(patch.readerMode)
        void saved.then(() => setReopenTick((t) => t + 1))
      } else {
        void saved
      }
      // PDF 改纸宽 = 整页重开填充（纸宽变了 PDF 应当跟着缩放填充）。
      // kookit PdfRender 用渲染时刻的 clientWidth 定 canvas 像素、无重排入口，
      // CSS 变量改宽度不会触发重算 —— 原地重开（flushLastLocation 已保位置）是唯一可靠路径；
      // PDF 专属档位（readerWidthPdf）同样走重开。
      const widthChanged =
        (patch.readerWidth !== undefined && patch.readerWidth !== prev.readerWidth) ||
        (patch.readerWidthPdf !== undefined && patch.readerWidthPdf !== prev.readerWidthPdf)
      if (book?.format === 'PDF' && widthChanged) {
        setReopenTick((t) => t + 1)
      }
    },
    [container, applyParams, book, paramsRef, setReaderMode]
  )

  /**
   * 插件面板格（契约 = CONTRACTS §9）：插件运行时注册的右段格，
   * 渲染权在宿主（ReaderRail 给外壳，插件拿内容区元素）。
   * ⚠ 指向失效守卫：插件被禁用/重载后 `rightPanel` 可能指向不存在的格 → 回落「參數」（不能空白）。
   */
  const pluginPanels = usePluginPanels()
  useEffect(() => {
    if (rightPanel.startsWith('plugin:') && !pluginPanels.some((p) => p.key === rightPanel)) {
      setRightPanel('params')
    }
  }, [pluginPanels, rightPanel])

  /**
   * 右欄卡片页 → 命令面板：可用页集变化时重登记
   * （readerCardBus，libraryNavBus 同款模块单例）。清单锚定 `chatAvailable` 布尔与插件注册表 ——
   * **不许锚定 railChat**（消息一变对象就是新的，会造成 register→emit→重渲染 的环）。
   */
  const cardItems = useMemo<ReaderCardItem[]>(
    () => [
      { kind: 'params', label: '參數' },
      { kind: 'notes', label: '筆記' },
      ...(chatAvailable ? [{ kind: 'chat', label: '聊天' }] : []),
      ...pluginPanels
        .filter((p) => !(p.hideWhenInRoom && chatAvailable))
        .map((p) => ({ kind: p.key, label: p.label }))
    ],
    [chatAvailable, pluginPanels]
  )
  useEffect(() => {
    readerCardBus.register(cardItems, (kind) => {
      setRightPanel(kind as CardPageKind)
      setControlsOpen(true)
    })
    return () => readerCardBus.unregister()
  }, [cardItems])

  // 卡片页开合视图 → 总线：AppShell 据此收窄阅读卡并让出右槽位。
  // deps 守住（只在开合/切页时 setView）—— AppShell 重渲染不会反过来触发广播，不成环。
  useEffect(() => {
    readerCardBus.setView({ open: controlsOpen, page: rightPanel })
  }, [controlsOpen, rightPanel])

  // 卡片页的槽位元素（AppShell 卡片区渲染，mount 后才有 DOM）—— portal 目标
  const [cardSlot, setCardSlot] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setCardSlot(document.getElementById('reader-card-slot'))
  }, [])

  /**
   * 阅读上下文句柄（插件契约 v1.1）：插件格经 `ctx.reader` 拿"此刻在读什么"与溯源跳回。
   * `snapshot()` 是**拉取式**的——章号/可见文本在调用瞬间取（保证请求发出时是最新位置），
   * 不随翻页重渲染本组件。
   */
  const readerContext = useMemo<PluginReaderContext | undefined>(() => {
    if (!book) return undefined
    return {
      snapshot: () => {
        const loc = container.render.getPosition()
        return {
          editionId: book.id,
          title: book.metadata.title,
          format: book.format,
          chapterCount: toc.length,
          toc: toc
            .filter((r) => r.chapterDocIndex !== undefined)
            .map((r) => ({ label: r.label, chapterDocIndex: r.chapterDocIndex as number })),
          location: {
            chapterDocIndex: loc.chapterDocIndex,
            chapterTitle: loc.chapterTitle,
            visibleText: loc.text
          }
        }
      },
      jumpToQuote: async (exact, chapterIndex) => {
        // 弱锚点路径（同笔记面板）：按引文重锚，失败退回章级直接跳
        const base = container.render.getPosition()
        const anchor: TextAnchor = {
          norm: {
            chapterIndex: chapterIndex ?? base.chapterDocIndex,
            progression: 0,
            quote: { exact, prefix: '', suffix: '' }
          },
          fragment: null
        }
        const remeasured = await container.render.remeasureAnchor(anchor).catch(() => null)
        await container.render.resolveAnchor(remeasured ?? anchor)
      }
    }
  }, [book, toc, container])

  // 阅读会话记录器（口径 = 失焦暂停/边界落笔/<10s 丢弃，见 readSessionRecorder.ts）：
  // enabled = 阅读态（阅读器激活且开着书）；换书/关标签由 editionId/enabled 变化经卸载路径 flush。
  useReadSessionRecorder(container, activeFeature === 'reader' && readerBookId !== null, readerBookId)

  // 激活到阅读器时热更新主题（设置里改主题后返回阅读器不重开书也生效）
  useEffect(() => {
    if (activeFeature !== 'reader') return
    if (!readerBookId) return
    void container.render.applyTheme(currentTheme())
  }, [activeFeature, readerBookId, container])

  const pageTurn = useCallback(
    async (dir: 'next' | 'prev') => {
      if (!book || opening) return
      try {
        if (dir === 'next') await container.render.next()
        else await container.render.prev()
      } catch (err) {
        // 适配器导航方法未打开即抛错：落到日志里，
        // "重开书偶发空白"这类 rendition 丢失能在这里现形，而不是无声失败
        host.pushLog(`翻页失败：${(err as Error).message}`)
        console.warn('[reader] pageTurn 失败', err)
      }
    },
    [container, book, opening, host]
  )

  /** 目录跳转：透传到渲染层 goToChapter（chapterDocIndex 标尺）。
   *  ⚠ **不收起目录**（目录默认展示，只有用户主动才隐藏）。 */
  const jumpChapter = useCallback(
    async (row: TocRow) => {
      if (row.chapterDocIndex === undefined || !book || opening) return
      try {
        await container.render.goToChapter(row.chapterDocIndex)
        host.pushLog(`跳到：${row.label}`)
      } catch (err) {
        host.pushLog(`跳转失败：${(err as Error).message}`)
      }
    },
    [container, book, opening, host]
  )

  /**
   * 滚轮翻页（分页模式：默认键盘、不提供按钮控件，鼠标滚轮可翻页，像 koodo）。
   * 触控板/平滑滚轮一次手势发一串小 delta → 短窗内累积、过阈值翻一页，随后冷却窗防止连翻。
   * scroll 模式不适用（原生滚动）。返回是否已接管（接管方据此 preventDefault）。
   */
  const wheelState = useRef({ accum: 0, lastAt: 0, turnedAt: 0 })
  const turnByWheel = useCallback(
    (deltaY: number): boolean => {
      if (readerMode === 'scroll') return false
      const now = Date.now()
      const st = wheelState.current
      if (now - st.lastAt > 200) st.accum = 0 // 新手势：丢弃上一手势残留
      st.lastAt = now
      st.accum += deltaY
      if (Math.abs(st.accum) >= 80 && now - st.turnedAt > 350) {
        void pageTurn(st.accum > 0 ? 'next' : 'prev')
        st.accum = 0
        st.turnedAt = now
      }
      return true
    },
    [readerMode, pageTurn]
  )

  /**
   * 滚轮（整个阅读器区接管，含左右点击翻页带——那两条带压在纸面上方，挂在纸上会漏）。
   * - scroll 模式：正文列之外是留白，滚轮落在留白上把位移转给正文列（style/components-reader.md）；
   *   目录/参数面板内部让位（列表自己滚）。
   * - 分页模式（single/double）：滚轮翻页（默认键盘、无按钮控件，像 koodo）。
   *   正文 iframe 内部的滚轮走 iframe 桥（下方 effect），这里只管宿主文档一侧。
   */
  const onReaderWheel = useCallback(
    (e: React.WheelEvent<HTMLElement>): void => {
      if ((e.target as HTMLElement).closest('.toc-list, .reader-controls')) return
      if (readerMode === 'scroll') {
        if ((e.target as HTMLElement).closest('.reader-stage')) return
        const stage = stageRef.current
        if (stage) stage.scrollTop += e.deltaY
        return
      }
      turnByWheel(e.deltaY)
    },
    [readerMode, turnByWheel]
  )

  // 分页模式的滚轮翻页：滚轮事件落在正文 iframe 里不会冒泡到宿主文档（文档边界），
  // 对同源 iframe 文档挂桥接监听（同 useKeyIntents 的按键桥，iframeBridge.ts）。
  // scroll 模式不挂——iframe 内原生滚动自管，拦截反而破坏阅读。
  useEffect(() => {
    if (!book || readerMode === 'scroll') return
    const onWheel = (e: WheelEvent): void => {
      if (turnByWheel(e.deltaY)) e.preventDefault()
    }
    return bridgeIframeDocuments((doc) => {
      doc.addEventListener('wheel', onWheel, { passive: false })
      return () => doc.removeEventListener('wheel', onWheel)
    })
  }, [book, readerMode, turnByWheel])

  // 阅读器键盘——走键鼠意图层（domain/input.ts）：
  // 绑定见 DEFAULT_BINDINGS.reader.*；Space 仅分页模式。
  // Esc 分流：**不收参数面板**——面板是常伴工具，被 Esc 顺手收掉是错误设计；
  // Esc 只做两件事：全屏先退全屏，否则退出阅读器。卡片页开合归「卡」按钮 / `p`。
  // ⚠ enabled 守卫必须给：功能组件常驻挂载，不设守卫书库里按 t/p 会误触阅读器意图
  useKeyIntents(
    'reader',
    {
      'reader.back': () => {
        // 几何标注武装中 → Esc 先解除（比退全屏/退阅读器更近的意图）
        container.render.disarmGeomCapture()
        if (fullscreen) {
          void window.turead.invoke(IPC.winSetFullScreen, false)
          return
        }
        host.closeReader()
      },
      'reader.nextPage': () => void pageTurn('next'),
      'reader.prevPage': () => void pageTurn('prev'),
      'reader.spacePage': () => {
        if (readerMode !== 'scroll') void pageTurn('next')
      },
      'reader.toggleToc': () => setTocOpen((v) => !v),
      // `` ` `` = 右欄卡片页**总开关**：开 → 显示上次的页
      // （首次 = 參數面），关 → 收起；`p`/`c` 语义 = "呼出并切到该面"。
      'reader.toggleCard': () => setControlsOpen((v) => !v),
      // `p` = 「閱讀參數」这一面：卡片开着已在參數页 → 收起（否则"按 p 没反应"）
      'reader.toggleControls': () => {
        if (controlsOpen && rightPanel === 'params') setControlsOpen(false)
        else {
          setRightPanel('params')
          setControlsOpen(true)
        }
      },
      // `c` = 「聊天」这一面：右欄开着且已在聊天上 → 收起；否则切到聊天并展开。
      // 不在房间里（这本书不是经房间进来的）→ 无此面，按键不做事。
      'reader.toggleChat': () => {
        if (!chatAvailable) return
        if (controlsOpen && rightPanel === 'chat') setControlsOpen(false)
        else {
          setRightPanel('chat')
          setControlsOpen(true)
        }
      },
      // F11 = **进入**全屏（幂等，不是切换）—— 退出全屏走 Esc（`reader.back` 的分流）；
      // 离开阅读器时若仍在全屏，由 useReaderFullscreen 的 effect 退出并保持最大化。
      'reader.enterFullscreen': () => {
        void window.turead.invoke(IPC.winSetFullScreen, true)
      },
      // ————— 标记/批注的**键盘接口（预留）** —————
      // 行为已就位、可直接调用；**键位故意留空**（见 domain/input.ts 的"预留"分组）——
      // 待配键方案（用户要设置页可配置 + 研究主流键鼠模式）定下后填 DEFAULT_BINDINGS 即可，
      // 不必再改这里。目标链条：键盘翻页 → 选中 → 集中焦点 → 做笔记，手不离开键盘。
      'reader.markSelection': () => {
        if (selection) void createMark(selection.anchor, 'yellow')
      },
      'reader.annotateSelection': () => {
        if (!selection) return
        setMenu(null)
        setComposer({ anchor: selection.anchor, body: '', fromSelection: true })
      },
      'reader.composerCommit': () => {
        // 提交**当前输入内容** —— 所以面板正文 state 由本组件持有（见 composer 注释）
        if (composer) void saveAnnotation()
      },
      'reader.composerCancel': () => setComposer(null)
    },
    activeFeature === 'reader' && !!book
  )

  // 鼠标侧键在阅读器内翻页。
  // 与书库域的侧键（后退/前进）分工**按功能态**：同一物理键在不同域语义不同。
  // preventDefault 压掉 Chromium 侧键默认的历史导航。
  useEffect(() => {
    if (activeFeature !== 'reader' || !book) return
    const onMouseDown = (e: MouseEvent): void => {
      if (e.button === 3) {
        e.preventDefault()
        void pageTurn('prev')
      } else if (e.button === 4) {
        e.preventDefault()
        void pageTurn('next')
      }
    }
    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [activeFeature, book, pageTurn])

  /**
   * 右键菜单项（阅读器域语义）。
   * 形态由 `ContextMenu` 统一；这里只给语义。
   * - 有选区 → 「標記」四色子菜单 + 「加批註」
   * - 点在已有笔记上 → 「編輯批註」+「移除」
   */
  const markMenuItems = (req: RenderContextMenuRequest): ContextMenuItem[] => {
    const items: ContextMenuItem[] = []
    // 几何标注（笔记 v3，PDF 专用）：无文本层的扫描版选不出文字，拖曳是唯一标注入口。
    // 选色 = 武装时的色（capture 是一次性的，完成后自动解除；Esc 取消）。
    if (book?.format === 'PDF') {
      const geomColor = (mode: 'rect' | 'stroke') =>
        (['yellow', 'green', 'blue', 'red'] as NoteColor[]).map((c) => ({
          label: { yellow: '黃', green: '綠', blue: '藍', red: '赤' }[c],
          swatch: `var(--note-${c})`,
          onClick: () => armGeom(mode, c)
        }))
      items.push({ label: '框選標註', children: geomColor('rect') })
      items.push({ label: '記號筆', children: geomColor('stroke') })
    }
    if (req.anchor) {
      const anchor = req.anchor
      // 色样正交（笔记 v3）：先样后色（样 = 一级子菜单，色 = 二级；ContextMenu 递归渲染）
      const colorItems = (style: NoteMarkStyle) =>
        (['yellow', 'green', 'blue', 'red'] as NoteColor[]).map((c) => ({
          label: { yellow: '黃', green: '綠', blue: '藍', red: '赤' }[c],
          swatch: `var(--${style === 'background' ? 'note' : 'mark-line'}-${c})`,
          onClick: () => void createMark(anchor, c, '', style)
        }))
      const styleLabel: Record<NoteMarkStyle, string> = {
        background: '底紋',
        underline: '劃線',
        wavy: '波浪',
        strikethrough: '刪除線'
      }
      items.push({
        label: '標記',
        children: (['background', 'underline', 'wavy', 'strikethrough'] as NoteMarkStyle[]).map((st) => ({
          label: styleLabel[st],
          children: colorItems(st)
        }))
      })
      items.push({
        label: '加批註',
        // fromSelection：这条输入框是"这次选区"的产物 → 选区一没就跟着关（见 composer 注释）
        onClick: () => setComposer({ anchor, body: '', fromSelection: true })
      })
    }
    if (req.noteId) {
      const noteId = req.noteId
      const target = notesRef.current.find((n) => n.id === noteId)
      if (target) {
        items.push({
          label: '編輯批註',
          onClick: () => setComposer({ anchor: target.anchor, noteId, body: target.body })
        })
        items.push({ label: '移除', onClick: () => void removeNote(target) })
      }
    }
    return items
  }

  return (
    <section
      className="relative h-full select-none"
      onWheel={onReaderWheel}
      // 宿主区（页边留白、点击带）的右键：正文内的右键走适配器的 context-menu 事件
      // （iframe 事件到不了宿主，故两路都要挂，最终汇到同一个菜单 state）
      onContextMenu={(e) => {
        e.preventDefault()
        setComposer(null)
        setMenu({
          x: e.clientX,
          y: e.clientY,
          anchor: selection?.anchor ?? null
        })
      }}
    >
      {/* 全屏纸（纸色铺满内容区）；正文列是它的子元素（宿主容器 = 正文列，见 styles.css .reader-stage）。
          滚轮接管在整个 section 上（含左右点击翻页带），见 onReaderWheel 注释 */}
      <div className="reader-paper absolute inset-0">
        {/* 正文列：id 是 kookit 硬编码契约；列宽 = --read-width（设置写入）→ 决定一行多长 */}
        <div className="reader-stage" id="page-area" ref={stageRef} />
      </div>

      {/* 右键菜单：新建标记/批注、编辑/移除既有笔记。
          阅读页"零控件"不冲突 —— 它随右键生灭，不是常驻控件 */}
      {menu && markMenuItems(menu).length > 0 && (
        <ContextMenu x={menu.x} y={menu.y} items={markMenuItems(menu)} onClose={() => setMenu(null)} />
      )}

      {/* 批注输入：**底部居中的纯色容器，零文字**。
          Enter 提交 / Shift+Enter 换行 / Esc 取消；移除既有笔记只剩右键菜单一条路径 */}
      {composer && (
        <NoteComposer
          value={composer.body}
          onChange={(body) => setComposer((c) => (c ? { ...c, body } : c))}
          onSave={() => void saveAnnotation()}
          onCancel={() => setComposer(null)}
        />
      )}

      {/* 目录内嵌件 + 右欄卡片页 */}
      {book && (
        <ReaderRail
          tocOpen={tocOpen}
          onTocToggle={() => setTocOpen((v) => !v)}
          tocRows={toc}
          onTocJump={(r) => void jumpChapter(r)}
          notes={notes}
          onNoteJump={(n) => void jumpNote(n)}
          onNoteRemove={(n) => void removeNote(n)}
          onNoteEdit={editNote}
          activeChapter={currentChapter}
          focusNote={focusNote}
          controlsOpen={controlsOpen}
          onControlsToggle={() => setControlsOpen((v) => !v)}
          params={params}
          onParamsChange={changeParams}
          rightPanel={rightPanel}
          onRightPanelChange={setRightPanel}
          chat={railChat}
          isPdf={book?.format === 'PDF'}
          pluginPanels={pluginPanels}
          readerContext={readerContext}
          cardSlot={cardSlot}
        />
      )}

      {/* 鼠标左右点击区翻页（z 低于目录，不遮它）。
          ⚠ 只在分页模式（single/double）激活：scroll 模式滚轮优先，点击区会遮住 1/4 边缘的正文选择。 */}
      {book && !opening && readerMode !== 'scroll' && (
        <>
          <button
            className="absolute inset-y-0 left-0 w-1/4"
            aria-label="上一頁（點擊左側）"
            onClick={() => void pageTurn('prev')}
          />
          <button
            className="absolute inset-y-0 right-0 w-1/4"
            aria-label="下一頁（點擊右側）"
            onClick={() => void pageTurn('next')}
          />
        </>
      )}
    </section>
  )
}
