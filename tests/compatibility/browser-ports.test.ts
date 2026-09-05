import { describe, expect, it } from 'bun:test'

import {
  compactLayout,
  flattenLayout,
  moveItem,
  normalizeCanvas,
  projectLayout,
  resizeItem,
  roundItemRects,
  transferItem,
  type GridCanvas,
  type GridItem,
  type GridLayout,
} from 'gridla'

import { leaf, node } from '../fixtures/nodes'

/**
 * Deterministic ports of browser tests that were classified `ported-core`
 * in `tests/e2e/PORT-LEDGER.md` but had no existing unit coverage. Each
 * case keeps the geometry of its browser counterpart and reproduces the
 * gesture with the solver / projection API. Titles carry the ledger id so
 * the two ledgers cross-reference.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const canvas = (
  width: number,
  height: number,
  padding = 0,
  extra: Partial<GridCanvas> = {},
): GridCanvas => ({
  width,
  height,
  padding: { top: padding, right: padding, bottom: padding, left: padding },
  heightMode: 'bounded',
  ...extra,
})

const item = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra: Partial<GridItem> = {},
): GridItem => ({ id, x, y, w, h, ...extra })

const byId = (items: readonly GridItem[], id: string): GridItem => {
  const found = items.find((entry) => entry.id === id)
  if (!found) throw new Error(`Missing item: ${id}`)
  return found
}

const bottomOf = (entry: { y: number; h: number }) => entry.y + entry.h
const rightOf = (entry: { x: number; w: number }) => entry.x + entry.w

/** Fixed-height header bar shared by the two-row layouts below. */
const fixedHeader = (w: number, h: number): GridItem =>
  item('header', 0, 0, w, h, {
    minW: 100,
    minH: h,
    maxH: h,
    sizeMode: 'fixed-h',
    fixedHeight: h,
    policy: { movement: 'locked' },
  })

// ---------------------------------------------------------------------------
// Two-row layouts (header bar, a four-item top row, a two-item bottom row)
// ---------------------------------------------------------------------------

/**
 * The seven-item two-row layout authored at 2263x1024 with a 1 px root gap.
 * Top row: chart, ticker, feed, form. Bottom row: activity, details (the
 * details item hangs below the shorter form, so the two bottom items do not
 * share a top edge in the authored geometry).
 */
function twoRowLayout(): GridLayout {
  const W = 2263
  const H = 1024
  const gap = 1
  const headerH = 90
  const rowY = headerH + gap // 91
  const chartRowH = 586
  const formH = 470
  const detailsY = rowY + formH + gap // 562
  const activityY = rowY + chartRowH + gap // 678
  const chartW = 1131
  const tickerX = chartW // 1131 (touching)
  const tickerW = 376
  const feedX = tickerX + tickerW + gap // 1508
  const feedW = 377
  const formX = feedX + feedW // 1885 (touching)
  const formW = W - formX // 378
  return {
    canvas: canvas(W, H),
    items: [
      fixedHeader(W, headerH),
      item('chart', 0, rowY, chartW, chartRowH, { minW: 100, minH: 1 }),
      item('ticker', tickerX, rowY, tickerW, chartRowH, { minW: 100, minH: 1 }),
      item('feed', feedX, rowY, feedW, chartRowH, { minW: 100, minH: 1 }),
      item('form', formX, rowY, formW, formH, { minW: 100, minH: 1 }),
      item('details', formX, detailsY, formW, H - detailsY, { minW: 100, minH: 1 }),
      item('activity', 0, activityY, formX - gap, H - activityY, { minW: 100, minH: 1 }),
    ],
  }
}

/**
 * A 1200x720 two-row layout with a fixed 90 px header. Rows touch the
 * header and each other (authored gap 0). `feedH` lets the feed span both
 * rows.
 */
