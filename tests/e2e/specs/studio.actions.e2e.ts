import { expect, itemRect, openStudioDocument, test } from '../fixtures'
import { actionsDocument } from '../studio-documents'
import {
  canvasOf,
  center,
  holdDrag,
  item,
  itemBox,
  moveTo,
  press,
  projected,
  selectInLayers,
  settleAll,
} from '../studio-helpers'

/** Delete, undo/redo, duplicate and Escape against the seeded "Actions" page. */
test.use({ viewport: { width: 2000, height: 1100 } })

test.describe('studio: actions and keyboard', () => {
  test.beforeEach(async ({ page }) => {
    await openStudioDocument(page, actionsDocument())
    await expect(page.locator(item('beta'))).toBeVisible()
    // Group canvases project their children once measured; read rects only after that.
    await projected(page, 'title', 176)
    await settleAll(page)
  })

  test('B-060 pressing Delete removes the selected item', async ({ page }) => {
    const beta = page.locator(item('beta'))
    await beta.click()
    await expect(beta).toHaveAttribute('data-studio-selected', '')
    await page.keyboard.press('Delete')
    await expect(beta).toHaveCount(0)
    await expect(page.locator(item('alpha'))).toHaveCount(1)
  })

  test('B-049 a selected group exposes a delete action that removes it with its children', async ({
    page,
  }) => {
    await page.locator(item('title')).click()
    await expect(page.locator(item('title'))).toHaveAttribute('data-studio-selected', '')
    // Step up to the parent through the layer tree.
    await selectInLayers(page, 'header')
    await expect(page.locator(item('header'))).toHaveAttribute('data-studio-selected', '')

    await page.locator('.st-actions button', { hasText: /^Delete$/ }).click()
    await expect(page.locator(item('header'))).toHaveCount(0)
    await expect(page.locator(item('title'))).toHaveCount(0)
    await expect(page.locator(item('action'))).toHaveCount(0)
    await expect(page.locator('[data-kind="group"]')).toHaveCount(0)
    await expect(page.locator(item('alpha'))).toHaveCount(1)
  })

  test('undo restores the geometry of a moved item and redo re-applies it', async ({ page }) => {
    const before = await itemRect(page, 'alpha')
    await holdDrag(page, 'alpha', 0, 200)
    await page.mouse.up()
    await settleAll(page)
    const moved = await itemRect(page, 'alpha')
    expect(moved.y - before.y).toBeGreaterThanOrEqual(150)

    await page.keyboard.press('Control+z')
    await expect.poll(() => itemRect(page, 'alpha')).toEqual(before)
    await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled()

    await page.keyboard.press('Control+Shift+z')
    await expect.poll(() => itemRect(page, 'alpha')).toEqual(moved)

    await page.getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => itemRect(page, 'alpha')).toEqual(before)
  })

  test('undo brings a deleted group back with its children', async ({ page }) => {
    await selectInLayers(page, 'header')
    await page.keyboard.press('Delete')
    await expect(page.locator(item('header'))).toHaveCount(0)
    await page.keyboard.press('Control+z')
    await expect(page.locator(item('header'))).toHaveCount(1)
    await expect(page.locator(`${canvasOf('header')} > [data-gridla-item]`)).toHaveCount(2)
  })

  test('duplicate adds a copy of the selected item with the same size', async ({ page }) => {
    const alpha = await itemRect(page, 'alpha')
    const rootItems = page.locator(`${canvasOf('root')} > [data-gridla-item]`)
    const count = await rootItems.count()
    await page.locator(item('alpha')).click()
    await page.keyboard.press('Control+d')
    await expect(rootItems).toHaveCount(count + 1)
    await settleAll(page)

    const copies = page.locator(`${canvasOf('root')} > [data-gridla-item][data-kind="text"]`)
    await expect(copies).toHaveCount(3)
    const ids = await copies.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-gridla-item') ?? ''),
    )
    const copyId = ids.find((id) => id !== 'alpha' && id !== 'beta')
    expect(copyId).toBeTruthy()
    const copy = await itemRect(page, copyId ?? '')
    expect(Math.abs(copy.w - alpha.w)).toBeLessThanOrEqual(2)
    expect(Math.abs(copy.h - alpha.h)).toBeLessThanOrEqual(2)
    expect(copy.x !== alpha.x || copy.y !== alpha.y).toBe(true)
  })

  test('Escape cancels a drag in progress and leaves the item where it was', async ({ page }) => {
    const before = await itemRect(page, 'alpha')
    const start = center(await itemBox(page, 'alpha'))
    await press(page, start.x, start.y)
    await moveTo(page, start, { x: start.x, y: start.y + 150 }, 12)
    await expect(page.locator('[data-gridla-preview]')).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(page.locator('[data-gridla-preview]')).toHaveCount(0)
    await page.mouse.move(start.x, start.y + 200)
    await page.mouse.up()
    await settleAll(page)
    expect(await itemRect(page, 'alpha')).toEqual(before)
  })

  test('Escape clears the selection when nothing is being dragged', async ({ page }) => {
    await page.locator(item('alpha')).click()
    await expect(page.locator('[data-studio-selected]')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-studio-selected]')).toHaveCount(0)
  })
})
