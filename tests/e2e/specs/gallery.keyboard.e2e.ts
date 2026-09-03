import { expect, itemRect, settledRect, test } from '../fixtures'

/**
 * Keyboard handling of the React canvas. The canvas is focusable; a click on
 * an item selects it and focuses the canvas. Arrow keys nudge the selection
 * by `keyboardStep` (8 px, Shift x4), Alt+arrow resizes from the south-east
 * corner, Delete removes the selection through `onDeleteKey`, Escape cancels
 * an in-flight gesture.
 *
 * Geometry is asserted on the uncontrolled demo painted 1:1 (projection off)
 * so a step is exactly 8 px; the input demo is used for its gesture readout.
 */
const item = (id: string) => `[data-gridla-item="${id}"]`

test.describe('gallery: keyboard interactions', () => {
  test.describe('geometry', () => {
    test.use({ viewport: { width: 1600, height: 900 } })

    test.beforeEach(async ({ gallery, page }) => {
      await gallery('react-uncontrolled', { responsive: false })
      await expect(page.locator(item('table'))).toBeVisible()
      await expect.poll(() => itemRect(page, 'header').then((r) => r.w)).toBe(936)
    })

    test('C-032 arrows nudge one step, Shift multiplies it, Alt+arrow grows the east edge with x anchored', async ({
      page,
    }) => {
      const chart = page.locator(item('chart'))
      await chart.click()
      await expect(chart).toHaveAttribute('data-gridla-selected', '')

      // The chart touches its neighbour, so first free 64 px on its right:
      // Alt+Shift+ArrowLeft shrinks by four steps from the south-east corner.
      const start = await itemRect(page, 'chart')
      await page.keyboard.press('Alt+Shift+ArrowLeft')
      await page.keyboard.press('Alt+Shift+ArrowLeft')
      const r0 = await settledRect(page, 'chart')
      expect(r0).toEqual({ ...start, w: start.w - 64 })

      await page.keyboard.press('ArrowRight')
      const r1 = await settledRect(page, 'chart')
      const step = r1.x - r0.x
      expect(step).toBe(8)
      expect(r1).toEqual({ ...r0, x: r0.x + 8 })

      await page.keyboard.press('Shift+ArrowRight')
      const r2 = await settledRect(page, 'chart')
      expect(r2.x - r1.x).toBeGreaterThanOrEqual(4 * step)
      expect(r2).toEqual({ ...r1, x: r1.x + 32 })

      await page.keyboard.press('Alt+ArrowRight')
      const r3 = await settledRect(page, 'chart')
      expect(Math.abs(r3.x - r2.x)).toBeLessThanOrEqual(1)
      expect(r3.y).toBe(r2.y)
      expect(r3.h).toBe(r2.h)
      expect(r3.w - r2.w).toBe(step)

      await page.keyboard.press('ArrowLeft')
      const r4 = await settledRect(page, 'chart')
      expect(r4).toEqual({ ...r3, x: r3.x - step })
    })

    test('a nudge into a neighbour with no slack is rejected and leaves the layout unchanged', async ({
      page,
    }) => {
      const chart = page.locator(item('chart'))
      await chart.click()
      const before = await itemRect(page, 'chart')
      const sidebar = await itemRect(page, 'sidebar')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowUp')
      expect(await settledRect(page, 'chart')).toEqual(before)
      expect(await itemRect(page, 'sidebar')).toEqual(sidebar)
    })

    test('Escape cancels an in-flight move and restores the original rect', async ({ page }) => {
      const chart = page.locator(item('chart'))
      const before = await itemRect(page, 'chart')
      const box = await chart.boundingBox()
      if (!box) throw new Error('chart is not visible')
      const sx = box.x + box.width / 2
      const sy = box.y + box.height / 2

      await page.mouse.move(sx, sy)
      await page.mouse.down()
      for (let i = 1; i <= 8; i += 1) await page.mouse.move(sx, sy + 5 * i)
      await expect(chart).toHaveAttribute('data-gridla-active', '')
      const during = await itemRect(page, 'chart')
      expect(during.y - before.y).toBeGreaterThanOrEqual(30)
      await expect(page.locator('[data-gridla-preview]')).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(chart).not.toHaveAttribute('data-gridla-active', '')
      await expect(page.locator('[data-gridla-preview]')).toHaveCount(0)
      expect(await settledRect(page, 'chart')).toEqual(before)

      // The release after a cancel commits nothing.
      await page.mouse.up()
      expect(await settledRect(page, 'chart')).toEqual(before)
      await expect(page.locator('[data-gridla-preview]')).toHaveCount(0)
    })
  })

  test.describe('input readout', () => {
    test.beforeEach(async ({ gallery, page }) => {
      await gallery('react-input')
      await expect(page.locator(item('table'))).toBeVisible()
    })

    test('the readout names every keyboard binding', async ({ page }) => {
      const readout = page.locator('.gl-readout')
      await page.locator(item('chart')).click()
      await expect(page.locator(item('chart'))).toHaveAttribute('data-gridla-selected', '')

      await page.keyboard.press('ArrowRight')
      await expect(readout).toContainText('ArrowRight to nudge')
      await page.keyboard.press('Shift+ArrowRight')
      await expect(readout).toContainText('nudge ×4')
      await expect(readout).toContainText('Shift')
      await page.keyboard.press('Alt+ArrowRight')
      await expect(readout).toContainText('ArrowRight to resize')
      await expect(readout).toContainText('Alt')
      await page.keyboard.press('Escape')
      await expect(readout).toContainText('Escape to cancel gesture')
    })

    test('Delete removes the selected item through onDeleteKey', async ({ page }) => {
      await expect(page.locator('[data-gridla-item]')).toHaveCount(4)
      await page.locator(item('table')).click()
      await expect(page.locator(item('table'))).toHaveAttribute('data-gridla-selected', '')
      await page.keyboard.press('Delete')
      await expect(page.locator(item('table'))).toHaveCount(0)
      await expect(page.locator('[data-gridla-item]')).toHaveCount(3)
      await expect(page.locator('.gl-readout')).toContainText('removed table')
    })
  })
})
