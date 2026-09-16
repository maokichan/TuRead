/**
 * 笔记流几何（装箱 + 窗口化）的单测 —— 纯函数，node 环境可跑（`npm test`）。
 *
 * 为什么这些判据值得钉：窗口化是"只渲染视口内那几十条"的**唯一依据**，算错了会出现
 * ①条目消失/重叠（位置算错）②滚动条几何抖动（总高算错）③大列表重新变慢（可见集算大）。
 * 领域里这类"位置算术"最容易被后续改动无声改坏，故用断言兜底。
 */
import { describe, expect, it } from 'vitest'
import {
  computeCols,
  computeColW,
  packGrid,
  packMasonry,
  visibleIndices,
  FLOW_COL_GAP,
  FLOW_ROW_GAP
} from './noteLayout'

describe('computeCols / computeColW', () => {
  it('列数 = 容器能放下几列（含列间距）', () => {
    // (1200+16)/(240+16)=4.75 → 4 列
    expect(computeCols(1200, 240)).toBe(4)
    // (1000+16)/256=3.97 → 3 列
    expect(computeCols(1000, 240)).toBe(3)
    // 比一列还窄也必须给 1 列（否则整列宽度为 0、内容不可见）
    expect(computeCols(120, 240)).toBe(1)
  })

  it('容器尺寸未知（首帧 0 宽 / 未测量）时退化为 1 列，不抛错', () => {
    expect(computeCols(0, 240)).toBe(1)
    expect(computeCols(Number.NaN, 240)).toBe(1)
  })

  it('列宽均分剩余空间（右侧不留缝）', () => {
    expect(computeColW(1200, 4)).toBeCloseTo((1200 - 3 * FLOW_COL_GAP) / 4, 5)
    expect(computeColW(1200, 1)).toBe(1200)
  })
})

describe('packMasonry（瀑布流：最短列优先）', () => {
  it('每条进当前最矮的列，且同列内 top 单调递增', () => {
    const l = packMasonry([100, 100, 100, 100], 2, 240)
    expect(l.placed.map((p) => p.col)).toEqual([0, 1, 0, 1])
    expect(l.placed[0].top).toBe(0)
    expect(l.placed[1].top).toBe(0)
    // 第三条第 0 列：100 + 行距
    expect(l.placed[2].top).toBe(100 + FLOW_ROW_GAP)
    for (const col of l.byCol) {
      const tops = col.map((i) => l.placed[i].top)
      expect([...tops].sort((a, b) => a - b)).toEqual(tops)
    }
  })

  it('长条目落在短列上（真正"最短列优先"，不是轮流）', () => {
    // 第 1 条很高 → 第 2 条应去第 1 列（空的），第 3 条回第 0 列
    const l = packMasonry([500, 50, 50], 2, 240)
    expect(l.placed.map((p) => p.col)).toEqual([0, 1, 1])
  })

  it('总高 = 最高列 − 行距（末尾不留一行间距，否则滚动条会多一截）', () => {
    const l = packMasonry([100, 60], 2, 240)
    expect(l.totalHeight).toBe(100) // 两条各在一列，最高列 = 100 + gap，减掉 gap
  })

  it('空输入不抛错、总高为 0', () => {
    const l = packMasonry([], 3, 240)
    expect(l.placed).toEqual([])
    expect(l.totalHeight).toBe(0)
  })
})

describe('packGrid（網格：行优先 + 行内等高）', () => {
  it('同行为最高者的高度，且下一行接在其下', () => {
    const l = packGrid([100, 40, 70, 20], 2, 240)
    expect(l.placed.map((p) => p.top)).toEqual([0, 0, 100 + FLOW_ROW_GAP, 100 + FLOW_ROW_GAP])
    expect(l.placed.map((p) => p.height)).toEqual([100, 100, 70, 70])
  })

  it('末行不满也按该行最高者收口（不预留缺位）', () => {
    const l = packGrid([100, 40, 70], 2, 240)
    expect(l.totalHeight).toBe(100 + FLOW_ROW_GAP + 70)
  })
})

describe('visibleIndices（窗口化：按列二分）', () => {
  const layout = packMasonry(Array.from({ length: 100 }, () => 200), 2, 240)

  it('视口内的条目都拿到，视口外的不要（这是"只渲染几十条"的依据）', () => {
    const vis = visibleIndices(layout, 0, 400, 0)
    // 每列每条 216px 高：视口 400 → 每列前 2 条（top 0 / 216）落进 [0,400]
    expect(vis).toEqual([0, 1, 2, 3])
  })

  it('overscan 生效（上下各扩一段，滚动时不露白）', () => {
    const vis = visibleIndices(layout, 0, 200, 216)
    expect(vis).toContain(2)
    expect(vis).toContain(3)
    expect(vis).not.toContain(4)
  })

  it('滚到中段只给中段（100 条里仍是个位数/十位数级）', () => {
    const vis = visibleIndices(layout, 5000, 400, 0)
    expect(vis.length).toBeGreaterThan(0)
    expect(vis.length).toBeLessThan(10)
  })

  it('滚过末尾 → 空集（不越界、不抛错）', () => {
    expect(visibleIndices(layout, 1e7, 400, 0)).toEqual([])
  })

  it('返回升序（DOM 顺序稳定，key 不抖）', () => {
    const vis = visibleIndices(layout, 1200, 800, 400)
    expect([...vis].sort((a, b) => a - b)).toEqual(vis)
  })
})
