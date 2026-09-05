import { describe, expect, it } from 'bun:test'

import {
  compactLayout,
  findContainerAt,
  findFirstUnlockedAncestor,
  flattenLayout,
  hitTest,
  isDirectChildOfContained,
  isInsideLockedSubtree,
  markLockedItems,
  pointInRect,
  preserveGaps,
  projectItemToRoot,
  projectItemsToRoot,
  rootPointToContainer,
  scaleItems,
  type GridCanvas,
  type GridItem,
} from 'gridla'

import { dashboardPage } from '../fixtures/dashboard-page'
import { boundedCanvas, leaf, node, type FixtureNode } from '../fixtures/nodes'
import { sharingPage } from '../fixtures/sharing-page'

describe('flattenLayout', () => {
  it('returns just the root for a leaf node', () => {
    const layout = flattenLayout(leaf('only'), { x: 0, y: 0, w: 200, h: 100 })
    expect(layout.items).toHaveLength(1)
    expect(layout.items[0]?.id).toBe('only')
    expect(layout.items[0]?.depth).toBe(0)
    expect(layout.items[0]?.parentId).toBeNull()
  })

  it('walks a single group and emits children flat', () => {
    const root = node({
      id: 'root',
      kind: 'group',
      order: ['a', 'b'],
      layout: {
        canvas: boundedCanvas(1200, 720, 18),
        items: [
          { id: 'a', x: 18, y: 18, w: 400, h: 200 },
          { id: 'b', x: 440, y: 18, w: 400, h: 200 },
        ],
      },
      children: [leaf('a'), leaf('b')],
    })

    const layout = flattenLayout(root, { x: 0, y: 0, w: 1200, h: 720 })
    expect(layout.items.map((item) => item.id)).toEqual(['root', 'a', 'b'])
    expect(layout.items[0]?.depth).toBe(0)
    expect(layout.items[1]?.depth).toBe(1)
    expect(layout.items[2]?.depth).toBe(1)
    expect(layout.items[1]?.parentId).toBe('root')
    expect(layout.items[1]?.rect).toEqual({ h: 200, w: 400, x: 18, y: 18 })
    expect(layout.items[2]?.rect).toEqual({ h: 200, w: 400, x: 440, y: 18 })
  })

  it('recurses into nested groups and accumulates rects in root coords', () => {
    const root = node({
      id: 'page',
      kind: 'group',
      order: ['header', 'body'],
      layout: {
        canvas: boundedCanvas(1200, 720, 18),
        items: [
          { id: 'header', x: 18, y: 18, w: 1164, h: 80 },
          { id: 'body', x: 18, y: 116, w: 1164, h: 586 },
        ],
      },
      children: [
        node({
          id: 'header',
          kind: 'group',
          order: ['title'],
          layout: {
            canvas: boundedCanvas(1164, 80, 12),
            items: [{ id: 'title', x: 12, y: 12, w: 220, h: 56 }],
          },
          children: [leaf('title')],
        }),
        node({
          id: 'body',
          kind: 'group',
          order: ['feed'],
          layout: {
            canvas: boundedCanvas(900, 586, 6),
            items: [{ id: 'feed', x: 6, y: 6, w: 880, h: 560 }],
          },
          children: [leaf('feed')],
        }),
      ],
    })

    const layout = flattenLayout(root, { x: 0, y: 0, w: 1200, h: 720 })
    const ids = layout.items.map((item) => item.id)
    expect(ids).toEqual(['page', 'header', 'title', 'body', 'feed'])

    const header = layout.itemsById.get('header')
    const title = layout.itemsById.get('title')
    expect(header?.rect).toEqual({ h: 80, w: 1164, x: 18, y: 18 })
    // title sits inside header, in root coords:
    //   title.canonical = (12, 12) within a 1164×80 canvas at (18, 18)
    //   → root = (18 + 12, 18 + 12) = (30, 30)
    expect(title?.parentId).toBe('header')
    expect(title?.rect.x).toBe(30)
    expect(title?.rect.y).toBe(30)
    expect(title?.depth).toBe(2)

    const body = layout.itemsById.get('body')
    const feed = layout.itemsById.get('feed')
    // body's authored canvas is 900×586; rendered at 1164×586.
    // feed's projected x ≈ 6 * (1164/900) = ~7.76 → projection rounds.
    // We just verify it ends up inside body's rect.
    expect(feed?.parentId).toBe('body')
    expect(feed?.rect.x).toBeGreaterThanOrEqual(body!.rect.x)
    expect(feed?.rect.y).toBeGreaterThanOrEqual(body!.rect.y)
  })

  it('keeps the dashboard header and calendar button fixed while the page height flexes', () => {
    for (const rootRect of [
      { h: 1200, w: 1800, x: 0, y: 0 },
      { h: 900, w: 600, x: 0, y: 0 },
    ]) {
      const layout = flattenLayout(dashboardPage(), rootRect)

      const header = layout.itemsById.get('header')
      const calendar = layout.itemsById.get('calendar-button')
      expect(header?.rect.h).toBe(86)
      expect(calendar?.rect.w).toBe(121)
      expect(calendar?.rect.h).toBe(36)
    }
  })

  it('keeps the dashboard calendar button fixed after the header group is resized taller', () => {
    const root = dashboardPage()
    const header = root.layout!.items.find((item) => item.id === 'header')
    expect(header).toBeDefined()
    header!.h = 212
    header!.fixedHeight = 212
    header!.minH = 212
    header!.maxH = 212

    const layout = flattenLayout(root, { h: 789, w: 942, x: 0, y: 0 })

    const calendar = layout.itemsById.get('calendar-button')
    expect(calendar?.rect.w).toBe(121)
    expect(calendar?.rect.h).toBe(36)
  })

  it('uses fixed dimensions instead of stale authored dimensions when projecting a resized group', () => {
    const buildRoot = (): FixtureNode =>
      node({
        id: 'root',
        kind: 'group',
        order: ['header'],
        layout: {
          canvas: boundedCanvas(300, 220, 0),
          items: [{ id: 'header', x: 0, y: 0, w: 300, h: 160 }],
        },
        children: [
          node({
            id: 'header',
            kind: 'group',
            order: ['settings', 'calendar'],
            layout: {
              canvas: boundedCanvas(300, 90, 0),
              items: [
                {
                  fixedHeight: 38,
                  fixedWidth: 38,
                  h: 38,
                  id: 'settings',
                  maxH: 38,
                  maxW: 38,
                  minH: 38,
                  minW: 38,
                  sizeMode: 'fixed',
                  w: 38,
                  x: 250,
                  y: 0,
                },
                {
                  fixedHeight: 36,
                  fixedWidth: 121,
                  h: 68,
                  id: 'calendar',
                  minH: 36,
                  minW: 121,
                  sizeMode: 'fixed',
                  w: 121,
                  x: 167,
                  y: 50,
                },
              ],
            },
            children: [leaf('settings'), leaf('calendar')],
          }),
        ],
      })

    const layout = flattenLayout(buildRoot(), { h: 220, w: 300, x: 0, y: 0 })

    const calendar = layout.itemsById.get('calendar')
    expect(calendar?.rect.w).toBe(121)
    expect(calendar?.rect.h).toBe(36)

    const compactRoot = buildRoot()
    const compactHeader = compactRoot.layout!.items.find((item) => item.id === 'header')
    expect(compactHeader).toBeDefined()
    compactHeader!.w = 80
    compactHeader!.h = 30

    const compactFlat = flattenLayout(compactRoot, { h: 220, w: 300, x: 0, y: 0 })
    const compactCalendar = compactFlat.itemsById.get('calendar')
    expect(compactCalendar?.rect.w).toBe(121)
    expect(compactCalendar?.rect.h).toBe(36)
  })

  it('stops at a tabs node (the tabs node owns its inner rendering)', () => {
    const root = node({
      id: 'root',
      kind: 'group',
      order: ['tabs'],
      layout: {
        canvas: boundedCanvas(1200, 720, 18),
        items: [{ id: 'tabs', x: 18, y: 18, w: 1164, h: 600 }],
      },
      children: [
        node({
          id: 'tabs',
          kind: 'tabs',
          order: ['tab-a', 'tab-b'],
          layout: {
            canvas: boundedCanvas(1200, 720, 18),
            items: [
              { id: 'tab-a', x: 18, y: 18, w: 1164, h: 300 },
              { id: 'tab-b', x: 18, y: 336, w: 1164, h: 300 },
            ],
          },
          children: [leaf('tab-a'), leaf('tab-b')],
        }),
      ],
    })

    const layout = flattenLayout(root, { x: 0, y: 0, w: 1200, h: 720 })
    const ids = layout.items.map((item) => item.id)
    expect(ids).toEqual(['root', 'tabs'])
    expect(layout.itemsById.has('tab-a')).toBe(false)
    expect(layout.itemsById.has('tab-b')).toBe(false)
    expect(layout.itemsById.get('tabs')?.isContainer).toBe(false)
  })

  it('a tabs node is never a container — the walker stops at it', () => {
    // A tabs node keeps its own inner rendering (a tab strip plus a single
    // active panel). The walker treats it as a leaf: its children never
    // appear in the flat layout and its `isContainer` is false; reordering
    // tabs is the consumer's concern, not a canvas drag.
    const root = node({
      id: 'root',
      kind: 'group',
      order: ['tabs'],
      layout: {
        canvas: boundedCanvas(1200, 720, 18),
        items: [{ id: 'tabs', x: 18, y: 18, w: 1164, h: 600 }],
      },
      children: [
        node({
          id: 'tabs',
          kind: 'tabs',
          order: ['a', 'b', 'c'],
          layout: {
            canvas: boundedCanvas(1200, 720, 0),
            items: [
              { id: 'a', x: 0, y: 0, w: 1200, h: 240 },
              { id: 'b', x: 0, y: 240, w: 1200, h: 240 },
              { id: 'c', x: 0, y: 480, w: 1200, h: 240 },
            ],
          },
          children: [leaf('a'), leaf('b'), leaf('c')],
        }),
      ],
    })
    const layout = flattenLayout(root, { x: 0, y: 0, w: 1200, h: 720 })
    expect(layout.itemsById.get('tabs')?.isContainer).toBe(false)
    expect(layout.itemsById.has('a')).toBe(false)
    expect(layout.itemsById.has('b')).toBe(false)
    expect(layout.itemsById.has('c')).toBe(false)
  })

  it('honors the child order when assembling render order', () => {
    const root = node({
      id: 'root',
      kind: 'group',
      order: ['c', 'a', 'b'],
      layout: {
        canvas: boundedCanvas(900, 200, 0),
        items: [
          { id: 'a', x: 0, y: 0, w: 100, h: 100 },
          { id: 'b', x: 100, y: 0, w: 100, h: 100 },
          { id: 'c', x: 200, y: 0, w: 100, h: 100 },
        ],
      },
      children: [leaf('a'), leaf('b'), leaf('c')],
    })
    const layout = flattenLayout(root, { x: 0, y: 0, w: 900, h: 200 })
    expect(layout.items.map((item) => item.id)).toEqual(['root', 'c', 'a', 'b'])
  })
})

