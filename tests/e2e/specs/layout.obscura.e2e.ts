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

  test('vanilla example keeps items inside a resized stage', async ({ page }) => {
    await page.goto('examples/vanilla/')
    const read = () =>
      page.evaluate(() => {
        const stage = document.getElementById('stage') as HTMLElement
        const bounds = stage.getBoundingClientRect()
        const items = Array.from(document.querySelectorAll<HTMLElement>('#canvas [data-id]')).map(
          (el) => {
            const r = el.getBoundingClientRect()
            return {
              id: el.dataset.id,
              right: r.right - bounds.left,
              bottom: r.bottom - bounds.top,
            }
          },
        )
        return { width: bounds.width, height: bounds.height, items }
      })
    await expect.poll(async () => (await read()).items.length).toBeGreaterThan(2)
    await page.evaluate(() => {
      const stage = document.getElementById('stage') as HTMLElement
      stage.style.flex = '0 0 480px'
      stage.style.width = '480px'
    })
    await expect.poll(async () => (await read()).width).toBeLessThanOrEqual(484)
    const after = await read()
    for (const item of after.items) {
      expect(item.right, `${item.id} right edge`).toBeLessThanOrEqual(after.width + 1)
      expect(item.bottom, `${item.id} bottom edge`).toBeLessThanOrEqual(after.height + 1)
    }
  })

  test('documentation home renders in both themes', async ({ page }) => {
    await page.goto('./')
    await expect(page.locator('h1').first()).toBeVisible()
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('h1').first()).toBeVisible()
    await page.screenshot({ path: 'test-results/obscura-home-dark.png' })
  })
})
