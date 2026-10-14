/**
 * 插件 manifest 校验的单测（纯函数；契约 = client/docs/CONTRACTS.md §9.1）。
 * 判据：字段齐、id 合法、entry 是目录内相对 .mjs；坏 manifest 一律拒绝（主进程据此跳过并进日志）。
 */
import { describe, expect, it } from 'vitest'
import { validatePluginManifest } from '@shared/plugin'

const GOOD = {
  id: 'clock',
  name: '時鐘',
  version: '0.1.0',
  entry: 'main.mjs',
  description: '阅读器右段的纯文字时钟。'
}

describe('validatePluginManifest', () => {
  it('合法 manifest 通过并回填规范化形状', () => {
    const res = validatePluginManifest(GOOD)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.manifest.id).toBe('clock')
      expect(res.manifest.entry).toBe('main.mjs')
    }
  })

  it('非对象 / 数组 / null 拒绝', () => {
    expect(validatePluginManifest(null).ok).toBe(false)
    expect(validatePluginManifest(42).ok).toBe(false)
    expect(validatePluginManifest('x').ok).toBe(false)
    expect(validatePluginManifest([]).ok).toBe(false)
  })

  it('缺字段拒绝', () => {
    const { id: _i, ...noId } = GOOD
    const { name: _n, ...noName } = GOOD
    const { version: _v, ...noVersion } = GOOD
    const { entry: _e, ...noEntry } = GOOD
    expect(validatePluginManifest(noId).ok).toBe(false)
    expect(validatePluginManifest(noName).ok).toBe(false)
    expect(validatePluginManifest(noVersion).ok).toBe(false)
    expect(validatePluginManifest(noEntry).ok).toBe(false)
  })

  it('坏 id 拒绝（大写 / 空格 / 下划线 / 空串）', () => {
    for (const id of ['Clock', 'has space', 'has_underscore', '', ' Clock']) {
      expect(validatePluginManifest({ ...GOOD, id }).ok).toBe(false)
    }
  })

  it('越界 entry 拒绝（绝对路径 / .. / 非 mjs）', () => {
    for (const entry of ['/etc/passwd.mjs', 'C:\\evil\\main.mjs', '../outside.mjs', 'a/../../b.mjs', 'main.js']) {
      expect(validatePluginManifest({ ...GOOD, entry }).ok).toBe(false)
    }
  })

  it('entry 反斜杠归一为正斜杠', () => {
    const res = validatePluginManifest({ ...GOOD, entry: 'sub\\main.mjs' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.manifest.entry).toBe('sub/main.mjs')
  })

  it('额外字段被忽略、description 缺省合法', () => {
    const { description: _d, ...noDesc } = GOOD
    const res = validatePluginManifest({ ...noDesc, extra: 'ignored' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.manifest.description).toBeUndefined()
  })
})
