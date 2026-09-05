import { expect, itemRect, test } from '../fixtures'

/**
 * Keyboard handling on the input demo. The canvas is focusable; a click on an
 * item selects it and focuses the canvas. Arrow keys nudge by `keyboardStep`
 * (8 authored px, Shift x4), Alt+arrow resizes from the south-east corner,
 * Delete removes the selection, Escape cancels an in-flight gesture. The stage
 * is projected, so a nudge shows up scaled; assertions are relative.
 */
const DEMO = 'react-input'

const item = (id: string) => `[data-gridla-item="${id}"]`

test.describe('gallery: keyboard interactions', () => {
  test.beforeEach(async ({ gallery, page }) => {
    await gallery(DEMO)
    await expect(page.locator(item('table'))).toBeVisible()
  })

  test('C-032 arrows nudge one step, Shift multiplies it, Alt+arrow grows the east edge with x anchored', async ({
    page,
  }) => {
    // Free the space right of the chart so nudges do not collide with a sibling.
    await page.locator(item('sidebar')).click()
    await expect(page.locator(item('sidebar'))).toHaveAttribute('data-gridla-selected', '')
    await page.keyboard.press('Delete')
    await expect(page.locator(item('sidebar'))).toHaveCount(0)

    const chart = page.locator(item('chart'))
    await chart.click()
    await expect(chart).toHaveAttribute('data-gridla-selected', '')
    const readout = page.locator('.gl-readout')

    const r0 = await itemRect(page, 'chart')
    await page.keyboard.press('ArrowRight')
    await expect(readout).toContainText('ArrowRight → nudge')
    const r1 = await itemRect(page, 'chart')
    const step = r1.x - r0.x
    expect(step).toBeGreaterThan(0)
    expect(step).toBeLessThanOrEqual(12)
    expect(r1.y).toBe(r0.y)
    expect(r1.w).toBe(r0.w)

    await page.keyboard.press('Shift+ArrowRight')
    await expect(readout).toContainText('nudge ×4')
    const r2 = await itemRect(page, 'chart')
    expect(r2.x - r1.x).toBeGreaterThanOrEqual(3.5 * step - 2)
    expect(r2.x - r1.x).toBeLessThanOrEqual(4 * step + 2)
    expect(r2.y).toBe(r0.y)

    await page.keyboard.press('Alt+ArrowRight')
    await expect(readout).toContainText('ArrowRight → resize')
    const r3 = await itemRect(page, 'chart')
    expect(Math.abs(r3.x - r2.x)).toBeLessThanOrEqual(1)
    expect(r3.w).toBeGreaterThan(r2.w)
    expect(r3.w - r2.w).toBeLessThanOrEqual(step + 2)
    expect(r3.h).toBe(r2.h)
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

    await page.keyboard.press('Escape')
    await expect(chart).not.toHaveAttribute('data-gridla-active', '')
    await page.mouse.up()

    const after = await itemRect(page, 'chart')
    expect(after).toEqual(before)
    await expect(page.locator('[data-gridla-preview]')).toHaveCount(0)
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
