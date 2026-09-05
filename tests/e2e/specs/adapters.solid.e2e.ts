import { dragBy, expect, resizeBy, settledRect, test, type Page } from '../fixtures'

/**
 * Adapter contract against the Solid demo app (examples/adapters/solid):
 * `gridla/solid` rendering a controlled dashboard with a nested group inside
 * a `GridTransferScope`. The layout is projected onto the stage, so
 * assertions compare rectangles before and after a gesture rather than
 * authored pixels. Keyboard nudges are unprojected 8 px steps
 * (`keyboardStep`), which the projection scales.
 */
const item = (id: string) => `[data-gridla-item="${id}"]`

/** Class of the canvas that directly hosts an item: `outer` or `nested`. */
async function canvasOf(page: Page, id: string) {
  return page
    .locator(item(id))
    .first()
    .locator('xpath=ancestor::*[@data-gridla-canvas][1]')
    .first()
    .getAttribute('class')
}

test.describe('adapter solid: gestures', () => {
  test.beforeEach(async ({ adapter, page }) => {
    await adapter('solid')
    await expect(page.locator(item('table'))).toBeVisible()
  })

  test('drag commits a move and reports the strategy', async ({ page }) => {
    const before = await settledRect(page, 'sidebar')
    await dragBy(page, page.locator(item('sidebar')).locator('.gd-item-head'), 0, 60)
    const after = await settledRect(page, 'sidebar')
    expect(after.y).toBeGreaterThan(before.y)
    expect(after.w).toBe(before.w)
    await expect(page.getByTestId('status')).toContainText('(move)')
    await expect(page.getByTestId('status')).not.toContainText('last strategy: none')
  })

  test('resize from the south-east handle grows the item', async ({ page }) => {
    const before = await settledRect(page, 'sidebar')
    await resizeBy(page, 'sidebar', 'se', 60, 40)
    const after = await settledRect(page, 'sidebar')
    expect(after.w).toBeGreaterThan(before.w)
    expect(after.h).toBeGreaterThan(before.h)
    await expect(page.getByTestId('status')).toContainText('(resize)')
  })

  test('arrow keys nudge the selected item after a click', async ({ page }) => {
    const sidebar = page.locator(item('sidebar'))
    const before = await settledRect(page, 'sidebar')
    await sidebar.locator('.gd-item-head').click()
    await expect(sidebar).toHaveAttribute('data-gridla-selected', '')
    await page.keyboard.press('ArrowRight')
    const after = await settledRect(page, 'sidebar')
    expect(after.x).toBeGreaterThan(before.x)
    expect(after.y).toBe(before.y)
  })

  test('items transfer from the nested group to the page and back', async ({ page }) => {
    expect(await canvasOf(page, 'note-1')).toBe('nested')
    const note = page.locator(item('note-1'))
    const sidebar = await page.locator(item('sidebar')).boundingBox()
    const noteBox = await note.boundingBox()
    if (!sidebar || !noteBox) throw new Error('items are not visible')
    // Out: drop the note into the free room right of the sidebar.
    await dragBy(
      page,
      note.locator('.gd-item-head'),
      sidebar.x + sidebar.width + 70 - (noteBox.x + noteBox.width / 2),
      sidebar.y + sidebar.height / 2 - (noteBox.y + noteBox.height / 2),
      20,
    )
    await expect.poll(() => canvasOf(page, 'note-1')).toBe('outer')
    await expect(page.getByTestId('status')).toContainText('(transfer)')
    await expect(page.locator(item('group')).locator(item('note-1'))).toHaveCount(0)

    // Back: drop it into the free room under the group's remaining note.
    await settledRect(page, 'note-1')
    const group = await page.locator(item('group')).locator('.nested').boundingBox()
    const moved = await page.locator(item('note-1')).boundingBox()
    if (!group || !moved) throw new Error('items are not visible')
    await dragBy(
      page,
      page.locator(item('note-1')).locator('.gd-item-head'),
      group.x + group.width * 0.3 - (moved.x + moved.width / 2),
      group.y + group.height * 0.75 - (moved.y + moved.height / 2),
      20,
    )
    await expect.poll(() => canvasOf(page, 'note-1')).toBe('nested')
    await expect(page.locator(item('group')).locator(item('note-1'))).toHaveCount(1)
  })

  test('controlled layout round-trips through the JSON readout and reset', async ({ page }) => {
    const readout = page.getByTestId('layout-json')
    const initial = await readout.textContent()
    const before = await settledRect(page, 'sidebar')
    await dragBy(page, page.locator(item('sidebar')).locator('.gd-item-head'), 0, 60)
    const after = await settledRect(page, 'sidebar')
    expect(after.y).toBeGreaterThan(before.y)
    await expect(readout).not.toHaveText(initial ?? '')
    const json = await readout.textContent()
    const match = /id: "sidebar", x: \d+, y: (\d+)/.exec(json ?? '')
    expect(match).not.toBeNull()
    // The readout is in authored coordinates; the stage is a projection of it.
    expect(Number(match?.[1])).toBeGreaterThan(96)

    await page.getByTestId('reset').click()
    await expect(readout).toHaveText(initial ?? '')
    const reset = await settledRect(page, 'sidebar')
    expect(reset.y).toBe(before.y)
    expect(reset.w).toBe(before.w)
  })
})