const nestedContainers = (): FixtureNode =>
  node({
    id: 'page',
    kind: 'group',
    order: ['outer'],
    layout: {
      canvas: boundedCanvas(1000, 1000, 0),
      items: [{ id: 'outer', x: 0, y: 0, w: 1000, h: 1000 }],
    },
    children: [
      node({
        id: 'outer',
        kind: 'group',
        order: ['inner'],
        layout: {
          canvas: boundedCanvas(1000, 1000, 0),
          items: [{ id: 'inner', x: 100, y: 100, w: 200, h: 200 }],
        },
        children: [
          node({
            id: 'inner',
            kind: 'group',
            order: [],
            layout: { canvas: boundedCanvas(200, 200, 0), items: [] },
            children: [],
          }),
        ],
      }),
    ],
  })

describe('findContainerAt', () => {
  const layout = flattenLayout(nestedContainers(), { x: 0, y: 0, w: 1000, h: 1000 })

  it('returns the deepest enclosing container', () => {
    const owner = findContainerAt(layout, { x: 150, y: 150 })
    expect(owner?.id).toBe('inner')
  })

  it('returns the outer container when point is outside the inner', () => {
    const owner = findContainerAt(layout, { x: 500, y: 500 })
    expect(owner?.id).toBe('outer')
  })

  it('falls back to the outermost container when point is at the canvas origin', () => {
    // (0,0) is on outer's edge but not inside inner (which starts at 100,100)
    const owner = findContainerAt(layout, { x: 0, y: 0 })
    expect(owner?.id).toBe('outer')
  })
})

describe('findContainerAt with a drag inset', () => {
  // inner is at (100, 100, 200, 200) inside outer. With a 50-px inset,
  // cursor must be at least 50 px inside `inner`'s edges to count as
  // owned by inner. The source container is excluded from the inset rule —
  // it always wins on point-in-rect.
  const layout = flattenLayout(nestedContainers(), { x: 0, y: 0, w: 1000, h: 1000 })

  it('point just inside inner edge (within inset) does NOT count as inner', () => {
    // inner rect: 100..300 x 100..300. With 50-px inset, valid inner
    // points are 150..250. Point (110, 110) is INSIDE the rect but
    // within the inset → falls through to outer.
    const owner = findContainerAt(layout, { x: 110, y: 110 }, { sourceId: 'page', inset: 50 })
    expect(owner?.id).toBe('outer')
  })

  it('point deep inside inner (past inset) counts as inner', () => {
    // (200, 200) is 100 px from inner's edges. Past the 50-px inset.
    const owner = findContainerAt(layout, { x: 200, y: 200 }, { sourceId: 'page', inset: 50 })
    expect(owner?.id).toBe('inner')
  })

  it('scales the inset down for short drop targets', () => {
    const shortRoot = node({
      id: 'page',
      kind: 'group',
      order: ['short-target', 'loose-item'],
      layout: {
        canvas: boundedCanvas(1200, 720, 0),
        items: [
          { id: 'short-target', x: 18, y: 18, w: 1164, h: 54 },
          { id: 'loose-item', x: 18, y: 97, w: 499, h: 65 },
        ],
      },
      children: [
        node({
          id: 'short-target',
          kind: 'group',
          order: [],
          layout: { canvas: boundedCanvas(1200, 720, 0), items: [] },
          children: [],
        }),
        leaf('loose-item'),
      ],
    })
    const shortLayout = flattenLayout(shortRoot, { x: 0, y: 0, w: 1200, h: 720 })

    const owner = findContainerAt(shortLayout, { x: 600, y: 45 }, { sourceId: 'page', inset: 36 })

    expect(owner?.id).toBe('short-target')
  })

  it('source container has no inset — always wins on point-in-rect', () => {
    // Source = inner. Point (110, 110) is inside inner's rect even
    // though within inset; since inner is the source, point-in-rect
    // wins.
    const owner = findContainerAt(layout, { x: 110, y: 110 }, { sourceId: 'inner', inset: 50 })
    expect(owner?.id).toBe('inner')
  })

  it('point outside any container returns null', () => {
    const owner = findContainerAt(layout, { x: 9000, y: 9000 }, { sourceId: 'page', inset: 50 })
    expect(owner).toBeNull()
  })

  it('a tabs node counts as a drop target even though it is not a container', () => {
    // Tabs render their own inner content (not flat-canvas siblings), so
    // `isContainer` is false. But the engine should still route cross-
    // container drops onto its children — gated on `acceptsChildren`.
    const tabsRoot = node({
      id: 'page',
      kind: 'group',
      order: ['the-tabs', 'sidebar'],
      layout: {
        canvas: boundedCanvas(1000, 1000, 0),
        items: [
          { id: 'the-tabs', x: 0, y: 0, w: 600, h: 1000 },
          { id: 'sidebar', x: 600, y: 0, w: 400, h: 1000 },
        ],
      },
      children: [
        node({ id: 'the-tabs', kind: 'tabs', order: [], children: [] }),
        node({
          id: 'sidebar',
          kind: 'group',
          order: [],
          layout: { canvas: boundedCanvas(400, 1000, 0), items: [] },
          children: [],
        }),
      ],
    })
    const tabsLayout = flattenLayout(tabsRoot, { x: 0, y: 0, w: 1000, h: 1000 })
    expect(tabsLayout.itemsById.get('the-tabs')?.isContainer).toBe(false)
    expect(tabsLayout.itemsById.get('the-tabs')?.acceptsChildren).toBe(true)
    expect(tabsLayout.itemsById.get('the-tabs')?.layout).not.toBeNull()
    const owner = findContainerAt(
      tabsLayout,
      { x: 300, y: 500 },
      { sourceId: 'sidebar', inset: 36 },
    )
    expect(owner?.id).toBe('the-tabs')
  })
})

