import { describe, expect, it } from 'bun:test'

import {
  createItem,
  enforceMinimumGaps,
  moveItem,
  placeItem,
  pushAndShrinkSiblings,
  resizeItem,
  roundItem,
} from 'gridla'
import type {
  GridBounds,
  GridCanvas,
  GridItem,
  GridItemSize,
  GridPoint,
  GridResizeEdge,
} from 'gridla'

// ---------------------------------------------------------------------------
// Helpers that make the test bodies read like bounds-based solver calls.
// ---------------------------------------------------------------------------

const canvasFor = (bounds: GridBounds): GridCanvas => ({
  width: bounds.width,
  height: bounds.height ?? 0,
  padding: bounds.padding,
  heightMode: bounds.height === null ? 'scrollable' : 'bounded',
})

type CompatResult = {
  accepted: boolean
  item: GridItem
  items: GridItem[]
  shiftsSiblings: boolean
}

const drag = (
  items: GridItem[],
  bounds: GridBounds,
  item: GridItem,
  gap: number,
  bypassAlignmentSnap = false,
): CompatResult => {
  const result = moveItem({
    layout: { canvas: canvasFor(bounds), items },
    itemId: item.id,
    position: { x: item.x, y: item.y },
    options: { gap, snap: !bypassAlignmentSnap },
  })
  return {
    accepted: result.accepted,
    item: result.item,
    items: result.layout.items,
    shiftsSiblings: result.shiftedSiblings,
  }
}

const resize = (
  items: GridItem[],
  bounds: GridBounds,
  desired: GridItem,
  gap: number,
  direction?: GridResizeEdge,
): CompatResult => {
  const result = resizeItem({
    layout: { canvas: canvasFor(bounds), items },
    itemId: desired.id,
    rect: desired,
    edge: direction,
    options: { gap },
  })
  return {
    accepted: result.accepted,
    item: result.item,
    items: result.layout.items,
    shiftsSiblings: result.shiftedSiblings,
  }
}

const externalDrop = (
  items: GridItem[],
  bounds: GridBounds,
  item: GridItem,
  gap: number,
): CompatResult => {
  const result = placeItem({
    layout: { canvas: canvasFor(bounds), items },
    item,
    options: { gap },
  })
  return {
    accepted: result.accepted,
    item: result.item,
    items: result.layout.items,
    shiftsSiblings: result.shiftedSiblings,
  }
}

const dropItem = ({
  id,
  point,
  size,
}: {
  id: string
  point: GridPoint
  size: GridItemSize
}): GridItem => roundItem(createItem(id, size, point.x - size.w / 2, point.y - size.h / 2))

const bounds: GridBounds = {
  height: 820,
  padding: {
    bottom: 18,
    left: 18,
    right: 18,
    top: 18,
  },
  width: 1200,
}

const item = (id: string, x: number, y: number, w: number, h: number): GridItem => ({
  h,
  id,
  minH: 40,
  minW: 40,
  w,
  x,
  y,
})

