/**
 * 插件通用能力（契约 v1.1）的安全判据单测：联网代理只许 https、密钥名形状。
 * 这两条是**安全判据**——散在 handler 里没有失败即红的断言，迟早被"顺手放宽"。
 */
import { describe, expect, it } from 'vitest'
import { assertFetchableUrl, assertSecretName } from '@shared/plugin'

describe('assertFetchableUrl（插件联网代理）', () => {
  it('https 放行并归一化', () => {
    expect(assertFetchableUrl('https://api.example.com/v1/chat')).toBe('https://api.example.com/v1/chat')
  })

  it('http / 其他协议 / 相对串 / 非串 / 超长 一律拒绝', () => {
    expect(() => assertFetchableUrl('http://api.example.com')).toThrow(/https/)
    expect(() => assertFetchableUrl('file:///c:/windows/win.ini')).toThrow(/https/)
    expect(() => assertFetchableUrl('ftp://x')).toThrow(/https/)
    expect(() => assertFetchableUrl('api.example.com')).toThrow()
    expect(() => assertFetchableUrl('')).toThrow()
    expect(() => assertFetchableUrl(42)).toThrow()
    expect(() => assertFetchableUrl(`https://x.com/${'a'.repeat(2100)}`)).toThrow()
  })
})

describe('assertSecretName（保险库键名）', () => {
  it('字母数字连字符放行', () => {
    expect(assertSecretName('api-key')).toBe('api-key')
    expect(assertSecretName('Key1')).toBe('Key1')
  })

  it('空串 / 空白 / 点 / 下划线 / 超长 拒绝', () => {
    for (const bad of ['', 'a b', 'a.b', 'a_b', 'x'.repeat(65)]) {
      expect(() => assertSecretName(bad)).toThrow()
    }
    expect(() => assertSecretName(null)).toThrow()
  })
})
