/**
 * 插件管理器（主进程）单测：syncFrom（dev 同步：覆盖、不删多余、缺源目录正常）/
 * 扫描（坏 manifest 跳过不中断）/ 入口读取（只认扫描结果、越界在 manifest 校验阶段就被拒）/
 * installZip（根/文件夹形态、防降级、路径围栏、形态拒绝）/ 卸载（目录围栏、卸后可重装）。
 * 契约 = client/plugins/PLUGINS.md；PluginManager 只依赖 node:fs + fflate + shared/plugin（纯逻辑可无书跑）。
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { zipSync } from 'fflate'
import { PluginManager } from '../main/plugins'

/** 假 settings 句柄（PluginManager 的第二个构造参数；这些用例不碰密钥，内存版即可） */
const fakeStore = {
  getSetting: async <T,>(_key: string, fallback: T): Promise<T> => fallback,
  setSetting: async (): Promise<void> => {}
}

/** 在 dir 下造一个最小合法插件 */
function makePlugin(dir: string, id: string, entry = 'main.mjs', version = '0.1.0'): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'plugin.json'),
    JSON.stringify({ id, name: id, version, entry })
  )
  writeFileSync(join(dir, entry), 'export function activate(){}')
}

const enc = new TextEncoder()

/** 造 zip 包（写盘返回路径）——installZip 走真实文件读取 */
function makeZip(root: string, name: string, files: Record<string, string>): string {
  const zipped = zipSync(
    Object.fromEntries(Object.entries(files).map(([k, v]) => [k, enc.encode(v)]))
  )
  const zipPath = join(root, name)
  writeFileSync(zipPath, Buffer.from(zipped))
  return zipPath
}

const manifestJson = (id: string, version: string): string =>
  JSON.stringify({ id, name: id, version, entry: 'main.mjs' })

