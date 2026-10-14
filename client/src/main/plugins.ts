/**
 * 插件管理（主进程）：官方插件的**种子 / 扫描 / 入口读取**——契约 = `client/docs/CONTRACTS.md` §9。
 *
 * 信任边界收在这里：渲染层只发 id，入口路径由本管理器**按自己的扫描结果**解析，
 * 渲染层传什么都不被采信（见 readEntry）。manifest 校验走 `shared/plugin.ts`（与渲染层同判据）；
 * 坏 manifest / 坏文件夹进主进程日志并跳过，**不中断其余插件**。
 */
import { promises as fs } from 'node:fs'
import type { Dirent } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { safeStorage } from 'electron'
import { assertFetchableUrl, assertSecretName, validatePluginManifest, type PluginManifest } from '@shared/plugin'

export interface InstalledPlugin extends PluginManifest {
  /** 运行时插件目录的绝对路径（只在本进程内使用，不回传渲染层） */
  dir: string
}

export class PluginManager {
  private byId = new Map<string, InstalledPlugin>()

  constructor(
    /** 运行时插件根目录（<userData>/plugins） */
    private readonly runtimeRoot: string,
    /** 首发插件来源目录（dev = client/plugins；打包 = resources/plugins）：种子用 */
    private readonly bundledDirs: string[],
    /** 全局 settings 表句柄（密钥保险库的落点；结构与 SqliteStore 的设置方法同形） */
    private readonly storeHandle: {
      getSetting<T>(key: string, fallback: T): Promise<T>
      setSetting(key: string, value: unknown): Promise<void>
    }
  ) {}

  /** 种子（"缺则种"）：把首发资源里的插件补进运行时目录；已安装的原样保留（用户数据不被覆盖） */
  async seed(): Promise<void> {
    await fs.mkdir(this.runtimeRoot, { recursive: true })
    for (const bundled of this.bundledDirs) {
      let entries: Dirent[]
      try {
        entries = await fs.readdir(bundled, { withFileTypes: true })
      } catch {
        continue // 没有首发插件目录（如 dev 还没建 client/plugins）= 正常态
      }
      for (const d of entries) {
        if (!d.isDirectory()) continue
        const target = join(this.runtimeRoot, d.name)
        try {
          await fs.access(join(target, 'plugin.json'))
          continue // 已安装
        } catch {
          /* 缺 → 种 */
        }
        try {
          await fs.cp(join(bundled, d.name), target, { recursive: true })
          console.log(`[plugins] 已种入插件：${d.name}`)
        } catch (err) {
          console.warn(`[plugins] 种子失败：${d.name}`, err)
        }
      }
    }
  }

  /** 扫描运行时目录：逐文件夹读 plugin.json 并校验；id 必须与文件夹名一致 */
  async list(): Promise<InstalledPlugin[]> {
    this.byId.clear()
    let dirs: Dirent[] = []
    try {
      dirs = await fs.readdir(this.runtimeRoot, { withFileTypes: true })
    } catch {
      return []
    }
    const out: InstalledPlugin[] = []
    for (const d of dirs) {
      if (!d.isDirectory()) continue
      try {
        const raw = JSON.parse(await fs.readFile(join(this.runtimeRoot, d.name, 'plugin.json'), 'utf8'))
        const res = validatePluginManifest(raw)
        if (!res.ok) {
          console.warn(`[plugins] ${d.name} 的 manifest 无效：${res.error}`)
          continue
        }
        if (res.manifest.id !== d.name) {
          console.warn(`[plugins] ${d.name} 的 manifest.id=${res.manifest.id} 与文件夹名不一致，跳过`)
          continue
        }
        const installed: InstalledPlugin = { ...res.manifest, dir: join(this.runtimeRoot, d.name) }
        this.byId.set(installed.id, installed)
        out.push(installed)
      } catch (err) {
        console.warn(`[plugins] ${d.name} 读取失败`, err)
      }
    }
    out.sort((a, b) => a.id.localeCompare(b.id))
    return out
  }

