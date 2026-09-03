import { expect, openStudioDocument, test } from '../fixtures'
import { packedDocument } from '../studio-documents'
import {
  box,
  canvasOf,
  center,
  contains,
  item,
  itemBox,
  moveTo,
  paletteBlock,
  press,
  projected,
  selectInLayers,
  settleAll,
} from '../studio-helpers'

/**
 * Palette insertion. A click adds to the active group (the selected group,
 * or the parent of the selected item, or the page); a drag past 6 px previews
 * into whichever canvas is under the pointer and commits on release.
 */
test.use({ viewport: { width: 2000, height: 1100 } })

const ITEMS_IN = (groupId: string) => `${canvasOf(groupId)} > [data-gridla-item]`

test.describe('studio: palette insertion', () => {
  test.beforeEach(async ({ page }) => {
    await openStudioDocument(page, packedDocument())
    await expect(page.locator(item('b'))).toBeVisible()
    // Group canvases project their children once measured; read rects only after that.
    await projected(page, 'a', 216)
    await settleAll(page)
  })

  test('B-050 dragging a palette entry over a packed group shows one preview inside that group', async ({
    page,
  }) => {
    const pack = await itemBox(page, 'pack')
    const target = center(await box(page.locator(canvasOf('pack'))))
    const start = center(await box(paletteBlock(page, 'Stat')))
    await press(page, start.x, start.y)
    await moveTo(page, start, target, 20)

    const previews = page.locator('[data-gridla-preview]')
    await expect(previews).toHaveCount(1)
    const preview = await box(previews.first())
    expect(preview.x).toBeGreaterThanOrEqual(pack.x - 4)
    expect(preview.right).toBeLessThanOrEqual(pack.right + 4)
    expect(contains(pack, preview, 4)).toBe(true)

    await page.keyboard.press('Escape')
    await page.mouse.up()
    await expect(previews).toHaveCount(0)
  })

  test('B-051 while a palette entry hovers a packed group its children move or shrink live', async ({
    page,
  }) => {
    const before = { a: await itemBox(page, 'a'), b: await itemBox(page, 'b') }
    const target = center(await box(page.locator(canvasOf('pack'))))
    const start = center(await box(paletteBlock(page, 'Stat')))
    await press(page, start.x, start.y)
    await moveTo(page, start, target, 20)
    await expect(page.locator('[data-gridla-preview]')).toHaveCount(1)

    // Whichever child the solver displaces, at least one moved or shrank live.
    const drift = async () => {
      let most = 0
      for (const id of ['a', 'b'] as const) {
        const now = await itemBox(page, id)
        const was = before[id]
        most = Math.max(
          most,
          Math.abs(now.x - was.x),
          Math.abs(now.y - was.y),
          Math.abs(now.w - was.w),
          Math.abs(now.h - was.h),
        )
      }
      return most
    }
    await expect.poll(drift).toBeGreaterThan(4)

    // Leaving the canvas clears the preview and the children snap back.
    await moveTo(page, target, start, 20)
    await expect(page.locator('[data-gridla-preview]')).toHaveCount(0)
    await page.mouse.up()
    await settleAll(page)
    expect(await itemBox(page, 'a')).toEqual(before.a)
    expect(await itemBox(page, 'b')).toEqual(before.b)
  })

  test('B-065 click-to-add into a selected packed group grows the group rather than overflowing', async ({
    page,
  }) => {
    await selectInLayers(page, 'pack')
    await expect(page.locator(item('pack'))).toHaveAttribute('data-studio-selected', '')
    const before = await itemBox(page, 'pack')
    const count = await page.locator(ITEMS_IN('pack')).count()

    await paletteBlock(page, 'Stat').click()
    await expect(page.locator(ITEMS_IN('pack'))).toHaveCount(count + 1)
    await settleAll(page)
    const after = await itemBox(page, 'pack')
    expect(after.h).toBeGreaterThanOrEqual(before.h - 4)
    const added = page.locator(`${ITEMS_IN('pack')}[data-kind="stat"]`)
    await expect(added).toHaveCount(1)
    expect(contains(after, await box(added), 4)).toBe(true)
  })

  test('B-066 click-to-add places the new item fully inside the page canvas', async ({ page }) => {
    await page.locator(item('side')).click()
    const count = await page.locator(ITEMS_IN('root')).count()
    await paletteBlock(page, 'Chart').click()
    await expect(page.locator(ITEMS_IN('root'))).toHaveCount(count + 1)
    await settleAll(page)
    const canvas = await box(page.locator(canvasOf('root')))
    const added = page.locator(`${ITEMS_IN('root')}[data-kind="chart"]`)
    await expect(added).toHaveCount(1)
    expect(contains(canvas, await box(added), 1)).toBe(true)
  })

  test('drag-to-add commits into the page canvas at the pointer', async ({ page }) => {
    const canvas = await box(page.locator(canvasOf('root')))
    const target = { x: canvas.x + 300, y: canvas.y + 450 }
    const start = center(await box(paletteBlock(page, 'Button')))
    await press(page, start.x, start.y)
    await moveTo(page, start, target, 20)
    await expect(page.locator('[data-gridla-preview]')).toHaveCount(1)
    await page.mouse.up()
    await settleAll(page)

    const added = page.locator(`${ITEMS_IN('root')}[data-kind="button"]`)
    await expect(added).toHaveCount(1)
    const rect = await box(added)
    expect(contains(canvas, rect, 1)).toBe(true)
    expect(Math.abs(rect.y - target.y)).toBeLessThan(rect.h + 40)
    expect(Math.abs(rect.x - target.x)).toBeLessThan(rect.w + 40)
  })

  test('drag-to-add commits into a packed group', async ({ page }) => {
    const target = center(await box(page.locator(canvasOf('pack'))))
    const start = center(await box(paletteBlock(page, 'Stat')))
    await press(page, start.x, start.y)
    await moveTo(page, start, target, 20)
    await expect(page.locator('[data-gridla-preview]')).toHaveCount(1)
    await page.mouse.up()
    await settleAll(page)

    const added = page.locator(`${ITEMS_IN('pack')}[data-kind="stat"]`)
    await expect(added).toHaveCount(1)
    expect(contains(await itemBox(page, 'pack'), await box(added), 4)).toBe(true)
  })
})