function flushRowsLayout({ feedH = 330, activityW = 1000 } = {}): GridLayout {
  return {
    canvas: canvas(1200, 720),
    items: [
      fixedHeader(1200, 90),
      item('chart', 0, 90, 600, 330, { minW: 100, minH: 1 }),
      item('ticker', 600, 90, 200, 330, { minW: 100, minH: 1 }),
      item('feed', 800, 90, 200, feedH, { minW: 100, minH: 1 }),
      item('form', 1000, 90, 200, 330, { minW: 100, minH: 1 }),
      item('activity', 0, 420, activityW, 300, { minW: 100, minH: 1 }),
      item('details', 1000, 420, 200, 300, { minW: 100, minH: 1 }),
    ],
  }
}

describe('two-row projection', () => {
  it('M-002: projecting the two-row layout keeps the four top-row items at one Y with the bottom row below', () => {
    const projected = projectLayout(twoRowLayout(), { width: 2038, height: 1024 }, { gap: 1 })
    const top = ['chart', 'ticker', 'feed', 'form'].map((id) => byId(projected.items, id))
    const topYs = top.map((entry) => entry.y)
    expect(Math.max(...topYs) - Math.min(...topYs)).toBeLessThanOrEqual(4)

    const chart = byId(projected.items, 'chart')
    // Both bottom-row items start well below the top row.
    for (const id of ['activity', 'details']) {
      expect(byId(projected.items, id).y).toBeGreaterThan(chart.y + 100)
    }
  })

  it('C-023: rows stay flush against a fixed-height header at gap 0 across two heights', () => {
    const source = flushRowsLayout()
    for (const height of [900, 520]) {
      const projected = projectLayout(source, { width: 1600, height }, { gap: 0 })
      const header = byId(projected.items, 'header')
      const chart = byId(projected.items, 'chart')
      const form = byId(projected.items, 'form')
      const activity = byId(projected.items, 'activity')
      const details = byId(projected.items, 'details')

      expect(header.h).toBeCloseTo(90, 0)
      // Chart row touches the header; activity row touches the chart row.
      expect(Math.abs(chart.y - bottomOf(header))).toBeLessThanOrEqual(1)
      expect(Math.abs(activity.y - bottomOf(chart))).toBeLessThanOrEqual(1)
      // Siblings in each row share a top edge.
      expect(Math.abs(form.y - chart.y)).toBeLessThanOrEqual(1)
      expect(Math.abs(details.y - activity.y)).toBeLessThanOrEqual(1)
    }
  })

  it('C-031: a member spanning two rows reaches the last-row bottom while row tops stay flush', () => {
    // The feed spans the chart row (330) and the activity row (300):
    // h = 630. Before spanning-aware chains the projection left gaps
    // between the rows and between the spanning member and the canvas
    // bottom at ratio_y > 1.
    const source = flushRowsLayout({ feedH: 630, activityW: 800 })
    const projected = projectLayout(source, { width: 1600, height: 1050 }, { gap: 1 })
    const chart = byId(projected.items, 'chart')
    const ticker = byId(projected.items, 'ticker')
    const form = byId(projected.items, 'form')
    const feed = byId(projected.items, 'feed')
    const activity = byId(projected.items, 'activity')
    const details = byId(projected.items, 'details')

    const chartBottom = bottomOf(chart)
    // Row 1 siblings share a bottom edge.
    expect(Math.abs(bottomOf(ticker) - chartBottom)).toBeLessThanOrEqual(2)
    expect(Math.abs(bottomOf(form) - chartBottom)).toBeLessThanOrEqual(2)
    // Row 2 sits flush below row 1.
    expect(Math.abs(activity.y - chartBottom)).toBeLessThanOrEqual(2)
    expect(Math.abs(details.y - chartBottom)).toBeLessThanOrEqual(2)
    // The spanning member and row 2 share the last-row bottom.
    expect(Math.abs(bottomOf(feed) - bottomOf(activity))).toBeLessThanOrEqual(2)
    expect(Math.abs(bottomOf(details) - bottomOf(activity))).toBeLessThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// East resize against the canvas edge
// ---------------------------------------------------------------------------

describe('east resize at the canvas edge', () => {
  it('C-015: a fixed 38 px card stays fixed and an item already at the right edge does not move or grow on east overshoot', () => {
    const body = canvas(900, 420, 6)
    const gap = 18
    const rightX = 900 - 6 - 360 // 534
    const left = item('feed-a', 6, 6, 360, 220, { minW: 120, minH: 80 })
    const right = item('feed-b', rightX, 6, 360, 300, { minW: 120, minH: 80 })
    const card = item('card', 6, 320, 38, 38, {
      minW: 38,
      minH: 38,
      sizeMode: 'fixed',
      fixedWidth: 38,
      fixedHeight: 38,
    })

    const result = resizeItem({
      layout: { canvas: body, items: [left, right, card] },
      itemId: 'feed-b',
      edge: 'e',
      delta: { x: 240, y: 0 },
      options: { gap },
    })

    const rightAfter = byId(result.layout.items, 'feed-b')
    const cardAfter = byId(result.layout.items, 'card')
    expect(cardAfter.w).toBeCloseTo(38, 0)
    expect(cardAfter.h).toBeCloseTo(38, 0)
    expect(Math.abs(rightAfter.x - right.x)).toBeLessThan(3)
    expect(Math.abs(rightAfter.w - right.w)).toBeLessThan(3)
  })

  it('B-009: east resize past the right edge clamps at the canvas and never pushes the left neighbour', () => {
    // Right item already ends at the inner right edge minus gap room:
    // x = leftX + leftW + gap.
    const body = canvas(900, 420, 6)
    const gap = 18
    const left = item('feed-a', 6, 6, 360, 220, { minW: 120, minH: 80 })
    const right = item('feed-b', 6 + 360 + gap, 6, 360, 240, { minW: 120, minH: 80 })

    const result = resizeItem({
      layout: { canvas: body, items: [left, right] },
      itemId: 'feed-b',
      edge: 'e',
      delta: { x: 240, y: 0 },
      options: { gap },
    })

    const leftAfter = byId(result.layout.items, 'feed-a')
    const rightAfter = byId(result.layout.items, 'feed-b')
    expect(Math.round(leftAfter.x)).toBe(Math.round(left.x))
    expect(Math.round(leftAfter.w)).toBe(Math.round(left.w))
    expect(rightAfter.x).toBe(right.x)
    expect(rightOf(rightAfter)).toBeLessThanOrEqual(900 - 6)
  })

  it('B-020: growing an item east shrinks its neighbour down towards its minimum width', () => {
    // Packed header: title (left), a wide action beside it (gap 12), then
    // a fixed settings control. Growing the title east must shrink the
    // action to absorb the growth. In the source the action could not be
    // resized by the user; that is a chrome affordance, not a solver
    // policy, so the neighbour is a plain item here.
    const header = canvas(1200, 80, 12)
    const gap = 12
    const title = item('title', 12, 12, 220, 56, { minW: 80, minH: 40 })
    const action = item('action', 244, 12, 696, 56, { minW: 40, minH: 40 })
    const settings = item('settings', 952, 12, 56, 56, { minW: 40, minH: 40 })

    const result = resizeItem({
      layout: { canvas: header, items: [title, action, settings] },
      itemId: 'title',
      edge: 'e',
      delta: { x: 200, y: 0 },
      options: { gap },
    })

    const titleAfter = byId(result.layout.items, 'title')
    const actionAfter = byId(result.layout.items, 'action')
    expect(result.accepted).toBe(true)
    expect(titleAfter.w - title.w).toBeGreaterThanOrEqual(120)
    expect(action.w - actionAfter.w).toBeGreaterThanOrEqual(120)
    expect(actionAfter.w).toBeGreaterThanOrEqual(action.minW ?? 0)
  })
})

// ---------------------------------------------------------------------------
// Child constraints across a parent resize
// ---------------------------------------------------------------------------

describe('parent resize with constrained children', () => {
  it('B-021: a child whose h == minH == canvas h stays inside the parent while the parent grows and shrinks', () => {
    // The child fills its 1200x720 canonical canvas and carries
    // minH = 720. Rendering that canvas into a 160 px tall slot, growing
    // the slot to 310 px, then shrinking back must keep the child inside
    // the slot at every step. Re-basing the canonical canvas to the
    // rendered size on commit used to compare minH 720 against a 160 px
    // canvas and blow the child three times past its parent.
    const canonical: GridLayout = {
      canvas: canvas(1200, 720),
      items: [item('filler', 0, 0, 1200, 720, { minW: 89, minH: 720 })],
    }
    const heights = [160, 310, 160]
    const inside = (child: GridItem, h: number) => {
      expect(child.h).toBeLessThanOrEqual(h + 4)
      expect(child.y).toBeGreaterThanOrEqual(-4)
      expect(bottomOf(child)).toBeLessThanOrEqual(h + 4)
    }

    // Straight from the canonical layout each time.
    for (const h of heights) {
      const rendered = projectLayout(
        canonical,
        { width: 1164, height: h },
        { strategy: 'segments' },
      )
      inside(byId(rendered.items, 'filler'), h)
    }

    // Chained: each render commits and becomes the next source.
    let current = canonical
    for (const h of heights) {
      const target = normalizeCanvas({ width: 1164, height: h }, current.canvas)
      const rendered = projectLayout(current, target, { strategy: 'segments' })
      inside(byId(rendered.items, 'filler'), h)
      current = { canvas: target, items: roundItemRects(rendered.items) }
    }
  })

  it('B-022: child min/max stay put across a parent grow and shrink, so the shrink succeeds', () => {
    // Root: header (60 tall) and a body group with room to grow south.
    const root: GridLayout = {
      canvas: canvas(1200, 720, 18),
      items: [
        item('header', 18, 18, 1164, 60, { minW: 120, minH: 40, policy: { movement: 'locked' } }),
        item('body', 18, 96, 1164, 240, { minW: 240, minH: 120 }),
      ],
    }
    // Body group content: one child, constraints authored by the user.
    const bodyCanonical: GridLayout = {
      canvas: canvas(1164, 240, 6),
      items: [item('child', 6, 6, 200, 120, { minW: 80, minH: 60 })],
    }
    const gap = 18

    // 1) Grow the body south by 120 and commit the projected children.
    const grow = resizeItem({
      layout: root,
      itemId: 'body',
      edge: 's',
      delta: { x: 0, y: 120 },
      options: { gap },
    })
    const grown = byId(grow.layout.items, 'body')
    expect(grow.accepted).toBe(true)
    expect(grown.h).toBeGreaterThan(240 + 60)

    // Commit path: the chain projection (`scaleItems`) re-renders the
    // children for the new size and must leave authored constraints alone.
    const grownCanvas = normalizeCanvas({ width: grown.w, height: grown.h }, bodyCanonical.canvas)
    const grownBody = projectLayout(bodyCanonical, grownCanvas, { gap })
    const childGrown = byId(grownBody.items, 'child')
    expect(childGrown.minH).toBe(60)
    expect(childGrown.minW).toBe(80)
    expect(childGrown.maxH).toBeUndefined()
    expect(childGrown.maxW).toBeUndefined()

    // 2) Shrink the body south by 140 (back below the original height).
    const shrink = resizeItem({
      layout: grow.layout,
      itemId: 'body',
      edge: 's',
      delta: { x: 0, y: -140 },
      options: { gap },
    })
    const shrunk = byId(shrink.layout.items, 'body')
    expect(shrink.accepted).toBe(true)
    expect(shrunk.h).toBeLessThan(grown.h - 80)

    const committed: GridLayout = { canvas: grownCanvas, items: roundItemRects(grownBody.items) }
    const shrunkCanvas = normalizeCanvas({ width: shrunk.w, height: shrunk.h }, committed.canvas)
    const shrunkBody = projectLayout(committed, shrunkCanvas, { gap })
    const childShrunk = byId(shrunkBody.items, 'child')
    expect(childShrunk.minH).toBe(60)
    expect(childShrunk.maxH).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Moves and resizes inside a padded root
// ---------------------------------------------------------------------------

describe('vertical stack and gap-aligned snapping', () => {
  it('B-026: dragging the bottom item of a vertical stack upward pushes the top item along Y, not X', () => {
    const root: GridLayout = {
      canvas: canvas(1200, 720, 18),
      items: [
        item('header', 18, 18, 1164, 56, { minW: 120, minH: 40, policy: { movement: 'locked' } }),
        item('feed-a', 18, 92, 1164, 260, { minW: 120, minH: 80 }),
        item('feed-b', 18, 370, 1164, 260, { minW: 120, minH: 80 }),
      ],
    }
    const topBefore = byId(root.items, 'feed-a')

    // Drop the bottom item so its top-left lands 30 px into the top item.
    const result = moveItem({
      layout: root,
      itemId: 'feed-b',
      position: { x: topBefore.x, y: topBefore.y + 30 },
      options: { gap: 18 },
    })

    const topAfter = byId(result.layout.items, 'feed-a')
    expect(Math.abs(topAfter.x - topBefore.x)).toBeLessThanOrEqual(10)
  })

  it('B-028: a north resize snaps to header.bottom + the container gap, not the current authored distance', () => {
    // The header was grown to 221 and the panel pushed down, leaving a
    // 43 px gap. Dragging the panel top up to a few px below the header
    // must snap to header.bottom + gap (18), not the stale 43 px distance.
    const gap = 18
    const root: GridLayout = {
      canvas: canvas(1864, 1091.796875, 18),
      items: [
        item('header', 18, 18, 1828, 221, { minW: 127, minH: 52, policy: { movement: 'locked' } }),
        item('panel', 18, 282, 1828, 792, { minW: 127, minH: 63 }),
      ],
    }
    const header = byId(root.items, 'header')
    const panel = byId(root.items, 'panel')
    expect(panel.y - bottomOf(header)).toBeGreaterThan(20)

    const targetTop = bottomOf(header) + 6 // 245
    const result = resizeItem({
      layout: root,
      itemId: 'panel',
      edge: 'n',
      delta: { x: 0, y: targetTop - panel.y },
      options: { gap },
    })

    const headerAfter = byId(result.layout.items, 'header')
    const panelAfter = byId(result.layout.items, 'panel')
    const gapAfter = panelAfter.y - bottomOf(headerAfter)
    expect(gapAfter).toBeGreaterThan(8)
    expect(gapAfter).toBeLessThanOrEqual(20)
    // North resize keeps the bottom edge (the fractional canvas height
    // clamps it to the inner bottom, 0.2 px above the authored edge).
    expect(bottomOf(panelAfter)).toBeCloseTo(bottomOf(panel), 0)
  })
})

// ---------------------------------------------------------------------------
// Cross-container transfer into a much shorter target
// ---------------------------------------------------------------------------

describe('cross-container transfer', () => {
  it('B-046: returning an item from a tall container into a 54 px tall target is accepted and fits the target inner height', () => {
    // Root is rendered ~684 px tall; the header container is rendered
    // 1164x54 but keeps a 1200x720 canonical canvas. Preserving the
    // item's visual size across containers asks for h = 65 * 720 / 54
    // (~867) in target units, which used to be rejected as too big.
    const source: GridLayout = {
      canvas: canvas(1200, 720, 18),
      items: [
        item('panel', 18, 180, 1164, 522, { minW: 81, minH: 1 }),
        item('header', 18, 18, 1164, 54, { minW: 81, minH: 1, policy: { movement: 'locked' } }),
        item('note', 18, 97, 499, 65, { minW: 89, minH: 1 }),
      ],
    }
    const target: GridLayout = {
      canvas: canvas(1200, 720),
      items: [
        item('title', 0, 0, 140, 720, { minW: 89, minH: 1 }),
        item('switch', 1079, 0, 89, 720, { minW: 89, minH: 1 }),
        item('settings', 1174, 0, 26, 720, { minW: 26, minH: 1 }),
      ],
    }
    const renderedHeader = { w: 1164, h: 54 }
    const visualSize = {
      w: (499 * target.canvas.width) / renderedHeader.w,
      h: (65 * target.canvas.height) / renderedHeader.h,
    }

    const result = transferItem({
      source,
      target,
      itemId: 'note',
      pointer: { x: target.canvas.width / 2, y: target.canvas.height / 2 },
      size: visualSize,
      options: { gap: 12 },
    })

    expect(result.accepted).toBe(true)
    expect(result.item.h).toBeLessThanOrEqual(720)
    expect(result.item.y).toBeGreaterThanOrEqual(0)
    expect(bottomOf(result.item)).toBeLessThanOrEqual(720)
    expect(result.source.items.some((entry) => entry.id === 'note')).toBe(false)
    expect(result.target.items.some((entry) => entry.id === 'note')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Nested thumbnails and compaction
// ---------------------------------------------------------------------------

describe('nested layout rendering', () => {
  it('B-064: a thumbnail render includes nested children and keeps every rect inside the frame right edge', () => {
    // Root has 18 px canvas padding; the panel holds a two-column layout.
    // Normalising against max(x + w) instead of the canvas width used to
    // trim the right padding and push the right-most rect 1-2 px past
    // the frame.
    const root = node({
      id: 'page',
      kind: 'group',
      gap: 'lg',
      padding: 'lg',
      order: ['header', 'panel'],
      layout: {
        canvas: canvas(1200, 720, 18),
        items: [
          item('header', 18, 18, 1164, 54, { minW: 81, minH: 1 }),
          item('panel', 18, 90, 1164, 612, { minW: 81, minH: 1 }),
        ],
      },
      children: [
        leaf('header'),
        node({
          id: 'panel',
          kind: 'group',
          gap: 'lg',
          padding: 'px',
          order: ['column-a', 'column-b'],
          layout: {
            canvas: canvas(1200, 720, 1),
            items: [
              item('column-a', 1, 1, 590, 718, { minW: 83, minH: 1 }),
              item('column-b', 609, 1, 590, 718, { minW: 83, minH: 1 }),
            ],
          },
          children: [leaf('column-a', 'table'), leaf('column-b', 'table')],
        }),
      ],
    })

    const frame = { x: 0, y: 0, w: 320, h: 180 }
    const flat = flattenLayout(root, frame)
    const rects = flat.items.filter((entry) => entry.depth > 0)

    // Nested children surface: the two columns are present at depth 2.
    expect(rects.filter((entry) => entry.depth === 2)).toHaveLength(2)
    expect(rects.length).toBeGreaterThanOrEqual(2)
    for (const entry of rects) {
      expect(rightOf(entry.rect)).toBeLessThanOrEqual(frame.x + frame.w)
      expect(entry.rect.x).toBeGreaterThanOrEqual(frame.x)
    }
  })

  it('B-067: switching a scrollable layout to bounded compacts an item that overflows the canvas', () => {
    // y + h = 84 + 880 = 964, well past the 720 tall canvas. Compaction
    // must fit it inside 702 (= 720 - 18 bottom padding), shrink only
    // its height, and leave the width alone.
    const overflow = item('feed', 18, 84, 1164, 880, { minW: 81, minH: 100 })
    const layout: GridLayout = {
      canvas: canvas(1200, 720, 18),
      items: [item('header', 18, 18, 1164, 48, { minW: 80, minH: 40 }), overflow],
    }

    const result = compactLayout(layout)
    const after = byId(result.layout.items, 'feed')

    expect(result.fits).toBe(true)
    expect(after.h).toBeLessThan(overflow.h)
    expect(after.h).toBeGreaterThanOrEqual(100)
    expect(Math.round(after.w)).toBe(Math.round(overflow.w))
    expect(bottomOf(after)).toBeLessThanOrEqual(720 - 18)
  })
})
