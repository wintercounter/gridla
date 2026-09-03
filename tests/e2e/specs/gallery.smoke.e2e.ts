import { expect, test } from '../fixtures'

/** Every demo id the gallery routes to (see examples/gallery/src/demos/index.ts). */
const DEMOS = [
  'static-layout',
  'responsive-projection',
  'sizing-modes',
  'constraints',
  'padding-gaps',
  'height-modes',
  'programmatic-ops',
  'snap-alignment',
  'strategy-comparison',
  'policies',
  'nested-groups',
  'cross-transfer',
  'react-uncontrolled',
  'react-persistence',
  'react-custom-chrome',
  'react-input',
  'react-multi-grid',
  'react-ssr',
  'react-stress',
  'react-presets',
]

/** Alternate ids the documentation site links with, and the demo each resolves to. */
const ALIASES: Record<string, string> = {
  'static-projection': 'static-layout',
  'min-max-constraints': 'constraints',
  'bounded-scrollable': 'height-modes',
  'programmatic-operations': 'programmatic-ops',
  'policy-comparison': 'strategy-comparison',
  'locked-ghost': 'policies',
  'cross-container-transfer': 'cross-transfer',
  'react-controlled': 'react-persistence',
  'custom-renderer': 'react-custom-chrome',
  'input-methods': 'react-input',
  'multiple-grids': 'react-multi-grid',
  ssr: 'react-ssr',
  stress: 'react-stress',
  'import-export': 'react-presets',
}

/**
 * A demo stage is labelled either by the demo frame's stage label, by a
 * core stage's accessible name, or by a React canvas' accessible name.
 */
const LABELLED_STAGE = '.gd-stage-label, .gl-stage[aria-label], [data-gridla-canvas][aria-label]'

test.describe('gallery @smoke', () => {
  for (const demo of DEMOS) {
    test(`${demo} renders a heading and a labelled stage without errors`, async ({
      page,
      gallery,
    }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))

      await gallery(demo)

      const heading = page.locator('h1')
      await expect(heading).toBeVisible()
      await expect(heading).not.toHaveText(/^\s*$/)
      await expect(page.locator('nav a[aria-current="page"]')).toHaveCount(1)
      await expect(page.locator(LABELLED_STAGE).first()).toBeVisible()
      expect(errors).toEqual([])
    })
  }

  test('alias ids resolve to their demo', async ({ page, gallery }) => {
    for (const [alias, target] of Object.entries(ALIASES)) {
      await gallery(target)
      const expected = await page.locator('h1').textContent()
      await gallery(alias)
      await expect(page.locator('h1')).toHaveText(expected ?? '')
    }
  })

  test('an unknown id falls back to the first demo', async ({ page, gallery }) => {
    await gallery('static-layout')
    const expected = await page.locator('h1').textContent()
    await gallery('no-such-demo')
    await expect(page.locator('h1')).toHaveText(expected ?? '')
  })
})
