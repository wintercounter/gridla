import { expect, test as base, type Locator, type Page } from '@playwright/test'

/** Read an item's rendered rectangle relative to its canvas. */
export async function itemRect(page: Page, itemId: string) {
  const item = page.locator(`[data-gridla-item="${itemId}"]`).first()
  const canvas = item.locator('xpath=ancestor::*[@data-gridla-canvas][1]')
  const [ir, cr] = await Promise.all([item.boundingBox(), canvas.boundingBox()])
  if (!ir || !cr) throw new Error(`item ${itemId} or its canvas is not visible`)
  return {
    x: Math.round(ir.x - cr.x),
    y: Math.round(ir.y - cr.y),
    w: Math.round(ir.width),
    h: Math.round(ir.height),
  }
}

/** Rectangle of the drop preview relative to its canvas, or null when no preview is shown. */
export async function previewRect(page: Page) {
  const preview = page.locator('[data-gridla-preview]').first()
  if ((await preview.count()) === 0) return null
  const canvas = preview.locator('xpath=ancestor::*[@data-gridla-canvas][1]')
  const [pr, cr] = await Promise.all([preview.boundingBox(), canvas.boundingBox()])
  if (!pr || !cr) return null
  return {
    x: Math.round(pr.x - cr.x),
    y: Math.round(pr.y - cr.y),
    w: Math.round(pr.width),
    h: Math.round(pr.height),
  }
}

/** Drag from the center of a locator by a delta with intermediate moves. */
export async function dragBy(page: Page, target: Locator, dx: number, dy: number, steps = 12) {
  const box = await target.boundingBox()
  if (!box) throw new Error('drag target is not visible')
  const sx = box.x + box.width / 2
  const sy = box.y + box.height / 2
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(sx + (dx * i) / steps, sy + (dy * i) / steps)
  }
  await page.mouse.up()
}

/** Drag a resize handle of an item by a delta. */
export async function resizeBy(page: Page, itemId: string, edge: string, dx: number, dy: number) {
  const handle = page.locator(`[data-gridla-resize-handle="${itemId}"][data-gridla-edge="${edge}"]`)
  await dragBy(page, handle, dx, dy)
}

/**
 * Where the gallery lives relative to `baseURL`. In CI the base is the built
 * site root and the gallery sits under `gallery/`. With GRIDLA_BASE_URL the
 * base is assumed to be the gallery dev server itself (prefix ''); set
 * GRIDLA_GALLERY_PREFIX to override either default.
 */
export function galleryPath(demo: string, params?: Record<string, string | number | boolean>) {
  const prefix =
    process.env.GRIDLA_GALLERY_PREFIX ?? (process.env.GRIDLA_BASE_URL ? '' : 'gallery/')
  if (!params) return `${prefix}#/${demo}`
  const search = new URLSearchParams({ demo })
  for (const [key, value] of Object.entries(params)) search.set(key, String(value))
  return `${prefix}#${search.toString()}`
}

export const test = base.extend<{
  gallery: (demo: string, params?: Record<string, string | number | boolean>) => Promise<void>
  studio: () => Promise<void>
}>({
  gallery: async ({ page }, use) => {
    await use(async (demo, params) => {
      await page.goto(galleryPath(demo, params))
      await expect(page.locator('h1')).toBeVisible()
    })
  },
  studio: async ({ page }, use) => {
    await use(async () => {
      await page.goto('studio/')
      await expect(page.locator('[data-gridla-canvas]').first()).toBeVisible()
    })
  },
})

export { expect }
