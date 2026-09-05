import {
  STUDIO_DRAFT_KEY,
  STUDIO_SAVED_KEY,
  expect,
  itemRect,
  openStudioTemplate,
  pickTemplate,
  test,
  waitForDraft,
} from '../fixtures'
import { actionsDocument } from '../studio-documents'
import { canvasOf, item, settleAll } from '../studio-helpers'

/**
 * Save / Load / Clear against localStorage, and JSON export / import. The
 * studio keeps two keys: the saved copy (explicit Save, restored by Load) and
 * the draft (autosaved after edits, restored at boot). Tests that edit after
 * saving wait for the draft to land before acting so they hold on any engine.
 */
test.use({ viewport: { width: 2000, height: 1100 } })

const ROOT_ITEMS = `${canvasOf('root')} > [data-gridla-item]`

/** The first heading of the dashboard template, by kind (ids are minted at runtime). */
async function firstHeadingId(page: Parameters<typeof itemRect>[0]) {
  const id = await page
    .locator(`${ROOT_ITEMS}[data-kind="heading"]`)
    .first()
    .getAttribute('data-gridla-item')
  if (!id) throw new Error('no heading on the page')
  return id
}

async function storageKeys(page: Parameters<typeof itemRect>[0]) {
  return page.evaluate(
    ([savedKey, draftKey]) => ({
      saved: localStorage.getItem(savedKey),
      draft: localStorage.getItem(draftKey),
    }),
    [STUDIO_SAVED_KEY, STUDIO_DRAFT_KEY],
  )
}

