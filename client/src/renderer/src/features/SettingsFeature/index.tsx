/**
 * 功能组件：设置（SettingsFeature）
 * 职责：全局设置（外观主题 / 阅读器行为 / 导入行为 / 快捷键清单 / 插件注册表）。
 * 设置经 ILibraryStore 持久化（key: appearance / librarySettings）；
 * 主题以 `data-theme` 应用到 <html>，CSS 语义 token 见 styles.css。
 * ⚠ 阅读器参数已全部收编：高频显示参数与布局模式都在**卡片页參數面**（ReaderFeature 拥有
 * readerSettings 的唯一写者；2026-09-13 布局模式也移出本页）。
 *
 * 批1.22 重构（用户定"不过多引导/去折叠语法/去线"的延伸）：
 * - **无标题**（侧栏「設」已说明这是哪）；**无提示段落**——优秀的交互不需要引导文案；
 *   分组**去线**（纯留白，与卡片页页签去线同方向）。
 * - **布尔语汇 = 關｜開 文字选项**（app 自己 on/off 语汇的第一次定义；原生 checkbox 全灭）。
 * - **快捷键 = 只读清单**（批1.22）：直接渲染意图绑定表（`core/domain/input.ts` 的纯数据），
 *   空键位标「未設」——改键/捕获/冲突检测随配键体系批（先做交互模式目标形态对齐，见 TODO）。
 * - **插件 = 注册表**（批1.22 用户定）：每插件一行（名称 + 啟｜停 + 版本），**配置住使用处**
 *   （卡片页面板），设置页不收配置项——信息过载被"一行一生死"的渲染策略挡住；
 *   "插件声明 config schema、宿主两处渲染"（問 的 key 这类读书前配置）= 贡献点 v2，远期。
 * - 診斷日誌整节移除（用户定"用户不会看"；logStore 管道保留给探针）。
 *
 * 主题模型（2026-09-11 规正，权威 core/domain/theme.ts）：**2 主题 × 2 模式**。
 * 主题（取向）= 純色（黑灰白）｜羊皮紙（暖棕）；模式 = 深｜淺｜跟隨系統（在所选主题内解析）。
 * 持久化形状 = ThemePreference{tone, mode}；旧单一字符串自动迁移（normalizeThemeSetting）。
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { LibrarySettings } from '@core/domain/types'
import { DEFAULT_BINDINGS } from '@core/domain/input'
import {
  normalizeThemeSetting,
  resolveThemePreference,
  type ThemeModeSetting,
  type ThemePreference,
  type ThemeTone
} from '@core/domain/theme'
import type { FeatureProps } from '../types'
import { applyDataThemeResolved } from '../../components/themeTransition'
import { getPluginState, setPluginEnabled, subscribePlugins } from '../../plugins/runtime'

const TONES: { value: ThemeTone; label: string }[] = [
  { value: 'solid', label: '純色' },
  { value: 'parchment', label: '羊皮紙' }
]

const MODES: { value: ThemeModeSetting; label: string }[] = [
  { value: 'light', label: '淺' },
  { value: 'dark', label: '深' },
  { value: 'system', label: '跟隨系統' }
]

const ONOFF: { value: boolean; label: string }[] = [
  { value: false, label: '關' },
  { value: true, label: '開' }
]

const DEFAULT_LIBRARY: LibrarySettings = { view: 'list', importRecursive: false }

/** 键位显示名（normalized key id → 人类读法；只覆盖表里出现过的键） */
const KEY_LABEL: Record<string, string> = {
  arrowright: '→',
  arrowleft: '←',
  pageup: 'PgUp',
  pagedown: 'PgDn',
  escape: 'Esc',
  ' ': 'Space',
  f11: 'F11'
}

function keyLabel(k: string): string {
  return k
    .split('+')
    .map((p) => {
      if (p === 'ctrl') return 'Ctrl'
      if (p === 'alt') return 'Alt'
      if (p === 'shift') return 'Shift'
      return KEY_LABEL[p] ?? p.charAt(0).toUpperCase() + p.slice(1)
    })
    .join('+')
}

/** 意图 → 人类读法（只读清单用；配键体系立项后随绑定表进 domain，供命令面板共用） */
const INTENT_LABEL: Record<string, string> = {
  'app.focusSearch': '聚焦搜尋',
  'app.commandPalette': '命令面板',
  'reader.back': '退回（先全屏→閱讀器）',
  'reader.nextPage': '下一頁',
  'reader.prevPage': '上一頁',
  'reader.spacePage': '翻頁（分頁模式）',
  'reader.toggleToc': '目錄',
  'reader.toggleControls': '參數面',
  'reader.toggleChat': '聊天面（房間內）',
  'reader.toggleCard': '卡片頁',
  'reader.enterFullscreen': '全屏',
  'reader.markSelection': '標記選區',
  'reader.annotateSelection': '批註選區',
  'reader.composerCommit': '提交批註',
  'reader.composerCancel': '取消批註'
}

/** 快捷键清单的域顺序与域标签（表里还没有意图的域不渲染） */
const SCOPES: { scope: string; label: string }[] = [
  { scope: 'app', label: '全局' },
  { scope: 'reader', label: '閱讀器' }
]

function applyDataTheme(pref: ThemePreference): void {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  // 经唯一入口应用：带全局颜色渐隐过渡（themeTransition.ts，批1）
  applyDataThemeResolved(resolveThemePreference(pref, dark))
}

