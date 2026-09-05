import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests run against the BUILT site artifact (`site-dist`, produced by
 * `bun run scripts/build-site.ts`), served under the same `/gridla/` base path
 * GitHub Pages uses. Set GRIDLA_SITE_DIR to point at a different artifact.
 *
 * Projects:
 * - chromium / firefox / webkit: the authoritative cross-engine gate.
 * - obscura: connects over CDP to the Obscura engine (see tests/e2e/obscura/).
 *   Only `*.obscura.e2e.ts` specs run there because the engine has no pointer
 *   events; see CAPABILITIES.md for the verified capability set.
 */
const siteDir = process.env.GRIDLA_SITE_DIR ?? 'site-dist'
const port = Number(process.env.GRIDLA_SITE_PORT ?? 4173)
// GRIDLA_BASE_URL points the suite at an already running server (for example
// a dev server) instead of the built artifact.
const externalBase = process.env.GRIDLA_BASE_URL
const baseURL = externalBase ?? `http://127.0.0.1:${port}/gridla/`
// Playwright's bundled browsers are glibc builds; on musl hosts point
// GRIDLA_CHROMIUM at a system Chromium.
const chromiumPath = process.env.GRIDLA_CHROMIUM

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
  webServer: externalBase
    ? undefined
    : {
        command: `bun run scripts/serve-site.ts --dir ${siteDir} --port ${port} --base /gridla/`,
        url: `${baseURL}revision.txt`,
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
  projects: [
    {
      name: 'chromium',
      testIgnore: /obscura/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: chromiumPath ? { executablePath: chromiumPath } : undefined,
      },
    },
    { name: 'firefox', testIgnore: /obscura/, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testIgnore: /obscura/, use: { ...devices['Desktop Safari'] } },
    {
      name: 'mobile-chromium',
      testIgnore: /obscura/,
      use: { ...devices['Pixel 7'] },
      grep: /@mobile/,
    },
    {
      // Obscura CDP lane. Specs live in *.obscura.e2e.ts and connect through
      // tests/e2e/obscura/fixture.ts; they skip when the engine is absent.
      name: 'obscura',
      testMatch: /.*\.obscura\.e2e\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
