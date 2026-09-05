import { expect, test } from '../fixtures'

/**
 * Shared adapter contract, smoke level: every adapter demo app under
 * `examples/adapters/<name>/` renders a canvas with items, using the common
 * `data-gridla-*` attributes, and boots without console errors. Add a name
 * here when its demo app lands; the site build mounts it automatically.
 */
const ADAPTERS = ['vanilla-dom', 'preact', 'elements', 'solid', 'vue', 'qwik', 'angular', 'svelte']

for (const name of ADAPTERS) {
  test.describe(`adapter ${name} @smoke`, () => {
    test('renders a canvas with items and no console errors', async ({ page, adapter }) => {
      const errors: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      page.on('pageerror', (error) => errors.push(error.message))

      await adapter(name)

      const canvas = page.locator('[data-gridla-canvas]').first()
      await expect(canvas).toBeVisible()
      const items = canvas.locator('[data-gridla-item]')
      expect(await items.count()).toBeGreaterThan(0)
      await expect(items.first()).toBeVisible()
      const box = await items.first().boundingBox()
      expect(box?.width ?? 0).toBeGreaterThan(0)
      expect(box?.height ?? 0).toBeGreaterThan(0)
      expect(errors).toEqual([])
    })
  })
}
