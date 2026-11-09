import { defineConfig } from '@playwright/test'

/**
 * e2e 验证台配置（test/e2e-baseline）。
 *
 * 为什么用 build + preview 而不是 dev：
 * - 项目 base: './'（相对 base，为 GitHub Pages 子路径准备），root: 'src/renderer'，
 *   产物含 1.94MB 的 elk.worker。dev server 走即时编译，worker 解析路径与生产不同，
 *   e2e 结论不能代表用户实际拿到的 dist。
 * - preview 服务的正是 npm run build 的产物，与 CI / GitHub Pages 一致，可确定性复现。
 *
 * 端口选 5177：
 * - vite.config.ts 的 server.port 是 5173（队友 dev 在用，不动它，也不复用），
 *   vite preview 默认 4173。这里显式 --port 5177 --strictPort，避免与队友 dev/preview 撞端口，
 *   撞端口时 --strictPort 会直接失败而不是悄悄换端口导致 baseURL 错位。
 * - reuseExistingServer: true：本地已起 5177 preview 时直接复用，CI 上自行起。
 *
 * testDir 指向 tests/e2e，testMatch 只收 .e2e.ts 后缀。
 * vitest.config.ts 的 include 只收 .test.ts 后缀，与 e2e 用例的 .e2e.ts 后缀天然不重叠，
 * 所以 npm run test 不会把 e2e 用例当单测收集（已实测，见 logs/e2e-baseline.log）。
 */
const PORT = 5177
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60000,
  expect: {
    timeout: 15000
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  },
  webServer: {
    // 先构建再 preview：保证 e2e 跑的是 dist 产物
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180000
  }
})
