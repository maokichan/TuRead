/**
 * 「跟随当前位置」判据的单测（纯函数，node 环境可跑）。
 *
 * 为什么值得钉：这两条判据决定**目录/笔记列表每次重画后滚到哪里**。算错的表现是
 * "读第 30 章时目录停在开头"（越界反查失败）或"列表乱跳"（边界含不含、退化路径错），
 * 而这类错误在真机上只会被当成"手感不对"，很难定位 —— 故用断言把边界钉死。
 */
import { describe, expect, it } from 'vitest'
import type { Note } from '@core/domain/types'
import { activeNoteIndex, activeTocIndex, type TocRow } from './readerFollow'

function row(label: string, chapterDocIndex?: number): TocRow {
  return { label, depth: 0, chapterDocIndex }
}

function note(id: string, chapterIndex: number): Note {
  return {
    id,
    editionId: 'e1',
    kind: 'highlight',
    anchor: {
      norm: { chapterIndex, progression: 0, quote: { exact: id, prefix: '', suffix: '' } },
      fragment: null
    },
    body: '',
    createdAt: 0,
    updatedAt: 0
  }
}

describe('activeTocIndex（当前章号 ≤ 位置的最后一条）', () => {
  const rows = [row('卷一', 0), row('分組標題'), row('第二章', 4), row('第三章', 9)]

  it('取不超过当前位置的最后一条', () => {
    expect(activeTocIndex(rows, 0)).toBe(0)
    expect(activeTocIndex(rows, 3)).toBe(0)
    expect(activeTocIndex(rows, 4)).toBe(2)
    expect(activeTocIndex(rows, 8)).toBe(2)
    expect(activeTocIndex(rows, 9)).toBe(3)
    expect(activeTocIndex(rows, 99)).toBe(3)
  })

  it('分组标题（无可直达渲染节）不参与判定，但仍占下标', () => {
    expect(rows[activeTocIndex(rows, 4)].label).toBe('第二章')
  })

  it('当前位置在第一条之前 / 目录为空 → -1（调用方不滚，保持原位）', () => {
    expect(activeTocIndex([row('第一章', 3)], 0)).toBe(-1)
    expect(activeTocIndex([], 5)).toBe(-1)
    expect(activeTocIndex([row('分組標題'), row('另一分組')], 5)).toBe(-1)
  })
})

describe('activeNoteIndex（当前章的第一条；本章无笔记则退化为之前最后一条）', () => {
  const notes = [note('a', 1), note('b', 3), note('c', 3), note('d', 7)]

  it('当前章有笔记 → 取该章第一条（把这一章的笔记组放到中间）', () => {
    expect(activeNoteIndex(notes, 3)).toBe(1)
  })

  it('当前章无笔记 → 退化为之前最后一条', () => {
    expect(activeNoteIndex(notes, 4)).toBe(2) // 第二章（章号 3）的最后一条
    expect(activeNoteIndex(notes, 6)).toBe(2)
  })

  it('边界：位置在第一条之前 → -1；在最后一条之后 → 最后一条', () => {
    expect(activeNoteIndex(notes, 0)).toBe(-1)
    expect(activeNoteIndex(notes, 7)).toBe(3)
    expect(activeNoteIndex(notes, 99)).toBe(3)
  })

  it('空列表 → -1', () => {
    expect(activeNoteIndex([], 3)).toBe(-1)
  })
})
