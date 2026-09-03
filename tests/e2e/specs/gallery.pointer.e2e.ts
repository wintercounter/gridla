import { expect, itemRect, resizeBy, test, type Page } from '../fixtures'

/**
 * Pointer gestures against the uncontrolled React demo with projection off, so
 * the canvas is painted at its authored 960x600 size and every number below is
 * an authored pixel. The dashboard layout (gap 12, padding 12):
 *
 *   header  12,12   936x72   (fixed height)
 *   chart   12,96   456x280  minH 120, minW 160
 *   sidebar 492,96  456x280  minH 120, minW 120
 *   table   12,388  936x200  minH 80
 *
 * The canvas is bounded, so the table can only shrink to 80 before a gesture
 * that pushes it further is rejected.
 */
const DEMO = 'react-uncontrolled'
const PARAMS = { responsive: false }
const TABLE_SLACK = 200 - 80

const item = (id: string) => `[data-gridla-item="${id}"]`
const handle = (id: string, edge: string) =>
  `[data-gridla-resize-handle="${id}"][data-gridla-edge="${edge}"]`

/** Wait until the canvas is painted 1:1 with the authored layout. */
async function ready(page: Page) {
  await expect(page.locator(item('table'))).toBeVisible()
  await expect.poll(() => itemRect(page, 'header').then((r) => r.w)).toBe(936)
}

/** Resize handles found at a client point, as `[itemId, edge]` pairs. */
function handlesAt(page: Page, x: number, y: number) {
  return page.evaluate(
    ([px, py]) =>
      document
        .elementsFromPoint(px, py)
        .filter((element) => element.hasAttribute('data-gridla-resize-handle'))
        .map((element) => [
          element.getAttribute('data-gridla-resize-handle'),
          element.getAttribute('data-gridla-edge'),
        ]),
    [x, y] as const,
  )
}

function centerOf(box: { x: number; y: number; width: number; height: number }) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

test.use({ viewport: { width: 1600, height: 900 } })

