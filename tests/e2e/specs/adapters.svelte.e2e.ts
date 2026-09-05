import { dragBy, expect, itemRect, resizeBy, settle, settledRect, test } from '../fixtures'

/**
 * Adapter contract for `gridla/svelte`, driven by `examples/adapters/svelte/`:
 * drag commit with a reported strategy, resize through a built-in handle,
 * keyboard nudge after a click, transfer between the nested canvas and the
 * outer one, and the `bind:layout` round trip shown in the JSON readout.
 */
test.describe('adapter svelte', () => {
  test.beforeEach(async ({ adapter }) => {
    await adapter('svelte')
  })

  test('drag commits a move and reports the strategy', async ({ page }) => {
    const before = await settledRect(page, 'chart')
    await dragBy(page, page.locator('[data-gridla-item="chart"] .gd-item-head'), 0, 120)
    const after = await settledRect(page, 'chart')
    expect(after.y).toBeGreaterThan(before.y)
    await expect(page.getByTestId('status')).toContainText('outer: move chart ·')
  })

  test('resize through a built-in handle', async ({ page }) => {
    const before = await settledRect(page, 'chart')
    await resizeBy(page, 'chart', 'e', -80, 0)
    const after = await settledRect(page, 'chart')
    expect(after.w).toBeLessThan(before.w)
    expect(Math.abs(after.w - (before.w - 80))).toBeLessThanOrEqual(2)
    await expect(page.getByTestId('status')).toContainText('outer: resize chart')
  })

  test('click selects and arrow keys nudge the selection', async ({ page }) => {
    const chart = page.locator('[data-gridla-item="chart"]')
    await chart.locator('.gd-item-head').click()
    await expect(chart).toHaveAttribute('data-gridla-selected', '')
    await expect(page.getByTestId('status')).toContainText('click chart')
    const before = await settledRect(page, 'chart')
    await page.keyboard.press('ArrowDown')
    const after = await settledRect(page, 'chart')
    expect(after.y - before.y).toBeGreaterThanOrEqual(6)
    expect(after.y - before.y).toBeLessThanOrEqual(10)
  })

  test('items move from the nested canvas to the outer one and back', async ({ page }) => {
    // The whole stage has to be on screen: drops land where the pointer is.
    await page.setViewportSize({ width: 1280, height: 1000 })
    const outer = page.locator('[data-gridla-canvas]').first()
    const nested = page.locator('.nested[data-gridla-canvas]')
    await expect(nested.locator('[data-gridla-item]')).toHaveCount(2)
    const outerBox = await outer.boundingBox()
    if (!outerBox) throw new Error('outer canvas not visible')

    // Out: drop note-1 into the free bottom row of the outer canvas.
    const noteHead = page.locator('[data-gridla-item="note-1"] .gd-item-head')
    const noteBox = await noteHead.boundingBox()
    if (!noteBox) throw new Error('note-1 not visible')
    // The free space sits under the chart (layout y 376 to 588, left half).
    const targetX = outerBox.x + outerBox.width * 0.2
    const targetY = outerBox.y + outerBox.height * 0.82
    await dragBy(
      page,
      noteHead,
      targetX - (noteBox.x + noteBox.width / 2),
      targetY - (noteBox.y + noteBox.height / 2),
      20,
    )
    await settle(page)
    await expect(nested.locator('[data-gridla-item]')).toHaveCount(1)
    await expect(outer.locator(':scope > [data-gridla-item="note-1"]')).toHaveCount(1)
    await expect(page.getByTestId('status')).toContainText('transfer note-1')

    // Back: drag it into the nested canvas again.
    const nestedBox = await nested.boundingBox()
    const moved = page.locator('[data-gridla-item="note-1"] .gd-item-head')
    const movedBox = await moved.boundingBox()
    if (!nestedBox || !movedBox) throw new Error('nested canvas or note-1 not visible')
    await dragBy(
      page,
      moved,
      nestedBox.x + nestedBox.width * 0.3 - (movedBox.x + movedBox.width / 2),
      nestedBox.y + nestedBox.height * 0.75 - (movedBox.y + movedBox.height / 2),
      20,
    )
    await settle(page)
    await expect(nested.locator('[data-gridla-item]')).toHaveCount(2)
    await expect(outer.locator(':scope > [data-gridla-item="note-1"]')).toHaveCount(0)
  })

  test('bind:layout round-trips through the readout and reset', async ({ page }) => {
    const json = page.getByTestId('layout-json')
    const initial = await itemRect(page, 'chart')
    await dragBy(page, page.locator('[data-gridla-item="chart"] .gd-item-head'), 0, 120)
    const moved = await settledRect(page, 'chart')
    expect(moved.y).toBeGreaterThan(initial.y)
    // Child to parent: the committed layout is what the parent renders.
    const readout = JSON.parse((await json.textContent()) ?? '{}') as {
      outer: Array<{ id: string; y: number }>
    }
    const chart = readout.outer.find((item) => item.id === 'chart')
    expect(chart).toBeDefined()
    expect(Math.abs((chart?.y ?? 0) - moved.y)).toBeLessThanOrEqual(2)
    // Parent to child: replacing the bound layout moves the item back.
    await page.getByTestId('reset').click()
    const reset = await settledRect(page, 'chart')
    expect(reset).toEqual(initial)
    await expect(page.getByTestId('status')).toContainText('reset')
  })
})