test.describe('studio: persistence', () => {
  test('save, reload: the saved page comes back with the same geometry', async ({ page }) => {
    await openStudioTemplate(page, 'Dashboard')
    await settleAll(page)
    const heading = await firstHeadingId(page)
    const before = await itemRect(page, heading)
    const items = await page.locator('[data-gridla-item]').count()

    await expect(page.locator('.st-save-status')).toHaveAttribute('data-status', 'none')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('.st-save-status')).toHaveAttribute('data-status', 'saved')
    const keys = await storageKeys(page)
    expect(keys.saved).not.toBeNull()
    expect(keys.draft).toBeNull()

    await page.reload()
    await expect(page.locator('dialog')).toHaveCount(0)
    await expect(page.locator('[data-gridla-item]')).toHaveCount(items)
    await expect(page.locator('[data-gridla-canvas]')).toHaveCount(2)
    await expect(page.locator('.st-save-status')).toHaveAttribute('data-status', 'saved')
    await expect.poll(() => itemRect(page, heading)).toEqual(before)
  })

  test('load restores the saved copy after the page was edited', async ({ page }) => {
    await openStudioTemplate(page, 'Dashboard')
    await settleAll(page)
    const heading = await firstHeadingId(page)
    const before = await itemRect(page, heading)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('.st-save-status')).toHaveAttribute('data-status', 'saved')

    await page.locator(item(heading)).click()
    await page.keyboard.press('Delete')
    await expect(page.locator(item(heading))).toHaveCount(0)
    await expect(page.locator('.st-save-status')).toHaveAttribute('data-status', 'unsaved')
    // The edit autosaves as a draft; it must not touch the saved copy.
    await waitForDraft(page)

    await page.getByRole('button', { name: 'Load', exact: true }).click()
    await expect(page.locator(item(heading))).toHaveCount(1)
    await expect(page.locator('.st-save-status')).toHaveAttribute('data-status', 'saved')
    expect((await storageKeys(page)).draft).toBeNull()
    await expect
      .poll(() => itemRect(page, heading).then(({ x, y, h }) => ({ x, y, h })))
      .toEqual({
        x: before.x,
        y: before.y,
        h: before.h,
      })
    // The width can come back a few px narrower (see the exact-width test below).
    expect(Math.abs((await itemRect(page, heading)).w - before.w)).toBeLessThanOrEqual(4)
  })

  test('load restores the exact width of a full-width item', async ({ page }) => {
    await openStudioTemplate(page, 'Dashboard')
    await settleAll(page)
    const heading = await firstHeadingId(page)
    const before = await itemRect(page, heading)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('.st-save-status')).toHaveAttribute('data-status', 'saved')
    await page.locator(item(heading)).click()
    await page.keyboard.press('Delete')
    await expect(page.locator(item(heading))).toHaveCount(0)
    await waitForDraft(page)
    await page.getByRole('button', { name: 'Load', exact: true }).click()
    await expect.poll(() => itemRect(page, heading)).toEqual(before)
  })

  test('reload after an edit opens the draft as unsaved changes; load goes back', async ({
    page,
  }) => {
    await openStudioTemplate(page, 'Dashboard')
    await settleAll(page)
    const heading = await firstHeadingId(page)
    const items = await page.locator('[data-gridla-item]').count()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('.st-save-status')).toHaveAttribute('data-status', 'saved')

    await page.locator(item(heading)).click()
    await page.keyboard.press('Delete')
    await expect(page.locator(item(heading))).toHaveCount(0)
    await waitForDraft(page)

    await page.reload()
    await expect(page.locator('dialog')).toHaveCount(0)
    await expect(page.locator('[data-gridla-item]')).toHaveCount(items - 1)
    await expect(page.locator(item(heading))).toHaveCount(0)
    await expect(page.locator('.st-save-status')).toHaveAttribute('data-status', 'unsaved')

    await page.getByRole('button', { name: 'Load', exact: true }).click()
    await expect(page.locator(item(heading))).toHaveCount(1)
    await expect(page.locator('[data-gridla-item]')).toHaveCount(items)
    await expect(page.locator('.st-save-status')).toHaveAttribute('data-status', 'saved')
  })

  test('clear forgets the saved copy', async ({ page }) => {
    await openStudioTemplate(page, 'Dashboard')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('.st-save-status')).toHaveAttribute('data-status', 'saved')
    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(page.locator('.st-notice').last()).toContainText('Cleared')
    await expect(page.locator('.st-save-status')).toHaveAttribute('data-status', 'none')
  })

  test('after clear the storage stays empty and load reports nothing saved', async ({ page }) => {
    await openStudioTemplate(page, 'Dashboard')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(page.locator('.st-notice').last()).toContainText('Cleared')
    await page.waitForTimeout(1_000)
    expect(await storageKeys(page)).toEqual({ saved: null, draft: null })
    await page.getByRole('button', { name: 'Load', exact: true }).click()
    await expect(page.locator('.st-notice').last()).toContainText('Nothing saved')
  })

  test('export shows the whole document as JSON', async ({ page }) => {
    await openStudioTemplate(page, 'Dashboard')
    const ids = await page
      .locator('[data-gridla-item]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-gridla-item')))
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    const json = page.getByRole('textbox', { name: 'Layout JSON' })
    await expect(json).toBeVisible()
    const text = await json.inputValue()
    const parsed = JSON.parse(text) as { format: string; version: number; root: { id: string } }
    expect(parsed.format).toBe('gridla-studio')
    expect(parsed.version).toBe(1)
    expect(parsed.root.id).toBe('root')
    for (const id of ids) expect(text).toContain(`"${id}"`)
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.locator('dialog')).toHaveCount(0)
  })

  test('import replaces the page with a pasted document', async ({ page }) => {
    await openStudioTemplate(page, 'Blank')
    await expect(page.locator('[data-gridla-item]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Import', exact: true }).click()
    const dialog = page.locator('dialog')
    await dialog.locator('textarea').fill(JSON.stringify(actionsDocument()))
    await dialog.getByRole('button', { name: 'Import', exact: true }).click()
    await expect(dialog).toHaveCount(0)

    await expect(page.locator(item('alpha'))).toBeVisible()
    await expect(page.locator(item('beta'))).toBeVisible()
    await expect(page.locator(`${canvasOf('header')} > [data-gridla-item]`)).toHaveCount(2)
    await settleAll(page)
    const alpha = await itemRect(page, 'alpha')
    expect(Math.abs(alpha.y - 240)).toBeLessThanOrEqual(2)
    expect(Math.abs(alpha.w - 400)).toBeLessThanOrEqual(2)
  })

  test('import rejects malformed input with a readable error', async ({ page }) => {
    await openStudioTemplate(page, 'Blank')
    await page.getByRole('button', { name: 'Import', exact: true }).click()
    const dialog = page.locator('dialog')
    await dialog.locator('textarea').fill('{"format":"other"}')
    await dialog.getByRole('button', { name: 'Import', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Could not import')
    await expect(dialog).toHaveCount(1)
  })

  test('the draft survives switching templates and reloading', async ({ page }) => {
    await openStudioTemplate(page, 'Dashboard')
    await pickTemplate(page, 'Editorial')
    await expect(page.locator('[data-gridla-canvas]')).toHaveCount(2)
    const items = await page.locator('[data-gridla-item]').count()
    // Wait for the draft that describes the NEW template, not the one the
    // previous pick already wrote.
    await expect
      .poll(async () => (await storageKeys(page)).draft ?? '', { timeout: 5000 })
      .toContain('Editorial')
    expect((await storageKeys(page)).saved).toBeNull()
    await page.reload()
    await expect(page.locator('[data-gridla-item]')).toHaveCount(items)
  })
})
