import { dragBy, expect, resizeBy, settledRect, test } from '../fixtures'

/**
 * Adapter contract against the Qwik demo app (examples/adapters/qwik):
 * `gridla/qwik` client-rendered with the Qwik optimizer run per module. The
 * dashboard layout is projected onto the stage, so assertions compare
 * rectangles before and after a gesture rather than authored pixels. The chart
 * touches the sidebar on its right, so gestures that must relocate an item
 * first free room with Alt+Shift+ArrowLeft (four keyboard steps off the east
 * edge per press).
 */
const item = (id: string) => `[data-gridla-item="${id}"]`

test.use({ viewport: { width: 1600, height: 900 } })

test.describe('adapter qwik: gestures', () => {
  test.beforeEach(async ({ adapter, page }) => {
    await adapter('qwik')
    await expect(page.locator(item('table'))).toBeVisible()
  })

  test('drag commits a move and reports the strategy', async ({ page }) => {
    const chart = page.locator(item('chart'))
    await chart.locator('.gd-item-head').click()
    await expect(chart).toHaveAttribute('data-gridla-selected', '')
    await page.keyboard.press('Alt+Shift+ArrowLeft')
    await page.keyboard.press('Alt+Shift+ArrowLeft')
    const before = await settledRect(page, 'chart')
    await dragBy(page, chart.locator('.gd-item-head'), 40, 0)
    const after = await settledRect(page, 'chart')
    expect(after.x).toBeGreaterThan(before.x)
    expect(after.w).toBe(before.w)
    await expect(page.getByTestId('status')).toContainText('(move)')
    await expect(page.getByTestId('status')).not.toContainText('last strategy: none')
  })

  test('resize from the south-east handle changes the size', async ({ page }) => {
    const before = await settledRect(page, 'chart')
    await resizeBy(page, 'chart', 'se', -60, -40)
    const after = await settledRect(page, 'chart')
    expect(after.w).toBeLessThan(before.w)
    expect(after.h).toBeLessThan(before.h)
    await expect(page.getByTestId('status')).toContainText('(resize)')
  })

  test('arrow keys nudge the selected item', async ({ page }) => {
    const chart = page.locator(item('chart'))
    await chart.locator('.gd-item-head').click()
    await expect(chart).toHaveAttribute('data-gridla-selected', '')
    const start = await settledRect(page, 'chart')
    await page.keyboard.press('Alt+Shift+ArrowLeft')
    const freed = await settledRect(page, 'chart')
    expect(freed.w).toBeLessThan(start.w)
    await page.keyboard.press('ArrowRight')
    const after = await settledRect(page, 'chart')
    expect(after.x).toBeGreaterThan(freed.x)
    expect(after.y).toBe(freed.y)
  })

  test('the runtime places a new item through the controller', async ({ page }) => {
    const count = await page.locator('[data-gridla-item]').count()
    await page.getByRole('button', { name: 'Add item' }).click()
    await expect(page.locator(item('new-1'))).toBeVisible()
    expect(await page.locator('[data-gridla-item]').count()).toBe(count + 1)
    await expect(page.getByTestId('status')).toContainText(`${count + 1} items`)
  })
})
