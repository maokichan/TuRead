/**
 * 全局日志存储（模块级）—— 日志栏移除后，诊断日志经「设置」功能组件的诊断页查看。
 * 容量上限 200 条；同步 console 输出（dev 无头调试可见）。
 */
const MAX_LINES = 200

const lines: string[] = []
const listeners = new Set<(snapshot: string[]) => void>()

export function pushLog(line: string): void {
  lines.push(line)
  if (lines.length > MAX_LINES) lines.shift()
  // 诊断日志同步到 console（主进程只转发 error/warn，这里 console.log 不会重复刷屏）
  console.log(line)
  const snapshot = [...lines]
  for (const fn of listeners) fn(snapshot)
}

export function subscribeLog(fn: (snapshot: string[]) => void): () => void {
  listeners.add(fn)
  fn([...lines])
  return () => listeners.delete(fn)
}

export function getLogs(): string[] {
  return [...lines]
}
