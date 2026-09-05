import { expect, openStudioTemplate, pickTemplate, test, type StudioTemplate } from '../fixtures'
import { canvasOf } from '../studio-helpers'

/**
 * First run and every template. Expected counts come from
 * examples/studio/src/templates.ts: canvases = 1 root + one per group,
 * items = every node except the root.
 */
test.use({ viewport: { width: 2000, height: 1100 } })

const TEMPLATES: { name: StudioTemplate; canvases: number; items: number }[] = [
  { name: 'Blank', canvases: 1, items: 0 },
  { name: 'Dashboard', canvases: 2, items: 10 },
  { name: 'Editorial', canvases: 2, items: 8 },
  { name: 'Analytics', canvases: 4, items: 15 },
  { name: 'Freeform', canvases: 2, items: 11 },
]

test.describe('studio @smoke', () => {
  test('the first run shows the welcome dialog and its dashboard action loads the template', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await openStudioTemplate(page)

    const dialog = page.locator('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Start with a blank page' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Open the dashboard template' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('[data-gridla-canvas]')).toHaveCount(2)
    await expect(page.locator('[data-gridla-item]')).toHaveCount(10)
    expect(errors).toEqual([])

    // The dialog does not come back on the next load.
    await page.reload()
    await expect(page.locator('[data-gridla-canvas]').first()).toBeVisible()
    await expect(page.locator('dialog')).toHaveCount(0)
  })

  test('a blank first run shows the empty page note', async ({ page }) => {
    await openStudioTemplate(page, 'Blank')
    await expect(page.locator('[data-gridla-item]')).toHaveCount(0)
    await expect(page.getByRole('note')).toContainText('Nothing on the page yet')
    await page.getByRole('button', { name: 'Add a heading' }).click()
    await expect(page.locator('[data-gridla-item][data-kind="heading"]')).toHaveCount(1)
  })

  for (const template of TEMPLATES) {
    test(`the ${template.name} template loads ${template.canvases} canvases and ${template.items} items without errors`, async ({
      page,
    }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await openStudioTemplate(page, template.name)
      await expect(page.locator('[data-gridla-canvas]')).toHaveCount(template.canvases)
      await expect(page.locator('[data-gridla-item]')).toHaveCount(template.items)
      await expect(page.locator(canvasOf('root'))).toBeVisible()
      expect(errors).toEqual([])
    })
  }

  test('switching templates replaces the page and undo brings the previous one back', async ({
    page,
  }) => {
    await openStudioTemplate(page, 'Dashboard')
    await pickTemplate(page, 'Analytics')
    await expect(page.locator('[data-gridla-canvas]')).toHaveCount(4)
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.locator('[data-gridla-canvas]')).toHaveCount(2)
    await expect(page.locator('[data-gridla-item]')).toHaveCount(10)
  })

  test('the preview width buttons re-project the page', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await openStudioTemplate(page, 'Dashboard')
    const root = page.locator(canvasOf('root'))
    const wide = await root.boundingBox()
    await page.getByRole('button', { name: /^Tablet/ }).click()
    await expect
      .poll(() => root.boundingBox().then((b) => Math.round(b?.width ?? 0)))
      .toBeLessThan(Math.round(wide?.width ?? 0) - 300)
    await page.getByRole('button', { name: /^Desktop/ }).click()
    await expect
      .poll(() => root.boundingBox().then((b) => Math.round(b?.width ?? 0)))
      .toBe(Math.round(wide?.width ?? 0))
    expect(errors).toEqual([])
  })
})
