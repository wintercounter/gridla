import { dragBy, expect, itemRect, resizeBy, settledRect, test } from '../fixtures'

/**
 * Shared adapter contract for the two DOM-based adapters: the vanilla
 * `gridla/dom` demo (`mountGrid`) and the `gridla/elements` demo (custom
 * elements over it). Both apps render the same dashboard: header, chart,
 * sidebar, and a nested group canvas holding a note and a to-do, all inside
 * one transfer scope. A status line (`[data-status]`) shows the last change
 * as `reason · strategy · itemId`.
 */
const APPS = ['vanilla-dom', 'elements']

const item = (id: string) => `[data-gridla-item="${id}"]`

for (const name of APPS) {
  test.describe(`adapter ${name}: contract`, () => {
    test.use({ viewport: { width: 1400, height: 900 } })

    test.beforeEach(async ({ adapter, page }) => {
      await adapter(name)
      await expect(page.locator(item('note'))).toBeVisible()
    })

    test('pointer drag commits with a strategy in the status line', async ({ page }) => {
      const before = await settledRect(page, 'chart')
      const sidebarBefore = await itemRect(page, 'sidebar')
      await dragBy(page, page.locator(item('chart')), sidebarBefore.x - before.x, 0)
      await expect(page.locator('[data-status]')).toHaveText(/^move · (push|swap)[\w-]* · chart$/)
      const after = await settledRect(page, 'chart')
      expect(after.x).toBeGreaterThan(before.x + 100)
      expect(after.w).toBe(before.w)
      const sidebarAfter = await itemRect(page, 'sidebar')
      expect(sidebarAfter.x).toBeLessThan(sidebarBefore.x)
      await expect(page.locator(item('chart'))).not.toHaveAttribute('data-gridla-active', '')
    })

    test('resize from the east handle commits a narrower item', async ({ page }) => {
      const before = await settledRect(page, 'chart')
      await resizeBy(page, 'chart', 'e', -80, 0)
      await expect(page.locator('[data-status]')).toHaveText(/^resize · [\w-]+ · chart$/)
      const after = await settledRect(page, 'chart')
      expect(after.x).toBe(before.x)
      expect(before.w - after.w).toBeGreaterThanOrEqual(70)
      expect(before.w - after.w).toBeLessThanOrEqual(90)
    })

    test('a click selects and the arrow keys nudge the selection', async ({ page }) => {
      const chart = page.locator(item('chart'))
      await chart.click()
      await expect(chart).toHaveAttribute('data-gridla-selected', '')
      // Free some room to the right first: Alt+Shift+ArrowLeft shrinks the
      // item from its south-east corner by four steps.
      await page.keyboard.press('Alt+Shift+ArrowLeft')
      await page.keyboard.press('Alt+Shift+ArrowLeft')
      const start = await settledRect(page, 'chart')
      await page.keyboard.press('ArrowRight')
      const r1 = await settledRect(page, 'chart')
      expect(r1.x - start.x).toBe(8)
      expect(r1.y).toBe(start.y)
      await page.keyboard.press('Shift+ArrowRight')
      const r2 = await settledRect(page, 'chart')
      expect(r2.x - r1.x).toBe(32)
      await expect(page.locator('[data-status]')).toHaveText(/^move · [\w-]+ · chart$/)
    })

    test('an item dragged out of the nested group lands on the outer canvas', async ({ page }) => {
      const note = page.locator(item('note'))
      const noteBox = await note.boundingBox()
      const chartBox = await page.locator(item('chart')).boundingBox()
      if (!noteBox || !chartBox) throw new Error('note or chart is not visible')
      const outer = page.locator('#canvas')
      await expect(outer.locator(`:scope > ${item('note')}`)).toHaveCount(0)

      const dx = chartBox.x + chartBox.width / 2 - (noteBox.x + noteBox.width / 2)
      const dy = chartBox.y + chartBox.height / 2 - (noteBox.y + noteBox.height / 2)
      await dragBy(page, note, dx, dy, 24)

      await expect(outer.locator(`:scope > ${item('note')}`)).toHaveCount(1)
      await expect(page.locator(item('note'))).toHaveCount(1)
      await expect(page.locator('[data-status]')).toHaveText(/^transfer · [\w-]+ · note$/)
      // The group keeps the to-do and no longer holds the note.
      const group = page.locator(item('group')).locator('[data-gridla-canvas]').first()
      await expect(group.locator(item('todo'))).toHaveCount(1)
      await expect(group.locator(item('note'))).toHaveCount(0)
    })
  })
}
