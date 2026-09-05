import { expect, test } from '../obscura/fixture'

/**
 * Obscura lane: layout and projection checks that need no pointer events.
 * The standard Chromium/Firefox/WebKit projects remain the interaction gate.
 */
test.describe('obscura layout lane @obscura', () => {
  test('React example renders items at solver coordinates', async ({ page }) => {
    await page.goto('examples/react/')
    const canvas = page.locator('[data-gridla-canvas]').first()
    await expect(canvas).toBeVisible()
    const rects = await page.evaluate(() => {
      const root = document.querySelector('[data-gridla-canvas]') as HTMLElement
      const origin = root.getBoundingClientRect()
      return Array.from(root.querySelectorAll<HTMLElement>('[data-gridla-item]')).map((el) => {
        const r = el.getBoundingClientRect()
        return {
          id: el.dataset.gridlaItem,
          x: Math.round(r.left - origin.left),
          y: Math.round(r.top - origin.top),
          w: Math.round(r.width),
          h: Math.round(r.height),
        }
      })
    })
    expect(rects.length).toBeGreaterThan(2)
    for (const a of rects) {
      for (const b of rects) {
        if (a === b) continue
        const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false)
      }
    }
  })

  test('vanilla example re-projects when the viewport changes', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 })
    await page.goto('examples/vanilla/')
    const read = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('#canvas [data-id]')).map((el) => [
          el.dataset.id,
          el.getBoundingClientRect().width,
        ]),
      )
    const wide = await read()
    await page.setViewportSize({ width: 700, height: 900 })
    await page.waitForTimeout(300)
    const narrow = await read()
    expect(narrow.length).toBe(wide.length)
    const header = (rows: (string | number | undefined)[][]) =>
      rows.find((r) => r[0] === 'header')?.[1] as number
    expect(header(narrow)).toBeLessThan(header(wide))
  })

  test('documentation home renders in both themes', async ({ page }) => {
    await page.goto('./')
    await expect(page.locator('h1').first()).toBeVisible()
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('h1').first()).toBeVisible()
    await page.screenshot({ path: 'test-results/obscura-home-dark.png' })
  })
})
