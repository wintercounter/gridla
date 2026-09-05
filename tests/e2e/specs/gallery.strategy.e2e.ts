import {
  expect,
  handlePoint,
  itemRect,
  previewRect,
  resizeBy,
  settledRect,
  test,
  type Page,
} from '../fixtures'

/**
 * Push, swap and shrink behaviour with a live drop preview, on the
 * uncontrolled React demo painted 1:1 (projection off). `chart` and `sidebar`
 * sit side by side with a 12 px gap and the same size, so dragging one over
 * the other swaps them; the sidebar's right edge touches the canvas edge, so
 * growing the chart east can only shrink the sidebar.
 */
const DEMO = 'react-uncontrolled'
const PARAMS = { responsive: false }

const item = (id: string) => `[data-gridla-item="${id}"]`
async function ready(page: Page) {
  await expect(page.locator(item('table'))).toBeVisible()
  await expect.poll(() => itemRect(page, 'header').then((r) => r.w)).toBe(936)
}

async function centerOf(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new Error(`${selector} is not visible`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Press on `chart` and move it over `sidebar` with intermediate steps, holding at the end. */
async function dragChartOverSidebar(page: Page) {
  const [chart, sidebar] = await Promise.all([itemRect(page, 'chart'), itemRect(page, 'sidebar')])
  const start = await centerOf(page, item('chart'))
  const dx = sidebar.x - chart.x
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  for (let i = 1; i <= 16; i += 1) await page.mouse.move(start.x + (dx * i) / 16, start.y)
  return { chart, sidebar }
}

test.use({ viewport: { width: 1600, height: 900 } })

test.describe('gallery: push/swap comparison', () => {
  test.beforeEach(async ({ gallery, page }) => {
    await gallery(DEMO, PARAMS)
    await ready(page)
  })

  test('B-005 dragging over a sibling shows the drop preview at the swap target', async ({
    page,
  }) => {
    const { sidebar } = await dragChartOverSidebar(page)

    await expect(page.locator('[data-gridla-preview]')).toBeVisible()
    const preview = await previewRect(page)
    expect(preview).not.toBeNull()
    expect(Math.abs((preview as { x: number }).x - sidebar.x)).toBeLessThan(8)
    expect(Math.abs((preview as { y: number }).y - sidebar.y)).toBeLessThan(8)
    // The sibling is displaced by the preview.
    await expect(page.locator(item('sidebar'))).toHaveAttribute('data-gridla-shifted', '')
    await page.mouse.up()
  })

  test('C-011 swap preview lands at the sibling; a later resize of the swapped item does not compact it back', async ({
    page,
  }) => {
    const { chart, sidebar } = await dragChartOverSidebar(page)
    const preview = await previewRect(page)
    expect(preview).not.toBeNull()
    expect(Math.abs((preview as { x: number }).x - sidebar.x)).toBeLessThan(8)
    await page.mouse.up()

    // The two traded places.
    const swappedChart = await settledRect(page, 'chart')
    const swappedSidebar = await settledRect(page, 'sidebar')
    expect(Math.abs(swappedChart.x - sidebar.x)).toBeLessThan(8)
    expect(Math.abs(swappedSidebar.x - chart.x)).toBeLessThan(8)
    expect(swappedSidebar.y).toBe(chart.y)

    await resizeBy(page, 'sidebar', 'e', 40, 0)
    const after = await settledRect(page, 'sidebar')
    expect(Math.abs(after.x - swappedSidebar.x)).toBeLessThan(8)
    expect(Math.abs(after.y - swappedSidebar.y)).toBeLessThan(8)
    expect(after.w - swappedSidebar.w).toBeGreaterThanOrEqual(30)
  })

  test('B-041 an east resize shrinks the neighbour live and retreating restores its width', async ({
    page,
  }) => {
    const original = await itemRect(page, 'sidebar')
    const start = await handlePoint(page, 'chart', 'e')

    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    for (let i = 1; i <= 12; i += 1) await page.mouse.move(start.x + (120 * i) / 12, start.y)
    await expect(page.locator(item('sidebar'))).toHaveAttribute('data-gridla-shifted', '')
    // Shifted siblings animate to their preview rect; poll for the settled value.
    await expect
      .poll(() => itemRect(page, 'sidebar').then((r) => r.w))
      .toBeLessThan(original.w - 60)

    for (let i = 1; i <= 15; i += 1) await page.mouse.move(start.x + 120 - 10 * i, start.y)
    await expect
      .poll(() => itemRect(page, 'sidebar').then((r) => Math.abs(r.w - original.w)))
      .toBeLessThanOrEqual(4)
    await expect
      .poll(() => itemRect(page, 'sidebar').then((r) => Math.abs(r.x - original.x)))
      .toBeLessThanOrEqual(1)
    await page.mouse.up()
  })
})
