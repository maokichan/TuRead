/**
 * 插件管理（主进程）：扫描 / 入口读取 / zip 安装 / 卸载——契约 = `client/plugins/PLUGINS.md`。
 *
 * 信任边界收在这里：渲染层只发 id，入口路径由本管理器**按自己的扫描结果**解析，
 * 渲染层传什么都不被采信（见 readEntry）；zip 安装的文件对话框同样收在主进程，渲染层零参数
 * 零路径。manifest 校验走 `shared/plugin.ts`（与渲染层同判据）；坏 manifest / 坏文件夹进
 * 主进程日志并跳过，**不中断其余插件**。卸载同口径：只认扫描结果、目录围栏防越界。
 * 获取形态（用户 2026-11-10 裁定）= **手动安装**：无任何自动补齐；官方插件经 GitHub Release
 * 分发 zip、走本管道导入；dev 同步（syncFrom）是装配点的豁免政策（`!app.isPackaged`），
 * 不在本类。
 */
import { promises as fs } from 'node:fs'
import type { Dirent } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { unzip } from 'fflate'
import { safeStorage } from 'electron'
import {
  assertFetchableUrl,
  assertSecretName,
  comparePluginVersions,
  validatePluginManifest,
  type PluginManifest
} from '@shared/plugin'

export interface InstalledPlugin extends PluginManifest {
  /** 运行时插件目录的绝对路径（只在本进程内使用，不回传渲染层） */
  dir: string
}

export class PluginManager {
  private byId = new Map<string, InstalledPlugin>()

  constructor(
    /** 运行时插件根目录（<userData>/plugins） */
    private readonly runtimeRoot: string,
    /** 全局 settings 表句柄（密钥保险库的落点；结构与 SqliteStore 的设置方法同形） */
    private readonly storeHandle: {
      getSetting<T>(key: string, fallback: T): Promise<T>
      setSetting(key: string, value: unknown): Promise<void>
    }
  ) {}

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
        const installed: InstalledPlugin = {
          ...res.manifest,
          dir: join(this.runtimeRoot, d.name)
        }
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

  /** zip 包读取上限（字节） */
  private static readonly ZIP_MAX_BYTES = 50 * 1024 * 1024
  /** zip 解压总量上限（字节；防 zip 炸弹） */
  private static readonly ZIP_MAX_UNCOMPRESSED = 100 * 1024 * 1024

  /**
   * 安装（唯一产品获取管道，PLUGINS.md §4）：本地 zip → 双校验 → 原子落位 → 刷新清单。
   * zip 形态（PLUGINS.md §2）：根直接含 `plugin.json`（目录名 = manifest.id），或**恰好一个**
   * 顶层文件夹且其名 = manifest.id；其余形态（0/多顶层目录、无 manifest、路径穿越）一律拒绝。
   * 版本比较（comparePluginVersions）：与已装同版本拒（重装先卸载）、已装更新拒（防降级）、
   * 已装较旧 = 覆盖安装（= 升级路径）；已装 manifest 损坏按 0.0.0 处理（修复通道）。
   * 原子落位 = 解压到 `<id>.incoming` 暂存目录 → 校验入口实物 → 换名；失败清暂存不留半截。
   */
  async installZip(zipPath: string): Promise<InstalledPlugin> {
    const buf = await fs.readFile(zipPath)
    if (buf.byteLength > PluginManager.ZIP_MAX_BYTES) {
      throw new Error(`插件包超过 ${PluginManager.ZIP_MAX_BYTES / 1024 / 1024}MB 上限`)
    }
    const entries = await new Promise<Record<string, Uint8Array>>((resolvePromise, reject) => {
      unzip(new Uint8Array(buf), (err, data) =>
        err ? reject(new Error(`不是有效的 zip 包：${err.message}`)) : resolvePromise(data)
      )
    })
    let total = 0
    for (const [key, data] of Object.entries(entries)) {
      if (key.startsWith('/') || key.includes('\\') || key.split('/').includes('..')) {
        throw new Error(`zip 内出现非法路径：${key}`)
      }
      total += data.byteLength
    }
    if (total > PluginManager.ZIP_MAX_UNCOMPRESSED) {
      throw new Error(`插件包解压后超过 ${PluginManager.ZIP_MAX_UNCOMPRESSED / 1024 / 1024}MB 上限`)
    }
    // 定位 manifest：根形态或唯一顶层文件夹形态（PLUGINS.md §2 的两种合法打包形态）
    const topLevel = new Set<string>()
    for (const key of Object.keys(entries)) {
      if (key.includes('/')) topLevel.add(key.split('/')[0])
    }
    let prefix = ''
    let topDir: string | null = null
    if (entries['plugin.json']) {
      // 根形态：目标目录名直接取 manifest.id
    } else {
      const withManifest = [...topLevel].filter((dir) => entries[`${dir}/plugin.json`])
      if (withManifest.length !== 1) {
        throw new Error('zip 形态不符：plugin.json 须在根，或在恰好一个顶层文件夹内')
      }
      topDir = withManifest[0]
      prefix = `${topDir}/`
    }
    const res = validatePluginManifest(JSON.parse(new TextDecoder().decode(entries[`${prefix}plugin.json`])))
    if (!res.ok) throw new Error(`插件 manifest 无效：${res.error}`)
    const manifest = res.manifest
    if (topDir !== null && topDir !== manifest.id) {
      throw new Error(`zip 内顶层文件夹名（${topDir}）与 manifest.id（${manifest.id}）不一致`)
    }
    const target = resolve(this.runtimeRoot, manifest.id)
    if (!target.startsWith(resolve(this.runtimeRoot) + sep)) {
      throw new Error(`插件 ${manifest.id} 的目录越界`)
    }
    // 版本比较（防降级）；已装 manifest 损坏/缺失按 0.0.0 → 允许覆盖（修复通道）
    let installedVersion = '0.0.0'
    try {
      const parsed = validatePluginManifest(JSON.parse(await fs.readFile(join(target, 'plugin.json'), 'utf8')))
      if (parsed.ok) installedVersion = parsed.manifest.version
    } catch {
      /* 无已装或已装损坏 → 允许覆盖 */
    }
    const cmp = comparePluginVersions(installedVersion, manifest.version)
    if (cmp === 0) throw new Error(`已安装同版本 ${manifest.version}（重装请先卸载）`)
    if (cmp > 0) throw new Error(`已安装更新版本 v${installedVersion}，拒绝降级安装 v${manifest.version}`)
    // 原子落位：暂存目录解压 → 入口实物校验 → 换名；中途失败清暂存
    const temp = resolve(this.runtimeRoot, `${manifest.id}.incoming`)
    try {
      for (const [key, data] of Object.entries(entries)) {
        if (!key.startsWith(prefix) || key === prefix) continue
        const rel = key.slice(prefix.length)
        if (rel === '' || rel.endsWith('/')) continue
        const dest = resolve(temp, rel)
        if (!dest.startsWith(resolve(temp) + sep)) throw new Error(`zip 内路径越界：${key}`)
        await fs.mkdir(dirname(dest), { recursive: true })
        await fs.writeFile(dest, data)
      }
      await fs.access(join(temp, manifest.entry))
      await fs.rm(target, { recursive: true, force: true })
      await fs.rename(temp, target)
    } catch (err) {
      await fs.rm(temp, { recursive: true, force: true }).catch(() => {})
      throw err
    }
    console.log(`[plugins] 已安装插件：${manifest.id} v${manifest.version}`)
    return (await this.list()).find((p) => p.id === manifest.id) as InstalledPlugin
  }

