/**
 * 插件运行时（渲染层外壳模块）—— 契约 = `client/docs/CONTRACTS.md` §9，功能 = FEATURES §13。
 *
 * 与 `roomSession` / `logStore` 同一先例：**模块级单例 + 订阅**（不进 ServiceContainer、
 * 不进 React Context）。职责只有三件：
 * ① 拉清单（`plugins:list`，主进程已种子 + 校验）→ 读启用状态（settings 表 `plugins` 键）；
 * ② 逐个激活：`plugins:read-entry` 读回入口源码 → Blob URL 动态 import（CSP `script-src`
 *    因此放行 `blob:`；信任边界 = v1 只装官方插件）→ `activate(api)`；
 * ③ 持有面板注册表（阅读器右段渲染它）与"已安装清单"（设置页渲染它）。
 *
 * 渲染权在宿主：插件只拿到内容区元素（几何/页签/开合/滚动外壳都在 ReaderRail/宿主样式层）。
 */
import { useSyncExternalStore } from 'react'
import { IPC } from '@shared/ipc'
import type { PluginManifest, PluginReaderContext } from '@shared/plugin'
import type { ServiceContainer } from '@core/container'
import { pushLog } from '../features/logStore'

/** 插件注册给宿主的一个右段面板格（页签 key = `plugin:<manifest.id>:<panel.id>`） */
export interface PluginPanel {
  key: `plugin:${string}`
  label: string
  title: string
  /** true = 进房间时让位（该格被房间聊天占用，用户已定 AI 与聊天互斥） */
  hideWhenInRoom: boolean
  /** 挂载：宿主给内容区元素；返回清理函数（卸载时调用）；`signal` 在收起/卸载/禁用时 abort */
  mount: (el: HTMLElement, ctx: { signal: AbortSignal; reader?: PluginReaderContext }) => void | (() => void)
}

/** 设置页「插件」分组的一行 */
export interface InstalledPluginInfo {
  id: string
  name: string
  version: string
  description?: string
  enabled: boolean
  /** 该插件激活失败的原因（可见不静默） */
  error?: string
}

interface PluginState {
  status: 'loading' | 'ready'
  /** 已注册的右段面板格（按激活序；页签序 = 參數 → 聊天 → 插件格） */
  panels: PluginPanel[]
  /** 已安装清单（含被禁用的——设置页要显示开关） */
  installed: InstalledPluginInfo[]
  /** 整体失败（如 IPC 异常）——设置页可见 */
  error?: string
}

let state: PluginState = { status: 'loading', panels: [], installed: [] }
const listeners = new Set<() => void>()

function setState(next: PluginState): void {
  state = next
  for (const fn of listeners) fn()
}

