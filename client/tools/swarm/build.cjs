/**
 * roombot 打包（esbuild → 单文件 CJS，纯 Node 可跑）。
 * 别名解析与 tsconfig.node.json 一致（@core/@shared）；ws 与领域层一起打进包里 ——
 * 机器人是自包含的，npm run swarm 前自动重打，源码改动即刻生效。
 */
const esbuild = require('esbuild')
const path = require('node:path')

esbuild
  .build({
    entryPoints: [path.join(__dirname, 'roombot.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    outfile: path.join(__dirname, 'roombot.cjs'),
    sourcemap: 'inline',
    logLevel: 'warning',
    alias: {
      '@core': path.join(__dirname, '..', '..', 'src', 'core'),
      '@shared': path.join(__dirname, '..', '..', 'src', 'shared')
    }
  })
  .then(() => process.stdout.write('[swarm] roombot.cjs 构建完成\n'))
  .catch((err) => {
    process.stderr.write(`[swarm] 构建失败：${err.message}\n`)
    process.exit(1)
  })
