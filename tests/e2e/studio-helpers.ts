/** Shared helpers for the studio specs: client-space geometry and held gestures. */

import type { Locator } from '@playwright/test'

import { expect, type Page } from './fixtures'

export type Box = { x: number; y: number; w: number; h: number; right: number; bottom: number }

export const item = (id: string) => `[data-gridla-item="${id}"]`
export const canvasOf = (groupId: string) => `[data-gridla-canvas][data-group-id="${groupId}"]`
/** The drop preview painted by one group's canvas. */
export const previewIn = (groupId: string) => `${canvasOf(groupId)} > [data-gridla-preview]`

/** Client-space box of a locator, rounded. Throws when the element is not visible. */
export async function box(target: Locator): Promise<Box> {
  const b = await target.boundingBox()
  if (!b) throw new Error('target is not visible')
  const x = Math.round(b.x)
  const y = Math.round(b.y)
  const w = Math.round(b.width)
  const h = Math.round(b.height)
  return { x, y, w, h, right: x + w, bottom: y + h }
}

export async function itemBox(page: Page, id: string) {
  return box(page.locator(item(id)).first())
}

export function center(b: Box) {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

/** True when `inner` lies inside `outer` with `tolerance` px of slack. */
export function contains(outer: Box, inner: Box, tolerance = 4) {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.right <= outer.right + tolerance &&
    inner.bottom <= outer.bottom + tolerance
  )
}

/** Press at a client point. */
export async function press(page: Page, x: number, y: number) {
  await page.mouse.move(x, y)
  await page.mouse.down()
}

/** Move the held pointer to a client point with intermediate moves. */
export async function moveTo(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 12,
) {
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps,
    )
  }
}

/** Press on the center of an item and drag by a delta, holding at the end. */
export async function holdDrag(page: Page, id: string, dx: number, dy: number, steps = 12) {
  const start = center(await itemBox(page, id))
  await press(page, start.x, start.y)
  await moveTo(page, start, { x: start.x + dx, y: start.y + dy }, steps)
  return start
}

/**
 * Keep the held pointer wiggling by a pixel around `at` until `ready`
 * resolves true. Gesture targets update on pointer moves, so a pointer that
 * stops the instant it enters a canvas can be a frame ahead of the preview.
 */
export async function nudgeUntil(
  page: Page,
  at: { x: number; y: number },
  ready: () => Promise<boolean>,
) {
  let step = 0
  await expect
    .poll(
      async () => {
        step += 1
        await page.mouse.move(at.x + (step % 2), at.y)
        return ready()
      },
      { timeout: 5_000 },
    )
    .toBe(true)
}

/**
 * Wait until a group canvas has measured itself and projected its children:
 * the item's rendered height drops below its authored height because the
 * group head takes part of the group's box.
 */
export async function projected(page: Page, id: string, authoredHeight: number) {
  await expect
    .poll(() => itemBox(page, id).then((r) => r.h), { timeout: 5_000 })
    .toBeLessThan(authoredHeight)
}

/** Wait until no CSS transition or animation runs anywhere on the page. */
export async function settleAll(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            // Ignore looping animations (status dots, spinners): only finite ones
            // mean geometry is still moving.
            document.getAnimations().filter((animation) => {
              const timing = animation.effect?.getComputedTiming()
              return (
                animation.playState === 'running' && Number.isFinite(timing?.activeDuration ?? 0)
              )
            }).length,
        ),
      { timeout: 5_000 },
    )
    .toBe(0)
}

/** Click a row of the layers panel by node id. */
export async function selectInLayers(page: Page, id: string) {
  await page.locator(`[data-row][title$=" · ${id}"]`).click()
}

/** Click a palette block by its label. */
export function paletteBlock(page: Page, label: string) {
  return page
    .getByRole('list', { name: 'Blocks' })
    .locator('button')
    .filter({ has: page.locator('.st-palette-label', { hasText: new RegExp(`^${label}$`) }) })
}

/** Number input of the inspector field with the given label. */
export function inspectorField(page: Page, label: string) {
  return page
    .locator('label.st-field')
    .filter({ has: page.locator('.st-field-label', { hasText: new RegExp(`^${label}$`) }) })
    .locator('input')
}