export function subscribePlugins(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getPluginState(): PluginState {
  return state
}

export function usePluginState(): PluginState {
  return useSyncExternalStore(subscribePlugins, getPluginState)
}

/** 阅读器右段消费：已启用的插件面板格 */
export function usePluginPanels(): PluginPanel[] {
  return usePluginState().panels
}

/** 组装一个插件的宿主 API（CONTRACTS §9.2 + v1.1 通用能力）。panels 由本模块持有 */
function makeApi(manifest: PluginManifest, container: ServiceContainer, panels: PluginPanel[]) {
  return {
    registerPanel(panel: {
      id: string
      label: string
      title?: string
      hideWhenInRoom?: boolean
      mount: (el: HTMLElement, ctx: { signal: AbortSignal; reader?: PluginReaderContext }) => void | (() => void)
    }): void {
      if (!panel || typeof panel.id !== 'string' || typeof panel.mount !== 'function') {
        pushLog(`插件 ${manifest.id} 注册了无效的面板（缺 id 或 mount），已忽略`)
        return
      }
      panels.push({
        key: `plugin:${manifest.id}:${panel.id}`,
        label: panel.label,
        title: panel.title ?? panel.label,
        hideWhenInRoom: panel.hideWhenInRoom === true,
        mount: panel.mount
      })
    },
    /** 联网代理（https-only；主进程校验 + 超时 + 体积上限）——CSP 不为此开口 */
    net: {
      async fetch(
        url: string,
        init?: { method?: string; headers?: Record<string, string>; body?: string }
      ): Promise<{ status: number; ok: boolean; contentType: string; body: string }> {
        return (await window.turead.invoke(IPC.pluginsNetFetch, { url, init })) as {
          status: number
          ok: boolean
          contentType: string
          body: string
        }
      }
    },
    /** 密钥保险库（safeStorage 系统级加密；落库是密文，明文只在取用瞬间回到插件手里） */
    secrets: {
      set(name: string, value: string): Promise<void> {
        return window.turead.invoke(IPC.pluginsSecretSet, { pluginId: manifest.id, name, value }) as Promise<void>
      },
      get(name: string): Promise<string> {
        return window.turead.invoke(IPC.pluginsSecretGet, { pluginId: manifest.id, name }) as Promise<string>
      },
      delete(name: string): Promise<void> {
        return window.turead.invoke(IPC.pluginsSecretDelete, { pluginId: manifest.id, name }) as Promise<void>
      }
    },
    storage: {
      async get<T>(key: string, fallback: T): Promise<T> {
        const cfg = await container.store.getSetting<Record<string, unknown>>(`plugin:${manifest.id}`, {})
        return (cfg[key] as T) ?? fallback
      },
      async set(key: string, value: unknown): Promise<void> {
        await container.store.patchSetting(`plugin:${manifest.id}`, { [key]: value })
      }
    },
    log(line: string): void {
      pushLog(`[${manifest.name}] ${line}`)
    }
  }
}

/** 加载（或禁用切换后重载）全部插件。AppShell 挂载时调一次；设置页切换时再调 */
export async function loadPlugins(container: ServiceContainer): Promise<void> {
  setState({ status: 'loading', panels: [], installed: [] })
  let list: Array<PluginManifest & { dir: string }>
  try {
    list = (await window.turead.invoke(IPC.pluginsList)) as Array<PluginManifest & { dir: string }>
  } catch (err) {
    const message = (err as Error).message
    pushLog(`插件清单读取失败：${message}`)
    setState({ status: 'ready', panels: [], installed: [], error: message })
    return
  }
  const cfg = await container.store.getSetting<{ enabled?: Record<string, boolean> }>('plugins', {})
  const panels: PluginPanel[] = []
  const installed: InstalledPluginInfo[] = []
  for (const manifest of list) {
    const enabled = cfg.enabled?.[manifest.id] !== false // 缺省启用（首发插件开箱即用）
    installed.push({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      enabled
    })
    if (!enabled) continue
    try {
      const code = (await window.turead.invoke(IPC.pluginsReadEntry, { id: manifest.id })) as string
      // Blob URL 动态 import：插件代码不参与构建（.mjs 自包含；CSP script-src 已放行 blob:）
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
      try {
        const mod = (await import(/* @vite-ignore */ url)) as {
          activate?: (api: unknown) => void | Promise<void>
        }
        if (typeof mod.activate !== 'function') throw new Error('入口缺少 activate(api) 导出')
        await mod.activate(makeApi(manifest, container, panels))
      } finally {
        URL.revokeObjectURL(url)
      }
      pushLog(`插件已啟用：${manifest.name} v${manifest.version}`)
    } catch (err) {
      const message = (err as Error).message
      const row = installed.find((i) => i.id === manifest.id)
      if (row) row.error = message
      pushLog(`插件 ${manifest.name} 加载失败：${message}`)
    }
  }
  setState({ status: 'ready', panels, installed })
}

/** 设置页切换启用/禁用：落库后重载运行时（禁用 = 不激活，激活中的面板随重载消失） */
export async function setPluginEnabled(
  container: ServiceContainer,
  id: string,
  enabled: boolean
): Promise<void> {
  const cfg = await container.store.getSetting<{ enabled?: Record<string, boolean> }>('plugins', {})
  await container.store.patchSetting('plugins', { enabled: { ...cfg.enabled, [id]: enabled } })
  await loadPlugins(container)
}