  /** 回入口源码文本。只认最近一次 list() 的结果——路径不来自渲染层（信任边界） */
  async readEntry(id: string): Promise<string> {
    const plugin = this.byId.get(id)
    if (!plugin) throw new Error(`未知插件：${id || '（空）'}`)
    const entryPath = resolve(plugin.dir, plugin.entry)
    if (!entryPath.startsWith(resolve(plugin.dir) + sep)) {
      throw new Error(`插件 ${id} 的入口越界：${plugin.entry}`)
    }
    return fs.readFile(entryPath, 'utf8')
  }

  // ————— 插件通用能力（契约 v1.1；非 AI 专属——联网插件都走这两件）—————

  /**
   * https 代理：插件侧 `api.net.fetch` 的实现。渲染进程对任意 https 开口（改 CSP）比这条
   * 受控通道宽得多，故联网统一走这里：只许 https（assertFetchableUrl）、带超时与体积上限。
   * 只回文本体（LLM/搜索类 API 全是 JSON/文本；要二进制的场景出现时再加响应类型分支）。
   */
  async netFetch(p: {
    url: unknown
    init?: { method?: string; headers?: Record<string, string>; body?: string }
  }): Promise<{ status: number; ok: boolean; contentType: string; body: string }> {
    const url = assertFetchableUrl(p?.url)
    const method = p?.init?.method ?? 'GET'
    if (!/^[A-Z]+$/.test(method)) throw new Error(`非法 HTTP 方法：${method.slice(0, 16)}`)
    const res = await fetch(url, {
      method,
      headers: p?.init?.headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : p?.init?.body,
      signal: AbortSignal.timeout(120_000)
    })
    const contentType = res.headers.get('content-type') ?? ''
    const text = await res.text()
    if (text.length > 20 * 1024 * 1024) throw new Error('插件网络请求的响应超过 20MB 上限')
    return { status: res.status, ok: res.ok, contentType, body: text }
  }

  // 密钥落库的 settings 键（密文；明文永不落盘、永不回传给非请求方）
  private secretKey(pluginId: string, name: string): string {
    // pluginId 在 list() 时已过 manifest 校验；name 走 assertSecretName
    return `plugin-secret:${pluginId}:${name}`
  }

  private requireEncryption(): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('系统不支持密钥加密（safeStorage 不可用），无法保存密钥')
    }
  }

  async secretSet(p: { pluginId: unknown; name: unknown; value: unknown }): Promise<void> {
    this.requireEncryption()
    const { pluginId, name } = this.assertSecretOwner(p)
    if (typeof p?.value !== 'string' || p.value.length === 0 || p.value.length > 8192) {
      throw new Error('密钥值为空或超长')
    }
    const encrypted = safeStorage.encryptString(p.value)
    await this.storeHandle.setSetting(this.secretKey(pluginId, name), encrypted.toString('base64'))
  }

  async secretGet(p: { pluginId: unknown; name: unknown }): Promise<string> {
    this.requireEncryption()
    const { pluginId, name } = this.assertSecretOwner(p)
    const stored = await this.storeHandle.getSetting<string | null>(this.secretKey(pluginId, name), null)
    if (!stored) throw new Error(`密钥未设置：${name}`)
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  }

  async secretDelete(p: { pluginId: unknown; name: unknown }): Promise<void> {
    const { pluginId, name } = this.assertSecretOwner(p)
    await this.storeHandle.setSetting(this.secretKey(pluginId, name), null)
  }

  /** 密钥归属判据：插件 id 过 manifest 同款校验、密钥名过 assertSecretName */
  private assertSecretOwner(p: { pluginId: unknown; name: unknown }): { pluginId: string; name: string } {
    if (typeof p?.pluginId !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(p.pluginId)) {
      throw new Error('密钥所属插件 id 非法')
    }
    return { pluginId: p.pluginId, name: assertSecretName(p?.name) }
  }
}
