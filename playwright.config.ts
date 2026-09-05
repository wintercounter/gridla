import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests run against the BUILT site artifact (`site-dist`, produced by
 * `bun run scripts/build-site.ts`), served under the same `/gridla/` base path
 * GitHub Pages uses. Set GRIDLA_SITE_DIR to point at a different artifact.
 *
 * Projects:
 * - chromium / firefox / webkit: the authoritative cross-engine gate.
 * - obscura: connects over CDP to the Obscura engine when OBSCURA_WS_ENDPOINT
 *   is set (see tests/e2e/obscura/). Tests that need capabilities Obscura
 *   lacks are tagged `@no-obscura` and excluded explicitly.
 */
const siteDir = process.env.GRIDLA_SITE_DIR ?? 'site-dist'
const port = Number(process.env.GRIDLA_SITE_PORT ?? 4173)
const baseURL = `http://127.0.0.1:${port}/gridla/`
const obscuraEndpoint = process.env.OBSCURA_WS_ENDPOINT

export default defineConfig({
  testDir: 'tests/e2e/specs',
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }], ['blob']] : [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000, toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `bun run scripts/serve-site.ts --dir ${siteDir} --port ${port} --base /gridla/`,
    url: `${baseURL}revision.txt`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
    {
      name: 'obscura',
      grepInvert: /@no-obscura/,
      use: {
        ...devices['Desktop Chrome'],
        connectOptions: obscuraEndpoint ? { wsEndpoint: obscuraEndpoint } : undefined,
      },
    },
  ],
})
