import { expect, test } from '../fixtures'

test.describe('site @smoke', () => {
  test('documentation home loads under the base path', async ({ page }) => {
    await page.goto('./')
    await expect(page).toHaveTitle(/gridla/i)
    await expect(page.locator('a[href*="gallery"]').first()).toBeVisible()
  })

  test('gallery loads and lists demos', async ({ page }) => {
    await page.goto('gallery/')
    await expect(page.locator('nav a').first()).toBeVisible()
    await expect(page.locator('h1')).toBeVisible()
  })

  test('studio loads with an empty state or template', async ({ page }) => {
    await page.goto('studio/')
    await expect(page.locator('[data-gridla-canvas]').first()).toBeVisible()
  })

  test('basic examples load', async ({ page }) => {
    await page.goto('examples/react/')
    await expect(page.locator('[data-gridla-canvas]').first()).toBeVisible()
    await page.goto('examples/vanilla/')
    await expect(page.locator('#canvas [data-id]').first()).toBeVisible()
  })

  test('deep links fall back to the custom 404', async ({ page }) => {
    const response = await page.goto('this/page/does/not/exist')
    expect(response?.status()).toBe(404)
    await expect(page.locator('body')).toContainText(/not found|404/i)
  })
})