describe('PluginManager', () => {
  it('syncFrom：复制来源插件、重复同步覆盖（改源码重启即生效）、不删运行时多余插件', async () => {
    const root = mkdtempSync(join(tmpdir(), 'turead-plugins-'))
    const workspace = join(root, 'workspace')
    makePlugin(join(workspace, 'clock'), 'clock')
    const runtime = join(root, 'runtime')
    const mgr = new PluginManager(runtime, fakeStore)
    await mgr.syncFrom([workspace])
    expect(existsSync(join(runtime, 'clock', 'plugin.json'))).toBe(true)
    // 改源码 → 再同步覆盖
    writeFileSync(join(workspace, 'clock', 'main.mjs'), 'export function activate(){/*v2*/}')
    await mgr.syncFrom([workspace])
    expect(readFileSync(join(runtime, 'clock', 'main.mjs'), 'utf8')).toContain('/*v2*/')
    // 运行时里的多余插件（临时装的）不被删除
    makePlugin(join(runtime, 'mine'), 'mine')
    await mgr.syncFrom([workspace])
    expect(existsSync(join(runtime, 'mine', 'plugin.json'))).toBe(true)
  })

  it('syncFrom：来源目录不存在 = 正常态（不报错）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'turead-plugins-'))
    const mgr = new PluginManager(join(root, 'runtime'), fakeStore)
    await expect(mgr.syncFrom([join(root, 'no-such-dir')])).resolves.toBeUndefined()
  })

  it('list：坏 manifest / id 与文件夹名不一致的都跳过，其余照常', async () => {
    const root = mkdtempSync(join(tmpdir(), 'turead-plugins-'))
    makePlugin(join(root, 'clock'), 'clock')
    mkdirSync(join(root, 'broken'), { recursive: true })
    writeFileSync(join(root, 'broken', 'plugin.json'), '{ 不是 JSON')
    makePlugin(join(root, 'mismatch'), 'other')
    const mgr = new PluginManager(root, fakeStore)
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
    const mgr = new PluginManager(root, fakeStore)
    await expect(mgr.readEntry('nope')).rejects.toThrow('未知插件')
    const list = await mgr.list()
    expect(list.map((p) => p.id)).toEqual(['clock']) // evil 的 .. 入口被 manifest 校验拒掉
    expect(await mgr.readEntry('clock')).toContain('activate')
    // list 之前（无扫描结果）一律拒绝——渲染层传什么都不被采信
    const fresh = new PluginManager(root, fakeStore)
    await expect(fresh.readEntry('clock')).rejects.toThrow('未知插件')
  })

  it('installZip：根形态（plugin.json 在 zip 根）安装成功，目录名 = manifest.id', async () => {
    const root = mkdtempSync(join(tmpdir(), 'turead-plugins-'))
    const runtime = join(root, 'runtime')
    const mgr = new PluginManager(runtime, fakeStore)
    const zipPath = makeZip(root, 'p.zip', {
      'plugin.json': manifestJson('sample', '0.1.0'),
      'main.mjs': 'export function activate(){}',
      'lib/util.mjs': 'export const x = 1'
    })
    const installed = await mgr.installZip(zipPath)
    expect(installed.id).toBe('sample')
    expect(existsSync(join(runtime, 'sample', 'main.mjs'))).toBe(true)
    expect(existsSync(join(runtime, 'sample', 'lib', 'util.mjs'))).toBe(true)
    expect((await mgr.list()).map((p) => p.id)).toEqual(['sample'])
  })

  it('installZip：文件夹形态（唯一顶层文件夹含 manifest）安装成功；顶层文件夹名不符拒绝', async () => {
    const root = mkdtempSync(join(tmpdir(), 'turead-plugins-'))
    const runtime = join(root, 'runtime')
    const mgr = new PluginManager(runtime, fakeStore)
    const ok = makeZip(root, 'ok.zip', {
      'sample/plugin.json': manifestJson('sample', '0.1.0'),
      'sample/main.mjs': 'export function activate(){}'
    })
    await mgr.installZip(ok)
    expect(existsSync(join(runtime, 'sample', 'main.mjs'))).toBe(true)
    // 顶层文件夹名 ≠ manifest.id → 拒绝
    const bad = makeZip(root, 'bad.zip', {
      'wrongname/plugin.json': manifestJson('sample', '0.1.0'),
      'wrongname/main.mjs': 'export function activate(){}'
    })
    await expect(mgr.installZip(bad)).rejects.toThrow('不一致')
  })

  it('installZip：同版本拒、低版本拒（防降级）、高版本覆盖（= 升级路径）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'turead-plugins-'))
    const runtime = join(root, 'runtime')
    const mgr = new PluginManager(runtime, fakeStore)
    const v010 = makeZip(root, 'v010.zip', {
      'plugin.json': manifestJson('sample', '0.1.0'),
      'main.mjs': 'export function activate(){}'
    })
    await mgr.installZip(v010)
    await expect(mgr.installZip(v010)).rejects.toThrow('同版本')
    const v009 = makeZip(root, 'v009.zip', {
      'plugin.json': manifestJson('sample', '0.0.9'),
      'main.mjs': 'export function activate(){}'
    })
    await expect(mgr.installZip(v009)).rejects.toThrow('降级')
    const v020 = makeZip(root, 'v020.zip', {
      'plugin.json': manifestJson('sample', '0.2.0'),
      'main.mjs': 'export function activate(){/*升级*/}'
    })
    await mgr.installZip(v020)
    expect(JSON.parse(readFileSync(join(runtime, 'sample', 'plugin.json'), 'utf8')).version).toBe('0.2.0')
  })

  it('installZip：坏 zip / 路径穿越 / 多顶层目录 / 无 manifest 一律拒绝', async () => {
    const root = mkdtempSync(join(tmpdir(), 'turead-plugins-'))
    const runtime = join(root, 'runtime')
    const mgr = new PluginManager(runtime, fakeStore)
    const notZip = join(root, 'not.zip')
    writeFileSync(notZip, Buffer.from('这不是 zip'))
    await expect(mgr.installZip(notZip)).rejects.toThrow('不是有效的 zip')
    const traversal = makeZip(root, 'traversal.zip', {
      'plugin.json': manifestJson('sample', '0.1.0'),
      'main.mjs': 'export function activate(){}',
      '../evil.txt': enc.encode('x').toString()
    })
    await expect(mgr.installZip(traversal)).rejects.toThrow('非法路径')
    const multi = makeZip(root, 'multi.zip', {
      'a/plugin.json': manifestJson('a', '0.1.0'),
      'b/plugin.json': manifestJson('b', '0.1.0')
    })
    await expect(mgr.installZip(multi)).rejects.toThrow('形态不符')
    const noManifest = makeZip(root, 'none.zip', { 'readme.txt': '没有 manifest' })
    await expect(mgr.installZip(noManifest)).rejects.toThrow('形态不符')
    expect(await mgr.list()).toEqual([])
  })

  it('uninstall 后同名同版本可重装（无任何自动补齐，卸载即卸载）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'turead-plugins-'))
    const runtime = join(root, 'runtime')
    const mgr = new PluginManager(runtime, fakeStore)
    const zipPath = makeZip(root, 'p.zip', {
      'plugin.json': manifestJson('sample', '0.1.0'),
      'main.mjs': 'export function activate(){}'
    })
    await mgr.installZip(zipPath)
    await mgr.uninstall('sample')
    expect(existsSync(join(runtime, 'sample'))).toBe(false)
    await mgr.installZip(zipPath) // 同版本也能装——卸载后没有「已装同版本」一说
    expect(existsSync(join(runtime, 'sample', 'plugin.json'))).toBe(true)
  })

  it('uninstall：非法 / 越界 id 一律拒绝（格式围栏 + 目录包含校验）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'turead-plugins-'))
    makePlugin(join(root, 'clock'), 'clock')
    const mgr = new PluginManager(root, fakeStore)
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
    const mgr = new PluginManager(root, fakeStore)
    await expect(mgr.uninstall('clock')).rejects.toThrow('未知插件') // 未扫描不采信
    await mgr.list()
    await expect(mgr.uninstall('nope')).rejects.toThrow('未知插件')
    expect(existsSync(join(root, 'clock', 'plugin.json'))).toBe(true)
  })
})
