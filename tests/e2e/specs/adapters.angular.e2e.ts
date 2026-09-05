import { dragBy, expect, itemRect, resizeBy, settledRect, test, type Page } from '../fixtures'

/**
 * Angular adapter contract against `examples/adapters/angular/`: a dashboard
 * bound with `[(layout)]`, a group item hosting a nested provider inside a
 * transfer scope, built-in resize handles, a status line showing the last
 * change, and JSON readouts of both two-way bound layouts.
 */
const item = (id: string) => `[data-gridla-item="${id}"]`

type Readout = { items: Array<{ id: string; x: number; y: number; w: number; h: number }> }

async function readout(page: Page, selector: string): Promise<Readout> {
  return JSON.parse((await page.locator(selector).textContent()) ?? '{}') as Readout
}

test.use({ viewport: { width: 1400, height: 900 } })

test.describe('adapter angular', () => {
  test.beforeEach(async ({ adapter, page }) => {
    await adapter('angular')
    await expect(page.locator(item('table'))).toBeVisible()
    await expect(page.locator(item('note-2'))).toBeVisible()
  })

  test('drag commits through [(layout)] and reports the strategy', async ({ page }) => {
    const before = await settledRect(page, 'chart')
    await dragBy(page, page.locator(item('chart')), 0, 160)
    const after = await settledRect(page, 'chart')
    expect(after.y).toBeGreaterThan(before.y + 100)
    await expect(page.locator('#status')).toHaveText(/outer · move · [a-z-]+ · chart/)
    await expect(page.locator('#status')).toHaveAttribute('data-strategy', /[a-z-]+/)
    // The parent's signal (rendered through the JSON readout) matches the DOM.
    const outer = await readout(page, '#layout-json')
    const chart = outer.items.find((entry) => entry.id === 'chart')
    expect(chart).toBeDefined()
    expect(Math.abs(Math.round(chart!.y) - after.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(Math.round(chart!.x) - after.x)).toBeLessThanOrEqual(1)
  })

  test('resize via the east handle changes the item and updates the readout', async ({ page }) => {
    const before = await settledRect(page, 'header')
    await resizeBy(page, 'header', 'e', -120, 0)
    const after = await settledRect(page, 'header')
    expect(after.w).toBeLessThan(before.w - 80)
    await expect(page.locator('#status')).toHaveText(/outer · resize · [a-z-]+ · header/)
    const outer = await readout(page, '#layout-json')
    const header = outer.items.find((entry) => entry.id === 'header')
    expect(Math.abs(Math.round(header!.w) - after.w)).toBeLessThanOrEqual(1)
  })

  test('click selects and arrow keys nudge the selected item', async ({ page }) => {
    const chart = page.locator(item('chart'))
    const before = await settledRect(page, 'chart')
    await chart.click()
    await expect(chart).toHaveAttribute('data-gridla-selected', '')
    // Make room first (Alt resizes, Shift multiplies the step), then nudge.
    await page.keyboard.press('Alt+Shift+ArrowLeft')
    await page.keyboard.press('Alt+Shift+ArrowLeft')
    const shrunk = await settledRect(page, 'chart')
    expect(shrunk).toEqual({ ...before, w: before.w - 64 })
    await expect(page.locator('#status')).toHaveText(/outer · resize · [a-z-]+ · chart/)
    await page.keyboard.press('ArrowRight')
    const after = await settledRect(page, 'chart')
    expect(after).toEqual({ ...shrunk, x: shrunk.x + 8 })
    await expect(page.locator('#status')).toHaveText(/outer · move · [a-z-]+ · chart/)
    const outer = await readout(page, '#layout-json')
    const entry = outer.items.find((candidate) => candidate.id === 'chart')!
    expect(Math.abs(Math.round(entry.x) - after.x)).toBeLessThanOrEqual(1)
  })

  test('items move between the nested group and the outer canvas', async ({ page }) => {
    const groupCanvas = page.locator('.group-canvas')
    await expect(groupCanvas.locator(item('note-1'))).toHaveCount(1)

    // Out: drop note-1 over the table row of the outer canvas.
    const table = await page.locator(item('table')).boundingBox()
    const note = await page.locator(item('note-1')).boundingBox()
    if (!table || !note) throw new Error('note or table not visible')
    const targetX = table.x + table.width * 0.7
    const targetY = table.y + table.height / 2
    await dragBy(
      page,
      page.locator(item('note-1')),
      targetX - (note.x + note.width / 2),
      targetY - (note.y + note.height / 2),
      20,
    )
    await expect(groupCanvas.locator(item('note-1'))).toHaveCount(0)
    const outerNote = page
      .locator('[data-gridla-canvas]')
      .first()
      .locator(`> ${item('note-1')}`)
    await expect(outerNote).toHaveCount(1)
    await expect(page.locator('#status')).toHaveText(/transfer/)
    const outer = await readout(page, '#layout-json')
    expect(outer.items.map((entry) => entry.id)).toContain('note-1')
    const group = await readout(page, '#group-json')
    expect(group.items.map((entry) => entry.id)).not.toContain('note-1')

    // Back in: drop it onto the group's canvas.
    const groupBox = await groupCanvas.boundingBox()
    const moved = await page.locator(item('note-1')).boundingBox()
    if (!groupBox || !moved) throw new Error('group or note not visible')
    await dragBy(
      page,
      page.locator(item('note-1')),
      groupBox.x + groupBox.width * 0.3 - (moved.x + moved.width / 2),
      groupBox.y + groupBox.height * 0.6 - (moved.y + moved.height / 2),
      20,
    )
    await expect(groupCanvas.locator(item('note-1'))).toHaveCount(1)
    const groupAfter = await readout(page, '#group-json')
    expect(groupAfter.items.map((entry) => entry.id)).toContain('note-1')
    const outerAfter = await readout(page, '#layout-json')
    expect(outerAfter.items.map((entry) => entry.id)).not.toContain('note-1')
    // The nested item rect matches the nested readout.
    const rect = await itemRect(page, 'note-1')
    const entry = groupAfter.items.find((candidate) => candidate.id === 'note-1')!
    expect(Math.abs(Math.round(entry.x) - rect.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(Math.round(entry.y) - rect.y)).toBeLessThanOrEqual(1)
  })

  test('[(layout)] round trip: a parent update flows back into the canvas', async ({ page }) => {
    const before = await settledRect(page, 'chart')
    await dragBy(page, page.locator(item('chart')), 0, 160)
    const moved = await settledRect(page, 'chart')
    expect(moved.y).toBeGreaterThan(before.y + 100)
    // The parent replaces both layout signals; the providers follow the new inputs.
    await page.getByRole('button', { name: 'Reset layouts' }).click()
    const after = await settledRect(page, 'chart')
    expect(after).toEqual(before)
    await expect(page.locator('#status')).toHaveText('reset')
    const outer = await readout(page, '#layout-json')
    const entry = outer.items.find((candidate) => candidate.id === 'chart')!
    expect(Math.abs(Math.round(entry.y) - before.y)).toBeLessThanOrEqual(1)
  })
})
