/**
 * Playwright fixture for the Obscura CDP lane. Each worker launches its own
 * `obscura serve`, waits for `/json/version`, and hands Playwright a browser
 * obtained through `chromium.connectOverCDP`. Specs in this lane are the
 * `*.obscura.e2e.ts` files; they must only use capabilities listed as
 * supported in CAPABILITIES.md (no pointer gestures, no `fill`, force clicks).
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { chromium, test as base, type Browser } from '@playwright/test'

const root = resolve(import.meta.dirname, '../../..')
const launcher = process.env.OBSCURA_BIN ?? resolve(root, '.tools/obscura/run.sh')
const fallback = resolve(root, '.tools/obscura/obscura')

function pickBinary(): string | null {
  if (existsSync(launcher)) return launcher
  if (existsSync(fallback)) return fallback
  return null
}

async function waitForEndpoint(port: number, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) {
        const info = (await response.json()) as { webSocketDebuggerUrl?: string }
        return info.webSocketDebuggerUrl ?? `ws://127.0.0.1:${port}/devtools/browser`
      }
    } catch {
      // not up yet
    }
    await new Promise((done) => setTimeout(done, 200))
  }
  throw new Error(`obscura did not expose CDP on port ${port} within ${timeoutMs}ms`)
}

export const test = base.extend<Record<never, never>, { obscuraBrowser: Browser }>({
  obscuraBrowser: [
    async ({}, use, workerInfo) => {
      const binary = pickBinary()
      if (!binary) {
        test.skip(true, 'Obscura is not installed; run `bun run tests/e2e/obscura/install.ts`')
        return
      }
      const port = 9300 + workerInfo.workerIndex
      const child: ChildProcess = spawn(
        binary,
        ['serve', '--port', String(port), '--allow-private-network', '--quiet'],
        { stdio: 'ignore' },
      )
      try {
        const endpoint = await waitForEndpoint(port)
        const browser = await chromium.connectOverCDP(endpoint)
        await use(browser)
        await browser.close()
      } finally {
        child.kill('SIGTERM')
      }
    },
    { scope: 'worker' },
  ],
  browser: async ({ obscuraBrowser }, use) => {
    await use(obscuraBrowser)
  },
})

export { expect } from '@playwright/test'