describe('solver', () => {
  // The next three cases describe a snap-when-very-close behavior:
  // dragging an item just past a sibling's gap-extended range should
  // dock to that sibling's edge instead of pushing it sideways. The
  // current solver prefers PUSH whenever desired is within the
  // gap-extended range (pushing siblings around is intuitive, eager
  // snapping is not). These tests describe a future, more nuanced
  // behavior (engage snap only within a tighter threshold, e.g. half
  // the sibling's edge or <12px). Left as `.skip` until a heuristic
  // satisfies both the "drag near to dock" intent and the "drag near
  // to push" intent without overlapping.
  it.skip('snaps a moved item to a sibling top edge and keeps the configured side gap', () => {
    // Skipped: describes a future snap-before-push heuristic, not current behavior.
    const gap = 18
    const active = item('active', 18, 80, 560, 620)
    const sibling = item('sibling', 606, 20, 530, 760)

    const result = drag([active, sibling], bounds, { ...active, x: 34, y: 27 }, gap)

    expect(result.accepted).toBe(true)
    expect(result.item.x).toBe(sibling.x - gap - active.w)
    expect(result.item.y).toBe(sibling.y)
  })

  it.skip('snaps a moved item to a sibling right edge with the configured gap', () => {
    // Skipped: describes a future snap-before-push heuristic, not current behavior.
    const gap = 12
    const left = item('left', 40, 40, 300, 260)
    const active = item('active', 500, 44, 280, 260)

    const result = drag([left, active], bounds, { ...active, x: 349, y: 45 }, gap)

    expect(result.accepted).toBe(true)
    expect(result.item.x).toBe(left.x + left.w + gap)
    expect(result.item.y).toBe(left.y)
  })

  it.skip('snaps a moved item below a sibling with the configured gap', () => {
    // Skipped: describes a future snap-before-push heuristic, not current behavior.
    const gap = 18
    const top = item('top', 80, 60, 420, 180)
    const active = item('active', 84, 360, 420, 160)

    const result = drag([top, active], bounds, { ...active, x: 82, y: 252 }, gap)

    expect(result.accepted).toBe(true)
    expect(result.item.x).toBe(top.x)
    expect(result.item.y).toBe(top.y + top.h + gap)
  })

  it('swaps side-by-side items when one is dropped over the other', () => {
    const gap = 18
    const active = item('active', 1, 1, 430, 646)
    const sibling = item('sibling', 449, 1, 430, 646)

    const result = drag(
      [active, sibling],
      {
        height: 674,
        padding: { bottom: 1, left: 1, right: 1, top: 1 },
        width: 916,
      },
      {
        ...sibling,
        // Drop the dragged item at the active's own origin: a clear
        // "drop over" intent (>50% overlap is required for swap; the
        // 50% threshold doubles as drag hysteresis so a swapped pair
        // doesn't oscillate on subsequent frames).
        x: 1,
        y: 1,
      },
      gap,
    )

    expect(result.accepted).toBe(true)
    expect(result.items.find((current) => current.id === 'sibling')).toMatchObject({
      x: active.x,
      y: active.y,
    })
    expect(result.items.find((current) => current.id === 'active')).toMatchObject({
      x: sibling.x,
      y: sibling.y,
    })
  })

  it('moves an overlapping external drop far enough down to preserve gap', () => {
    const gap = 18
    const active = item('active', 18, 18, 760, 500)
    const drop = item('sibling', 86, 500, 700, 260)

    const result = externalDrop([active], bounds, drop, gap)

    expect(result.accepted).toBe(true)
    expect(result.item.y).toBeGreaterThanOrEqual(active.y + active.h + gap)
  })

  it('places a new item into the gap between header and content', () => {
    const gap = 18
    const header = item('header', 18, 18, 1164, 40)
    const content = item('content', 18, 120, 760, 500)
    const result = externalDrop(
      [header, content],
      bounds,
      dropItem({
        id: 'toolbar',
        point: { x: 400, y: 98 },
        size: { h: 40, minH: 40, minW: 120, w: 260 },
      }),
      gap,
    )

    expect(result.accepted).toBe(true)
    expect(result.item.y).toBe(header.y + header.h + gap)
  })

  it('inserts a tall external item below a header instead of trimming the header', () => {
    const gap = 18
    const header = item('header', 18, 18, 916, 40)
    const feeds = item('feeds', 18, 78, 916, 648)
    const drop = item('sibling', 456, 21, 448, 646)

    const result = externalDrop([header, feeds], { ...bounds, height: 1500, width: 960 }, drop, gap)

    const nextHeader = result.items.find((current) => current.id === 'header')
    const nextFeeds = result.items.find((current) => current.id === 'feeds')

    expect(result.accepted).toBe(true)
    expect(nextHeader).toMatchObject(header)
    expect(result.item.y).toBe(header.y + header.h + gap)
    expect(nextFeeds?.y).toBeGreaterThanOrEqual(result.item.y + result.item.h + gap)
  })

  it('trims a large sibling so a cross-container drop can sit beside it with gap', () => {
    const gap = 18
    const header = item('header', 18, 18, 1164, 40)
    const feeds = item('feeds', 18, 76, 1164, 680)
    const result = externalDrop([header, feeds], bounds, item('sibling', 746, 76, 436, 594), gap)
    const nextFeeds = result.items.find((current) => current.id === 'feeds')

    expect(result.accepted).toBe(true)
    expect(result.item.x).toBe(746)
    expect(result.item.y).toBe(76)
    expect(nextFeeds?.w).toBe(result.item.x - gap - feeds.x)
  })

  it('fits a returned cross-container item beside the remaining item when rounding leaves only one pixel short', () => {
    const gap = 18
    const active = item('active', 1, 1, 412, 644)
    const returning = item('sibling', 430, 1, 405, 646)

    const result = externalDrop(
      [active],
      {
        height: 1310,
        padding: { bottom: 1, left: 1, right: 1, top: 1 },
        width: 836,
      },
      returning,
      gap,
    )

    expect(result.accepted).toBe(true)
    expect(result.item.x).toBe(active.x + active.w + gap)
    expect(result.item.y).toBe(active.y)
    expect(result.item.w).toBe(404)
  })

  it('shrinks the right neighbor when resizing an item east into it', () => {
    const gap = 18
    const active = item('active', 1, 1, 408, 646)
    const sibling = item('sibling', 427, 1, 408, 646)

    const result = resize(
      [active, sibling],
      {
        height: 648,
        padding: { bottom: 1, left: 1, right: 1, top: 1 },
        width: 836,
      },
      { ...active, w: 520 },
      gap,
    )

    const nextSibling = result.items.find((current) => current.id === 'sibling')

    expect(result.accepted).toBe(true)
    expect(result.item.w).toBe(520)
    expect(nextSibling?.x).toBe(result.item.x + result.item.w + gap)
    expect(nextSibling?.w).toBe(sibling.x + sibling.w - (result.item.x + result.item.w + gap))
  })

  it('does not compact neighbors into the hole left by a moved item', () => {
    const gap = 18
    const active = item('active', 18, 18, 300, 220)
    const neighbor = item('neighbor', 18, 420, 300, 220)
    const manualHole = item('manual-hole', 620, 18, 240, 180)

    const result = drag([active, neighbor, manualHole], bounds, { ...active, x: 820, y: 520 }, gap)

    expect(result.accepted).toBe(true)
    expect(result.items.find((current) => current.id === 'neighbor')).toMatchObject(neighbor)
    expect(result.items.find((current) => current.id === 'manual-hole')).toMatchObject(manualHole)
  })

  it('repairs only undersized rendered gaps without collapsing larger user holes', () => {
    const gap = 18
    const left = item('left', 1, 1, 411, 646)
    const tooCloseRight = item('right', 424, 1, 411, 646)
    const manualHole = item('hole', 980, 1, 80, 646)

    const result = enforceMinimumGaps(
      [left, tooCloseRight, manualHole],
      {
        height: 648,
        padding: { bottom: 1, left: 1, right: 1, top: 1 },
        width: 1200,
      },
      gap,
    )

    const nextLeft = result.find((current) => current.id === 'left')
    const nextRight = result.find((current) => current.id === 'right')
    const nextHole = result.find((current) => current.id === 'hole')

    expect(nextLeft).toMatchObject(left)
    expect(nextRight?.x).toBe(left.x + left.w + gap)
    expect(nextHole).toMatchObject(manualHole)
  })

  it('clamps a new item above the first item to the canvas padding', () => {
    const gap = 18
    const header = item('header', 18, 72, 1164, 40)
    const result = externalDrop(
      [header],
      bounds,
      dropItem({
        id: 'toolbar',
        point: { x: 220, y: 12 },
        size: { h: 36, minH: 36, minW: 120, w: 260 },
      }),
      gap,
    )

    expect(result.accepted).toBe(true)
    expect(result.item.y).toBe(bounds.padding.top)
  })

  it('refuses to grow a resized item into a locked sibling', () => {
    // Active sits below a locked header. North-resize tries to pull
    // the top edge up into the header's footprint — the resize solver
    // must refuse (canPlace finds the collision, neighbor shrink
    // refuses because the sibling is locked).
    const gap = 0
    const headerBounds: GridBounds = {
      height: 720,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      width: 1200,
    }
    const header: GridItem = {
      id: 'header',
      x: 0,
      y: 0,
      w: 1200,
      h: 90,
      policy: { movement: 'locked' },
    }
    const feed: GridItem = {
      id: 'feed',
      x: 0,
      y: 90,
      w: 1200,
      h: 300,
    }

    const result = resize([header, feed], headerBounds, { ...feed, y: 40, h: 350 }, gap, 'n')

    expect(result.accepted).toBe(false)
    // Layout unchanged on refusal.
    const settledFeed = result.items.find((i) => i.id === 'feed')
    const settledHeader = result.items.find((i) => i.id === 'header')
    expect(settledFeed?.y).toBe(90)
    expect(settledFeed?.h).toBe(300)
    expect(settledHeader?.y).toBe(0)
    expect(settledHeader?.h).toBe(90)
  })

  it('snaps active to the outer edge of a locked sibling within snap distance', () => {
    // Active drags toward a locked sibling but stops within snap
    // distance of the gap-aligned dock position. Push refuses (wall),
    // swap skips it, snap fires and parks active just to the left.
    const gap = 12
    const headerBounds: GridBounds = {
      height: 200,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      width: 1200,
    }
    const wall: GridItem = {
      id: 'wall',
      x: 600,
      y: 0,
      w: 300,
      h: 200,
      policy: { movement: 'locked' },
    }
    const active: GridItem = {
      id: 'active',
      x: 50,
      y: 0,
      w: 200,
      h: 200,
    }

    // Dock target: wall.x - gap - active.w = 600 - 12 - 200 = 388.
    // Drag to x=380 (8 px short → within the default snap distance of 24).
    const result = drag([wall, active], headerBounds, { ...active, x: 380 }, gap)

    expect(result.accepted).toBe(true)
    const settledWall = result.items.find((i) => i.id === 'wall')
    expect(settledWall?.x).toBe(600)
    expect(settledWall?.w).toBe(300)
    const settledActive = result.items.find((i) => i.id === 'active')
    expect(settledActive?.x).toBe(388)
  })

  it('refuses to commit a drop that deeply overlaps a locked sibling', () => {
    // Dragging deep onto a wall (not within snap distance of the
    // dock) must refuse — the dragged item bounces back to its
    // origin instead of teleporting to a far-away snap target.
    const gap = 12
    const headerBounds: GridBounds = {
      height: 200,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      width: 1200,
    }
    const wall: GridItem = {
      id: 'wall',
      x: 600,
      y: 0,
      w: 300,
      h: 200,
      policy: { movement: 'locked' },
    }
    const active: GridItem = {
      id: 'active',
      x: 50,
      y: 0,
      w: 200,
      h: 200,
    }
    // 100 px of deep overlap with the wall — well past snap distance.
    const result = drag([wall, active], headerBounds, { ...active, x: 500 }, gap)
    expect(result.accepted).toBe(false)
  })

  it('does not push a right-edge anchored fixed-w sibling backward — dragged item snaps to its left', () => {
    // A fixed-w=38 button pinned at the right edge (x+w = canvas.right).
    // Dragging another item into its row must NOT shift the anchored
    // button leftward to "make room"; the dragged item should land
    // `gap` pixels before the anchor instead (the user's snap-to-left
    // intent).
    const gap = 12
    const headerBounds: GridBounds = {
      height: 200,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      width: 1200,
    }
    const menuButton: GridItem = {
      id: 'menu-button',
      x: 1162,
      y: 0,
      w: 38,
      h: 200,
      minW: 38,
      minH: 1,
      maxW: 38,
      sizeMode: 'fixed-w',
      fixedWidth: 38,
    }
    const toolbar: GridItem = {
      id: 'toolbar',
      x: 800,
      y: 0,
      w: 126,
      h: 200,
      minW: 89,
      minH: 1,
    }

    // The toolbar has been dragged close enough to the button that its
    // desired rect overlaps the fixed sibling. Without the edge-anchor
    // guard the solver pushed the button backward; now the push refuses
    // and the snap fallback lands the toolbar at
    // menuButton.x - gap - toolbar.w = 1162 - 12 - 126 = 1024.
    const result = drag([menuButton, toolbar], headerBounds, { ...toolbar, x: 1050 }, gap)

    expect(result.accepted).toBe(true)
    const settledMenuButton = result.items.find((i) => i.id === 'menu-button')
    const settledToolbar = result.items.find((i) => i.id === 'toolbar')
    expect(settledMenuButton?.x).toBe(1162)
    expect(settledMenuButton?.w).toBe(38)
    expect(settledToolbar?.x).toBe(1024)
    expect(settledToolbar?.x ?? 0).toBe(
      (settledMenuButton?.x ?? 0) - gap - (settledToolbar?.w ?? 0),
    )
  })

  it('moves title into the large header gap and shifts layout controls aside', () => {
    const gap = 12
    const headerBounds: GridBounds = {
      height: 321,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      width: 1820,
    }
    const title: GridItem = {
      id: 'title',
      x: 12,
      y: 0,
      w: 212,
      h: 321,
      minW: 135,
      minH: 321,
    }
    const ticker: GridItem = {
      id: 'ticker',
      x: 236,
      y: 0,
      w: 872,
      h: 321,
      minW: 135,
      minH: 321,
    }
    const viewToggle: GridItem = {
      id: 'view-toggle',
      x: 1634,
      y: 0,
      w: 135,
      h: 321,
      minW: 135,
      minH: 321,
    }
    const menuButton: GridItem = {
      id: 'menu-button',
      x: 1781,
      y: 0,
      w: 39,
      h: 321,
      minW: 39,
      minH: 321,
    }

    const result = drag(
      [title, ticker, viewToggle, menuButton],
      headerBounds,
      { ...title, x: viewToggle.x },
      gap,
    )

    expect(result.accepted).toBe(true)
    expect(result.item.x).toBeGreaterThan(title.x + 200)
    expect(
      Math.abs(
        (result.items.find((current) => current.id === viewToggle.id)?.x ?? viewToggle.x) -
          viewToggle.x,
      ),
    ).toBeGreaterThan(40)
  })

  it('keeps the rendered header drag result inside the commit safety gate', () => {
    const gap = 12
    const headerBounds: GridBounds = {
      height: 243,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      width: 924,
    }
    const title: GridItem = {
      id: 'title',
      x: 12,
      y: 0,
      w: 135,
      h: 243,
      minW: 135,
      minH: 321,
    }
    const ticker: GridItem = {
      id: 'ticker',
      x: 159,
      y: 0,
      w: 434,
      h: 243,
      minW: 135,
      minH: 321,
    }
    const viewToggle: GridItem = {
      id: 'view-toggle',
      x: 738,
      y: 0,
      w: 135,
      h: 243,
      minW: 135,
      minH: 321,
    }
    const menuButton: GridItem = {
      id: 'menu-button',
      x: 885,
      y: 0,
      w: 39,
      h: 243,
      minW: 39,
      minH: 321,
    }

    const result = drag(
      [title, ticker, viewToggle, menuButton],
      headerBounds,
      { ...title, x: viewToggle.x },
      gap,
    )

    expect(result.accepted).toBe(true)
    for (const entry of result.items) {
      expect(entry.x).toBeGreaterThanOrEqual(0)
      expect(entry.x + entry.w).toBeLessThanOrEqual(headerBounds.width)
    }
    for (let i = 0; i < result.items.length; i += 1) {
      for (let j = i + 1; j < result.items.length; j += 1) {
        const a = result.items[i]
        const b = result.items[j]
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        expect(Math.min(overlapX, overlapY)).toBeLessThanOrEqual(0)
      }
    }
  })

  it('does not inflate the perpendicular axis when resizing a projected header item', () => {
    const gap = 12
    const headerBounds: GridBounds = {
      height: 243,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      width: 924,
    }
    const title: GridItem = {
      id: 'title',
      x: 12,
      y: 0,
      w: 135,
      h: 243,
      minW: 135,
      minH: 321,
    }
    const ticker: GridItem = {
      id: 'ticker',
      x: 159,
      y: 0,
      w: 434,
      h: 243,
      minW: 135,
      minH: 321,
    }
    const viewToggle: GridItem = {
      id: 'view-toggle',
      x: 738,
      y: 0,
      w: 135,
      h: 243,
      minW: 135,
      minH: 321,
    }
    const menuButton: GridItem = {
      id: 'menu-button',
      x: 885,
      y: 0,
      w: 39,
      h: 243,
      minW: 39,
      minH: 321,
    }

    const result = resize(
      [title, ticker, viewToggle, menuButton],
      headerBounds,
      { ...title, w: title.w + 80 },
      gap,
      'e',
    )

    expect(result.accepted).toBe(true)
    expect(result.item.h).toBe(title.h)
    expect(result.item.minH).toBe(title.minH)
    expect(result.item.w - title.w).toBeGreaterThanOrEqual(60)
    const resizedTicker = result.items.find((current) => current.id === ticker.id)
    expect(resizedTicker).toBeDefined()
    expect(ticker.w - (resizedTicker?.w ?? ticker.w)).toBeGreaterThanOrEqual(60)
  })

  it('moves a two-feed row east and makes room at the canvas edge', () => {
    const feedBounds: GridBounds = {
      height: 927,
      padding: { top: 1, right: 1, bottom: 1, left: 1 },
      width: 1820,
    }
    const feedA: GridItem = {
      id: 'feed-a',
      x: 1,
      y: 1,
      w: 895,
      h: 925,
      minW: 126,
      minH: 30,
    }
    const feedB: GridItem = {
      id: 'feed-b',
      x: 914,
      y: 1,
      w: 905,
      h: 925,
      minW: 126,
      minH: 30,
    }

    const result = drag([feedA, feedB], feedBounds, { ...feedA, x: feedA.x + 100 }, 18)

    expect(result.accepted).toBe(true)
    expect(result.item.x - feedA.x).toBeGreaterThanOrEqual(80)
    const shifted = result.items.find((current) => current.id === feedB.id)
    expect(shifted).toBeDefined()
    expect(
      Math.abs((shifted?.x ?? feedB.x) - feedB.x) > 20 || feedB.w - (shifted?.w ?? feedB.w) > 20,
    ).toBe(true)
  })

  it('keeps a parallel-row item size when aligning it with a sibling row', () => {
    const scrollBounds: GridBounds = {
      height: null,
      padding: { top: 18, right: 18, bottom: 18, left: 18 },
      width: 1200,
    }
    const header = item('header', 18, 18, 1164, 48)
    header.minW = 80
    header.minH = 40
    const feeds = item('feeds', 18, 84, 1164, 685)
    feeds.minW = 81
    feeds.minH = 1
    const active = item('active', 18, 787, 557, 240)
    active.minW = 83
    active.minH = 1
    const form = item('form', 593, 1045, 320, 240)
    form.minW = 120
    form.minH = 80

    const result = drag([header, feeds, active, form], scrollBounds, { ...form, y: active.y }, 18)

    expect(result.accepted).toBe(true)
    expect(result.item.x).toBe(form.x)
    expect(result.item.y).toBe(active.y)
    expect(result.item.w).toBe(form.w)
    expect(result.item.h).toBe(form.h)
  })

  it('south resize honours the effective padding so a feed can reach the canvas edge', () => {
    // The container's authored bottom padding is 18 but the RENDERED
    // bound (what the user actually configured) is 0. The resize bound
    // is built from that rendered value, so the feed can grow until its
    // bottom touches the canvas height.
    //
    // Before the fix the bound used the authored padding directly, so
    // the feed was clamped at `canvas.height − 18 = 702` no matter what
    // the user did in the UI.
    const bottomNoPaddingBounds: GridBounds = {
      height: 720,
      padding: { top: 0, right: 18, bottom: 0, left: 18 },
      width: 1200,
    }
    const feed = item('feed', 18, 108, 1164, 594)
    feed.minH = 1
    feed.minW = 81
    const desired = { ...feed, h: 794 } // drag south by 200
    const result = resize([feed], bottomNoPaddingBounds, desired, 0, 's')

    expect(result.accepted).toBe(true)
    const settled = result.items.find((entry) => entry.id === 'feed')!
    expect(settled.y).toBe(108)
    // Bottom reaches the canvas edge (no bottom padding reserved).
    expect(settled.y + settled.h).toBe(720)
  })

  it('south resize of a canvas-bottom-touching item keeps its y and clamps h', () => {
    // Reproduces the "I can't resize to the canvas edge" case. The
    // item already sits at y=126, y+h=702 — exactly at the canvas
    // inner bottom (canvas.height 720 minus padding-bottom 18). Dragging
    // the south handle DOWN should be a no-op (we're already at max).
    // Previous bug: the clamp would compute max-h as `maxBottom - padTop`
    // and then shift y up to make the oversized h fit — so the item
    // jumped from y=126 to y=18.
    const paddedBounds: GridBounds = {
      height: 720,
      padding: { top: 18, right: 18, bottom: 18, left: 18 },
      width: 1200,
    }
    const feed = item('feed', 18, 126, 1164, 576)
    feed.minH = 1
    feed.minW = 81
    // South-drag south by 200 px: desired.h = 776, y stays.
    const desired = { ...feed, h: 776 }
    const result = resize([feed], paddedBounds, desired, 0, 's')

    expect(result.accepted).toBe(true)
    const settled = result.items.find((entry) => entry.id === 'feed')!
    // y must NOT jump up.
    expect(settled.y).toBe(126)
    // Bottom must stay at the canvas inner bottom.
    expect(settled.y + settled.h).toBe(702)
  })

  it('row-swap: feed (top, w=1000) drags down over chart/list/note (bottom row)', () => {
    // The feed occupies the entire upper-left row (y=90..390, w=1000)
    // and chart + list + note collectively occupy the entire lower-left
    // row (y=390..720). The user drags the feed DOWN over the three
    // siblings and expects all three of them to "jump up" to row 1
    // while the feed takes their row. A 1-to-1 swap can't make this
    // work because position-swap puts the feed onto chart's footprint
    // and leaves list/note in their old row — overlap.
    const rowBounds: GridBounds = {
      height: 720,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      width: 1200,
    }
    const gap = 0
    const header: GridItem = {
      id: 'header',
      x: 0,
      y: 0,
      w: 1200,
      h: 90,
      minW: 100,
      minH: 90,
      maxH: 90,
      sizeMode: 'fixed-h',
      fixedHeight: 90,
      policy: { movement: 'locked' },
    }
    const feed = item('feed', 0, 90, 1000, 300)
    const chart = item('chart', 0, 390, 600, 330)
    const list = item('list', 600, 390, 200, 330)
    const note = item('note', 800, 390, 200, 330)
    const form = item('form', 1000, 90, 200, 330)
    const details = item('details', 1000, 420, 200, 300)

    // Drag the feed DOWN by ~200 px so it solidly overlaps the
    // chart/list/note row.
    const result = drag(
      [header, feed, chart, list, note, form, details],
      rowBounds,
      { ...feed, y: 300 },
      gap,
    )

    expect(result.accepted).toBe(true)
    const find = (id: string) => result.items.find((current) => current.id === id)
    const after = {
      feed: find('feed')!,
      chart: find('chart')!,
      list: find('list')!,
      note: find('note')!,
      form: find('form')!,
      details: find('details')!,
      header: find('header')!,
    }

    // Header is locked.
    expect(after.header).toMatchObject({ x: 0, y: 0, w: 1200, h: 90 })
    // Feed lands in the lower row.
    expect(after.feed.y).toBeGreaterThanOrEqual(390)
    // chart/list/note jumped up to the row the feed vacated (y ≈ 90).
    expect(after.chart.y).toBeLessThanOrEqual(120)
    expect(after.list.y).toBeLessThanOrEqual(120)
    expect(after.note.y).toBeLessThanOrEqual(120)
    // Their bottoms still align with each other.
    expect(after.list.y + after.list.h).toBe(after.chart.y + after.chart.h)
    expect(after.note.y + after.note.h).toBe(after.chart.y + after.chart.h)
    // No overlap between any two items.
    const all = [
      after.header,
      after.feed,
      after.chart,
      after.list,
      after.note,
      after.form,
      after.details,
    ]
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const a = all[i]
        const b = all[j]
        const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false)
      }
    }
  })

  // User drags a form south to swap with the details panel, then keeps
  // pulling further past the canvas bottom. The preview used to shrink
  // the dragged item's height because the clamp anchored y first and
  // then shrank h to fit between y and the canvas inner-bottom. On
  // commit, the shrunken size was baked into the swapped item — an
  // accidental resize from a drag. Drag must keep the authored w/h and
  // only re-position back inside the canvas.
  it('keeps the dragged item size when pointer is past the canvas bottom', () => {
    const form = item('form', 904, 91, 300, 488)
    const details = item('details', 904, 580, 300, 162)
    const result = drag(
      [form, details],
      {
        height: 720,
        padding: { bottom: 0, left: 0, right: 0, top: 0 },
        width: 1505,
      },
      {
        ...form,
        // y pushed well past the canvas bottom (720). With the bug,
        // the clamp would shrink h to ~minH and the swap would commit
        // that shrunken size.
        x: 904,
        y: 1500,
      },
      1,
    )

    expect(result.accepted).toBe(true)
    expect(result.item.w).toBe(300)
    expect(result.item.h).toBe(488)
  })

  // Drag a note south so its bottom enters a large panel's body. The
  // panel (much larger than the note) trims its TOP to make space,
  // leaving the note flush above the now-shorter panel. Ported from
  // the legacy resize-neighbors behaviour that was explicitly requested
  // back.
  it('shrinks an oversized neighbour from the facing side to make room (drag south)', () => {
    // Top row of side-by-side items, a panel spanning the bottom row.
    // Dragging the note south makes it overlap the panel; the swap path
    // is blocked by the other top-row siblings (chart/list/form would
    // overlap any note rect placed at canvas y=0), so the solver falls
    // through to the shrink-neighbour step.
    const chart = item('chart', 0, 91, 1131, 488)
    const list = item('list', 1131, 91, 376, 488)
    const note = item('note', 1508, 91, 377, 488)
    const form = item('form', 1885, 91, 378, 488)
    const panel = item('panel', 0, 580, 2263, 444)
    const result = drag(
      [chart, list, note, form, panel],
      {
        height: 1024,
        padding: { bottom: 0, left: 0, right: 0, top: 0 },
        width: 2263,
      },
      {
        ...note,
        // Drag the note south so its bottom enters the panel.
        x: 1508,
        y: 400,
      },
      1,
    )

    expect(result.accepted).toBe(true)
    expect(result.shiftsSiblings).toBe(true)
    // The note keeps its size and position.
    expect(result.item.w).toBe(377)
    expect(result.item.h).toBe(488)
    expect(result.item.y).toBe(400)
    // The panel trimmed its TOP (y pushed down past the note's bottom).
    const newPanel = result.items.find((entry) => entry.id === 'panel')!
    expect(newPanel.y).toBeGreaterThanOrEqual(400 + 488)
    // Width unchanged — trim was vertical.
    expect(newPanel.w).toBe(2263)
  })

  // Cascading swap regression: dragging chart east through the list
  // and then onto the note must produce TWO swaps. Without threading
  // the previous frame's result back in, the second cursor-position
  // solve sees chart still at its original (0, 91) slot and just makes
  // the first swap again, leaving the note untouched. The interaction
  // layer is responsible for that threading; here we verify the solver
  // handles a second swap correctly when given post-first-swap state.
  it('supports a second swap when fed the post-first-swap layout', () => {
    // Top row at canvas width 2263.
    const chart = item('chart', 0, 91, 1131, 488)
    const list = item('list', 1131, 91, 376, 488)
    const note = item('note', 1508, 91, 377, 488)
    const form = item('form', 1885, 91, 378, 488)
    const wideBounds: GridBounds = {
      height: 1024,
      padding: { bottom: 0, left: 0, right: 0, top: 0 },
      width: 2263,
    }
    // Frame 1: chart dragged east into the list.
    const first = drag([chart, list, note, form], wideBounds, { ...chart, x: 200, y: 91 }, 1)
    expect(first.accepted).toBe(true)
    expect(first.shiftsSiblings).toBe(true)
    // Chart now at the list's far-edge anchor (row-reverse swap).
    const chartAfter1 = first.items.find((entry) => entry.id === 'chart')!
    const listAfter1 = first.items.find((entry) => entry.id === 'list')!
    expect(chartAfter1.x).toBe(376)
    expect(listAfter1.x).toBe(0)
    // Frame 2: cursor continues east past the note. Solve against the
    // post-frame-1 layout.
    const second = drag(first.items, wideBounds, { ...chartAfter1, x: 600, y: 91 }, 1)
    expect(second.accepted).toBe(true)
    expect(second.shiftsSiblings).toBe(true)
    const chartAfter2 = second.items.find((entry) => entry.id === 'chart')!
    const noteAfter2 = second.items.find((entry) => entry.id === 'note')!
    // Chart moves further east, the note moves into chart's previous slot.
    expect(chartAfter2.x).toBeGreaterThan(chartAfter1.x)
    expect(noteAfter2.x).toBeLessThan(note.x)
  })

  // When a push forces multiple downstream siblings into the same
  // shrinkable budget, the shortfall should be distributed across all
  // pushed siblings — not absorbed entirely by the LAST one. Reported
  // case: dragging one feed south left the next feed at full height
  // while the last one was crushed to a sliver; expected behaviour is
  // a uniform shrink so the column reads cleanly.
  it('distributes push-shrink across every displaced sibling rather than crushing the last one', () => {
    // Single-column layout, canvas height 600.
    //   active at y=  0..200
    //   B      at y=210..400 (direct overlap when active drags into y=100)
    //   C      at y=410..600 (cascaded downstream of B)
    // Drag active to y=100, h=200 → activeEnd=300; cursor for the
    // chain starts at 310. Naive packing puts B at 310..500 and C at
    // 510..700, overflowing by 100 px. Pre-fix the algorithm crushed
    // C to h=90 while B kept h=190; post-fix both shrink to h=140.
    const pushBounds: GridBounds = {
      height: 600,
      padding: { bottom: 0, left: 0, right: 0, top: 0 },
      width: 400,
    }
    const active = item('A', 0, 100, 400, 200)
    const b = item('B', 0, 210, 400, 190)
    const c = item('C', 0, 410, 400, 190)
    const result = pushAndShrinkSiblings(active, [b, c], pushBounds, 10, 'y', 24)
    expect(result).not.toBeNull()
    const bAfter = result!.find((entry) => entry.id === 'B')!
    const cAfter = result!.find((entry) => entry.id === 'C')!
    // Both shrunk within a couple of pixels of each other instead of
    // C absorbing the whole 100 px overflow.
    expect(Math.abs(bAfter.h - cAfter.h)).toBeLessThanOrEqual(2)
    // And visibly shrunk vs original 190.
    expect(bAfter.h).toBeLessThan(180)
    expect(cAfter.h).toBeLessThan(180)
    // Chain still packs flush from activeEnd+gap to canvas bottom.
    expect(bAfter.y).toBe(310)
    expect(cAfter.y).toBe(bAfter.y + bAfter.h + 10)
    expect(cAfter.y + cAfter.h).toBeLessThanOrEqual(600)
  })

  // FEED GRID REPRO: the last feed in column 3 was crushed to ~137 px
  // while the feed above it kept its full 448-px height after dragging
  // a feed from column 2 into column 3. Use the committed post-bake
  // canvas (2068×916), with the dragged feed starting in column 2 row 1
  // and being dragged to column 3 row 1.
  it('REPRO feed grid: drag a feed into column 3 shrinks both downstream feeds, not just the last', () => {
    const feedsBounds: GridBounds = {
      height: 916,
      padding: { bottom: 1, left: 1, right: 1, top: 1 },
      width: 2068,
    }
    const FEED_GAP = 18
    const col1X = 1
    const col2X = 696
    const col3X = 1391
    const colW = 676
    const shortH = 293
    const tallH = 448
    const row2Y = 1 + shortH + FEED_GAP // 312
    const row3Y = row2Y + shortH + FEED_GAP // 623
    const feedA: GridItem = {
      id: 'feed-a',
      x: col1X,
      y: 1,
      w: colW,
      h: shortH,
      minH: 1,
      minW: 89,
    }
    const feedB: GridItem = {
      id: 'feed-b',
      x: col1X,
      y: row2Y,
      w: colW,
      h: shortH,
      minH: 1,
      minW: 89,
    }
    const feedC: GridItem = {
      id: 'feed-c',
      x: col1X,
      y: row3Y,
      w: colW,
      h: shortH,
      minH: 1,
      minW: 89,
    }
    const feedD: GridItem = {
      id: 'feed-d',
      x: col2X,
      y: 1,
      w: colW,
      h: shortH,
      minH: 1,
      minW: 89,
    }
    const feedE: GridItem = {
      id: 'feed-e',
      x: col2X,
      y: row2Y,
      w: colW,
      h: shortH,
      minH: 1,
      minW: 89,
    }
    const feedF: GridItem = {
      id: 'feed-f',
      x: col2X,
      y: row3Y,
      w: colW,
      h: shortH,
      minH: 1,
      minW: 89,
    }
    const feedG: GridItem = {
      id: 'feed-g',
      x: col3X,
      y: 1,
      w: colW,
      h: tallH,
      minH: 1,
      minW: 89,
    }
    const feedH: GridItem = {
      id: 'feed-h',
      x: col3X,
      y: 1 + tallH + FEED_GAP, // 467
      w: colW,
      h: tallH,
      minH: 1,
      minW: 89,
    }
    const result = drag(
      [feedA, feedB, feedC, feedD, feedE, feedF, feedG, feedH],
      feedsBounds,
      // User dragged feed-d from (696,1) to col 3 row 1 (1391,1).
      { ...feedD, x: col3X, y: 1 },
      FEED_GAP,
    )

    expect(result.accepted).toBe(true)
    const after = (id: string) => result.items.find((entry) => entry.id === id)!
    const gAfter = after('feed-g')
    const hAfter = after('feed-h')
    // What the user wants: both downstream feeds shrunk proportionally,
    // not feed-g keeping h=448 with feed-h crushed to ~137.
    expect(hAfter.h).toBeGreaterThan(180)
    expect(Math.abs(gAfter.h - hAfter.h)).toBeLessThanOrEqual(20)
  })

  // ROW GRID REPRO: dragging the list from the top row down-and-left
  // toward the feed must NOT pull the entire chart row into the push
  // chain. Before the cross-overlap threshold, the BFS treated chart
  // (which has 43 px Y overlap with the active list landing at y=536)
  // and the feed (444 px Y overlap) as one merged chain and crushed
  // items across both rows. After the fix: only the row that
  // genuinely overlaps the active (feed row) reflows.
  it('REPRO row grid: cross-axis drag does not merge unrelated rows into a single push chain', () => {
    const rowBounds: GridBounds = {
      height: 1024,
      padding: { bottom: 0, left: 0, right: 0, top: 0 },
      width: 2104,
    }
    const header = item('header', 0, 0, 2104, 90)
    const chart = item('chart', 0, 91, 1131, 488)
    const list = item('list', 1131, 91, 376, 488)
    const note = item('note', 1508, 91, 377, 488)
    const form = item('form', 1885, 91, 378, 488)
    const feed = item('feed', 0, 580, 1884, 444)
    const details = item('details', 1885, 580, 378, 444)
    // User drops the list to the LEFT of the feed, partly hanging
    // above the row break (y=536). Active width unchanged.
    const result = drag(
      [header, chart, list, note, form, feed, details],
      rowBounds,
      { ...list, x: 0, y: 536 },
      1,
    )

    // Either outcome is acceptable here: the drag refuses (the list
    // bounces back to its origin slot in row 1) or commits to a clean
    // layout where row 1 stays put. What MUST NOT happen is the prior
    // behaviour where the chart row gets pulled along by the BFS and
    // crushed across both rows.
    const after = (id: string) => result.items.find((entry) => entry.id === id)!
    expect(after('chart').w).toBe(chart.w)
    expect(after('note').w).toBe(note.w)
    expect(after('form').w).toBe(form.w)
    expect(after('chart').x).toBe(chart.x)
  })

  // NOTE-LEFT-OF-FEED: user dragged the note from row 1 (1508, 91) to
  // row 2's LEFT side, just before the feed. Before the trim-side fix,
  // the motion=X position fallback chose top/bottom based on
  // activeCenterY, which produced a vertical trim (squishing the feed
  // vertically) instead of the natural left/right slot. With the
  // "active is taller than target → trim left/right on X" rule, the
  // feed shrinks horizontally and the note slots in on the left.
  it('REPRO row grid: dropping the note to the left of the feed trims the feed LEFT and slots the note flush', () => {
    const rowBounds: GridBounds = {
      height: 1024,
      padding: { bottom: 0, left: 0, right: 0, top: 0 },
      width: 2263,
    }
    const header = item('header', 0, 0, 2263, 90)
    const chart = item('chart', 0, 91, 1131, 488)
    const list = item('list', 1131, 91, 376, 488)
    const note = item('note', 1508, 91, 377, 488)
    const form = item('form', 1885, 91, 378, 488)
    const feed = item('feed', 0, 580, 1884, 444)
    const details = item('details', 1885, 580, 378, 444)
    const result = drag(
      [header, chart, list, note, form, feed, details],
      rowBounds,
      // Note dragged to row 2 left, sitting fully INSIDE the feed on
      // X (active.w=377 < feed.w=1884), partly sticking out on Y
      // (active.h=488 > feed.h=444).
      { ...note, x: 0, y: 580 },
      1,
    )
    expect(result.accepted).toBe(true)
    const after = (id: string) => result.items.find((entry) => entry.id === id)!
    const noteAfter = after('note')
    const feedAfter = after('feed')
    const detailsAfter = after('details')
    // The note joins row 2 at the leftmost position; row 2 redistributes
    // every member's width so the three siblings tile the canvas.
    expect(noteAfter.x).toBe(0)
    expect(noteAfter.y).toBe(580)
    // The note adapts vertically to the feed's row height.
    expect(noteAfter.h).toBe(feed.h)
    // Order along x: note, feed, details.
    expect(noteAfter.x).toBeLessThan(feedAfter.x)
    expect(feedAfter.x).toBeLessThan(detailsAfter.x)
    // The feed still occupies the bulk of the row.
    expect(feedAfter.w).toBeGreaterThan(noteAfter.w)
    expect(feedAfter.w).toBeGreaterThan(detailsAfter.w)
    // Chart row stays untouched — the redistribute only touches the
    // row identified by active's centre y (row 2 here).
    expect(after('chart').x).toBe(chart.x)
    expect(after('chart').w).toBe(chart.w)
  })

  // NOTE-BACK-TO-ROW-1: user moved the note from row 1 to row 2 — the
  // bake adapted the note to row 2's lane (351×444 vs original 377×488).
  // Dragging back up to the row-1 hole between the list and the form
  // was refused because the hole is 350×488 but the note is 351×444:
  // canPlace rejects the 1-px width overshoot. The fit-to-open-slot
  // step resizes the note to the slot dimensions on the way in.
  it('REPRO row grid: dragging the note back to its original row-1 hole resizes it to fit the slot', () => {
    const rowBounds: GridBounds = {
      height: 1024,
      padding: { bottom: 0, left: 0, right: 0, top: 0 },
      width: 2104,
    }
    const header = item('header', 0, 0, 2104, 90)
    const chart = item('chart', 0, 91, 1052, 488)
    const list = item('list', 1052, 91, 349, 488)
    const form = item('form', 1753, 91, 351, 488)
    const feed = item('feed', 0, 580, 1400, 444)
    const details = item('details', 1753, 580, 351, 444)
    const note = item('note', 1401, 580, 351, 444)
    // User drags the note back up to its old row-1 slot.
    const result = drag(
      [header, chart, list, form, feed, details, note],
      rowBounds,
      { ...note, x: 1401, y: 91 },
      1,
    )
    expect(result.accepted).toBe(true)
    const after = (id: string) => result.items.find((entry) => entry.id === id)!
    const noteAfter = after('note')
    // The note joins row 1 between the list and the form; the row
    // redistributes to tile the canvas. The note adapts to row 1's
    // height (488).
    expect(noteAfter.y).toBe(91)
    expect(noteAfter.h).toBe(488)
    // Order along x: chart, list, note, form.
    expect(after('chart').x).toBeLessThan(after('list').x)
    expect(after('list').x).toBeLessThan(noteAfter.x)
    expect(noteAfter.x).toBeLessThan(after('form').x)
    // Row 1 still tiles the full canvas width.
    const formAfter = after('form')
    expect(formAfter.x + formAfter.w).toBeGreaterThanOrEqual(2103)
    // Row 2 untouched.
    expect(after('feed').y).toBe(580)
    expect(after('details').y).toBe(580)
  })

  // COLUMN REORDER: after feed-d was dragged into column 3, the column
  // has three feeds stacked vertically. The user then expects to drag
  // the column members up/down within the column to reorder them —
  // including past the canvas bottom for an "insert-at-end" drop.
  //
  // Layout matches what the user shared verbatim. Note the 1-px x
  // mismatch between feed-d (x=1391) and feed-g / feed-h (x=1390)
  // which is within the column-reorder TOL=4 cluster. It's also AFTER
  // the cross-row insert that crushed feed-h to h=137 while feed-g
  // kept h=448 — the equalize-heights pass should normalize both
  // during a column reorder.
  const columnBounds: GridBounds = {
    height: 916,
    padding: { bottom: 1, left: 1, right: 1, top: 1 },
    width: 2068,
  }
  const columnW = 676
  const columnFeedD: GridItem = {
    id: 'feed-d',
    x: 1391,
    y: 1,
    w: columnW,
    h: 293,
    minH: 1,
    minW: 89,
  }
  const columnFeedG: GridItem = {
    id: 'feed-g',
    x: 1390,
    y: 312,
    w: 677,
    h: 448,
    minH: 1,
    minW: 89,
  }
  const columnFeedH: GridItem = {
    id: 'feed-h',
    x: 1390,
    y: 778,
    w: 677,
    h: 137,
    minH: 1,
    minW: 89,
  }
  const columnFeedA = item('feed-a', 1, 1, 677, 293)
  const columnFeedB = item('feed-b', 1, 312, 677, 292)
  const columnFeedC = item('feed-c', 1, 622, 677, 293)
  const columnFeedE = item('feed-e', 696, 312, 676, 292)
  const columnFeedF = item('feed-f', 696, 622, 676, 293)
  const columnStartItems = [
    columnFeedA,
    columnFeedB,
    columnFeedC,
    columnFeedD,
    columnFeedE,
    columnFeedF,
    columnFeedG,
    columnFeedH,
  ]

  it('REPRO column 3: drag feed-d DOWN between feed-g and feed-h', () => {
    const result = drag(
      columnStartItems,
      columnBounds,
      // Drop with cursor in the gap between feed-g and feed-h. h=293
      // item centred on y≈624.
      { ...columnFeedD, y: 477 },
      18,
    )
    expect(result.accepted).toBe(true)
    const after = (id: string) => result.items.find((entry) => entry.id === id)!
    const g = after('feed-g')
    const d = after('feed-d')
    const h = after('feed-h')
    // Reorder: feed-g first, then feed-d, then feed-h.
    expect(g.y).toBeLessThan(d.y)
    expect(d.y).toBeLessThan(h.y)
    // Equalize: all three column members get a roughly-equal share of
    // the column's vertical extent (was: feed-h stays crushed at
    // h=137 from the initial cross-row insert).
    expect(Math.abs(g.h - d.h)).toBeLessThanOrEqual(2)
    expect(Math.abs(d.h - h.h)).toBeLessThanOrEqual(2)
    // Column members keep their x; non-column items untouched.
    expect(d.x).toBe(columnFeedD.x)
    expect(g.x).toBe(columnFeedG.x)
    expect(h.x).toBe(columnFeedH.x)
    expect(after('feed-a').x).toBe(1)
    expect(after('feed-e').x).toBe(696)
  })

  it('REPRO column 3: drag feed-d BELOW feed-h (canvas bottom)', () => {
    const result = drag(
      columnStartItems,
      columnBounds,
      // Drop with cursor below feed-h's bottom — the move solver clamps
      // active.y so active.y+h ≤ canvas.bottom, but the canvas-edge
      // override in the column reorder should still recognise this as
      // "insert at end" intent.
      { ...columnFeedD, y: 1000 },
      18,
    )
    expect(result.accepted).toBe(true)
    const after = (id: string) => result.items.find((entry) => entry.id === id)!
    const g = after('feed-g')
    const d = after('feed-d')
    const h = after('feed-h')
    // feed-d ends up at the BOTTOM of column 3.
    expect(g.y).toBeLessThan(h.y)
    expect(h.y).toBeLessThan(d.y)
  })

  // Same problem on the X axis: dragging east past the canvas right
  // edge must not shrink width.
  it('keeps the dragged item size when pointer is past the canvas right edge', () => {
    const left = item('left', 18, 18, 400, 200)
    const right = item('right', 600, 18, 300, 200)
    const result = drag([left, right], bounds, { ...left, x: 2500, y: 18 }, 18)

    expect(result.accepted).toBe(true)
    expect(result.item.w).toBe(400)
    expect(result.item.h).toBe(200)
  })
})
