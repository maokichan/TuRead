/**
 * 阅读器「跟随当前位置」判据（2026-09-16 用户定）—— 目录与笔记两处**共用同一条判据**。
 *
 * 用户要求（原话）："我们需要确保目录条目索引，用户读到哪里，哪个条目就处于目录的中间位置"，
 * 且"这一点同样反应在笔记上"。所以这里做两件事：
 * ① **判据纯函数**（`activeTocIndex` / `activeNoteIndex`）—— 输入"当前位置 + 条目序列"，
 *    输出"哪一条是当前条目"；有单测（`readerFollow.test.ts`）。
 * ② **落点动作**（`centerInScrollBox`）—— 把那条滚到滚动容器**正中**。
 *
 * ⚠ **粒度诚实说明（不要假装更准）**：阅读位置 `BookLocation` 只到**章**（`chapterDocIndex`），
 * kookit 不提供章内进度（`count` 是"可见块序号"，跨章不可比）。因此：
 * - 目录：当前条目 = **章号 ≤ 当前位置的最后一条**（经典"当前章高亮"口径，跳转目标明确）；
 * - 笔记：同一章可能有多条 → 取**当前章的第一条**（把"这一章的笔记组"整体放到中间，
 *   已读的在上面、未读的在下面）；当前章没有笔记时退化为**之前最后一条**。
 * 章内精确到某一条需要新的位置度量 —— 已登记 `TODO.md`（与 PDF/翻页专题同批谈）。
 */

import type { Note } from '@core/domain/types'

/**
 * 目录树扁平化行（`ReaderFeature` 产出，`TocPanel` 展示）。
 *
 * ⚠ 原本定义在 `TocPanel.tsx` 里，2026-09-16 移到本模块：本模块是**纯 `.ts`**，
 * 而 `tsconfig.test.json` **不设 `jsx`** —— 判据的单测一旦经 `.ts` 链条 import 到 `.tsx`，
 * 整个 `typecheck` 就报 `TS6142`（实测）。数据形状住在纯模块里，判据与测试都能干净引用；
 * `TocPanel` 侧保留同名再导出，调用方不必改。
 */
export interface TocRow {
  label: string
  depth: number
  /** 目录项起始渲染节号（缺省 = 无可直达章节，禁用跳转） */
  chapterDocIndex?: number
}

/**
 * 目录当前条目下标（`-1` = 没有可比条目，例如整本书只有分组标题）：
 * **章号 ≤ 当前位置的最后一条**。
 */
export function activeTocIndex(rows: TocRow[], chapter: number): number {
  let found = -1
  for (let i = 0; i < rows.length; i++) {
    const at = rows[i].chapterDocIndex
    if (at === undefined) continue // 纯分组标题（无可直达渲染节）不参与"当前条目"
    if (at <= chapter) found = i
    else break // 目录是递增的，一旦越过就可以停
  }
  return found
}

/**
 * 笔记当前条目下标（`-1` = 没有可比条目）：
 * 优先**当前章的第一条**（把这一章的笔记组放到中间），否则退化为**之前最后一条**。
 * `notes` 必须是**阅读序**（章 → 章内进度 → 创建时间，见 `domain/anchor.ts` 的 `compareNoteOrder`）。
 */
export function activeNoteIndex(notes: Note[], chapter: number): number {
  let lastPassed = -1
  for (let i = 0; i < notes.length; i++) {
    const at = notes[i].anchor.norm.chapterIndex
    if (at < chapter) lastPassed = i
    else if (at === chapter) return i // 当前章的第一条
    else break // 阅读序：越过当前章就可以停
  }
  return lastPassed
}

/**
 * 把 `el` 滚到 `box` 的**正中**（两侧可滚范围由浏览器夹取，越界时自然停在边界）。
 *
 * 用**矩形差**而不是 `offsetTop`：`.toc-list` 是定位元素，条目区的 `offsetParent` 未必是滚动容器，
 * 而矩形差在任何嵌套/追加了 header 的情形下都成立。
 */
export function centerInScrollBox(box: HTMLElement, el: HTMLElement, smooth: boolean): void {
  const boxRect = box.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()
  const top = box.scrollTop + (elRect.top - boxRect.top) - (box.clientHeight - elRect.height) / 2
  box.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
}