describe('hitTest', () => {
  const root = node({
    id: 'root',
    kind: 'group',
    order: ['a', 'b'],
    layout: {
      canvas: boundedCanvas(1000, 500, 0),
      items: [
        { id: 'a', x: 0, y: 0, w: 400, h: 500 },
        { id: 'b', x: 400, y: 0, w: 600, h: 500 },
      ],
    },
    children: [leaf('a'), leaf('b')],
  })
  const layout = flattenLayout(root, { x: 0, y: 0, w: 1000, h: 500 })

  it('returns the deepest item under the point', () => {
    const hit = hitTest(layout, { x: 200, y: 250 })
    expect(hit?.id).toBe('a')
  })

  it('returns the item whose edge the point touches', () => {
    const hit = hitTest(layout, { x: 1000, y: 500 })
    // (1000, 500) is the bottom-right corner — inside b
    expect(hit?.id).toBe('b')
  })
})

describe('projectItemsToRoot', () => {
  it('matches projectItemToRoot for every item in the same solver result context', () => {
    const root = node({
      id: 'root',
      kind: 'group',
      gap: 'px',
      order: ['a', 'b', 'c'],
      layout: {
        canvas: boundedCanvas(1000, 500, 0),
        items: [
          { id: 'a', x: 0, y: 0, w: 300, h: 500 },
          { id: 'b', x: 301, y: 0, w: 300, h: 500 },
          { id: 'c', x: 602, y: 0, w: 398, h: 500 },
        ],
      },
      children: [leaf('a'), leaf('b'), leaf('c')],
    })
    const layout = flattenLayout(root, { x: 10, y: 20, w: 800, h: 400 })
    const container = layout.itemsById.get('root')
    if (!container?.layout) throw new Error('expected root layout')

    const resultItems = container.layout.items.map((item) =>
      item.id === 'b' ? { ...item, x: item.x + 12, w: item.w - 12 } : item,
    )
    const projected = projectItemsToRoot(container, resultItems)

    expect([...projected.keys()].sort()).toEqual(resultItems.map((item) => item.id).sort())
    for (const item of resultItems) {
      expect(projected.get(item.id)).toEqual(projectItemToRoot(container, item, resultItems))
    }
  })
})

describe('rootPointToContainer', () => {
  // A FlatItem's `layout.canvas` is rebased to the rendered rect at
  // flatten time, so this helper is effectively
  // "root_point − container_rect_offset". There's no ratio anywhere; the
  // authored-to-rendered projection happens at flatten time and the
  // solver works in the editing user's pixels.
  it('subtracts the container rect offset from a root point', () => {
    const root = node({
      id: 'root',
      kind: 'group',
      order: [],
      layout: { canvas: boundedCanvas(900, 420, 0), items: [] },
      children: [],
    })
    const layout = flattenLayout(root, { x: 100, y: 50, w: 1800, h: 840 })
    const container = layout.items[0]!
    // root (1000, 470) - container offset (100, 50) = local (900, 420)
    const local = rootPointToContainer(container, { x: 1000, y: 470 })
    expect(local?.x).toBeCloseTo(900, 0)
    expect(local?.y).toBeCloseTo(420, 0)
  })

  it('round-trips an item rect: forward+inverse give back the input', () => {
    // The forward projection re-bases the authored canvas to the rendered
    // rect at flatten time; the inverse simply translates root→local.
    // For a position inside the rendered canvas the round-trip is the
    // identity (modulo the container's pixel offset).
    const root = node({
      id: 'root',
      kind: 'group',
      padding: 'lg',
      order: [],
      layout: { canvas: boundedCanvas(1200, 720, 18), items: [] },
      children: [],
    })
    const rootRect = { x: 0, y: 0, w: 1280, h: 900 }
    const layout = flattenLayout(root, rootRect)
    const container = layout.items[0]!
    // A rendered point inside the canvas — the inverse hands it back
    // (the canvas itself starts at (rootRect.x + padding, rootRect.y +
    // padding) in root coords, but the *local* canvas coords are
    // the raw root point minus the rect offset).
    const visualX = 593
    const visualY = 721
    const local = rootPointToContainer(container, { x: visualX, y: visualY })
    expect(local?.x).toBeCloseTo(593, 0)
    expect(local?.y).toBeCloseTo(721, 0)
  })
})

