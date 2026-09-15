/**
 * 存储迁移器单测（T1 旧 JSON / T2 多 .db → 全局单库）。
 * 依据：`client/docs/DATA_MODEL.md` §6.3 状态转移表。
 *
 * ⚠ **为什么只测纯函数、不在 vitest 里开 SQLite**：`better-sqlite3` 在本机是按 **Electron ABI**
 * 重建的（`npm run rebuild:sqlite`，见 DATA_MODEL §1/§5），普通 Node 进程加载会 ABI 不匹配。
 * 所以这里钉住迁移里**最容易写错的那几段纯映射**（模式改名、旧行→edition 参数、阅读状态拆表、
 * 路径归一的跨平台口径），而"真的把旧 .db 合并进新库"由 Electron 侧的探针跑真链路验证
 * —— 项目的分工口径是「单测验判据、探针验链路」。
 */
import { describe, expect, it } from 'vitest'
import {
  legacyRowToEditionParams,
  legacyRowToReadingState,
  mapLibraryMode,
  normalizeDir
} from './migrate'

describe('mapLibraryMode（库模式术语改名，DATA_MODEL §6.2）', () => {
  it("旧的 'source'（虚拟映射/跟踪真实文件夹）→ 新的 'mapped'", () => {
    expect(mapLibraryMode('source')).toBe('mapped')
  })

  it("旧的 'virtual'（自建書箱）→ 新的 'curated'", () => {
    expect(mapLibraryMode('virtual')).toBe('curated')
  })

  it('缺省/未知一律按自建库处理（旧默认库就是这样：全部书在根层）', () => {
    expect(mapLibraryMode(undefined)).toBe('curated')
    expect(mapLibraryMode('')).toBe('curated')
    expect(mapLibraryMode('whatever')).toBe('curated')
  })
})

describe('normalizeDir（holdings.parent_path 的口径）', () => {
  it('去尾分隔符', () => {
    expect(normalizeDir('C:\\books\\a\\')).toBe('C:\\books\\a')
    expect(normalizeDir('C:\\books\\a/')).toBe('C:\\books\\a')
  })

  it('正斜杠统一成反斜杠（同一目录只有一种写法，映射库的层级过滤才可比）', () => {
    expect(normalizeDir('C:/books/a')).toBe('C:\\books\\a')
  })

  it('null/undefined → null（无路径的收录不该有 parent_path）', () => {
    expect(normalizeDir(null)).toBeNull()
    expect(normalizeDir(undefined)).toBeNull()
  })

  it('⚠ 已知边界：不做大小写归一（两个写法会各自成层；登记在 TODO 工程组）', () => {
    expect(normalizeDir('C:\\Books\\A')).not.toBe(normalizeDir('c:\\books\\a'))
  })
})

describe('legacyRowToEditionParams（旧行 → v3 edition 参数）', () => {
  it('认 v2 的 books 表行（下划线列名）', () => {
    const p = legacyRowToEditionParams({
      id: 'b1',
      title: '書名',
      format: 'EPUB',
      fp_algo: 'md5-sample3-v1',
      fp_hash: 'abc',
      fp_size: 123,
      file_path: 'C:\\books\\b1.epub',
      cover_path: 'b1.jpg',
      cover_failed: 1,
      created_at: 1000,
      metadata: '{"title":"書名"}'
    })
    expect(p).toEqual({
      id: 'b1',
      fingerprint: { algorithm: 'md5-sample3-v1', hash: 'abc', size: 123 },
      format: 'EPUB',
      title: '書名',
      metadata: '{"title":"書名"}',
      filePath: 'C:\\books\\b1.epub',
      coverPath: 'b1.jpg',
      coverFailed: 1,
      createdAt: 1000,
      work: null
    })
  })

  it('认 v1 JSON 的 books[] 项（驼峰 + 内嵌 fingerprint 对象）', () => {
    const p = legacyRowToEditionParams({
      id: 'b2',
      fingerprint: { algorithm: 'md5-sample3-v1', hash: 'h2', size: 9 },
      metadata: { title: '舊書' },
      format: 'PDF',
      filePath: '/x/b2.pdf',
      createdAt: 2000,
      coverPath: 'b2.jpg',
      coverFailed: true
    })
    expect(p.fingerprint).toEqual({ algorithm: 'md5-sample3-v1', hash: 'h2', size: 9 })
    expect(p.title).toBe('舊書')
    expect(p.filePath).toBe('/x/b2.pdf')
    expect(p.coverFailed).toBe(1)
    expect(p.createdAt).toBe(2000)
    // 元数据统一序列化成字符串入库（editions.metadata 列）
    expect(p.metadata).toBe('{"title":"舊書"}')
  })

  it('旧 work 列非空时才产出 work（历史恒 NULL → 通常为 null）', () => {
    expect(
      legacyRowToEditionParams({ id: 'x', fp_hash: 'h', fp_size: 1, work_protocol: null, work_code: null })
        .work
    ).toBeNull()
    expect(
      legacyRowToEditionParams({
        id: 'x',
        fp_hash: 'h',
        fp_size: 1,
        work_protocol: 'isbn',
        work_code: '9787000000000'
      }).work
    ).toEqual({ protocol: 'isbn', code: '9787000000000' })
  })

  it('缺字段不炸：fingerprint 退回列值/默认算法，title 缺失给空串', () => {
    const p = legacyRowToEditionParams({ id: 'x' })
    expect(p.fingerprint.algorithm).toBe('md5-sample3-v1')
    expect(p.fingerprint.hash).toBe('')
    expect(p.title).toBe('')
    expect(p.format).toBe('')
  })
})

describe('legacyRowToReadingState（v2 内嵌列 → v3 拆表）', () => {
  it('两个字段都没有 → null（不必写 reading_state 行）', () => {
    expect(legacyRowToReadingState({ id: 'b1' })).toBeNull()
  })

  it('v2 下划线列名', () => {
    expect(
      legacyRowToReadingState({ last_read_at: 500, last_location: '{"page":3}' })
    ).toEqual({ lastReadAt: 500, lastLocation: '{"page":3}' })
  })

  it('v1 驼峰 + 对象位置 → 序列化成字符串入库', () => {
    const s = legacyRowToReadingState({ lastReadAt: 700, lastLocation: { page: 4 } })
    expect(s?.lastReadAt).toBe(700)
    expect(s?.lastLocation).toBe('{"page":4}')
  })

  it('只有位置没有时间也算"读过"（保留位置，lastReadAt 为 null）', () => {
    expect(legacyRowToReadingState({ last_location: '{"page":1}' })).toEqual({
      lastReadAt: null,
      lastLocation: '{"page":1}'
    })
  })
})
