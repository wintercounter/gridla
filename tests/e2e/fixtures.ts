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

/**
 * Wait until no CSS transition or animation runs inside the first canvas.
 * Demo items animate committed geometry, so read rects only once settled.
 */
export async function settle(page: Page) {
  const canvas = page.locator('[data-gridla-canvas]').first()
  await expect
    .poll(() =>
      canvas.evaluate(
        (element) =>
          element.getAnimations({ subtree: true }).filter((animation) => {
            const timing = animation.effect?.getComputedTiming()
            return animation.playState === 'running' && Number.isFinite(timing?.activeDuration ?? 0)
          }).length,
      ),
    )
    .toBe(0)
}

/** `itemRect` after the canvas has settled. */
export async function settledRect(page: Page, itemId: string) {
  await settle(page)
  return itemRect(page, itemId)
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

/**
 * Drag a resize handle of an item by a delta. Handles straddle the item edge
 * and items may clip overflow, so the press lands on the part of the handle
 * that lies inside the item.
 */
export async function resizeBy(page: Page, itemId: string, edge: string, dx: number, dy: number) {
  const { x: sx, y: sy } = await handlePoint(page, itemId, edge)
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  const steps = 12
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(sx + (dx * i) / steps, sy + (dy * i) / steps)
  }
  await page.mouse.up()
}

/** Client point on a resize handle that lies inside its item (see `resizeBy`). */
export async function handlePoint(page: Page, itemId: string, edge: string) {
  const handle = page.locator(`[data-gridla-resize-handle="${itemId}"][data-gridla-edge="${edge}"]`)
  const item = page.locator(`[data-gridla-item="${itemId}"]`).first()
  const [hb, ib] = await Promise.all([handle.boundingBox(), item.boundingBox()])
  if (!hb || !ib) throw new Error(`resize handle ${edge} of ${itemId} is not visible`)
  const left = Math.max(hb.x, ib.x)
  const top = Math.max(hb.y, ib.y)
  const right = Math.min(hb.x + hb.width, ib.x + ib.width)
  const bottom = Math.min(hb.y + hb.height, ib.y + ib.height)
  return {
    x: right > left ? (left + right) / 2 : hb.x + hb.width / 2,
    y: bottom > top ? (top + bottom) / 2 : hb.y + hb.height / 2,
  }
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

/**
 * Where the studio lives relative to `baseURL`. In CI the base is the built
 * site root and the studio sits under `studio/`. With GRIDLA_BASE_URL the base
 * is assumed to be the studio server itself (prefix ''); set
 * GRIDLA_STUDIO_PREFIX to override either default.
 */
export function studioPath() {
  return process.env.GRIDLA_STUDIO_PREFIX ?? (process.env.GRIDLA_BASE_URL ? '' : 'studio/')
}

/**
 * localStorage keys the studio persists under (see
 * examples/studio/src/hooks/persistence.ts): the explicit Save copy, the
 * autosaved draft, and the welcome flag.
 */
export const STUDIO_SAVED_KEY = 'gridla-studio-saved'
export const STUDIO_DRAFT_KEY = 'gridla-studio-draft'
export const STUDIO_WELCOME_KEY = 'gridla-studio-welcomed'

/** Wait until the studio has autosaved the open page as a draft. */
export async function waitForDraft(page: Page) {
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), STUDIO_DRAFT_KEY))
    .not.toBeNull()
}

export type StudioTemplate = 'Blank' | 'Dashboard' | 'Editorial' | 'Analytics' | 'Freeform'

/**
 * Make studio runs deterministic: wipe the studio's localStorage the first
 * time the tab loads (reloads within the same tab keep what the page wrote
 * since, so persistence can be tested) and optionally seed a document as the
 * saved copy (with no draft, so boot opens it) and the welcome flag before
 * the app boots.
 */
export async function resetStudioStorage(
  page: Page,
  seed: { document?: unknown; welcomed?: boolean } = {},
) {
  await page.addInitScript(
    ({ savedKey, draftKey, welcomeKey, document, welcomed }) => {
      try {
        if (sessionStorage.getItem('gridla-e2e-reset')) return
        sessionStorage.setItem('gridla-e2e-reset', '1')
        localStorage.clear()
        if (welcomed) localStorage.setItem(welcomeKey, '1')
        localStorage.removeItem(draftKey)
        if (document !== null) localStorage.setItem(savedKey, JSON.stringify(document))
      } catch {
        // Storage can be unavailable; the studio copes and so do the tests.
      }
    },
    {
      savedKey: STUDIO_SAVED_KEY,
      draftKey: STUDIO_DRAFT_KEY,
      welcomeKey: STUDIO_WELCOME_KEY,
      document: seed.document ?? null,
      welcomed: seed.welcomed ?? false,
    },
  )
}

/** Navigate to the studio and wait for the root canvas. */
export async function gotoStudio(page: Page) {
  await page.goto(studioPath() || './')
  await expect(page.locator('[data-gridla-canvas]').first()).toBeVisible()
}

/** Close the first-run dialog with its "blank page" action. */
export async function dismissWelcome(page: Page) {
  await page.getByRole('button', { name: 'Start with a blank page' }).click()
  await expect(page.locator('dialog')).toHaveCount(0)
}

/** Pick a template from the palette's template list. */
export async function pickTemplate(page: Page, name: StudioTemplate) {
  await page
    .getByRole('list', { name: 'Templates' })
    .locator('button')
    .filter({ has: page.locator('span', { hasText: new RegExp(`^${name}$`) }) })
    .click()
  if (name !== 'Blank') await expect(page.locator('[data-gridla-item]').first()).toBeVisible()
}

/**
 * Fresh studio (storage cleared), welcome dismissed, template loaded. The
 * welcome dialog is left in place when `template` is omitted so a test can
 * exercise the first run itself.
 */
export async function openStudioTemplate(page: Page, template?: StudioTemplate) {
  await resetStudioStorage(page)
  await gotoStudio(page)
  if (!template) return
  await dismissWelcome(page)
  await pickTemplate(page, template)
}

/** Fresh studio booted with `document` already in storage and the welcome dialog seen. */
export async function openStudioDocument(page: Page, document: unknown) {
  await resetStudioStorage(page, { document, welcomed: true })
  await gotoStudio(page)
  await expect(page.locator('dialog')).toHaveCount(0)
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
      await gotoStudio(page)
    })
  },
})

export { expect }
export type { Page }