describe('isInsideLockedSubtree', () => {
  const lockedHeaderTree = (): FixtureNode =>
    node({
      id: 'page',
      kind: 'group',
      order: ['header', 'body'],
      layout: {
        canvas: boundedCanvas(1200, 720, 0),
        items: [
          { id: 'header', x: 0, y: 0, w: 1200, h: 90 },
          { id: 'body', x: 0, y: 90, w: 1200, h: 630 },
        ],
      },
      children: [
        node({
          id: 'header',
          kind: 'group',
          locked: true,
          order: ['title', 'button'],
          layout: {
            canvas: boundedCanvas(1200, 90, 0),
            items: [
              { id: 'title', x: 0, y: 0, w: 1000, h: 90 },
              { id: 'button', x: 1100, y: 0, w: 100, h: 90 },
            ],
          },
          children: [leaf('title'), leaf('button')],
        }),
        leaf('body'),
      ],
    })

  it('returns true for any descendant of a locked container', () => {
    const layout = flattenLayout(lockedHeaderTree(), { x: 0, y: 0, w: 1200, h: 720 })
    expect(isInsideLockedSubtree(layout, 'header')).toBe(true)
    expect(isInsideLockedSubtree(layout, 'title')).toBe(true)
    expect(isInsideLockedSubtree(layout, 'button')).toBe(true)
  })

  it('returns false for siblings of the locked subtree and for the root', () => {
    const layout = flattenLayout(lockedHeaderTree(), { x: 0, y: 0, w: 1200, h: 720 })
    expect(isInsideLockedSubtree(layout, 'page')).toBe(false)
    expect(isInsideLockedSubtree(layout, 'body')).toBe(false)
  })

  it('findFirstUnlockedAncestor walks up past locked ancestors', () => {
    const layout = flattenLayout(lockedHeaderTree(), { x: 0, y: 0, w: 1200, h: 720 })
    expect(findFirstUnlockedAncestor(layout, 'title')?.id).toBe('page')
    expect(findFirstUnlockedAncestor(layout, 'header')?.id).toBe('page')
    expect(findFirstUnlockedAncestor(layout, 'body')?.id).toBe('body')
    expect(findFirstUnlockedAncestor(layout, 'page')?.id).toBe('page')
  })

  it('markLockedItems stamps movement:locked on locked items', () => {
    const layout = flattenLayout(lockedHeaderTree(), { x: 0, y: 0, w: 1200, h: 720 })
    const rootLayout = layout.itemsById.get('page')!.layout!
    const out = markLockedItems(rootLayout.items, layout)
    const header = out.find((i) => i.id === 'header')
    const body = out.find((i) => i.id === 'body')
    expect(header?.policy?.movement).toBe('locked')
    // Locked movement should NOT also drop the item out of collision
    // (different semantics).
    expect(header?.policy?.collision).toBeUndefined()
    expect(body?.policy?.movement).toBeUndefined()
    // Original input untouched.
    expect(rootLayout.items.find((i) => i.id === 'header')?.policy?.movement).toBeUndefined()
  })
})

describe('contained / isDirectChildOfContained', () => {
  const containedSidebarTree = (): FixtureNode =>
    node({
      id: 'page',
      kind: 'group',
      order: ['sidebar', 'main'],
      layout: {
        canvas: boundedCanvas(1200, 720, 0),
        items: [
          { id: 'sidebar', x: 0, y: 0, w: 300, h: 720 },
          { id: 'main', x: 300, y: 0, w: 900, h: 720 },
        ],
      },
      children: [
        node({
          id: 'sidebar',
          kind: 'group',
          contained: true,
          order: ['nested', 'leaf'],
          layout: {
            canvas: boundedCanvas(300, 720, 0),
            items: [
              { id: 'nested', x: 0, y: 0, w: 300, h: 200 },
              { id: 'leaf', x: 0, y: 200, w: 300, h: 520 },
            ],
          },
          children: [
            node({
              id: 'nested',
              kind: 'group',
              order: ['deep'],
              layout: {
                canvas: boundedCanvas(300, 200, 0),
                items: [{ id: 'deep', x: 0, y: 0, w: 300, h: 200 }],
              },
              children: [leaf('deep')],
            }),
            leaf('leaf'),
          ],
        }),
        leaf('main'),
      ],
    })

  it('reads the contained flag and defaults tabs to contained', () => {
    const rect = { x: 0, y: 0, w: 100, h: 100 }
    const emptyLayout = { canvas: boundedCanvas(100, 100, 0), items: [] }
    const flat = (root: FixtureNode) => flattenLayout(root, rect).items[0]!
    expect(flat(node({ id: 'x', kind: 'group', layout: emptyLayout })).contained).toBe(false)
    expect(
      flat(node({ id: 'x', kind: 'group', layout: emptyLayout, contained: true })).contained,
    ).toBe(true)
    expect(flat(node({ id: 'tabs', kind: 'tabs' })).contained).toBe(true)
    expect(flat(node({ id: 'tabs', kind: 'tabs', contained: false })).contained).toBe(false)
  })

  it('isDirectChildOfContained is true only for the direct children of a contained container', () => {
    const layout = flattenLayout(containedSidebarTree(), { x: 0, y: 0, w: 1200, h: 720 })
    // Direct children of the contained `sidebar` container → true.
    expect(isDirectChildOfContained(layout, 'nested')).toBe(true)
    expect(isDirectChildOfContained(layout, 'leaf')).toBe(true)
    // Grandchild — `deep`'s direct parent is `nested`, which is not contained.
    expect(isDirectChildOfContained(layout, 'deep')).toBe(false)
    // Siblings of the contained container, and the contained container itself.
    expect(isDirectChildOfContained(layout, 'main')).toBe(false)
    expect(isDirectChildOfContained(layout, 'sidebar')).toBe(false)
    // Root has no parent.
    expect(isDirectChildOfContained(layout, 'page')).toBe(false)
  })

  it('returns false for unknown item ids', () => {
    const layout = flattenLayout(containedSidebarTree(), { x: 0, y: 0, w: 1200, h: 720 })
    expect(isDirectChildOfContained(layout, 'ghost')).toBe(false)
  })
})

describe('isContainer / pointInRect', () => {
  const rect = { x: 0, y: 0, w: 100, h: 100 }
  const emptyLayout = { canvas: boundedCanvas(100, 100, 0), items: [] }
  const flat = (root: FixtureNode) => flattenLayout(root, rect).items[0]!

  it('always treats a group as a container', () => {
    expect(flat(node({ id: 'g', kind: 'group', layout: emptyLayout })).isContainer).toBe(true)
  })

  it('never treats tabs as a container', () => {
    // A tabs node owns its inner rendering all the time. The flat-canvas
    // walker treats it as a leaf.
    expect(flat(node({ id: 't', kind: 'tabs', layout: emptyLayout })).isContainer).toBe(false)
    expect(flat(node({ id: 't', kind: 'tabs' })).isContainer).toBe(false)
  })

  it('never treats leaf kinds as containers', () => {
    expect(flat(leaf('a', 'text')).isContainer).toBe(false)
    expect(flat(leaf('b', 'table')).isContainer).toBe(false)
  })

  it('hits when point is on the edge', () => {
    const r = { x: 10, y: 10, w: 100, h: 50 }
    expect(pointInRect({ x: 10, y: 10 }, r)).toBe(true)
    expect(pointInRect({ x: 110, y: 60 }, r)).toBe(true)
    expect(pointInRect({ x: 5, y: 30 }, r)).toBe(false)
  })
})

