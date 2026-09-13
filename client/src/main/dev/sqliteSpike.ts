/**
 * dev-only spike：better-sqlite3 在 Electron 主进程的连通性验证（DATA_MODEL.md 开放问题 1，
 * 2026-09-13 用户放行）。验证四件事：
 * ① Electron ABI 原生模块可加载（prebuild：better-sqlite3@12 提供 electron-v130 二进制）
 * ② 文件库真实落盘（WAL 模式）+ 基本读写（建表/插入/查询）
 * ③ 重开持久化（关闭后重新 open，数据还在）
 * ④ WAL 副产物文件（-wal/-shm）落盘行为
 * 触发：`TUREAD_DEV_SQLITE=1 npm run dev`（无窗口需求，main 直接打印后退出；失败打印 FAIL）。
 * 归属：开发工具（spike），结论回写 DATA_MODEL.md 后此文件可删。
 */
export async function runSqliteSpike(): Promise<void> {
  const { join } = await import('node:path')
  const { app } = await import('electron')
  const dir = join(app.getPath('userData'), 'sqlite-spike')
  const { mkdirSync, rmSync, existsSync } = await import('node:fs')
  const ok = (m: string): void => console.log(`[SPIKE] ok: ${m}`)
  try {
    // ① 动态加载原生模块：顶不动静态 import（ABI 不匹配会炸掉所有启动路径）
    const mod = await import('better-sqlite3')
    const Database = (mod as unknown as { default: typeof import('better-sqlite3') }).default
    ok(`原生模块加载（electron ABI）`)

    mkdirSync(dir, { recursive: true })
    const dbPath = join(dir, 'spike.db')
    if (existsSync(dbPath)) rmSync(dbPath)
    for (const suffix of ['-wal', '-shm']) {
      if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix)
    }

    // ② 文件库 + WAL + 读写
    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.exec(
      'CREATE TABLE spike_books (id TEXT PRIMARY KEY, title TEXT NOT NULL, last_location TEXT)'
    )
    const insert = db.prepare('INSERT INTO spike_books (id, title, last_location) VALUES (?, ?, ?)')
    insert.run('b1', '样本书', JSON.stringify({ chapterDocIndex: 3, page: 0 }))
    const row = db.prepare('SELECT * FROM spike_books WHERE id = ?').get('b1') as {
      id: string
      title: string
      last_location: string
    }
    if (row.title !== '样本书') throw new Error('读回不匹配')
    ok(`建表/插入/查询（WAL=${db.pragma('journal_mode', { simple: true })}）`)
    db.close()

    // ③ 重开持久化
    const db2 = new Database(dbPath)
    const again = db2.prepare('SELECT title FROM spike_books WHERE id = ?').get('b1') as {
      title: string
    }
    if (again.title !== '样本书') throw new Error('重开后数据丢失')
    ok(`重开持久化（${dbPath}）`)

    // ④ 事务批量写（迁移器 328 本的关键动作）
    const bulk = db2.transaction((n: number) => {
      const ins = db2.prepare(
        'INSERT OR REPLACE INTO spike_books (id, title, last_location) VALUES (?, ?, ?)'
      )
      for (let i = 0; i < n; i++) ins.run(`b${i}`, `书${i}`, null)
    })
    const t0 = Date.now()
    bulk(328)
    const cnt = (db2.prepare('SELECT COUNT(*) AS c FROM spike_books').get() as { c: number }).c
    ok(`事务批量写 328 行 ${Date.now() - t0}ms，总行数=${cnt}`)
    db2.close()

    console.log('[SPIKE-RESULT] SQLITE-OK 全部通过（Electron 主进程 + 文件库 + WAL + 事务）')
    process.exitCode = 0
  } catch (err) {
    console.error(`[SPIKE-RESULT] SQLITE-FAIL ${(err as Error).message}`)
    process.exitCode = 1
  } finally {
    // 结果落盘：打包产物是 GUI 程序，stdout 到不了终端（TODO 工程组已知问题），
    // 由 finally 无条件写出 OK/FAIL 供外部读取
    try {
      const { writeFileSync, mkdirSync } = await import('node:fs')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'result.txt'), process.exitCode === 0 ? 'OK' : 'FAIL')
    } catch {
      /* 落盘失败不影响进程退出码 */
    }
  }
}
