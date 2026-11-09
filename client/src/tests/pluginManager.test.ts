/**
 * 插件管理器（主进程）单测：种子（缺则种、已装不动、opt-out 不复活）/ 扫描（坏 manifest 跳过不中断）/
 * 入口读取（只认扫描结果、越界在 manifest 校验阶段就被拒）/ 卸载（种子件可卸 + opt-out、目录围栏）。
 * 契约 = client/docs/CONTRACTS.md §9；PluginManager 只依赖 node:fs + shared/plugin（纯逻辑可无书跑）。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PluginManager } from '../main/plugins'

/** 假 settings 句柄（PluginManager 的第三个构造参数；这些用例不碰密钥，内存版即可） */
const fakeStore = {
  getSetting: async <T,>(_key: string, fallback: T): Promise<T> => fallback,
  setSetting: async (): Promise<void> => {}
}

/** 在 dir 下造一个最小合法插件 */
function makePlugin(dir: string, id: string, entry = 'main.mjs'): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'plugin.json'),
    JSON.stringify({ id, name: id, version: '0.1.0', entry })
  )
  writeFileSync(join(dir, entry), 'export function activate(){}')
}

describe('PluginManager', () => {
  it('seed：缺则种、已装的原样保留（用户数据不被覆盖）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'turead-plugins-'))
    const bundled = join(root, 'bundled')
    makePlugin(join(bundled, 'clock'), 'clock')
    const runtime = join(root, 'runtime')
    const mgr = new PluginManager(runtime, [bundled], fakeStore)
    await mgr.seed()
    expect(existsSync(join(runtime, 'clock', 'plugin.json'))).toBe(true)
    // 用户改过运行时副本 → 再种子不覆盖
    const target = join(runtime, 'clock', 'plugin.json')
    writeFileSync(target, JSON.stringify({ id: 'clock', name: '改過', version: '9.9.9', entry: 'main.mjs' }))
    await mgr.seed()
    expect(JSON.parse(readFileSync(target, 'utf8')).version).toBe('9.9.9')
  })

  it('seed：首发目录不存在 = 正常态（不报错）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'turead-plugins-'))
    const mgr = new PluginManager(join(root, 'runtime'), [join(root, 'no-such-dir')], fakeStore)
    await expect(mgr.seed()).resolves.toBeUndefined()
  })

  it('list：坏 manifest / id 与文件夹名不一致的都跳过，其余照常', async () => {
    const root = mkdtempSync(join(tmpdir(), 'turead-plugins-'))
    makePlugin(join(root, 'clock'), 'clock')
    mkdirSync(join(root, 'broken'), { recursive: true })
    writeFileSync(join(root, 'broken', 'plugin.json'), '{ 不是 JSON')
    makePlugin(join(root, 'mismatch'), 'other')
    const mgr = new PluginManager(root, [], fakeStore)
    const list = await mgr.list()
    expect(list.map((p) => p.id)).toEqual(['clock'])
  })

  it('readEntry：未知 id 拒绝；读回的是入口源码；越界 entry 在校验阶段被拒', async () => {
    const root = mkdtempSync(join(tmpdir(), 'turead-plugins-'))
    makePlugin(join(root, 'clock'), 'clock')
    mkdirSync(join(root, 'evil'), { recursive: true })
    writeFileSync(
      join(root, 'evil', 'plugin.json'),
      JSON.stringify({ id: 'evil', name: 'x', version: '0.0.0', entry: '../clock/main.mjs' })
    )
    const mgr = new PluginManager(root, [], fakeStore)
    await expect(mgr.readEntry('nope')).rejects.toThrow('未知插件')
    const list = await mgr.list()
    expect(list.map((p) => p.id)).toEqual(['clock']) // evil 的 .. 入口被 manifest 校验拒掉
    expect(await mgr.readEntry('clock')).toContain('activate')
    // list 之前（无扫描结果）一律拒绝——渲染层传什么都不被采信
    const fresh = new PluginManager(root, [], fakeStore)
    await expect(fresh.readEntry('clock')).rejects.toThrow('未知插件')
  })

  it('uninstall：种子件可卸（2026-11-10 用户裁定）——记 opt-out，再 seed 不复活', async () => {
    const root = mkdtempSync(join(tmpdir(), 'turead-plugins-'))
    const bundled = join(root, 'bundled')
    makePlugin(join(bundled, 'clock'), 'clock')
    const runtime = join(root, 'runtime')
    // 记忆版 settings 假件（opt-out 清单要能存取）
    const kv = new Map<string, unknown>()
    const memStore = {
      getSetting: async <T,>(key: string, fallback: T): Promise<T> =>
        kv.has(key) ? (kv.get(key) as T) : fallback,
      setSetting: async (key: string, value: unknown): Promise<void> => {
        kv.set(key, value)
      }
    }
    const mgr = new PluginManager(runtime, [bundled], memStore)
    await mgr.seed()
    const list = await mgr.list()
    expect(list[0]?.seeded).toBe(true) // 种子标记 = 设置页「官方隨附」提示，不承载卸载豁免
    await mgr.uninstall('clock')
    expect(existsSync(join(runtime, 'clock'))).toBe(false)
    expect((await mgr.list()).map((p) => p.id)).toEqual([])
    await mgr.seed() // 「缺则种」尊重 opt-out：不再补种已卸载的种子件
    expect(existsSync(join(runtime, 'clock'))).toBe(false)
  })

  it('uninstall：非种子件连目录一起移除，随后的 list 不再出现', async () => {
    const root = mkdtempSync(join(tmpdir(), 'turead-plugins-'))
    const bundled = join(root, 'bundled')
    makePlugin(join(bundled, 'clock'), 'clock')
    const runtime = join(root, 'runtime')
    const mgr = new PluginManager(runtime, [bundled], fakeStore)
    await mgr.seed() // 种入官方件
    makePlugin(join(runtime, 'mine'), 'mine') // 用户后装的非种子件
    const list = await mgr.list()
    expect(list.map((p) => `${p.id}:${p.seeded}`)).toEqual(['clock:true', 'mine:false'])
    await mgr.uninstall('mine')
    expect(existsSync(join(runtime, 'mine'))).toBe(false)
    expect((await mgr.list()).map((p) => p.id)).toEqual(['clock'])
  })

  it('uninstall：非法 / 越界 id 一律拒绝（格式围栏 + 目录包含校验）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'turead-plugins-'))
    makePlugin(join(root, 'clock'), 'clock')
    const mgr = new PluginManager(root, [], fakeStore)
    await mgr.list()
    await expect(mgr.uninstall('../clock')).rejects.toThrow('非法')
    await expect(mgr.uninstall('Clock')).rejects.toThrow('非法')
    await expect(mgr.uninstall('')).rejects.toThrow('非法')
    await expect(mgr.uninstall(undefined)).rejects.toThrow('非法')
    expect(existsSync(join(root, 'clock', 'plugin.json'))).toBe(true)
  })

  it('uninstall：未知 id 拒绝（只认最近一次 list 的扫描结果，同 readEntry 口径）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'turead-plugins-'))
    makePlugin(join(root, 'clock'), 'clock')
    const mgr = new PluginManager(root, [], fakeStore)
    await expect(mgr.uninstall('clock')).rejects.toThrow('未知插件') // 未扫描不采信
    await mgr.list()
    await expect(mgr.uninstall('nope')).rejects.toThrow('未知插件')
    expect(existsSync(join(root, 'clock', 'plugin.json'))).toBe(true)
  })
})
