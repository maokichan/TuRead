/**
 * 文档层生成器（笔记 v3）——汇编与笔记档案的 Markdown 文本构建（纯函数，零依赖）。
 *
 * **两层文件的关系**（决策笔记 notes-v3-data-model「文档层」）：
 * - **汇编**（用户所有）：wikilink 引用笔记 `![[note-<id>]]`——生产性总结发生在这里；
 * - **筆記檔案**（生成物，每书一份、可重生成覆盖）：节标题 = `note-<id>` = 引用的**解析目标**，
 *   使汇编里的引用在 Obsidian 可解析、可反链。档案定位「生成物勿手改」——再生成整体覆盖。
 */
import type { Note } from '@core/domain/types'

const nowIso = (): string => new Date().toISOString()

/** 汇编文档：每条笔记一个引用行。 */
export function buildCompilationMd(title: string, items: Array<{ note: Note }>): string {
  const lines = ['---', `title: ${title}`, 'type: compilation', `created: ${nowIso()}`, '---', '', `# ${title}`, '']
  for (const it of items) {
    lines.push(`![[note-${it.note.id}]]`)
  }
  lines.push('', '<!-- 引用经「筆記檔案」解析；用 Obsidian 打开 vault 資料夾即可反链。 -->', '')
  return lines.join('\n')
}

/** 筆記檔案（单书）：每条笔记一个标题节。 */
export function buildArchiveMd(
  editionTitle: string,
  editionId: string,
  items: Array<{ note: Note }>
): string {
  const lines = [
    '---',
    `title: 檔案 · ${editionTitle}`,
    'type: notes-archive',
    `edition: ${editionId}`,
    `generated: ${nowIso()}`,
    '---',
    '',
    `# 檔案 · ${editionTitle}`,
    '',
    '<!-- 本文件是生成物：由「筆記」页的文档视图重新生成整体覆盖，请勿手改。 -->',
    ''
  ]
  for (const it of items) {
    const n = it.note
    lines.push(`## note-${n.id}`, '')
    const quote = n.anchor.norm.quote.exact
    if (quote !== '') {
      lines.push(`> 「${quote}」（第 ${n.anchor.norm.chapterIndex + 1} 節）`, '')
    }
    lines.push(`<!-- ${n.color ?? '-'} · ${n.markStyle ?? 'background'} -->`, '')
    if (n.body.trim() !== '') {
      lines.push(n.body, '')
    }
  }
  return lines.join('\n')
}

/** 文件名净化（书名等外部输入 → vault 合法名；main 侧还有白名单兜底）。 */
export function safeVaultName(raw: string): string {
  const cleaned = raw.replace(/[\\/:*?"<>|\x00-\x1f]/g, '·').trim()
  return (cleaned === '' ? '未命名' : cleaned).slice(0, 60) + '.md'
}

/** 取不与 taken 冲突的自由名（base.md → base-2.md → base-3.md …）。 */
export function freeVaultName(base: string, taken: string[]): string {
  const stem = base.replace(/\.md$/, '')
  if (!taken.includes(`${stem}.md`)) return `${stem}.md`
  for (let i = 2; ; i += 1) {
    const name = `${stem}-${i}.md`
    if (!taken.includes(name)) return name
  }
}
