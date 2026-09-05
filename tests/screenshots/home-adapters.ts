#!/usr/bin/env bun
/* oxlint-disable no-await-in-loop -- screenshots are taken one context at a time on purpose */
/**
 * Screenshots of the home page at desktop and phone widths in both themes,
 * for a visual check of the adapter tab strip and the adapter row.
 *
 *   bun run scripts/serve-site.ts --dir website/doc_build --port 4197 --base /gridla/
 *   GRIDLA_CHROMIUM=/usr/bin/chromium bun run tests/screenshots/home-adapters.ts <out-dir>
 */
import { chromium } from '@playwright/test'

const base = process.env.GRIDLA_BASE_URL ?? 'http://127.0.0.1:4197/gridla/'
const out = process.argv[2] ?? '.'
const browser = await chromium.launch({ executablePath: process.env.GRIDLA_CHROMIUM })

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1280, 360]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 360 ? 740 : 900 },
      colorScheme: theme,
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    await page.addInitScript((mode: string) => {
      localStorage.setItem('rspress-theme-appearance', mode)
    }, theme)
    await page.goto(base, { waitUntil: 'networkidle' })
    await page.evaluate(() => {
      for (const node of document.querySelectorAll<HTMLElement>('[data-reveal]')) {
        node.dataset.revealed = ''
      }
    })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${out}/home-adapters-${theme}-${width}.png`, fullPage: true })
    // Tab strip close-ups: first tab, then the last tab (scrolled into view on phones).
    const tabs = page.locator('.g-tabs').first()
    await tabs.screenshot({ path: `${out}/home-adapters-${theme}-${width}-tabs-first.png` })
    await page.getByRole('tab', { name: 'Preact' }).click()
    await page.waitForTimeout(200)
    await tabs.screenshot({ path: `${out}/home-adapters-${theme}-${width}-tabs-last.png` })
    await page
      .locator('.g-adapters')
      .screenshot({ path: `${out}/home-adapters-${theme}-${width}-row.png` })
    await context.close()
  }
}

await browser.close()
