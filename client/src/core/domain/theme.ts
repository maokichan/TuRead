/**
 * 主题模型（领域层，纯函数，零依赖）。
 * 权威：client/docs/CONTRACTS.md §2（v0.3.0 规正）+ client/docs/STYLE.md §3.4。
 *
 * 模型：**2 主题（tone）× 2 模式（mode）** = 4 套 resolved 取向。
 * - tone（主题/取向）：solid = 纯色（黑灰白）；parchment = 羊皮纸（暖棕）
 * - mode（模式/明暗）：dark 深 / light 浅；**模式可选 'system'**（跟随系统，在所选主题内解析）
 * - resolved 四值 = styles.css 的 data-theme 枚举：
 *   'dark' = 纯色·深，'light' = 纯色·浅，'sepia-light' = 羊皮纸·浅，'sepia-dark' = 羊皮纸·深
 *
 * 消费方：SettingsFeature（两轴选择 + 持久化 ThemePreference）、ReaderFeature（传 resolved 给渲染层）、
 * KookitRenderAdapter（isDark 判定 + 注入深色正文 CSS）。任何组件不得自行解释主题字符串。
 */

/** 4 套 resolved 取向（= styles.css 的 data-theme 枚举） */
export type ResolvedTheme = 'dark' | 'light' | 'sepia-light' | 'sepia-dark'

/** 主题（取向）：表达"这一套是什么纸/什么色相"，不表达明暗 */
export type ThemeTone = 'solid' | 'parchment'

/** 模式（明暗）：深 / 浅；'system' = 跟随系统（在所选主题内解析） */
export type ThemeMode = 'dark' | 'light'
export type ThemeModeSetting = ThemeMode | 'system'

/** 用户偏好（持久化于 config.json 的 appearance.theme）：取向 × 模式，模式可跟随系统 */
export interface ThemePreference {
  tone: ThemeTone
  mode: ThemeModeSetting
}

const TONE_OF: Record<ResolvedTheme, ThemeTone> = {
  dark: 'solid',
  light: 'solid',
  'sepia-light': 'parchment',
  'sepia-dark': 'parchment'
}

const MODE_OF: Record<ResolvedTheme, ThemeMode> = {
  dark: 'dark',
  light: 'light',
  'sepia-light': 'light',
  'sepia-dark': 'dark'
}

/** resolved 主题 -> 取向（tone） */
export function toneOf(theme: ResolvedTheme): ThemeTone {
  return TONE_OF[theme]
}

/** resolved 主题 -> 模式（mode） */
export function modeOf(theme: ResolvedTheme): ThemeMode {
  return MODE_OF[theme]
}

/** 该主题是否为深色模式（夜间模式判定：纯色·深 / 羊皮纸·深） */
export function isDarkResolvedTheme(theme: ResolvedTheme): boolean {
  return MODE_OF[theme] === 'dark'
}

/** 组合 取向 × 模式 -> resolved 主题 */
export function composeTheme(tone: ThemeTone, mode: ThemeMode): ResolvedTheme {
  if (tone === 'parchment') return mode === 'dark' ? 'sepia-dark' : 'sepia-light'
  return mode === 'dark' ? 'dark' : 'light'
}

/** 解析模式设置（'system' → 按系统深浅） */
export function resolveModeSetting(mode: ThemeModeSetting, systemDark: boolean): ThemeMode {
  return mode === 'system' ? (systemDark ? 'dark' : 'light') : mode
}

/** 解析 ThemePreference 为 resolved 主题（跟随系统在【所选主题内】解析） */
export function resolveThemePreference(pref: ThemePreference, systemDark: boolean): ResolvedTheme {
  return composeTheme(pref.tone, resolveModeSetting(pref.mode, systemDark))
}

/**
 * 旧版持久化值迁移（v0.3.0 前是单一字符串 'system'|'dark'|'light'|'sepia-light'|'sepia-dark'|'sepia'）
 * -> ThemePreference。非法值回退 纯色·跟随系统。
 */
export function normalizeThemeSetting(v: unknown): ThemePreference {
  if (v && typeof v === 'object' && 'tone' in v) {
    const tone = (v as ThemePreference).tone
    const mode = (v as ThemePreference).mode
    const toneOk = tone === 'solid' || tone === 'parchment'
    const modeOk = mode === 'dark' || mode === 'light' || mode === 'system'
    if (toneOk && modeOk) return { tone, mode }
    return { tone: 'solid', mode: 'system' }
  }
  switch (v) {
    case 'dark':
      return { tone: 'solid', mode: 'dark' }
    case 'light':
      return { tone: 'solid', mode: 'light' }
    case 'sepia-light':
      return { tone: 'parchment', mode: 'light' }
    case 'sepia-dark':
      return { tone: 'parchment', mode: 'dark' }
    case 'sepia':
      return { tone: 'parchment', mode: 'light' }
    default:
      return { tone: 'solid', mode: 'system' }
  }
}
