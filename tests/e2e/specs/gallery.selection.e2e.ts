import { expect, test } from '../fixtures'

/**
 * Selection on the custom chrome demo. The demo renders headless items with a
 * grip as the only drag surface (default) and paints a selection ring plus
 * resize knobs for the selected item.
 */
const DEMO = 'react-custom-chrome'

const item = (id: string) => `[data-gridla-item="${id}"]`
const grip = (id: string) => `${item(id)} [data-gridla-drag-handle]`

test.describe('gallery: custom chrome and selection', () => {
  test('C-002 clicking an item body selects it', async ({ page, gallery }) => {
    // With the grip-only option off, the whole card is the drag surface, so a
    // press anywhere on the body selects the item.
    await gallery(DEMO, { grip: false })
    const chart = page.locator(item('chart'))
    await expect(chart).toBeVisible()
    await expect(chart).not.toHaveAttribute('data-gridla-selected', '')

    await chart.locator('.gl-card-body').click()

    await expect(chart).toHaveAttribute('data-gridla-selected', '')
    // Selection chrome (ring and knobs) is painted only for the selected item.
    await expect(chart.locator('.gl-card-ring')).toHaveCount(1)
    await expect(chart.locator('[data-gridla-resize-handle="chart"]')).toHaveCount(3)
    await expect(page.locator('[data-gridla-selected]')).toHaveCount(1)
  })

  test('C-002 with grip-only chrome a press on the body does not select', async ({
    page,
    gallery,
  }) => {
    await gallery(DEMO)
    const chart = page.locator(item('chart'))
    await chart.locator('.gl-card-body').click()
    await expect(chart).not.toHaveAttribute('data-gridla-selected', '')
    await expect(page.locator('[data-gridla-selected]')).toHaveCount(0)

    await page.locator(grip('chart')).click()
    await expect(chart).toHaveAttribute('data-gridla-selected', '')
  })

  test('B-040 pointer-down on B while A is selected switches selection before release', async ({
    page,
    gallery,
  }) => {
    await gallery(DEMO)
    const a = page.locator(item('chart'))
    const b = page.locator(item('sidebar'))

    await page.locator(grip('chart')).click()
    await expect(a).toHaveAttribute('data-gridla-selected', '')
    await expect(b).not.toHaveAttribute('data-gridla-selected', '')

    const box = await page.locator(grip('sidebar')).boundingBox()
    if (!box) throw new Error('grip of sidebar is not visible')
    const sx = box.x + box.width / 2
    const sy = box.y + box.height / 2
    await page.mouse.move(sx, sy)
    await page.mouse.down()
    // Selection switches on pointer down, before any threshold or release.
    await expect(b).toHaveAttribute('data-gridla-selected', '')
    await expect(a).not.toHaveAttribute('data-gridla-selected', '')

    await page.mouse.move(sx + 5, sy + 5)
    await page.mouse.move(sx + 10, sy + 10)
    await expect(b).toHaveAttribute('data-gridla-selected', '')
    await expect(b).toHaveAttribute('data-gridla-active', '')
    await expect(a).not.toHaveAttribute('data-gridla-selected', '')
    await expect(page.locator('[data-gridla-selected]')).toHaveCount(1)

    await page.mouse.up()
    await expect(b).not.toHaveAttribute('data-gridla-active', '')
    await expect(b).toHaveAttribute('data-gridla-selected', '')
  })
})