export function SettingsFeature({ container }: FeatureProps): React.JSX.Element {
  const [themePref, setThemePref] = useState<ThemePreference>({ tone: 'solid', mode: 'system' })
  const [importRecursive, setImportRecursive] = useState(false)
  const [readerFullscreen, setReaderFullscreen] = useState(false)
  // 插件（v1.13，契约 = CONTRACTS §9）：订阅插件运行时的"已安装清单"（含被禁用的）
  const plugins = useSyncExternalStore(subscribePlugins, getPluginState)
  const themePrefRef = useRef<ThemePreference>({ tone: 'solid', mode: 'system' })

  // 启动载入已持久化设置；跟随系统时监听系统深浅色切换
  useEffect(() => {
    void container.store.getSetting<{ theme?: unknown; readerFullscreen?: boolean }>('appearance', {}).then((cfg) => {
      // 载入时只应用、不写盘 —— 否则每次启动都产生一次无意义的 JSON 全量重写
      applyThemePref(normalizeThemeSetting(cfg.theme), false)
      setReaderFullscreen(cfg.readerFullscreen === true)
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
      // patchSetting（原子合并）：appearance 键下还有 readerFullscreen 等字段，不能整键覆盖
      if (persist) void container.store.patchSetting('appearance', { theme: pref })
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

  const toggleImportRecursive = useCallback(
    (next: boolean) => {
      setImportRecursive(next)
      // 局部更新：主进程原子合并，避免与书库侧写同一键时互相覆盖
      void container.store.patchSetting('librarySettings', { importRecursive: next })
    },
    [container]
  )

  const toggleReaderFullscreen = useCallback(
    (next: boolean) => {
      setReaderFullscreen(next)
      void container.store.patchSetting('appearance', { readerFullscreen: next })
    },
    [container]
  )

  return (
    <section className="flex flex-col gap-8 py-1">
      <Group title="外觀">
        <OptionRow
          label="主題"
          options={TONES}
          value={themePref.tone}
          onPick={(v) => changeTone(v as ThemeTone)}
        />
        <OptionRow
          label="明暗"
          options={MODES}
          value={themePref.mode}
          onPick={(v) => changeMode(v as ThemeModeSetting)}
        />
      </Group>

      <Group title="閱讀器">
        <OptionRow label="進入時全屏" options={ONOFF} value={readerFullscreen} onPick={toggleReaderFullscreen} />
      </Group>

      <Group title="導入">
        <OptionRow label="包含子文件夾" options={ONOFF} value={importRecursive} onPick={toggleImportRecursive} />
      </Group>

      <Group title="快捷鍵">
        {/* 只读清单（批1.22）：直接渲染意图绑定表；改键随配键体系批（TODO） */}
        {SCOPES.map(({ scope, label }) => {
          const entries = Object.entries(DEFAULT_BINDINGS).filter(([intent]) => intent.startsWith(`${scope}.`))
          if (entries.length === 0) return null
          return (
            <div key={scope} className="flex flex-col gap-1">
              <span className="text-[12.5px] text-[var(--muted)]">{label}</span>
              {entries.map(([intent, keys]) => (
                <div key={intent} className="grid grid-cols-[1fr_auto] items-baseline gap-4">
                  <span className="text-[13px] text-[var(--muted)]">{INTENT_LABEL[intent] ?? intent}</span>
                  <span className={`text-[13px] ${keys.length > 0 ? 'text-[var(--text)]' : 'text-[var(--muted)]'}`}>
                    {keys.length > 0 ? keys.map(keyLabel).join(' / ') : '未設'}
                  </span>
                </div>
              ))}
            </div>
          )
        })}
      </Group>

      <Group title="插件">
        {plugins.installed.length === 0 ? (
          <p className="m-0 text-[13px] text-[var(--muted)]">
            {plugins.error
              ? `插件加載失敗：${plugins.error}`
              : plugins.status === 'loading'
                ? '（正在載入插件…）'
                : '（沒有已安裝的插件）'}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {plugins.installed.map((p) => (
              <div key={p.id} className="flex items-center gap-4">
                <span className="text-[15px]">{p.name}</span>
                <OptionRow
                  label=""
                  options={[
                    { value: true, label: '啟' },
                    { value: false, label: '停' }
                  ]}
                  value={p.enabled}
                  onPick={() => void setPluginEnabled(container, p.id, !p.enabled)}
                />
                <span className="text-[11px] text-[var(--muted)]">
                  v{p.version}
                  {p.error ? `（加載失敗：${p.error}）` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </Group>
    </section>
  )
}

/** 分组：副标题 + 留白（批1.22 去线；取代原 border-t 分割线，§5.7 同步） */
function Group({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="m-0 font-ui text-[15px] font-bold">{title}</h3>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

/** 选项行：标签 + 文字选项组（选中态金棕；布尔 = 關｜開——app 自己 on/off 语汇的唯一定义处） */
function OptionRow<T extends string | boolean>({
  label,
  options,
  value,
  onPick
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onPick: (v: T) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-4">
      {label !== '' && <span className="set-label">{label}</span>}
      <div className="flex items-center gap-3">
        {options.map((o) => (
          <button
            key={String(o.value)}
            className={`set-opt${o.value === value ? ' set-opt--on' : ''}`}
            aria-pressed={o.value === value}
            onClick={() => onPick(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