  /**
   * 从来源目录**覆盖同步**插件进运行时目录。中性原语；政策（是否调用）住装配点——
   * main/index.ts 仅在 `!app.isPackaged` 时以 client/plugins 为来源调用（dev 豁免，
   * 用户 2026-11-10 裁定：产品 = 手动安装，打包路径物理触达不到本方法）。
   * 覆盖（不只补缺）才能让「改完源码重启 dev 即生效」；单向覆盖、**不删**运行时目录里的
   * 多余插件（临时装的测试件不受影响）；插件用户数据在 settings 表，覆盖代码不伤数据。
   */
  async syncFrom(sources: string[]): Promise<void> {
    await fs.mkdir(this.runtimeRoot, { recursive: true })
    for (const source of sources) {
      let entries: Dirent[]
      try {
        entries = await fs.readdir(source, { withFileTypes: true })
      } catch {
        continue // 来源目录不存在（如还没建 client/plugins）= 正常态
      }
      for (const d of entries) {
        if (!d.isDirectory()) continue
        try {
          await fs.cp(join(source, d.name), join(this.runtimeRoot, d.name), { recursive: true })
          console.log(`[plugins] dev 同步插件：${d.name}`)
        } catch (err) {
          console.warn(`[plugins] dev 同步失败：${d.name}`, err)
        }
      }
    }
  }

  /**
   * 卸载（PLUGINS.md §3）：删 `<userData>/plugins/<id>/`。围栏判据——
   * ① id 过 manifest 同款格式（不含路径分隔符与点）；② 目录包含校验（纵深防御）；
   * ③ 只认最近一次 list() 的扫描结果（同 readEntry 信任边界）。
   * 无自动补齐（获取形态 = 手动安装）→ 卸载即卸载，不存在「复活」问题。
   * settings 数据（`plugin:<id>` / 密钥）清理由渲染层接手——见 renderer runtime 的 uninstallPlugin。
   */
  async uninstall(id: unknown): Promise<void> {
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      throw new Error('插件 id 非法（要求 /^[a-z0-9][a-z0-9-]*$/）')
    }
    const dir = resolve(this.runtimeRoot, id)
    if (!dir.startsWith(resolve(this.runtimeRoot) + sep)) {
      throw new Error(`插件 ${id} 的目录越界`)
    }
    if (!this.byId.has(id)) throw new Error(`未知插件：${id}`)
    await fs.rm(dir, { recursive: true, force: true })
    this.byId.delete(id)
    console.log(`[plugins] 已卸载插件：${id}`)
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
