/**
 * 功能组件：设置（SettingsFeature）
 * 职责：全局设置（外观主题 / 阅读器布局模式 / **导入行为**）+ 诊断日志（原日志栏移入此处）。
 * 设置经 ILibraryStore 持久化（key: appearance / readerSettings / librarySettings）；
 * 主题以 `data-theme` 应用到 <html>，CSS 语义 token 见 styles.css。
 *
 * 主题模型（2026-09-11 规正，权威 core/domain/theme.ts）：**2 主题 × 2 模式**。
 * 主题（取向）= 純色（黑灰白）｜羊皮紙（暖棕）；模式 = 深｜淺｜跟隨系統（在所选主题内解析）。
 * 持久化形状 = ThemePreference{tone, mode}；旧单一字符串自动迁移（normalizeThemeSetting）。
 * resolved 值（styles.css 的 data-theme）：dark=纯色·深 / light=纯色·浅 / sepia-light=羊皮纸·浅 / sepia-dark=羊皮纸·深。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LibrarySettings, RenderOptions } from '@core/domain/types'
import {
  normalizeThemeSetting,
  resolveThemePreference,
  type ThemeModeSetting,
  type ThemePreference,
  type ThemeTone
} from '@core/domain/theme'
import type { FeatureProps } from '../types'
import { subscribeLog } from '../logStore'

type ReaderMode = NonNullable<RenderOptions['readerMode']>

const TONES: { value: ThemeTone; label: string }[] = [
  { value: 'solid', label: '純色' },
  { value: 'parchment', label: '羊皮紙' }
]

const MODES: { value: ThemeModeSetting; label: string }[] = [
  { value: 'light', label: '淺' },
  { value: 'dark', label: '深' },
  { value: 'system', label: '跟隨系統' }
]

const READER_MODES: { value: ReaderMode; label: string }[] = [
  { value: 'scroll', label: '滾動' },
  { value: 'single', label: '單頁' },
  { value: 'double', label: '雙頁' }
]

/**
 * 正文列宽档位（STYLE.md §5.8 v0.4：全屏的是"纸"不是"正文"）。
 * ⚠ 档位只是**设置页的呈现**；落库的是 px 数值（`readerSettings.readerWidth`）——
 * 为远期"自由调节 + 按屏幕/字号自适应"留余地（STYLE.md §5.9）。
 */
const READER_WIDTHS: { value: number; label: string }[] = [
  { value: 620, label: '窄' },
  { value: 760, label: '中' },
  { value: 920, label: '寬' }
]

const DEFAULT_READER_WIDTH = 760

/** 把列宽写到 documentElement（正文列 CSS 读 --read-width）——与主题同款做法：渲染层不感知设置来源 */
function applyReadWidth(px: number): void {
  const safe = Math.min(1600, Math.max(480, Math.round(px)))
  document.documentElement.style.setProperty('--read-width', `${safe}px`)
}

const DEFAULT_LIBRARY: LibrarySettings = { view: 'list', importRecursive: false }

function applyDataTheme(pref: ThemePreference): void {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.setAttribute('data-theme', resolveThemePreference(pref, dark))
}

