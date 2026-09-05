import { expect, handlePoint, itemRect, openStudioDocument, resizeBy, test } from '../fixtures'
import { locksDocument } from '../studio-documents'
import {
  center,
  holdDrag,
  inspectorField,
  item,
  itemBox,
  moveTo,
  press,
  projected,
  selectInLayers,
  settleAll,
} from '../studio-helpers'

/**
 * Lock semantics in the studio. The source suite lifted per-item locks in an
 * "edit mode"; the studio has no such mode: a lock (`policy.movement:
 * 'locked'`, toggled with Ctrl/Cmd+L or the inspector) is always enforced, and
 * locked items render no resize handles. The rows below therefore pin what
 * exists (locked items refuse gestures and block neighbours) and keep the
 * override behaviour as fixme.
 */
test.use({ viewport: { width: 2000, height: 1100 } })

test.describe('studio: locks and fixed sizes', () => {
  test.beforeEach(async ({ page }) => {
    await openStudioDocument(page, locksDocument())
    await expect(page.locator(item('card'))).toBeVisible()
    // Group canvases project their children once measured; read rects only after that.
    await projected(page, 'title', 176)
    await settleAll(page)
  })

  test('C-009 a movement-locked item refuses a 160 px drag and exposes no resize handles', async ({
    page,
  }) => {
    const title = page.locator(item('title'))
    await expect(title).toHaveAttribute('data-locked', '')
    await expect(title.locator('[data-gridla-resize-handle]')).toHaveCount(0)
    const before = await itemRect(page, 'title')

    await holdDrag(page, 'title', 160, 0)
    await expect(page.locator('[data-gridla-preview]')).toHaveCount(0)
    await page.mouse.up()
    await settleAll(page)

    const after = await itemRect(page, 'title')
    expect(after).toEqual(before)
  })

  test('C-009 edit mode lifts the lock so the title can be moved and resized', async ({ page }) => {
    test.fixme(true, 'The studio has no edit mode; locks stay enforced while editing.')
    const before = await itemRect(page, 'title')
    await holdDrag(page, 'title', 160, 0)
    await page.mouse.up()
    await resizeBy(page, 'title', 'e', 60, 0)
    await settleAll(page)
    const after = await itemRect(page, 'title')
    expect(after.x).toBeGreaterThan(before.x)
    expect(after.w).toBeGreaterThan(before.w)
  })

  test('B-006 a neighbour dragged onto a locked item slot cannot displace the locked item', async ({
    page,
  }) => {
    const titleBefore = await itemRect(page, 'title')
    const actionBefore = await itemRect(page, 'action')
    await holdDrag(page, 'action', -(actionBefore.x - titleBefore.x), 0, 16)
    await page.mouse.up()
    await settleAll(page)

    const titleAfter = await itemRect(page, 'title')
    const actionAfter = await itemRect(page, 'action')
    expect(titleAfter).toEqual(titleBefore)
    const overlaps =
      actionAfter.x < titleAfter.x + titleAfter.w &&
      actionAfter.x + actionAfter.w > titleAfter.x &&
      actionAfter.y < titleAfter.y + titleAfter.h &&
      actionAfter.y + actionAfter.h > titleAfter.y
    expect(overlaps).toBe(false)
  })

  test('B-006 edit mode lets the locked title move into the adjacent slot', async ({ page }) => {
    test.fixme(true, 'The studio has no edit mode; a locked item never moves by drag.')
    const before = await itemRect(page, 'title')
    const action = await itemRect(page, 'action')
    await holdDrag(page, 'title', action.x - before.x, 0)
    await page.mouse.up()
    await settleAll(page)
    const after = await itemRect(page, 'title')
    expect(after.x - before.x).toBeGreaterThanOrEqual((action.x - before.x) / 2)
  })

  test('B-016 a locked group has no north handle and a header grown south cannot push it', async ({
    page,
  }) => {
    const body = page.locator(item('body'))
    await expect(body).toHaveAttribute('data-locked', '')
    await expect(body.locator(':scope > [data-gridla-resize-handle]')).toHaveCount(0)

    const bodyBefore = await itemRect(page, 'body')
    const headerBefore = await itemRect(page, 'header')
    const handle = await handlePoint(page, 'header', 's')
    await press(page, handle.x, handle.y)
    await moveTo(page, handle, { x: handle.x, y: handle.y + 200 }, 12)
    await page.mouse.up()
    await settleAll(page)

    const bodyAfter = await itemRect(page, 'body')
    const headerAfter = await itemRect(page, 'header')
    expect(bodyAfter).toEqual(bodyBefore)
    // The header may take up the 136 px gap but never overlaps the locked group.
    expect(headerAfter.y + headerAfter.h).toBeLessThanOrEqual(bodyAfter.y + 1)
    expect(headerAfter.h - headerBefore.h).toBeLessThanOrEqual(138)
  })

  test('B-016 edit mode shrinks a resize-locked group from its north handle', async ({ page }) => {
    test.fixme(true, 'The studio has no edit mode; locked groups render no resize handles.')
    const before = await itemRect(page, 'body')
    await resizeBy(page, 'body', 'n', 0, 80)
    await settleAll(page)
    const after = await itemRect(page, 'body')
    expect(after.y - before.y).toBeGreaterThanOrEqual(40)
    expect(before.h - after.h).toBeGreaterThanOrEqual(40)
  })

  test('B-038 a resize-locked group paints an active north handle on proximity in edit mode', async ({
    page,
  }) => {
    test.fixme(true, 'The studio has no edit mode; locked groups render no resize handles.')
    const body = await itemBox(page, 'body')
    await page.mouse.move(body.x + body.w / 2, body.y + 2)
    await expect(
      page.locator('[data-gridla-resize-handle="body"][data-gridla-edge="n"]'),
    ).toHaveCount(1)
    const before = await itemRect(page, 'body')
    await resizeBy(page, 'body', 'n', 0, 80)
    await settleAll(page)
    const after = await itemRect(page, 'body')
    expect(after.y).toBeGreaterThan(before.y)
    expect(before.h - after.h).toBeGreaterThanOrEqual(40)
  })

  test('B-073 a fixed-size item resized from its south-east handle keeps the new size as its fixed size', async ({
    page,
  }) => {
    await page.locator(item('card')).click()
    await expect(page.locator(item('card'))).toHaveAttribute('data-studio-selected', '')
    const before = await itemRect(page, 'card')
    await resizeBy(page, 'card', 'se', 60, 60)
    await settleAll(page)
    const after = await itemRect(page, 'card')
    expect(Math.abs(after.w - before.w - 60)).toBeLessThanOrEqual(4)
    expect(Math.abs(after.h - before.h - 60)).toBeLessThanOrEqual(4)

    // Re-select the item so the inspector shows it (see the selection test below).
    await page.locator(item('card')).click()
    await expect(page.locator(item('card'))).toHaveAttribute('data-studio-selected', '')
    // An empty pin field shows the current size as its placeholder.
    const shown = (label: string) =>
      inspectorField(page, label).evaluate(
        (element) =>
          (element as HTMLInputElement).value || (element as HTMLInputElement).placeholder,
      )
    await expect.poll(() => shown('Fixed width')).toBe(String(after.w))
    await expect.poll(() => shown('Fixed height')).toBe(String(after.h))
  })

  test('a resize gesture keeps the resized item selected', async ({ page }) => {
    await page.locator(item('card')).click()
    await expect(page.locator(item('card'))).toHaveAttribute('data-studio-selected', '')
    await resizeBy(page, 'card', 'se', 60, 60)
    await settleAll(page)
    await expect(page.locator(item('card'))).toHaveAttribute('data-studio-selected', '')
  })

  test('B-074 a fixed 121x36 child keeps its size while its fixed-height group grows and shrinks, then resizes itself', async ({
    page,
  }) => {
    const pin = () => itemRect(page, 'pin')
    const start = await pin()
    expect(start.w).toBe(121)
    expect(start.h).toBe(36)
    const groupBefore = await itemRect(page, 'header')

    await resizeBy(page, 'header', 's', 0, 100)
    await settleAll(page)
    const grown = await itemRect(page, 'header')
    expect(grown.h - groupBefore.h).toBeGreaterThanOrEqual(40)
    expect(await pin()).toMatchObject({ w: 121, h: 36 })

    await resizeBy(page, 'header', 's', 0, -100)
    await settleAll(page)
    const shrunk = await itemRect(page, 'header')
    expect(grown.h - shrunk.h).toBeGreaterThanOrEqual(40)
    expect(await pin()).toMatchObject({ w: 121, h: 36 })

    await page.locator(item('pin')).click()
    await resizeBy(page, 'pin', 'ne', 30, -30)
    await settleAll(page)
    const resized = await pin()
    expect(Math.abs(resized.w - 121) + Math.abs(resized.h - 36)).toBeGreaterThan(4)
  })

  test('the inspector lock toggle makes an item refuse a drag and unlocking restores it', async ({
    page,
  }) => {
    await page.locator(item('card')).click()
    await page.locator('.st-actions button', { hasText: /^Lock$/ }).click()
    await expect(page.locator(item('card'))).toHaveAttribute('data-locked', '')
    const before = await itemRect(page, 'card')
    await holdDrag(page, 'card', 200, 0)
    await page.mouse.up()
    await settleAll(page)
    expect(await itemRect(page, 'card')).toEqual(before)

    // A locked item is not a press target, so re-select it through the layer tree.
    await selectInLayers(page, 'card')
    await page.keyboard.press('Control+l')
    await expect(page.locator(item('card'))).not.toHaveAttribute('data-locked', '')
    const start = center(await itemBox(page, 'card'))
    await press(page, start.x, start.y)
    await moveTo(page, start, { x: start.x + 200, y: start.y }, 12)
    await page.mouse.up()
    await settleAll(page)
    expect((await itemRect(page, 'card')).x - before.x).toBeGreaterThanOrEqual(150)
  })
})