test.describe('gallery: pointer interactions', () => {
  test.beforeEach(async ({ gallery, page }) => {
    await gallery(DEMO, PARAMS)
    await ready(page)
  })

  test('C-004 no move handle exists; only the east handle is under the pointer at the east edge', async ({
    page,
  }) => {
    const chart = page.locator(item('chart'))
    await chart.click()
    await expect(chart).toHaveAttribute('data-gridla-selected', '')

    // The whole item is the drag surface: no separate move handle element.
    await expect(chart.locator('[data-gridla-drag-handle]')).toHaveCount(0)

    const box = await chart.boundingBox()
    if (!box) throw new Error('chart is not visible')
    const center = centerOf(box)
    await page.mouse.move(center.x, center.y)
    expect(await handlesAt(page, center.x, center.y)).toEqual([])

    const edgeX = box.x + box.width - 2
    await page.mouse.move(edgeX, center.y)
    expect(await handlesAt(page, edgeX, center.y)).toEqual([['chart', 'e']])
  })

  test('B-001 hovering 2 px inside the east edge finds exactly one east handle', async ({
    page,
  }) => {
    const box = await page.locator(item('sidebar')).boundingBox()
    if (!box) throw new Error('sidebar is not visible')
    const x = box.x + box.width - 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    const found = await handlesAt(page, x, y)
    expect(found).toHaveLength(1)
    expect(found[0]).toEqual(['sidebar', 'e'])
  })

  test.skip(
    'B-002 the move handle is hidden at the bottom and shown near the top centre',
    'The adapter has no proximity move handle: the whole item (or an explicit drag surface) starts a move, so there is no opacity to measure.',
  )

  test('C-006 an item with free move and resize can be dragged down and exposes its east handle', async ({
    page,
  }) => {
    const chart = page.locator(item('chart'))
    const before = await itemRect(page, 'chart')
    const box = await chart.boundingBox()
    if (!box) throw new Error('chart is not visible')
    const start = centerOf(box)
    const dy = TABLE_SLACK

    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    for (let i = 1; i <= 12; i += 1) await page.mouse.move(start.x, start.y + (dy * i) / 12)
    await page.mouse.up()

    const after = await itemRect(page, 'chart')
    expect(after.y - before.y).toBeGreaterThanOrEqual(dy - 8)
    expect(after.y - before.y).toBeLessThanOrEqual(dy + 8)
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(8)

    const moved = await chart.boundingBox()
    if (!moved) throw new Error('chart is not visible')
    const x = moved.x + moved.width - 2
    const y = moved.y + moved.height / 2
    await page.mouse.move(x, y)
    expect(await handlesAt(page, x, y)).toEqual([['chart', 'e']])
  })

  test('C-008 pointercancel leaves the item in place; a real drag suppresses selection and pushes the neighbour', async ({
    page,
  }) => {
    const chart = page.locator(item('chart'))
    const chartBefore = await itemRect(page, 'chart')
    const tableBefore = await itemRect(page, 'table')
    const box = await chart.boundingBox()
    if (!box) throw new Error('chart is not visible')
    const start = centerOf(box)
    const suppressed = () =>
      page.evaluate(() => document.documentElement.hasAttribute('data-gridla-dragging'))

    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 1, start.y)
    await chart.evaluate((element) =>
      element.dispatchEvent(
        new PointerEvent('pointercancel', { bubbles: true, pointerId: 1, pointerType: 'mouse' }),
      ),
    )
    await page.mouse.up()

    const afterCancel = await itemRect(page, 'chart')
    expect(Math.abs(afterCancel.x - chartBefore.x)).toBeLessThan(3)
    expect(Math.abs(afterCancel.y - chartBefore.y)).toBeLessThan(3)
    expect(await suppressed()).toBe(false)

    const dy = 60
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    for (let i = 1; i <= 10; i += 1) await page.mouse.move(start.x, start.y + (dy * i) / 10)
    await expect(chart).toHaveAttribute('data-gridla-active', '')
    expect(await suppressed()).toBe(true)
    expect(await page.evaluate(() => String(window.getSelection()))).toBe('')
    await page.mouse.up()

    await expect(chart).not.toHaveAttribute('data-gridla-active', '')
    expect(await suppressed()).toBe(false)
    const tableAfter = await itemRect(page, 'table')
    expect(tableAfter.y - tableBefore.y).toBeGreaterThanOrEqual(20)
  })

  test('B-008 the active item stacks above the drop preview', async ({ page }) => {
    const chart = page.locator(item('chart'))
    const [chartRect, sidebarRect] = await Promise.all([
      itemRect(page, 'chart'),
      itemRect(page, 'sidebar'),
    ])
    const box = await chart.boundingBox()
    if (!box) throw new Error('chart is not visible')
    const start = centerOf(box)
    const dx = sidebarRect.x - chartRect.x

    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    for (let i = 1; i <= 12; i += 1) await page.mouse.move(start.x + (dx * i) / 12, start.y)

    await expect(page.locator('[data-gridla-preview]')).toBeVisible()
    const zIndex = (selector: string) =>
      page.evaluate((s) => {
        const raw = getComputedStyle(document.querySelector(s) as Element).zIndex
        return raw === 'auto' ? 0 : Number(raw)
      }, selector)
    const active = await zIndex('[data-gridla-item][data-gridla-active]')
    const preview = await zIndex('[data-gridla-preview]')
    expect(active).toBeGreaterThan(preview)
    await page.mouse.up()
  })

  test('B-013 a 4 px move right after pointer-down already translates the item by 4 px', async ({
    page,
  }) => {
    const chart = page.locator(item('chart'))
    const before = await itemRect(page, 'chart')
    const box = await chart.boundingBox()
    if (!box) throw new Error('chart is not visible')
    const start = centerOf(box)

    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 4, start.y + 4)

    await expect(chart).toHaveAttribute('data-gridla-active', '')
    const during = await itemRect(page, 'chart')
    expect(Math.abs(during.x - (before.x + 4))).toBeLessThan(2)
    expect(Math.abs(during.y - (before.y + 4))).toBeLessThan(2)
    await page.mouse.up()
  })

  test('B-032 a south resize far past the blocking neighbour keeps the live rect at the last valid size', async ({
    page,
  }) => {
    // The gallery renders no north handle, so the same rule is exercised from
    // the south edge against the table pinned to the bounded canvas bottom.
    const before = await itemRect(page, 'chart')
    const box = await page.locator(handle('chart', 's')).boundingBox()
    if (!box) throw new Error('south handle of chart is not visible')
    const start = centerOf(box)
    const dy = 400

    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    for (let i = 1; i <= 16; i += 1) await page.mouse.move(start.x, start.y + (dy * i) / 16)

    const live = await itemRect(page, 'chart')
    expect(live.y).toBe(before.y)
    expect(live.h).toBeGreaterThan(before.h)
    expect(live.h).toBeLessThanOrEqual(before.h + TABLE_SLACK + 2)
    // The pointer sits 400 px below the original bottom; the rect did not follow it.
    expect(live.y + live.h).toBeLessThan(before.y + before.h + dy - 200)
    await page.mouse.up()

    const committed = await itemRect(page, 'chart')
    expect(committed.h).toBe(live.h)
  })

  test('B-033 pointer capture keeps a resize alive off-canvas and commits on return', async ({
    page,
  }) => {
    const before = await itemRect(page, 'chart')
    const box = await page.locator(handle('chart', 's')).boundingBox()
    if (!box) throw new Error('south handle of chart is not visible')
    const start = centerOf(box)
    const viewport = page.viewportSize()
    if (!viewport) throw new Error('viewport is unknown')

    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    for (let i = 1; i <= 4; i += 1) await page.mouse.move(start.x, start.y + 10 * i)
    // Leave the canvas entirely while the button stays down.
    await page.mouse.move(viewport.width - 10, start.y + 40)
    await page.mouse.move(viewport.width - 10, start.y + 60)
    await expect(page.locator(item('chart'))).toHaveAttribute('data-gridla-active', '')
    await page.mouse.move(start.x, start.y + 60)
    await page.mouse.up()

    const after = await itemRect(page, 'chart')
    expect(after.h - before.h).toBeGreaterThanOrEqual(40)
    expect(after.h - before.h).toBeLessThanOrEqual(64)
  })

  test('B-035 two consecutive resizes with a release between them both commit', async ({
    page,
  }) => {
    // Adapted to the east handle: the neighbour has 336 px of slack there,
    // enough for both gestures to be accepted in full.
    const first = await itemRect(page, 'chart')
    await resizeBy(page, 'chart', 'e', 80, 0)
    const second = await itemRect(page, 'chart')
    expect(second.w - first.w).toBeGreaterThanOrEqual(30)
    expect(second.x).toBe(first.x)

    await resizeBy(page, 'chart', 'e', 60, 0)
    const third = await itemRect(page, 'chart')
    expect(third.w - second.w).toBeGreaterThanOrEqual(30)
    expect(third.x).toBe(first.x)
  })

  test('B-037 releasing in invalid territory commits the last valid preview, not the pre-drag size', async ({
    page,
  }) => {
    const original = await itemRect(page, 'chart')
    await resizeBy(page, 'chart', 's', 0, 100)
    const grown = await itemRect(page, 'chart')
    expect(grown.h - original.h).toBeGreaterThanOrEqual(90)

    const box = await page.locator(handle('chart', 's')).boundingBox()
    if (!box) throw new Error('south handle of chart is not visible')
    const start = centerOf(box)
    const viewport = page.viewportSize()
    if (!viewport) throw new Error('viewport is unknown')
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    const target = viewport.height - 4
    for (let i = 1; i <= 16; i += 1) {
      await page.mouse.move(start.x, start.y + ((target - start.y) * i) / 16)
    }
    await page.mouse.up()

    const after = await itemRect(page, 'chart')
    expect(after.y).toBe(grown.y)
    expect(after.h).toBeGreaterThanOrEqual(grown.h - 2)
    // The table had 20 px left before its minimum; the commit can use at most that.
    expect(after.h).toBeLessThanOrEqual(grown.h + (TABLE_SLACK - 100) + 2)
    expect(after.h).not.toBe(original.h)
  })
})
