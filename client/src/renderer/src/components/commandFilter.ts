/**
 * 命令面板的检索纯函数（2026-10-24，FEATURES.md §14）：query 对 label 做
 * 大小写不敏感的**子串**匹配；空查询（含纯空白）= 全量。
 * 住在纯 `.ts`：测试工程不设 jsx（`tsconfig.test.json` 不能 import `.tsx`）。
 */
export interface PaletteCommand {
  id: string
  label: string
  /** 右侧键位提示（如 `Ctrl+F`）；可省 */
  keyLabel?: string
  /** 执行动作（Enter / 点击）；执行后面板自会关闭 */
  run: () => void
}

export function filterCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const q = query.trim().toLowerCase()
  if (q === '') return commands
  return commands.filter((c) => c.label.toLowerCase().includes(q))
}
