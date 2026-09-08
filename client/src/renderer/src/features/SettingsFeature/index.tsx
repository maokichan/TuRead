/**
 * 功能组件：设置（SettingsFeature）
 * 职责：更改整个程序的设置（外观主题[含跟随系统] / 阅读器布局模式）+ 诊断日志（原日志栏移入此处）。
 * 设置经 ILibraryStore 持久化（key: appearance / readerSettings）；
 * 主题以 `data-theme` 应用到 <html>，CSS 语义 token 见 styles.css（第三方可整套覆盖建自定义主题）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RenderOptions } from '@core/domain/types'
import type { FeatureProps } from '../types'
import { subscribeLog } from '../logStore'

type Theme = 'system' | 'dark' | 'sepia' | 'light'
type ResolvedTheme = Exclude<Theme, 'system'>
type ReaderMode = NonNullable<RenderOptions['readerMode']>

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'dark', label: '暗色' },
  { value: 'sepia', label: '羊皮纸' },
  { value: 'light', label: '亮色' }
]

const READER_MODES: { value: ReaderMode; label: string }[] = [
  { value: 'scroll', label: '滚动' },
  { value: 'single', label: '单页' },
  { value: 'double', label: '双页' }
]

function resolveTheme(t: Theme): ResolvedTheme {
  if (t === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return t
}

function applyDataTheme(t: Theme): void {
  document.documentElement.setAttribute('data-theme', resolveTheme(t))
}

export function SettingsFeature({ container }: FeatureProps): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>('system')
  const [readerMode, setReaderMode] = useState<ReaderMode>('scroll')
  const [logs, setLogs] = useState<string[]>([])
  const themeRef = useRef<Theme>('system')

  // 诊断日志订阅（日志栏移除后在这里查看）
  useEffect(() => {
    return subscribeLog(setLogs)
  }, [])

  // 启动载入已持久化设置；跟随系统时监听系统深浅色切换
  useEffect(() => {
    void container.store.getSetting<{ theme?: Theme }>('appearance', {}).then((cfg) => {
      // 载入时只应用、不写盘 —— 否则每次启动都产生一次无意义的 JSON 全量重写
      applyTheme(cfg.theme ?? 'system', false)
    })
    void container.store.getSetting<{ readerMode?: ReaderMode }>('readerSettings', {}).then((cfg) => {
      if (cfg.readerMode) setReaderMode(cfg.readerMode)
    })
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

  const segActive = 'border-transparent bg-[var(--accent)] text-[var(--on-accent)]'
  const segIdle =
    'border-[var(--border)] bg-[var(--panel-2)] hover:border-[var(--accent)] hover:text-[var(--accent)]'

  return (
    <section className="flex h-full flex-col gap-4">
      <h2 className="m-0 text-[15px]">设置</h2>

      <div className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] text-[var(--muted)]">外观主题</span>
          <div className="flex flex-wrap gap-2">
            {THEMES.map((t) => (
              <button
                key={t.value}
                onClick={() => applyTheme(t.value)}
                className={`rounded-lg border px-3 py-1.5 text-[13px] ${
                  theme === t.value ? segActive : segIdle
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] text-[var(--muted)]">阅读器布局模式（重开书生效）</span>
          <div className="flex flex-wrap gap-2">
            {READER_MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => changeReaderMode(m.value)}
                className={`rounded-lg border px-3 py-1.5 text-[13px] ${
                  readerMode === m.value ? segActive : segIdle
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-[var(--muted)]">
            单页/双页为分页模式（iframe 内列滚动）；滚动模式为宿主容器滚动。
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <h3 className="mb-1.5 mt-1 text-[12.5px] tracking-[0.6px] text-[var(--muted)] uppercase">诊断日志</h3>
        <pre className="m-0 min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--log-bg)] p-3 font-[var(--mono)] text-[11px] leading-[1.6] whitespace-pre-wrap text-[var(--log-text)]">
          {logs.length === 0 ? '（暂无日志）' : logs.join('\n')}
        </pre>
      </div>
    </section>
  )
}