describe('compactLayout', () => {
  const item = (overrides: Partial<GridItem> & { id: string; y: number; h: number }): GridItem => ({
    w: 100,
    x: 0,
    ...overrides,
  })

  it('returns items unchanged when content already fits', () => {
    const canvas = boundedCanvas(1000, 720, 18)
    const items = [item({ h: 200, id: 'a', y: 18 }), item({ h: 300, id: 'b', y: 240 })]
    const result = compactLayout({ canvas, items })
    expect(result.fits).toBe(true)
    expect(result.layout.items[0]?.h).toBe(200)
    expect(result.layout.items[1]?.h).toBe(300)
  })

  it('shrinks two stacked flexible items proportionally to fit', () => {
    const canvas = boundedCanvas(1000, 720, 0)
    const items = [item({ h: 400, id: 'a', y: 0 }), item({ h: 500, id: 'b', y: 420 })]
    // Extent = 920, available = 720. Ratio = 720/920 ≈ 0.783.
    const result = compactLayout({ canvas, items })
    expect(result.fits).toBe(true)
    const last = result.layout.items[1]
    if (!last) throw new Error('missing item')
    expect(last.y + last.h).toBeLessThanOrEqual(721) // 1px slack for round
  })

  it('preserves fixed-h items and shrinks flexible ones around them', () => {
    const canvas = boundedCanvas(1000, 720, 0)
    const items = [
      item({ h: 400, id: 'flex', minH: 100, y: 0 }),
      item({ h: 600, id: 'fixed', sizeMode: 'fixed-h', y: 400 }),
    ]
    // Extent = 1000, available = 720. fixed-h keeps h=600.
    // Solving R: for fixed item at y=400, R*(400) + 600 = 720 → R = 0.3.
    // For flex (y=0, h=400): R = 720/400 = 1.8 (would shrink only if needed).
    // Binding R = 0.3.
    const result = compactLayout({ canvas, items })
    expect(result.fits).toBe(true)
    const flex = result.layout.items.find((entry) => entry.id === 'flex')
    const fixed = result.layout.items.find((entry) => entry.id === 'fixed')
    expect(fixed?.h).toBe(600)
    expect(flex?.h).toBeGreaterThanOrEqual(100)
    expect((fixed?.y ?? 0) + (fixed?.h ?? 0)).toBeLessThanOrEqual(721)
  })

  it('refuses the gesture when even minH-locked items cannot fit', () => {
    const canvas = boundedCanvas(1000, 500, 0)
    const items = [
      item({ h: 400, id: 'a', minH: 300, y: 0 }),
      item({ h: 400, id: 'b', minH: 400, sizeMode: 'fixed-h', y: 400 }),
    ]
    // Available = 500. Fixed item at y=400, h=400: bottom needs R*400 + 400 ≤ 500 → R ≤ 0.25.
    // At R=0.25, flex item desired h = 400*0.25 = 100 < minH=300 → locked at 300.
    // After locking: flex item at y=0, h=300; fixed item bottom = R*400 + 400.
    // Flex bottom = 0*R + 300 = 300. Fixed needs R*400 ≤ 100 → R ≤ 0.25.
    // Total bottom = 0.25*400 + 400 = 500. Just fits.
    // Bump minH past the available height so it cannot fit no matter
    // what — flex item is forced to lock at 600 px but the canvas
    // only offers 500 px of available space.
    items[0]!.minH = 600
    const result = compactLayout({ canvas, items })
    expect(result.fits).toBe(false)
  })

  it('treats scrollable containers as rigid (keeps authored height)', () => {
    const canvas = boundedCanvas(1000, 600, 0)
    const items = [
      item({ h: 400, id: 'scroll', y: 0 }),
      item({ h: 400, id: 'flex', minH: 100, y: 400 }),
    ]
    const result = compactLayout({ canvas, items }, { isRigid: (entry) => entry.id === 'scroll' })
    expect(result.fits).toBe(true)
    const scroll = result.layout.items.find((entry) => entry.id === 'scroll')
    // Scrollable item keeps its authored height.
    expect(scroll?.h).toBe(400)
  })
})

