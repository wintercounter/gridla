import { expect, handlePoint, itemRect, openStudioDocument, resizeBy, test } from '../fixtures'
import { nestedDocument } from '../studio-documents'
import {
  box,
  canvasOf,
  center,
  contains,
  item,
  itemBox,
  moveTo,
  nudgeUntil,
  press,
  projected,
  previewIn,
  settleAll,
} from '../studio-helpers'

/**
 * Nested groups in the studio: every group is its own provider and canvas
 * (see tests/e2e/studio-documents.ts for the seeded geometry). Numbers are
 * read from the DOM in client space; the root canvas is projected 1200 -> 1198
 * and each group canvas sits below a ~30 px head, so tolerances are a few px.
 */
test.use({ viewport: { width: 2000, height: 1100 } })

test.describe('studio: nested groups', () => {
  test.beforeEach(async ({ page }) => {
    await openStudioDocument(page, nestedDocument())
    await expect(page.locator(item('right'))).toBeVisible()
    // Group canvases project their children once measured; read rects only after that.
    await projected(page, 'title', 176)
    await settleAll(page)
  })

  test('C-003 clicking a child selects the child directly; the group never enters the selection log', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const log: string[] = []
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          const element = record.target as HTMLElement
          if (element.hasAttribute('data-studio-selected'))
            log.push(element.getAttribute('data-gridla-item') ?? '?')
        }
      })
      observer.observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-studio-selected'],
      })
      ;(window as unknown as { selectionLog: string[] }).selectionLog = log
    })

    await page.locator(item('left')).click()
    await expect(page.locator(item('left'))).toHaveAttribute('data-studio-selected', '')
    await expect(page.locator(item('body'))).not.toHaveAttribute('data-studio-selected', '')
    const log = await page.evaluate(
      () => (window as unknown as { selectionLog: string[] }).selectionLog,
    )
    expect(log).toContain('left')
    expect(log).not.toContain('body')
    expect(log).not.toContain('header')
  })

  test('B-007 clicking a child selects the child, not the group', async ({ page }) => {
    await page.locator(item('title')).click()
    await expect(page.locator(item('title'))).toHaveAttribute('data-studio-selected', '')
    await expect(page.locator('[data-studio-selected]')).toHaveCount(1)
    await expect(page.locator(item('header'))).not.toHaveAttribute('data-studio-selected', '')
  })

  test('C-007 a 5 px drag of a child shows a preview inside its group and never re-parents it', async ({
    page,
  }) => {
    const bodyBox = await itemBox(page, 'body')
    const start = center(await itemBox(page, 'left'))
    await press(page, start.x, start.y)
    await moveTo(page, start, { x: start.x + 5, y: start.y + 5 }, 5)

    const preview = page.locator(previewIn('body'))
    await expect(preview).toBeVisible()
    const previewBox = await box(preview)
    expect(contains(bodyBox, previewBox, 4)).toBe(true)
    await expect(page.locator(previewIn('root'))).toHaveCount(0)
    await expect(page.locator(previewIn('header'))).toHaveCount(0)

    await page.mouse.up()
    await settleAll(page)
    await expect(page.locator(`${canvasOf('body')} > ${item('left')}`)).toHaveCount(1)
    expect(contains(await itemBox(page, 'body'), await itemBox(page, 'left'), 4)).toBe(true)
  })

  test('C-014 after a cross-group drop the committed rect equals the last preview (within 3 px)', async ({
    page,
  }) => {
    const header = await box(page.locator(canvasOf('header')))
    const start = center(await itemBox(page, 'right'))
    // The header keeps a free 424x176 area east of its action button.
    const target = { x: header.x + 930, y: header.y + header.h / 2 }
    await press(page, start.x, start.y)
    // Start the move inside the body, then cross into the header in one step:
    // a pointer sample in the root gap between the groups would place a root
    // preview there and push the header away from the pointer.
    await moveTo(page, start, { x: start.x + 20, y: start.y - 20 }, 6)
    await page.mouse.move(target.x, target.y)

    const preview = page.locator(previewIn('header'))
    await nudgeUntil(page, target, () => preview.count().then((n) => n > 0))
    const previewBox = await box(preview)
    await page.mouse.up()
    await settleAll(page)

    await expect(page.locator(`${canvasOf('header')} > ${item('right')}`)).toHaveCount(1)
    const committed = await itemBox(page, 'right')
    expect(Math.abs(committed.x - previewBox.x)).toBeLessThanOrEqual(3)
    expect(Math.abs(committed.y - previewBox.y)).toBeLessThanOrEqual(3)
  })

  test('B-044 during a cross-group drag the active item and the preview share one rect (<=2 px)', async ({
    page,
  }) => {
    test.fixme(
      true,
      'The adapter lets the active item follow the pointer while the preview snaps to the solved slot, so the two rects differ by the pointer offset.',
    )
    const header = await box(page.locator(canvasOf('header')))
    const start = center(await itemBox(page, 'action'))
    const body = await box(page.locator(canvasOf('body')))
    await press(page, start.x, start.y)
    await moveTo(page, start, { x: body.x + 300, y: body.y + body.h / 2 }, 16)
    expect(header.h).toBeGreaterThan(0)

    const preview = page.locator(previewIn('body'))
    await expect(preview).toBeVisible()
    const previewBox = await box(preview)
    const active = await box(page.locator('[data-gridla-item][data-gridla-active]').first())
    expect(Math.abs(active.x - previewBox.x)).toBeLessThanOrEqual(2)
    expect(Math.abs(active.y - previewBox.y)).toBeLessThanOrEqual(2)
    expect(Math.abs(active.w - previewBox.w)).toBeLessThanOrEqual(2)
    expect(Math.abs(active.h - previewBox.h)).toBeLessThanOrEqual(2)
    await page.mouse.up()
  })

  test('B-017 while a group is resized from the north its children have already shrunk', async ({
    page,
  }) => {
    await page.locator(item('body')).locator('[data-gridla-drag-handle="body"]').click()
    const before = await itemBox(page, 'left')
    const handle = await handlePoint(page, 'body', 'n')
    await press(page, handle.x, handle.y)
    await moveTo(page, handle, { x: handle.x, y: handle.y + 100 }, 12)

    await expect
      .poll(() => itemBox(page, 'left').then((r) => before.h - r.h))
      .toBeGreaterThanOrEqual(40)
    await page.mouse.up()
  })

  test('B-030 while a header is resized south the neighbour group and its children move mid-drag', async ({
    page,
  }) => {
    const before = await itemBox(page, 'left')
    const handle = await handlePoint(page, 'header', 's')
    await press(page, handle.x, handle.y)
    await moveTo(page, handle, { x: handle.x, y: handle.y + 80 }, 12)

    await expect
      .poll(() => itemBox(page, 'left').then((r) => r.y - before.y))
      .toBeGreaterThanOrEqual(40)
    await page.mouse.up()
  })

  test('B-047 a root drag that pushes a sibling group moves that group children mid-drag', async ({
    page,
  }) => {
    const headerBefore = await itemBox(page, 'header')
    const titleBefore = await itemBox(page, 'title')
    const start = center(await itemBox(page, 'note'))
    // Hold the pointer over the header group's head strip: that is root
    // space, so the drop preview pushes the whole group down.
    await press(page, start.x, start.y)
    await moveTo(page, start, { x: start.x, y: headerBefore.y + 12 }, 16)

    await expect
      .poll(() => itemBox(page, 'header').then((r) => r.y - headerBefore.y))
      .toBeGreaterThan(40)
    const headerNow = await itemBox(page, 'header')
    const titleNow = await itemBox(page, 'title')
    const shift = headerNow.y - headerBefore.y
    expect(Math.abs(titleNow.y - titleBefore.y - shift)).toBeLessThanOrEqual(6)
    await page.mouse.up()
  })

  test('B-054 dropping into the gap between two groups keeps the lower group children inside it', async ({
    page,
  }) => {
    const header = await itemBox(page, 'header')
    const body = await itemBox(page, 'body')
    const gapY = (header.bottom + body.y) / 2
    const start = center(await itemBox(page, 'action'))
    await press(page, start.x, start.y)
    await moveTo(page, start, { x: body.x + 300, y: gapY }, 16)

    await expect(page.locator(previewIn('root'))).toBeVisible()
    await expect.poll(() => itemBox(page, 'body').then((r) => r.y)).toBeGreaterThan(body.y + 20)
    // The pushed group and its children animate to their new rects; poll so
    // the containment check reads a settled frame.
    await expect
      .poll(async () => {
        const bodyNow = await itemBox(page, 'body')
        return (
          contains(bodyNow, await itemBox(page, 'left'), 4) &&
          contains(bodyNow, await itemBox(page, 'right'), 4)
        )
      })
      .toBe(true)
    await page.mouse.up()
  })

  test('B-023 the group head drags the group with its children; clicks on children target the child', async ({
    page,
  }) => {
    const groupBefore = await itemBox(page, 'body')
    const leftBefore = await itemBox(page, 'left')
    const head = page.locator('[data-gridla-drag-handle="body"]')
    const start = center(await box(head))
    await press(page, start.x, start.y)
    await moveTo(page, start, { x: start.x, y: start.y + 60 }, 12)
    await page.mouse.up()
    await settleAll(page)

    const groupAfter = await itemBox(page, 'body')
    const leftAfter = await itemBox(page, 'left')
    expect(groupAfter.y - groupBefore.y).toBeGreaterThanOrEqual(30)
    expect(
      Math.abs(leftAfter.y - leftBefore.y - (groupAfter.y - groupBefore.y)),
    ).toBeLessThanOrEqual(4)

    await page.locator(item('left')).click()
    await expect(page.locator(item('left'))).toHaveAttribute('data-studio-selected', '')
    await expect(page.locator(item('body'))).not.toHaveAttribute('data-studio-selected', '')
  })

  test('B-048 dragging a child south handle never resizes the parent group', async ({ page }) => {
    await page.locator(item('left')).click()
    const groupBefore = await itemRect(page, 'body')
    await resizeBy(page, 'left', 's', 0, 120)
    await settleAll(page)
    const groupAfter = await itemRect(page, 'body')
    expect(Math.abs(groupAfter.h - groupBefore.h)).toBeLessThanOrEqual(2)
    expect(Math.abs(groupAfter.y - groupBefore.y)).toBeLessThanOrEqual(2)
  })

  test('B-010 dragging a group south handle 800 px past the page clamps at the canvas bottom', async ({
    page,
    browserName,
  }) => {
    test.fixme(
      browserName === 'firefox',
      'Firefox ends far-past-viewport south drags at a tiny height; same open issue as gallery B-032.',
    )
    // Clear the room below the group first so nothing sits between it and the bottom.
    await page.locator(item('note')).click()
    await page.keyboard.press('Delete')
    await expect(page.locator(item('note'))).toHaveCount(0)
    await page.locator('[data-gridla-drag-handle="body"]').click()
    const before = await itemRect(page, 'body')
    const handle = await handlePoint(page, 'body', 's')
    await press(page, handle.x, handle.y)
    await moveTo(page, handle, { x: handle.x, y: handle.y + 800 }, 20)
    await page.mouse.up()
    await settleAll(page)

    const after = await itemRect(page, 'body')
    expect(after.h).toBeGreaterThan(before.h)
    const canvas = await box(page.locator(canvasOf('root')))
    const innerBottom = canvas.h - 24
    expect(Math.abs(after.y + after.h - innerBottom)).toBeLessThanOrEqual(2)
  })
})
