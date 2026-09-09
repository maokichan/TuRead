/**
 * 功能组件：设置（SettingsFeature）
 * 职责：全局设置（外观主题 / 阅读器布局模式 / **导入行为**）+ 诊断日志（原日志栏移入此处）。
 * 设置经 ILibraryStore 持久化（key: appearance / readerSettings / librarySettings）；
 * 主题以 `data-theme` 应用到 <html>，CSS 语义 token 见 styles.css。
 *
 * 主题（2026-09-08 定，四套色彩取向）：暗色 / 亮色（一律黑灰白）+ 羊皮纸·亮 / 羊皮纸·暗（暖棕明暗两版）；
 * 另提供"跟随系统"（按系统深浅色在**暗色/亮色**之间切换）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LibrarySettings, RenderOptions } from '@core/domain/types'
import type { FeatureProps } from '../types'
import { subscribeLog } from '../logStore'

type Theme = 'system' | 'dark' | 'light' | 'sepia-light' | 'sepia-dark'
type ResolvedTheme = Exclude<Theme, 'system'>
type ReaderMode = NonNullable<RenderOptions['readerMode']>

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'dark', label: '暗色' },
  { value: 'light', label: '亮色' },
  { value: 'sepia-light', label: '羊皮纸·亮' },
  { value: 'sepia-dark', label: '羊皮纸·暗' }
]

const READER_MODES: { value: ReaderMode; label: string }[] = [
  { value: 'scroll', label: '滚动' },
  { value: 'single', label: '单页' },
  { value: 'double', label: '双页' }
]

const DEFAULT_LIBRARY: LibrarySettings = { view: 'list', importRecursive: false }

/** 跟随系统只在**中性**两套之间切换（羊皮纸是明确取向，不参与自动） */
function resolveTheme(t: Theme): ResolvedTheme {
  if (t === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return t
}

function applyDataTheme(t: Theme): void {
  document.documentElement.setAttribute('data-theme', resolveTheme(t))
}

/** 旧版只有一套 `sepia` → 迁移到 `sepia-light` */
function normalizeTheme(v: unknown): Theme {
  if (v === 'sepia') return 'sepia-light'
  return THEMES.some((t) => t.value === v) ? (v as Theme) : 'system'
}

export function SettingsFeature({ container }: FeatureProps): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>('system')
  const [readerMode, setReaderMode] = useState<ReaderMode>('scroll')
  const [importRecursive, setImportRecursive] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const themeRef = useRef<Theme>('system')

  // 诊断日志订阅（日志栏移除后在这里查看）
  useEffect(() => {
    return subscribeLog(setLogs)
  }, [])

  // 启动载入已持久化设置；跟随系统时监听系统深浅色切换
  useEffect(() => {
    void container.store.getSetting<{ theme?: unknown }>('appearance', {}).then((cfg) => {
      // 载入时只应用、不写盘 —— 否则每次启动都产生一次无意义的 JSON 全量重写
      applyTheme(normalizeTheme(cfg.theme), false)
    })
    void container.store.getSetting<{ readerMode?: ReaderMode }>('readerSettings', {}).then((cfg) => {
      if (cfg.readerMode) setReaderMode(cfg.readerMode)
    })
    void container.store
      .getSetting<LibrarySettings>('librarySettings', DEFAULT_LIBRARY)
      .then((cfg) => setImportRecursive(cfg.importRecursive === true))
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => {
      if (themeRef.current === 'system') applyDataTheme('system')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container])

  const applyTheme = useCallback(
    (t: Theme, persist = true) => {
      themeRef.current = t
      setTheme(t)
      applyDataTheme(t)
      if (persist) void container.store.setSetting('appearance', { theme: t })
    },
    [container]
  )

  const changeReaderMode = useCallback(
    (m: ReaderMode) => {
      setReaderMode(m)
      void container.store.setSetting('readerSettings', { readerMode: m })
    },
    [container]
  )

  const toggleImportRecursive = useCallback(() => {
    setImportRecursive((prev) => {
      const next = !prev
      // 局部更新：主进程原子合并，避免与书库侧写同一键时互相覆盖
      void container.store.patchSetting('librarySettings', { importRecursive: next })
      return next
    })
  }, [container])

  // 选项即文字（STYLE.md §5.1）：无边框无底色，选中态靠 accent 色温（不再用色块按钮）
  const segActive = 'text-action text-action--primary'
  const segIdle = 'text-action'

  return (
    <section className="flex h-full flex-col gap-5">
      <h2 className="m-0 font-[var(--font-serif-cn)] text-[18px] font-bold">设置</h2>

      {/* 分组结构（STYLE.md §5.1）：**去掉圆角容器**，用副标题 + 分割线划分 —— 设置项会越来越多 */}
      <Field
        title="外观主题"
        hint="暗色/亮色为黑灰白取向；羊皮纸为暖棕取向，含亮、暗两版。"
      >
        <div className="flex flex-wrap items-center gap-5">
          {THEMES.map((t) => (
            <button
              key={t.value}
              onClick={() => applyTheme(t.value)}
              className={theme === t.value ? segActive : segIdle}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Field>

      <Field
        title="阅读器布局模式"
        hint="重开书生效。单页/双页为分页模式（iframe 内列滚动）；滚动模式为宿主容器滚动。"
      >
        <div className="flex flex-wrap items-center gap-5">
          {READER_MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => changeReaderMode(m.value)}
              className={readerMode === m.value ? segActive : segIdle}
            >
              {m.label}
            </button>
          ))}
        </div>
      </Field>

      <Field
        title="导入"
        hint="关闭 = 只导入所选目录本身；开启 = 连同其所有子目录里的电子书。"
      >
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={importRecursive}
            onChange={toggleImportRecursive}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          导入文件夹时包含子文件夹
        </label>
      </Field>

      <Field title="诊断日志" className="flex min-h-0 flex-1 flex-col">
        <pre className="m-0 min-h-0 flex-1 overflow-y-auto bg-[var(--log-bg)] p-3 text-[11px] leading-[1.6] whitespace-pre-wrap text-[var(--log-text)]">
          {logs.length === 0 ? '（暂无日志）' : logs.join('\n')}
        </pre>
      </Field>
    </section>
  )
}

/** 设置分组：副标题 + 上分割线（取代原来的圆角容器） */
function Field({
  title,
  hint,
  className = '',
  children
}: {
  title: string
  hint?: string
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className={`border-t border-[var(--border)] pt-4 pb-2 ${className}`}>
      <h3 className="m-0 mb-2 font-[var(--font-serif-cn)] text-[14px] font-bold">{title}</h3>
      {hint && <p className="m-0 mb-3 text-[11px] text-[var(--muted)]">{hint}</p>}
      {children}
    </section>
  )
}