describe('scaleItems + preserveGaps', () => {
  it('does NOT redistribute non-linear Y-chains (parallel children of the same upstream item)', () => {
    // Reproduces a page state where the user drags a form alongside a
    // feed (same authored y). The adjacency graph links {feeds, feed-a,
    // form} because feeds Y-gaps both children — but feed-a and form are
    // parallel branches at the same y, not a linear stack. Distributing
    // heights along Y would collapse each parallel item to a fraction of
    // the chain span, shrinking the rendered preview rect well below the
    // item's authored height.
    const sourceCanvas = boundedCanvas(1200, 720, 18)
    const targetCanvas = boundedCanvas(1280, 900, 18)
    const items: GridItem[] = [
      { h: 626, id: 'feeds', minH: 1, w: 1164, x: 18, y: 77 },
      { h: 582, id: 'feed-a', minH: 1, w: 557, x: 18, y: 721 },
      { h: 240, id: 'form', minH: 80, w: 320, x: 593, y: 721 },
    ]
    const projected = scaleItems(items, sourceCanvas, targetCanvas)
    // Snapshot post-scale heights to verify chain redistribute leaves
    // them alone. The form would shrink from ~303 → ~180 if the bug
    // returned (parallel chain treated as linear).
    const form = projected.find((entry) => entry.id === 'form')!
    const feedA = projected.find((entry) => entry.id === 'feed-a')!
    const formHBeforeRedistribute = form.h
    const feedAHBeforeRedistribute = feedA.h
    preserveGaps(projected, items, 18, targetCanvas, sourceCanvas)
    // ±1 px tolerance: edge alignment rounds the final output so
    // siblings sharing an authored edge land on the same integer, but
    // per-item heights may shift by a fractional pixel.
    expect(Math.abs(form.h - formHBeforeRedistribute)).toBeLessThanOrEqual(1)
    expect(Math.abs(feedA.h - feedAHBeforeRedistribute)).toBeLessThanOrEqual(1)
  })

  it('keeps the visible gap between chain neighbours exactly equal to the configured gap', () => {
    // Authored gap = 18 px. Source canvas 1200×720, target canvas
    // 1900×720 (ratioX ≈ 1.585). With chain redistribute, the visible
    // gap between feed-a.right and feed-b.left MUST be exactly 18,
    // not 18 × ratio.
    const sourceCanvas = boundedCanvas(1200, 720, 1)
    const targetCanvas = boundedCanvas(1900, 720, 1)
    const items: GridItem[] = [
      { id: 'feed-a', x: 1, y: 1, w: 590, h: 266 },
      { id: 'feed-b', x: 609, y: 1, w: 590, h: 266 },
    ]
    const projected = scaleItems(items, sourceCanvas, targetCanvas)
    preserveGaps(projected, items, 18, targetCanvas, sourceCanvas)
    const a = projected.find((entry) => entry.id === 'feed-a')!
    const b = projected.find((entry) => entry.id === 'feed-b')!
    expect(b.x - (a.x + a.w)).toBe(18)
  })

  it('does NOT scale chain item sizes to absorb the gap-vs-ratio mismatch', () => {
    // An older redistribute scaled item widths up so the chain spanned
    // the canvas with gap exactly = 18. That caused two bugs: an
    // unrelated item grew a few pixels when a sibling landed at gap=18,
    // AND free items at the same authored x as a chain member rendered
    // at a different target x. The position-only redistribute leaves
    // sizes alone — items only translate, never scale.
    const sourceCanvas = boundedCanvas(1200, 720, 1)
    const targetCanvas = boundedCanvas(1200, 900, 1)
    const items: GridItem[] = [
      { id: 'feed-a', x: 1, y: 1, w: 590, h: 266 },
      { id: 'note', x: 1, y: 285, w: 320, h: 240 },
    ]
    const projected = scaleItems(items, sourceCanvas, targetCanvas)
    const beforeFeed = projected.find((entry) => entry.id === 'feed-a')!
    const beforeNote = projected.find((entry) => entry.id === 'note')!
    const ah = beforeFeed.h
    const aw = beforeFeed.w
    const th = beforeNote.h
    const tw = beforeNote.w
    preserveGaps(projected, items, 18, targetCanvas, sourceCanvas)
    const a = projected.find((entry) => entry.id === 'feed-a')!
    const t = projected.find((entry) => entry.id === 'note')!
    // Sizes preserved across the redistribute. ±1 px tolerance because
    // edge alignment rounds the final output to integers.
    expect(Math.abs(a.h - ah)).toBeLessThanOrEqual(1)
    expect(Math.abs(a.w - aw)).toBeLessThanOrEqual(1)
    expect(Math.abs(t.h - th)).toBeLessThanOrEqual(1)
    expect(Math.abs(t.w - tw)).toBeLessThanOrEqual(1)
    // And the configured gap is honoured (within 1 px after rounding).
    expect(Math.abs(t.y - (a.y + a.h) - 18)).toBeLessThanOrEqual(1)
  })

  it('aligns free items to chain edges (same authored x ⇒ same target x)', () => {
    // The user model: if two items share an authored x, they share
    // a target x — regardless of whether one is in a canvas-spanning
    // chain and the other is free-placed.
    const sourceCanvas = boundedCanvas(1200, 720, 1)
    const targetCanvas = boundedCanvas(1900, 900, 1)
    const items: GridItem[] = [
      { id: 'feed-a', x: 1, y: 1, w: 590, h: 266 },
      { id: 'feed-b', x: 609, y: 1, w: 590, h: 266 },
      { id: 'note', x: 609, y: 400, w: 320, h: 240 },
    ]
    const projected = scaleItems(items, sourceCanvas, targetCanvas)
    preserveGaps(projected, items, 18, targetCanvas, sourceCanvas)
    const feedB = projected.find((entry) => entry.id === 'feed-b')!
    const note = projected.find((entry) => entry.id === 'note')!
    expect(note.x).toBe(feedB.x)
  })

  it('aligns free items to chain right edges too (authored right matches)', () => {
    // Symmetric to the previous test: a free item whose authored
    // right edge matches a chain member's authored right edge must
    // land at the same target right.
    const sourceCanvas = boundedCanvas(1200, 720, 1)
    const targetCanvas = boundedCanvas(1900, 900, 1)
    const items: GridItem[] = [
      { id: 'feed-a', x: 1, y: 1, w: 590, h: 266 },
      { id: 'feed-b', x: 609, y: 1, w: 590, h: 266 },
      // authored right = 591 = feed-a's right
      { id: 'stat-1', x: 374, y: 400, w: 217, h: 120 },
    ]
    const projected = scaleItems(items, sourceCanvas, targetCanvas)
    preserveGaps(projected, items, 18, targetCanvas, sourceCanvas)
    const feedA = projected.find((entry) => entry.id === 'feed-a')!
    const stat = projected.find((entry) => entry.id === 'stat-1')!
    expect(stat.x + stat.w).toBe(feedA.x + feedA.w)
  })

  it('keeps fixed-h header at authored height and gap on vertical viewport resize', () => {
    // Mirrors the sharing page: fixed 48-px header, row of 4 stat
    // cards at y=66 (header.h + 18 lg gap), row of 2 feeds at
    // y=184 (stats.bottom + 18 lg gap), all flush with the 720-tall
    // authored canvas. Even when the target canvas is shorter than
    // the source, the header must keep its 48-px height and the gaps
    // must stay exactly 18 — the stats and feeds split the remainder.
    const sourceCanvas = boundedCanvas(1200, 720, 0)
    const targetCanvas = boundedCanvas(1200, 400, 0)
    const items: GridItem[] = [
      { id: 'header', x: 0, y: 0, w: 1200, h: 48, sizeMode: 'fixed-h', fixedHeight: 48 },
      { id: 'stat-1', x: 0, y: 66, w: 287, h: 100 },
      { id: 'stat-2', x: 305, y: 66, w: 287, h: 100 },
      { id: 'stat-3', x: 610, y: 66, w: 287, h: 100 },
      { id: 'stat-4', x: 915, y: 66, w: 285, h: 100 },
      { id: 'feed-a', x: 0, y: 184, w: 591, h: 536 },
      { id: 'feed-b', x: 609, y: 184, w: 591, h: 536 },
    ]
    const projected = scaleItems(items, sourceCanvas, targetCanvas)
    preserveGaps(projected, items, 18, targetCanvas, sourceCanvas)

    const findItem = (id: string) => projected.find((i) => i.id === id)!
    const header = findItem('header')
    expect(header.y).toBe(0)
    expect(header.h).toBe(48)

    // Header bottom flush with the top of the stats row, with exactly
    // 18 px between them.
    const stat1 = findItem('stat-1')
    const stat4 = findItem('stat-4')
    expect(stat1.y).toBe(header.y + header.h + 18)
    expect(stat4.y).toBe(stat1.y)
    // All stats in the row share the same height after redistribute.
    expect(stat4.h).toBe(stat1.h)

    // Stats bottom flush with the top of the feeds row, with exactly
    // 18 px between them.
    const feedA = findItem('feed-a')
    const feedB = findItem('feed-b')
    expect(feedA.y).toBe(stat1.y + stat1.h + 18)
    expect(feedB.y).toBe(feedA.y)
    // Feeds bottom hits the canvas edge.
    expect(feedA.y + feedA.h).toBe(400)
  })

  it('keeps the sharing page feed row filling the page below fixed stat cards', () => {
    const layout = flattenLayout(sharingPage(), { h: 594, w: 1280, x: 0, y: 0 })

    const find = (id: string) => {
      const item = layout.itemsById.get(id)
      if (!item) throw new Error(`Missing layout item ${id}`)
      return item
    }

    const header = find('header')
    const stat = find('stat-1')
    const statLast = find('stat-4')
    const feedA = find('feed-a')
    const feedB = find('feed-b')

    expect(header.rect.h).toBe(38)
    expect(stat.rect.y).toBe(header.rect.y + header.rect.h + 18)
    expect(stat.rect.h).toBe(140)
    expect(statLast.rect.h).toBe(stat.rect.h)
    expect(feedA.rect.y).toBe(stat.rect.y + stat.rect.h + 18)
    expect(feedB.rect.y).toBe(feedA.rect.y)
    expect(feedA.rect.h).toBeGreaterThan(250)
    expect(feedB.rect.h).toBe(feedA.rect.h)
    expect(feedA.rect.y + feedA.rect.h).toBe(594 - 18)
  })

  it('keeps a touching multi-column row flush against a fixed-h header (gap=0)', () => {
    // Page-level gap = 0 (no configured lg gap). A fixed-h=90 header sits
    // at y=0 with a row of four free items touching it at y=90, then a
    // second row at y=420 also touching the first. As the target canvas
    // grows taller, the free rows must stay flush against the fixed
    // header (gap stays 0) and absorb the extra height between them —
    // not drift away.
    const sourceCanvas = boundedCanvas(1200, 720, 0)
    const targetCanvas = boundedCanvas(1200, 900, 0)
    const items: GridItem[] = [
      { id: 'header', x: 0, y: 0, w: 1200, h: 90, sizeMode: 'fixed-h', fixedHeight: 90 },
      { id: 'chart', x: 0, y: 90, w: 600, h: 330 },
      { id: 'panel-a', x: 600, y: 90, w: 200, h: 330 },
      { id: 'panel-b', x: 800, y: 90, w: 200, h: 330 },
      { id: 'form', x: 1000, y: 90, w: 200, h: 330 },
      { id: 'feed', x: 0, y: 420, w: 1000, h: 300 },
      { id: 'details', x: 1000, y: 420, w: 200, h: 300 },
    ]
    const projected = scaleItems(items, sourceCanvas, targetCanvas)
    // Configured gap is 0 — the chain must still engage on the
    // touching pairs.
    preserveGaps(projected, items, 0, targetCanvas, sourceCanvas)

    const find = (id: string) => projected.find((i) => i.id === id)!
    const header = find('header')
    const chart = find('chart')
    const form = find('form')
    const feed = find('feed')
    const details = find('details')

    expect(header.h).toBe(90)
    // Chart row flush against the header (no drift).
    expect(chart.y).toBe(header.y + header.h)
    expect(form.y).toBe(chart.y)
    // Feed row flush against the chart row.
    expect(feed.y).toBe(chart.y + chart.h)
    expect(details.y).toBe(feed.y)
    // Feed row bottom hits the canvas bottom.
    expect(feed.y + feed.h).toBe(900)
  })

  it('keeps the configured 1-px gap between feed and details at a 3035-px-wide viewport', () => {
    // Regression: the authored layout has feed w=1884 + 1-px gap +
    // details x=1885,w=378 against canvas 2263×1024. The viewport is
    // 3035 × 1024.19. Rendered output showed
    //   feed.w = 2525  details.x = 2528
    // i.e. a 3-px visible gap where the layout asks for 1. The cause
    // was per-item Math.round in the projection chain rounding
    // siblings independently, so feed.right (2525.85→2526) and
    // details.x (2526.85→2527) diverged from each other AND from
    // the cross-chain form.x in a separate chain.
    //
    // Float positions through the projection pipeline keep the
    // configured 1-px gap intact (within sub-pixel tolerance) and
    // authored-edge alignment across rows holds.
    const sourceCanvas = boundedCanvas(2263, 1024, 0)
    const targetCanvas = boundedCanvas(3035, 1024, 0)
    const items: GridItem[] = [
      {
        id: 'header',
        x: 0,
        y: 0,
        w: 2263,
        h: 90,
        sizeMode: 'fixed-h',
        fixedHeight: 90,
        policy: { movement: 'locked' },
      },
      { id: 'chart', x: 0, y: 91, w: 1131, h: 488 },
      { id: 'panel-a', x: 1131, y: 91, w: 376, h: 488 },
      { id: 'panel-b', x: 1508, y: 91, w: 377, h: 488 },
      { id: 'form', x: 1885, y: 91, w: 378, h: 488 },
      { id: 'feed', x: 0, y: 580, w: 1884, h: 444 },
      { id: 'details', x: 1885, y: 580, w: 378, h: 444 },
    ]
    const projected = scaleItems(items, sourceCanvas, targetCanvas, 1)
    preserveGaps(projected, items, 1, targetCanvas, sourceCanvas)

    const findItem = (id: string) => projected.find((item) => item.id === id)!
    const feed = findItem('feed')
    const details = findItem('details')
    const form = findItem('form')

    // The configured gap is 1 px → details should start exactly 1
    // viewport pixel after feed ends. Sub-pixel tolerance (≤ 1.5)
    // because the browser will sub-pixel render but the projection
    // shouldn't add MORE than the configured 1.
    const gap = details.x - (feed.x + feed.w)
    expect(gap).toBeGreaterThanOrEqual(0.5)
    expect(gap).toBeLessThanOrEqual(1.5)

    // Cross-chain alignment: form (top row) and details (bottom row)
    // both at authored x=1885 land at the same viewport x within
    // sub-pixel tolerance.
    expect(Math.abs(form.x - details.x)).toBeLessThanOrEqual(0.5)
  })

  it('aligns items at the same authored X across separate row chains (no per-chain rounding drift)', () => {
    // Regression: form (top row) and details (bottom row) both sit at
    // authored x=1281 but project through DIFFERENT X-chains (one per
    // row). Each chain applies its own rounding and the two items ended
    // up at 1547 vs 1548 in the rendered viewport, leaving a 1-px
    // misalignment visible at the page's right edge. The cross-chain
    // edge-alignment pass must snap them to one common viewport x.
    const sourceCanvas = boundedCanvas(1538, 1024, 0)
    const targetCanvas = boundedCanvas(1858, 1024, 0)
    const items: GridItem[] = [
      { id: 'header', x: 0, y: 0, w: 1538, h: 90, sizeMode: 'fixed-h', fixedHeight: 90 },
      { id: 'chart', x: 0, y: 91, w: 768, h: 488 },
      { id: 'panel-a', x: 768, y: 91, w: 256, h: 488 },
      { id: 'panel-b', x: 1024, y: 91, w: 257, h: 488 },
      { id: 'form', x: 1281, y: 91, w: 257, h: 488 },
      { id: 'feed', x: 0, y: 580, w: 1280, h: 444 },
      { id: 'details', x: 1281, y: 580, w: 257, h: 444 },
    ]
    const projected = scaleItems(items, sourceCanvas, targetCanvas, 1)
    preserveGaps(projected, items, 1, targetCanvas, sourceCanvas)

    const findItem = (id: string) => projected.find((item) => item.id === id)!
    const form = findItem('form')
    const details = findItem('details')

    // Both items started at authored x=1281 — they MUST share the
    // same target x after projection. Pre-fix: 1547 vs 1548.
    expect(form.x).toBe(details.x)
    // And both should land at the same right edge too.
    expect(form.x + form.w).toBe(details.x + details.w)
  })

  it('scaleItems keeps multi-item rows aligned and preserveGaps restores exact gaps', () => {
    // Regression for a commit scramble. Four items share authored y=90 in
    // one vertical chain (a full-width feed below unions them). Walking the
    // chain item by item used to give each one its own slot, so a single
    // drag committed four different y values for one row. Lanes fix that:
    // items that start together are projected together, and preserveGaps
    // then restores the exact configured gaps and edge anchors.
    const sourceCanvas = boundedCanvas(1200, 720, 0)
    const targetCanvas = boundedCanvas(1718, 888, 0)
    const items: GridItem[] = [
      {
        id: 'header',
        x: 0,
        y: 0,
        w: 1200,
        h: 90,
        sizeMode: 'fixed-h',
        fixedHeight: 90,
        policy: { movement: 'locked' },
      },
      { id: 'chart', x: 0, y: 90, w: 600, h: 330 },
      { id: 'panel-a', x: 600, y: 90, w: 200, h: 330 },
      { id: 'panel-b', x: 800, y: 90, w: 200, h: 330 },
      { id: 'form', x: 1000, y: 90, w: 200, h: 330 },
      { id: 'feed', x: 0, y: 420, w: 1000, h: 300 },
      { id: 'details', x: 1000, y: 420, w: 200, h: 300 },
    ]

    const projected = scaleItems(items, sourceCanvas, targetCanvas, 1)

    const findById = (list: GridItem[], id: string): GridItem =>
      list.find((item) => item.id === id)!
    const scaledTopYs = new Set([
      findById(projected, 'chart').y,
      findById(projected, 'panel-a').y,
      findById(projected, 'panel-b').y,
      findById(projected, 'form').y,
    ])
    expect(scaledTopYs.size).toBe(1)

    preserveGaps(projected, items, 1, targetCanvas, sourceCanvas)

    const header = findById(projected, 'header')
    const chart = findById(projected, 'chart')
    const panelA = findById(projected, 'panel-a')
    const panelB = findById(projected, 'panel-b')
    const form = findById(projected, 'form')
    const feed = findById(projected, 'feed')
    const details = findById(projected, 'details')

    expect(header.y).toBe(0)
    expect(header.h).toBe(90)
    // Top row tiles at the SAME y (within 1 px of the header bottom +
    // configured gap).
    const topYs = [chart.y, panelA.y, panelB.y, form.y]
    expect(Math.max(...topYs) - Math.min(...topYs)).toBeLessThanOrEqual(1)
    expect(chart.y - (header.y + header.h)).toBeLessThanOrEqual(2)
    // Top-row members share the same h (after redistribute).
    expect(Math.abs(panelA.h - chart.h)).toBeLessThanOrEqual(1)
    // Bottom row tiles at the SAME y.
    expect(Math.abs(feed.y - details.y)).toBeLessThanOrEqual(1)
    // Bottom row sits 1 px below top row.
    expect(feed.y - (chart.y + chart.h)).toBeLessThanOrEqual(2)
  })

  it('redistributes a header+feeds chain across asymmetric source/target padding', () => {
    // Source canvas has uniform 18-px padding (lg) on every side, so
    // header sits at y=18 + h=90 and feeds sits at y=108 + h=594
    // (= source inner-bottom). Target canvas (rendered viewport) uses a
    // padding of { top:0, right:18, bottom:18, left:18 } — top padding
    // overridden to "none" so the header touches the page top.
    //
    // Pre-fix bug: anchoring against fixed siblings pinned feeds.y to
    // header.bottom (authored gap=0) but didn't grow feeds.h, so feeds
    // ended ~38 px short of the target inner-bottom. Chain redistribute
    // then computed `lastTouchesEnd` on the already-shifted scaled
    // value, failed the canvas-span check, and bailed without
    // redistributing — leaving the gap visible on the rendered page.
    const sourceCanvas: GridCanvas = {
      width: 1200,
      height: 720,
      padding: { top: 18, right: 18, bottom: 18, left: 18 },
      heightMode: 'bounded',
    }
    const targetCanvas: GridCanvas = {
      width: 1184,
      height: 991,
      padding: { top: 0, right: 18, bottom: 18, left: 18 },
      heightMode: 'bounded',
    }
    const items: GridItem[] = [
      {
        id: 'header',
        x: 18,
        y: 18,
        w: 1164,
        h: 90,
        minH: 90,
        maxH: 90,
        sizeMode: 'fixed-h',
        fixedHeight: 90,
      },
      { id: 'feeds', x: 18, y: 108, w: 1164, h: 594 },
    ]
    const projected = scaleItems(items, sourceCanvas, targetCanvas)
    preserveGaps(projected, items, 0, targetCanvas, sourceCanvas)

    const find = (id: string) => projected.find((i) => i.id === id)!
    const header = find('header')
    const feeds = find('feeds')

    expect(header.h).toBe(90)
    // Header stays anchored to the target top (padding.top=0).
    expect(header.y).toBe(0)
    // Feeds sits flush against the header bottom.
    expect(feeds.y).toBe(header.y + header.h)
    // Feeds grows so its bottom reaches the target inner-end
    // (target.height - padding.bottom = 991 - 18 = 973).
    expect(feeds.y + feeds.h).toBe(973)
  })

  it('lets a column-spanning sibling reach the canvas bottom while flush rows below it scale', () => {
    // After the user resized panel-b south to the canvas bottom. panel-b
    // (x=800-1000) now spans BOTH rows under the fixed-h header: its
    // authored h=630 covers chart's row (90-420) AND the feed row
    // (420-720). The chain logic used to bail because lane 1 size =
    // max(chart 330, panel-b 630) = 630 made lane 1 overflow lane 2's
    // start. After the spanning-aware fix:
    //   - chart row scales proportionally to its 330 share
    //   - feed row scales proportionally to its 300 share
    //   - panel-b's bottom hits the canvas bottom
    //   - row-1 items' bottoms align flush with row-2 items' tops
    const sourceCanvas = boundedCanvas(1200, 720, 0)
    const targetCanvas = boundedCanvas(1200, 900, 0)
    const items: GridItem[] = [
      {
        id: 'header',
        x: 0,
        y: 0,
        w: 1200,
        h: 90,
        sizeMode: 'fixed-h',
        fixedHeight: 90,
        policy: { movement: 'locked' },
      },
      { id: 'chart', x: 0, y: 90, w: 600, h: 330 },
      { id: 'panel-a', x: 600, y: 90, w: 200, h: 330 },
      { id: 'panel-b', x: 800, y: 90, w: 200, h: 630 },
      { id: 'form', x: 1000, y: 90, w: 200, h: 330 },
      { id: 'feed', x: 0, y: 420, w: 800, h: 300 },
      { id: 'details', x: 1000, y: 420, w: 200, h: 300 },
    ]
    const projected = scaleItems(items, sourceCanvas, targetCanvas)
    preserveGaps(projected, items, 0, targetCanvas, sourceCanvas)

    const find = (id: string) => projected.find((i) => i.id === id)!
    const header = find('header')
    const chart = find('chart')
    const panelA = find('panel-a')
    const form = find('form')
    const panelB = find('panel-b')
    const feed = find('feed')
    const details = find('details')

    // Header keeps its fixed height at the top.
    expect(header.y).toBe(0)
    expect(header.h).toBe(90)
    // Row 1 starts flush against the header.
    expect(chart.y).toBe(90)
    expect(panelA.y).toBe(90)
    expect(form.y).toBe(90)
    expect(panelB.y).toBe(90)
    // Row 1 height = (330 / 630) * (900 - 90) ≈ 424.
    expect(chart.h).toBeGreaterThan(420)
    expect(chart.h).toBeLessThan(428)
    // All row-1 siblings share the same bottom.
    expect(panelA.y + panelA.h).toBe(chart.y + chart.h)
    expect(form.y + form.h).toBe(chart.y + chart.h)
    // Row 2 starts exactly where row 1 ends — no drift.
    expect(feed.y).toBe(chart.y + chart.h)
    expect(details.y).toBe(feed.y)
    // Row 2 hits canvas bottom.
    expect(feed.y + feed.h).toBe(900)
    expect(details.y + details.h).toBe(900)
    // panel-b spans both rows — reaches the canvas bottom and starts at
    // the header bottom.
    expect(panelB.y + panelB.h).toBe(900)
  })

  it('keeps a fixed-w right-edge sibling pinned in a single-anchor chain (gap=md)', () => {
    // Mirrors a header row: an unrelated free item (`switcher`) sits to
    // the left of a fixed-w=38 settings button anchored to the right
    // canvas edge with a 12-px md gap. The chain walk previously placed
    // the settings button forward from the switcher's scaled position,
    // pulling it ~12 px off the wall. After the end-anchored branch, the
    // settings button stays anchored and the switcher shifts to keep the
    // 12-px gap.
    const sourceCanvas = boundedCanvas(1200, 720, 0)
    const targetCanvas = boundedCanvas(1500, 720, 0)
    const items: GridItem[] = [
      { id: 'switcher', x: 1024, y: 0, w: 126, h: 720 },
      { id: 'settings', x: 1162, y: 0, w: 38, h: 720, sizeMode: 'fixed-w', fixedWidth: 38 },
    ]
    const projected = scaleItems(items, sourceCanvas, targetCanvas)
    preserveGaps(projected, items, 12, targetCanvas, sourceCanvas)

    const find = (id: string) => projected.find((i) => i.id === id)!
    const settings = find('settings')
    const switcher = find('switcher')
    // Settings button flush with the target canvas right edge.
    expect(settings.x + settings.w).toBe(targetCanvas.width)
    expect(settings.w).toBe(38)
    // Switcher sits exactly 12 px to the left.
    expect(settings.x - (switcher.x + switcher.w)).toBe(12)
  })
})
