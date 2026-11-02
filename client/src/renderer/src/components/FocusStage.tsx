import { useEffect, useRef, useState } from 'react'
import type { EditionRecord, ReadingState } from '@core/domain/types'
import { formatRelative, formatSize, progressText } from '../features/format'
import { DEFAULT_BANDS, openFocusStage, type FocusStageSession } from './focusStageEngine'

interface FocusStageProps {
  /** 内容身份（v0.4.0：`EditionRecord`） */
  book: EditionRecord
  readingState: ReadingState | null
  coverUrl: string | null
  /** 当前层末段面包屑文本（"收錄於…"），无可为 null */
  collectionLabel: string | null
  /** 收场补间落定后回调（父级据此清 detailId 卸载本组件） */
  onClose: () => void
  /** 点击雕塑卡（居中卡片）直接打开阅读（用户 2026-11-03 定：卡片可点击） */
  onOpen: () => void
}

/**
 * 书库·详情「聚焦舞台」（单击书卡的全屏焦点态；替代旧详情抽屉的入口，FEATURES §10）。
 *
 * React 壳只管三件事：① 景深幕（blur + 点场外收场）；② Esc；③ 引擎会话的生命周期。
 * 3D 编排全部在 `focusStageEngine.ts`（持久渲染器 / 墙钟补间 / 看门狗 / 文字承载层）。
 * 顶条带（窗控 / 后退前进）在幕外（top = --inset-top）——底面全局件恒可点（DIRECTION §2）。
 * 操作接口（打开阅读 / 移除等）按用户定**先不进来**——动画定稿后再裁落点（TODO「详情页操作清单」）。
 */
export function FocusStage({
  book,
  readingState,
  coverUrl,
  collectionLabel,
  onClose,
  onOpen
}: FocusStageProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const sessionRef = useRef<FocusStageSession | null>(null)
  const [closing, setClosing] = useState(false)
  /** 开场编排未落定前，幕不拦点击——双击打开阅读的第二次点击要能落到书卡上 */
  const [settled, setSettled] = useState(false)
  const cardSizeRef = useRef<{ width: number; height: number } | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const originSelector = `[data-book-id="${CSS.escape(book.id)}"] [data-book-cover]`
    const originEl = document.querySelector(originSelector)
    if (!originEl) {
      /* 防御性可见失败：舞台不弹出的无声路径只有这一条（渲染层日志可查） */
      console.warn('[FocusStage] 原格元素未找到，舞台不弹出：', originSelector)
      return
    }
    const rect = originEl.getBoundingClientRect()
    cardSizeRef.current = { width: rect.width, height: rect.height }
    const m = book.metadata
    const last = readingState?.lastReadAt ? formatRelative(readingState.lastReadAt) : '未閱讀'
    const progress = progressText(readingState)
    const time = readingState?.totalReadMs
      ? `共 ${Math.max(1, Math.round(readingState.totalReadMs / 60000))} 分鐘`
      : '共 —'
    const phy = `${book.format} · ${formatSize(book.fingerprint.size)}`
    const desc = m.description?.trim()
    const texts = [
      `${last}　·　${progress}`,
      `${phy}　·　${time}`,
      desc ? `描述：${desc}` : `來源：${book.filePath}`,
      collectionLabel ? `收錄於「${collectionLabel}」` : phy,
      `${progress}　·　${last}`
    ]
    const session = openFocusStage({
      host,
      originRect: rect,
      originSelector,
      title: m.title || '未命名',
      coverUrl,
      texts,
      bands: DEFAULT_BANDS,
      reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      onExited: () => onCloseRef.current(),
      onSettled: () => setSettled(true)
    })
    sessionRef.current = session
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') sessionRef.current?.close()
    }
    document.addEventListener('keydown', onKey)
    /* 主题切换 → 重建纹理（颜色唯一来源 = styles.css 的 data-theme token） */
    const themeObs = new MutationObserver(() => session.refreshTheme())
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      document.removeEventListener('keydown', onKey)
      themeObs.disconnect()
      session.dispose()
    }
    // 一次性编排：生命周期绑定在 book 上（父级以 key={book.id} 保证换书即重挂）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id])

  /* 封面异步就位 / 变化 → 补画（不重播编排） */
  useEffect(() => {
    sessionRef.current?.setCover(coverUrl)
  }, [coverUrl])

  const requestClose = (): void => {
    if (closing) return
    setClosing(true)
    sessionRef.current?.close()
  }

  return (
    <>
      {/* 景深幕：光学失焦（不压色）；点击场外 = 收场。收场比进 faster（P5：出比进快） */}
      <div
        aria-hidden
        onClick={requestClose}
        className={`fixed inset-x-0 bottom-0 top-[var(--inset-top)] z-[var(--z-drawer)] bg-transparent backdrop-blur-[var(--scrim-blur)] transition-opacity ${closing ? 'duration-[var(--dur-veil)] opacity-0' : 'duration-[var(--dur-view)] opacity-100'} ${settled && !closing ? 'pointer-events-auto' : 'pointer-events-none'}`}
      />
      {/* WebGL 舞台：指针全穿透（关闭路径 = scrim / Esc）；雕塑卡命中层唯一例外 */}
      <div
        ref={hostRef}
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 top-[var(--inset-top)] z-[var(--z-drawer)]"
      >
        {settled && !closing && cardSizeRef.current && (
          /* 雕塑卡（居中卡片）本身可点击 = 直接打开阅读（用户 2026-11-03 定）。
             命中区 = 卡片落定矩形（容器正中），出现于编排落定后、收场即撤 */
          <button
            type="button"
            aria-label={`打開《${book.metadata.title || '未命名'}》`}
            onClick={() => onOpenRef.current()}
            className="pointer-events-auto absolute left-1/2 top-1/2 z-[var(--z-menu)] -translate-x-1/2 -translate-y-1/2 cursor-pointer"
            style={{ width: cardSizeRef.current.width, height: cardSizeRef.current.height }}
          />
        )}
      </div>
    </>
  )
}