export function SettingsFeature({ container }: FeatureProps): React.JSX.Element {
  const [themePref, setThemePref] = useState<ThemePreference>({ tone: 'solid', mode: 'system' })
  const [readerMode, setReaderMode] = useState<ReaderMode>('scroll')
  const [readerWidth, setReaderWidth] = useState(DEFAULT_READER_WIDTH)
  const [importRecursive, setImportRecursive] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const themePrefRef = useRef<ThemePreference>({ tone: 'solid', mode: 'system' })

  // 诊断日志订阅（日志栏移除后在这里查看）
  useEffect(() => {
    return subscribeLog(setLogs)
  }, [])

  // 启动载入已持久化设置；跟随系统时监听系统深浅色切换
  useEffect(() => {
    void container.store.getSetting<{ theme?: unknown }>('appearance', {}).then((cfg) => {
      // 载入时只应用、不写盘 —— 否则每次启动都产生一次无意义的 JSON 全量重写
      applyThemePref(normalizeThemeSetting(cfg.theme), false)
    })
    void container.store.getSetting<{ readerMode?: ReaderMode; readerWidth?: number }>(
      'readerSettings',
      {}
    ).then((cfg) => {
      if (cfg.readerMode) setReaderMode(cfg.readerMode)
      // 列宽是纯 CSS 的（--read-width）→ 载入即生效，无需重开书
      const w = typeof cfg.readerWidth === 'number' ? cfg.readerWidth : DEFAULT_READER_WIDTH
      setReaderWidth(w)
      applyReadWidth(w)
    })
    void container.store
      .getSetting<LibrarySettings>('librarySettings', DEFAULT_LIBRARY)
      .then((cfg) => setImportRecursive(cfg.importRecursive === true))
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => {
      // 仅当模式为"跟随系统"时才需随系统深浅重算 resolved 值
      if (themePrefRef.current.mode === 'system') applyDataTheme(themePrefRef.current)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container])

  const applyThemePref = useCallback(
    (pref: ThemePreference, persist = true) => {
      themePrefRef.current = pref
      setThemePref(pref)
      applyDataTheme(pref)
      if (persist) void container.store.setSetting('appearance', { theme: pref })
    },
    [container]
  )

  const changeTone = useCallback(
    (tone: ThemeTone) => applyThemePref({ ...themePrefRef.current, tone }),
    [applyThemePref]
  )

  const changeMode = useCallback(
    (mode: ThemeModeSetting) => applyThemePref({ ...themePrefRef.current, mode }),
    [applyThemePref]
  )

  const changeReaderMode = useCallback(
    (m: ReaderMode) => {
      setReaderMode(m)
      // 局部更新：与下面 changeReaderWidth 写同一个键，必须原子合并（否则互相覆盖）
      void container.store.patchSetting('readerSettings', { readerMode: m })
    },
    [container]
  )

  const changeReaderWidth = useCallback(
    (w: number) => {
      setReaderWidth(w)
      applyReadWidth(w)
      void container.store.patchSetting('readerSettings', { readerWidth: w })
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
      <h2 className="m-0 font-[var(--font-serif-cn)] text-[18px] font-bold">設置</h2>

      {/* 分组结构（STYLE.md §5.1）：**去掉圆角容器**，用副标题 + 分割线划分 —— 设置项会越来越多 */}
      <Field
        title="外觀主題"
        hint="主題 = 紙的取向（純色黑灰白 / 羊皮紙暖棕）；模式 = 明暗（跟隨系統只影響模式，在所选主题内解析）。"
      >
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-[var(--muted)]">主題</span>
            {TONES.map((t) => (
              <button
                key={t.value}
                onClick={() => changeTone(t.value)}
                className={themePref.tone === t.value ? segActive : segIdle}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-[var(--muted)]">模式</span>
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => changeMode(m.value)}
                className={themePref.mode === m.value ? segActive : segIdle}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </Field>

      <Field
        title="閱讀器"
        hint="佈局模式重開書生效；閱讀寬度 = 正文列寬（即 kookit 的排版寬度依據，當場生效）。閱讀頁本身不留任何欄，顯示設計一律在這裡改。"
      >
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-[var(--muted)]">佈局</span>
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
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-[var(--muted)]">閱讀寬度</span>
            {READER_WIDTHS.map((w) => (
              <button
                key={w.value}
                onClick={() => changeReaderWidth(w.value)}
                className={readerWidth === w.value ? segActive : segIdle}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </Field>

      <Field
        title="導入"
        hint="關閉 = 只導入所選目錄本身；開啟 = 連同其所有子目錄裡的電子書。"
      >
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={importRecursive}
            onChange={toggleImportRecursive}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          導入文件夾時包含子文件夾
        </label>
      </Field>

      <Field title="診斷日誌" className="flex min-h-0 flex-1 flex-col">
        <pre className="m-0 min-h-0 flex-1 overflow-y-auto bg-[var(--log-bg)] p-3 text-[11px] leading-[1.6] whitespace-pre-wrap text-[var(--log-text)]">
          {logs.length === 0 ? '（暫無日誌）' : logs.join('\n')}
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
