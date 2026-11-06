import { describe, expect, it } from 'vitest'
import { extractAtWord, filterNoteCandidates, formatNoteRef, noteRefDisplay } from './noteRefCompletion'
import type { NoteRefCandidate } from './noteRefCompletion'

/** 造候选（测试里只填过滤/格式化用到的字段） */
const cand = (over: Partial<NoteRefCandidate>): NoteRefCandidate => ({
  id: 'id-1',
  editionId: 'edition-1',
  editionTitle: '三體',
  chapterIndex: 0,
  excerpt: '',
  body: '',
  ...over
})

describe('extractAtWord（@ 词提取）', () => {
  it('行尾 @词：返回 @ 偏移与词', () => {
    expect(extractAtWord('前面 @三體')).toEqual({ at: 3, word: '三體' })
    expect(extractAtWord('混合 note-3f2c 与 @X_9-y')).toEqual({ at: 15, word: 'X_9-y' })
  })

  it('刚敲 @（词空）也命中；行尾是标点/无 @ = null', () => {
    expect(extractAtWord('@')).toEqual({ at: 0, word: '' })
    expect(extractAtWord('mail me @foo,')).toBeNull()
    expect(extractAtWord('没有 trigger')).toBeNull()
  })

  it('只认行尾那一个词：@ 前是普通字符也算（source 侧由 matchBefore 限行）', () => {
    expect(extractAtWord('email@foo')).toEqual({ at: 5, word: 'foo' })
  })
})

describe('filterNoteCandidates（子串过滤，≤ 8 条，不分大小写）', () => {
  const notes: NoteRefCandidate[] = [
    cand({ id: 'a', editionTitle: '三體', excerpt: '黑暗森林法則', body: '' }),
    cand({ id: 'b', editionTitle: '三體 II', excerpt: '面壁者', body: '罗辑的领悟' }),
    cand({ id: 'c', editionTitle: '基地', excerpt: '心理史學', body: 'Seldon Plan' }),
    cand({ id: 'd', editionTitle: '沙丘', excerpt: '', body: '沙蟲與香料' })
  ]

  it('词命中标题/摘录/正文任一字段即留（大小写不敏感）', () => {
    const ids = filterNoteCandidates(notes, '三體').map((n) => n.id)
    expect(ids).toEqual(['a', 'b']) // 标题命中（「三體」「三體 II」都含）
    expect(filterNoteCandidates(notes, '森林').map((n) => n.id)).toEqual(['a'])
    expect(filterNoteCandidates(notes, 'seldon').map((n) => n.id)).toEqual(['c']) // body 字段
  })

  it('空词 = 前 8 条全量；超过 8 条截断；无命中 = 空', () => {
    expect(filterNoteCandidates(notes, '').length).toBe(4)
    const many = Array.from({ length: 12 }, (_, i) => cand({ id: `n${i}` }))
    expect(filterNoteCandidates(many, '')).toHaveLength(8)
    expect(filterNoteCandidates(notes, '不存在词')).toEqual([])
  })
})

describe('formatNoteRef / noteRefDisplay（引用串格式）', () => {
  it('有摘录：書名经 safeVaultName 净化，顯示名 = 摘录前 12 字包「」', () => {
    const ref = formatNoteRef(
      cand({ id: 'u1', editionTitle: '三體', excerpt: '給歲月以文明，而不是給文明以歲月' })
    )
    expect(ref).toBe('[[檔案 · 三體#note-u1|「給歲月以文明，而不是給文」]]')
    expect(noteRefDisplay(cand({ excerpt: '短摘录' }))).toBe('「短摘录」')
  })

  it('摘录空：顯示名退化为「書名 · 節N」（章序 0 起、展示 1 起）', () => {
    expect(formatNoteRef(cand({ id: 'u2', chapterIndex: 2 }))).toBe('[[檔案 · 三體#note-u2|三體 · 節3]]')
  })

  it('書名含非法文件名字符：与档案文件名同源净化（/ → ·，去 .md）', () => {
    const ref = formatNoteRef(cand({ id: 'u3', editionTitle: '上/下游', excerpt: '引' }))
    expect(ref).toBe('[[檔案 · 上·下游#note-u3|「引」]]')
  })
})
