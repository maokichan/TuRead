/**
 * 插件 manifest 契约与校验（纯函数，零依赖）—— 契约 = `client/docs/CONTRACTS.md` §9。
 * 主进程（扫描运行时插件文件夹）与渲染层（展示）共用同一份判据；坏 manifest 一律拒绝并进日志，
 * **不静默**（缺失要可见）。
 */

export interface PluginManifest {
  /** /^[a-z0-9][a-z0-9-]*$/；= 文件夹名；运行时目录与设置键的命名空间 */
  id: string
  /** 展示名 */
  name: string
  /** semver 形态字符串（v1 种子策略 = "缺则种"，版本比较后置） */
  version: string
  /** 入口 ESM 相对路径（必须在插件目录内；禁止绝对路径与 `..`） */
  entry: string
  description?: string
}

export type PluginManifestResult =
  | { ok: true; manifest: PluginManifest }
  | { ok: false; error: string }

const ID_RE = /^[a-z0-9][a-z0-9-]*$/

function str(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

/** 校验 manifest。判据：字段齐、id 合法、entry 是目录内的相对 .mjs 路径（禁绝对路径与 `..`）。 */
export function validatePluginManifest(raw: unknown): PluginManifestResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'manifest 必须是 JSON 对象' }
  }
  const o = raw as Record<string, unknown>
  if (!str(o['id']) || typeof o['id'] !== 'string' || !ID_RE.test(o['id'])) {
    return { ok: false, error: 'id 缺失或非法（要求 /^[a-z0-9][a-z0-9-]*$/）' }
  }
  if (!str(o['name'])) return { ok: false, error: 'name 缺失' }
  if (!str(o['version'])) return { ok: false, error: 'version 缺失' }
  if (!str(o['entry'])) return { ok: false, error: 'entry 缺失' }
  const entry = (o['entry'] as string).replaceAll('\\', '/')
  if (entry.startsWith('/') || /^[A-Za-z]:/.test(entry)) {
    return { ok: false, error: 'entry 必须是相对路径' }
  }
  if (entry.split('/').includes('..')) {
    return { ok: false, error: 'entry 不得包含 ..（越界）' }
  }
  if (!entry.endsWith('.mjs')) {
    return { ok: false, error: 'entry 必须是 .mjs（ESM 入口）' }
  }
  const description = o['description']
  const manifest: PluginManifest = {
    id: o['id'],
    name: (o['name'] as string).slice(0, 64),
    version: (o['version'] as string).slice(0, 32),
    entry,
    ...(str(description) ? { description: description.slice(0, 200) } : {})
  }
  return { ok: true, manifest }
}
