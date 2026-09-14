import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * 单元测试配置（2026-09-14 引入 vitest）。
 *
 * 引入理由（原 TODO 条目）：客户端此前**零测试设施**，而 `domain/location.ts`、`domain/anchor.ts`
 * 这类"语义模块"是纯函数、判据细（主键/兜底/降级），最需要断言兜底却最容易被改坏。
 * 同时落用户 2026-09-12 架构审查要求：**分层依赖守卫机器化**（见 `src/tests/layering.test.ts`），
 * 不靠人肉复查。
 *
 * 许可证：vitest = MIT，devDependency、**不进发行物** → 与 AGPL-3.0 无冲突。
 *
 * 分工：
 * - 本配置 = **纯逻辑单测**（`environment: 'node'`，无 DOM 依赖的领域/用例）；
 * - 涉及真实渲染 / Electron / iframe 的验证仍走 `TUREAD_DEV_PROBE` 无头探针（两类设施互补，
 *   不是替代关系 —— 探针验"链路通不通"，单测验"判据对不对"）。
 *
 * ⚠ 别名与 `electron.vite.config.ts` 保持一致：测试必须 import 到与运行时**同一套**路径，
 *   否则守卫测试会因为解析差异给出假结论。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve('src/core'),
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src'),
      '@vendor': resolve('src/vendor')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // 显式 import（不用 globals）：避免为测试放宽 tsconfig 的 types，保持生产配置干净
    globals: false
  }
})
