import { describe, expect, it } from 'vitest'
import { filterCommands, type PaletteCommand } from './commandFilter'

const cmds: PaletteCommand[] = [
  { id: 'a', label: '前往書庫', run: () => {} },
  { id: 'b', label: '主題：純色·深', run: () => {} },
  { id: 'c', label: 'Focus Search', run: () => {} }
]

describe('filterCommands', () => {
  it('空查询返回全量（含纯空白）', () => {
    expect(filterCommands(cmds, '')).toHaveLength(3)
    expect(filterCommands(cmds, '   ')).toHaveLength(3)
  })

  it('子串命中（大小写不敏感）', () => {
    expect(filterCommands(cmds, '書庫').map((c) => c.id)).toEqual(['a'])
    expect(filterCommands(cmds, 'focus').map((c) => c.id)).toEqual(['c'])
  })

  it('无命中返回空数组', () => {
    expect(filterCommands(cmds, '不存在')).toEqual([])
  })

  it('前后空白不影响匹配', () => {
    expect(filterCommands(cmds, ' 書庫 ')).toHaveLength(1)
  })
})
