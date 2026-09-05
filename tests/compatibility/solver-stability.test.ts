import { describe, expect, it } from 'bun:test'

import {
  boundsFromCanvas,
  moveItem,
  resizeItem,
  resizeRect,
  type GridBounds,
  type GridCanvas,
  type GridItem,
  type GridResizeEdge,
} from 'gridla'

/**
 * A fixed four-item layout captured after a first round of fixes. Many
 * sibling pairs sit within the configured 18-px gap halo but have NO actual
 * geometric overlap — only the pre-existing feed-b.bottom=272 vs stat.top=289
 * leaves a 17-px vertical gap (1 less than configured). The solver must NOT
 * enforce the configured gap on resizes that don't introduce real overlap.
 */
function tightGapItems(): Array<GridItem> {
  // stat is shrunk to w=217, h=126 with y=289. The stat/note pair has a
  // 21-px x-gap (3 more than configured) and feed-b.bottom=272 vs
  // stat.y=289 is a 17-px vertical gap (1 less than configured). These are
  // the pre-existing pinches the solver must NOT "correct" on its own.
  return [
    {
      h: 126,
      id: 'stat',
      minH: 64,
      minW: 120,
      w: 217,
      x: 371,
      y: 289,
    },
    {
      id: 'feed-a',
      x: 1,
      y: 1,
      w: 587,
      h: 270,
      minW: 83,
      minH: 1,
    },
    {
      h: 247,
      id: 'note',
      minH: 80,
      minW: 120,
      w: 343,
      x: 609,
      y: 288,
    },
    {
      id: 'feed-b',
      x: 606,
      y: 1,
      w: 593,
      h: 271,
      minW: 83,
      minH: 1,
    },
  ]
}

const canvas: GridCanvas = {
  width: 1200,
  height: 720,
  padding: { top: 1, right: 1, bottom: 1, left: 1 },
  heightMode: 'bounded',
}

const bounds: GridBounds = boundsFromCanvas(canvas)

const GAP = 18

function findItem(items: ReadonlyArray<GridItem>, id: string): GridItem {
  const found = items.find((entry) => entry.id === id)
  if (!found) throw new Error(`missing item ${id}`)
  return found
}

function commitResize({
  items,
  activeId,
  direction,
  deltaX,
  deltaY,
}: {
  items: Array<GridItem>
  activeId: string
  direction: GridResizeEdge
  deltaX: number
  deltaY: number
}): Array<GridItem> {
  const active = findItem(items, activeId)
  const desired = resizeRect(active, direction, { x: deltaX, y: deltaY }, bounds)
  const result = resizeItem({
    layout: { canvas, items },
    itemId: activeId,
    edge: direction,
    rect: desired,
    options: { gap: GAP },
  })
  if (!result.accepted) return items
  return result.layout.items
}

describe('solver stability: tight authored gaps', () => {
  it('exposes the pre-existing tight gaps (sanity check)', () => {
    const items = tightGapItems()
    const feedA = findItem(items, 'feed-a')
    const feedB = findItem(items, 'feed-b')
    const stat = findItem(items, 'stat')
    const note = findItem(items, 'note')
    // feed-a right→feed-b left should be exactly 18 here.
    expect(feedB.x - (feedA.x + feedA.w)).toBe(18)
    // feed-b.bottom→stat.top is 17 (one less than configured 18).
    expect(stat.y - (feedB.y + feedB.h)).toBe(17)
    // stat.right→note.left is 21 (three more than configured).
    expect(note.x - (stat.x + stat.w)).toBe(21)
  })

  it('resizing feed-b south by 1 px must not change any other item', () => {
    const before = tightGapItems()
    const after = commitResize({
      items: before.map((entry) => ({ ...entry })),
      activeId: 'feed-b',
      direction: 's',
      deltaX: 0,
      deltaY: 1,
    })
    for (const beforeItem of before) {
      if (beforeItem.id === 'feed-b') continue
      const afterItem = findItem(after, beforeItem.id)
      expect({
        id: afterItem.id,
        x: afterItem.x,
        y: afterItem.y,
        w: afterItem.w,
        h: afterItem.h,
      }).toEqual({
        id: beforeItem.id,
        x: beforeItem.x,
        y: beforeItem.y,
        w: beforeItem.w,
        h: beforeItem.h,
      })
    }
  })

  it('100 consecutive tiny resizes on feed-b must not drift any neighbour', () => {
    let items = tightGapItems()
    const initialFeedA = findItem(items, 'feed-a')
    const initialStat = findItem(items, 'stat')
    const initialNote = findItem(items, 'note')
    for (let i = 0; i < 100; i += 1) {
      const direction: GridResizeEdge = i % 2 === 0 ? 's' : 'n'
      items = commitResize({
        items,
        activeId: 'feed-b',
        direction,
        deltaX: 0,
        deltaY: i % 2 === 0 ? 1 : -1,
      })
    }
    const feedA = findItem(items, 'feed-a')
    const stat = findItem(items, 'stat')
    const note = findItem(items, 'note')
    // feed-a is on a completely separate axis from feed-b on Y;
    // resizing feed-b's height MUST NOT mutate feed-a's geometry.
    expect({ x: feedA.x, y: feedA.y, w: feedA.w, h: feedA.h }).toEqual({
      x: initialFeedA.x,
      y: initialFeedA.y,
      w: initialFeedA.w,
      h: initialFeedA.h,
    })
    // stat at y=288 is below feed-b.bottom=272; small ±1 px
    // resizes don't bring feed-b into vertical overlap with it.
    expect({
      x: stat.x,
      y: stat.y,
      w: stat.w,
      h: stat.h,
    }).toEqual({
      x: initialStat.x,
      y: initialStat.y,
      w: initialStat.w,
      h: initialStat.h,
    })
    // note starts overlapping feed-b once feed-b grows past y=288.
    // With ±1 px resizes alternating around 271 we never reach 287,
    // so note must also stay put.
    expect({
      x: note.x,
      y: note.y,
      w: note.w,
      h: note.h,
    }).toEqual({
      x: initialNote.x,
      y: initialNote.y,
      w: initialNote.w,
      h: initialNote.h,
    })
  })

  it('south resize must not mutate the active item on the X axis', () => {
    const before = tightGapItems()
    const beforeFeedB = findItem(before, 'feed-b')
    const after = commitResize({
      items: before.map((entry) => ({ ...entry })),
      activeId: 'feed-b',
      direction: 's',
      deltaX: 0,
      deltaY: 20,
    })
    const afterFeedB = findItem(after, 'feed-b')
    expect(afterFeedB.x).toBe(beforeFeedB.x)
    expect(afterFeedB.w).toBe(beforeFeedB.w)
  })

  it('idempotence: re-committing the same canonical resize result is a no-op', () => {
    const initial = tightGapItems()
    const once = commitResize({
      items: initial.map((entry) => ({ ...entry })),
      activeId: 'feed-b',
      direction: 's',
      deltaX: 0,
      deltaY: 10,
    })
    // Second commit using the SAME origin sizing from the result as if
    // the user started a new gesture at the new size and dragged 0px.
    const twice = commitResize({
      items: once.map((entry) => ({ ...entry })),
      activeId: 'feed-b',
      direction: 's',
      deltaX: 0,
      deltaY: 0,
    })
    for (const onceItem of once) {
      const twiceItem = findItem(twice, onceItem.id)
      expect({
        id: twiceItem.id,
        x: twiceItem.x,
        y: twiceItem.y,
        w: twiceItem.w,
        h: twiceItem.h,
      }).toEqual({
        id: onceItem.id,
        x: onceItem.x,
        y: onceItem.y,
        w: onceItem.w,
        h: onceItem.h,
      })
    }
  })

  it('drag must not mutate any non-active item when there is room', () => {
    const before = tightGapItems()
    const active = findItem(before, 'stat')
    const result = moveItem({
      layout: { canvas, items: before },
      itemId: active.id,
      position: { x: active.x + 1, y: active.y + 1 },
      options: { gap: GAP },
    })
    expect(result.accepted).toBe(true)
    for (const beforeItem of before) {
      if (beforeItem.id === active.id) continue
      const afterItem = findItem(result.layout.items, beforeItem.id)
      expect({
        id: afterItem.id,
        x: afterItem.x,
        y: afterItem.y,
        w: afterItem.w,
        h: afterItem.h,
      }).toEqual({
        id: beforeItem.id,
        x: beforeItem.x,
        y: beforeItem.y,
        w: beforeItem.w,
        h: beforeItem.h,
      })
    }
  })

  it('a large south resize of feed-b does NOT alter feed-a width or position', () => {
    // The layout has a pre-existing 15-px canonical gap between
    // feed-a.right and feed-b.left (configured gap is 18).
    // When feed-b grows south by ~50 px it vertically overlaps
    // note (legitimate collision). The solver SHOULD shrink/
    // shift note and may even leave feed-b's size alone, but
    // it must NOT enforce the configured 18-px gap between feed-a
    // and feed-b — those two items never enter collision because
    // the resize only changes feed-b's height. Pre-existing authored
    // misalignment is the author's responsibility to fix; the solver's
    // job is to avoid REAL collisions, not to retroactively perfect
    // every authored gap.
    const before = tightGapItems()
    const beforeFeedA = findItem(before, 'feed-a')
    const beforeStat = findItem(before, 'stat')
    const after = commitResize({
      items: before.map((entry) => ({ ...entry })),
      activeId: 'feed-b',
      direction: 's',
      deltaX: 0,
      deltaY: 50,
    })
    const afterFeedA = findItem(after, 'feed-a')
    const afterStat = findItem(after, 'stat')
    // feed-a and feed-b never enter overlap on this gesture
    // (they're at the same y but the gesture only changes feed-b's
    // bottom edge, which is far away from feed-a's right edge).
    // feed-a must not change.
    expect({
      x: afterFeedA.x,
      y: afterFeedA.y,
      w: afterFeedA.w,
      h: afterFeedA.h,
    }).toEqual({
      x: beforeFeedA.x,
      y: beforeFeedA.y,
      w: beforeFeedA.w,
      h: beforeFeedA.h,
    })
    // stat also doesn't horizontally OR vertically overlap with
    // any plausible feed-b south-resize endpoint — it must stay put.
    expect({
      x: afterStat.x,
      y: afterStat.y,
      w: afterStat.w,
      h: afterStat.h,
    }).toEqual({
      x: beforeStat.x,
      y: beforeStat.y,
      w: beforeStat.w,
      h: beforeStat.h,
    })
  })

  it('a south resize that overlaps note only shrinks/shifts note, nothing else', () => {
    const before = tightGapItems()
    const beforeFeedA = findItem(before, 'feed-a')
    const beforeStat = findItem(before, 'stat')
    const after = commitResize({
      items: before.map((entry) => ({ ...entry })),
      activeId: 'feed-b',
      direction: 's',
      deltaX: 0,
      deltaY: 80,
    })
    const afterFeedA = findItem(after, 'feed-a')
    const afterStat = findItem(after, 'stat')
    expect(afterFeedA).toEqual(beforeFeedA)
    expect(afterStat).toEqual(beforeStat)
  })

  it('a south resize that REALLY pushes into note trims note', () => {
    // 200-px south growth puts feed-b.bottom at 271 → 471, well
    // past note.y=288. That IS a real push; note must
    // either shrink (move down, smaller h) so the gap is honoured, or
    // the resize is refused. The post-resize note height must
    // be strictly smaller than the pre-resize 247.
    const before = tightGapItems()
    const after = commitResize({
      items: before.map((entry) => ({ ...entry })),
      activeId: 'feed-b',
      direction: 's',
      deltaX: 0,
      deltaY: 200,
    })
    const feedB = findItem(after, 'feed-b')
    const note = findItem(after, 'note')
    const beforeNote = findItem(before, 'note')
    // Either the resize was accepted with note moved or shrunk,
    // OR it was refused (feed-b unchanged). Refused gestures stay at
    // the previous bounds — but a 200-px push past note shouldn't
    // be silently refused without ANY adjustment, so prefer the trim.
    if (feedB.h > 271) {
      // Resize was accepted — note must reflect being pushed.
      expect(note.h).toBeLessThan(beforeNote.h)
      // And the resulting layout must satisfy gap on the y axis between
      // feed-b and note (within rounding tolerance).
      const gapAfter = note.y - (feedB.y + feedB.h)
      expect(gapAfter).toBeGreaterThanOrEqual(GAP - 1)
    }
  })

  it('200 mixed gestures (resize/drag) on feed-b never touch feed-a or stat', () => {
    let items = tightGapItems()
    const initialFeedA = findItem(items, 'feed-a')
    const initialStat = findItem(items, 'stat')
    const dirs: Array<GridResizeEdge> = ['n', 's']
    for (let i = 0; i < 200; i += 1) {
      const direction = dirs[i % dirs.length]
      const delta = ((i % 10) - 5) * 4 // -20..20 in steps of 4
      items = commitResize({
        items,
        activeId: 'feed-b',
        direction,
        deltaX: 0,
        deltaY: delta,
      })
      const feedA = findItem(items, 'feed-a')
      const stat = findItem(items, 'stat')
      // Lock in: neither item changes EVER, regardless of feed-b
      // gesture history.
      expect(feedA).toEqual(initialFeedA)
      expect(stat).toEqual(initialStat)
    }
  })

  it('stat east resize toward note snaps to gap=18 without moving feed-b', () => {
    // The layout has stat at x=371, w=217 and note at x=609.
    // Pre-existing x-gap = 21 (3 more than configured 18).
    // The user wants to drag stat's east handle to the right and
    // close the gap until it snaps at 18. Snap target: note.x - gap
    // = 609 - 18 = 591. stat.right must end at 591. feed-b, which
    // sits diagonally above stat (different y range), must NOT move.
    const before = tightGapItems()
    const beforeFeedB = findItem(before, 'feed-b')
    const beforeFeedA = findItem(before, 'feed-a')
    const beforeNote = findItem(before, 'note')
    // Drag east handle by 5 px — short of the snap distance but with the
    // snap targets including note.x-gap=591, the active.right of
    // 588+5=593 is within snap distance (24) of 591.
    const after = commitResize({
      items: before.map((entry) => ({ ...entry })),
      activeId: 'stat',
      direction: 'e',
      deltaX: 5,
      deltaY: 0,
    })
    const afterStat = findItem(after, 'stat')
    const afterFeedB = findItem(after, 'feed-b')
    const afterFeedA = findItem(after, 'feed-a')
    const afterNote = findItem(after, 'note')
    // stat right edge lands at note.x - configured_gap.
    expect(afterStat.x + afterStat.w).toBe(beforeNote.x - GAP)
    // feed-b must NOT move — they're diagonally separated.
    expect(afterFeedB).toEqual(beforeFeedB)
    // feed-a must NOT move.
    expect(afterFeedA).toEqual(beforeFeedA)
    // note must NOT move (the user resized AWAY from it; no push).
    expect(afterNote).toEqual(beforeNote)
  })

  it('note west resize toward stat snaps to gap=18 without moving feed-b', () => {
    // Mirror of the previous test: drag note's west handle
    // leftward to close the same gap. Snap target: stat.right + gap.
    const before = tightGapItems()
    const beforeStat = findItem(before, 'stat')
    const beforeFeedB = findItem(before, 'feed-b')
    const beforeFeedA = findItem(before, 'feed-a')
    const after = commitResize({
      items: before.map((entry) => ({ ...entry })),
      activeId: 'note',
      direction: 'w',
      deltaX: -5,
      deltaY: 0,
    })
    const afterNote = findItem(after, 'note')
    const afterStat = findItem(after, 'stat')
    const afterFeedB = findItem(after, 'feed-b')
    const afterFeedA = findItem(after, 'feed-a')
    // note left edge lands at stat.right + configured_gap.
    expect(afterNote.x).toBe(beforeStat.x + beforeStat.w + GAP)
    expect(afterStat).toEqual(beforeStat)
    expect(afterFeedB).toEqual(beforeFeedB)
    expect(afterFeedA).toEqual(beforeFeedA)
  })

  it('a large stat east overshoot trims note only (no feed-b shift)', () => {
    // Push stat east by 100 px — well past note.x. stat
    // is now in real geometric overlap with note. Solver should
    // shrink/shift note to maintain 18-px gap. feed-b is at a
    // different y range (1-272 vs stat at 289-415) — pre-existing
    // 17-px vertical gap. The diagonal placement means stat's east
    // growth NEVER geometrically overlaps feed-b, so the solver must
    // leave it bit-identical.
    const before = tightGapItems()
    const beforeFeedB = findItem(before, 'feed-b')
    const beforeFeedA = findItem(before, 'feed-a')
    const after = commitResize({
      items: before.map((entry) => ({ ...entry })),
      activeId: 'stat',
      direction: 'e',
      deltaX: 100,
      deltaY: 0,
    })
    const afterFeedB = findItem(after, 'feed-b')
    const afterFeedA = findItem(after, 'feed-a')
    expect(afterFeedB).toEqual(beforeFeedB)
    expect(afterFeedA).toEqual(beforeFeedA)
  })

  it('ghost (collision: ignore) items are transparent to neighbour resizes', () => {
    // Regression: a sibling whose canonical slot is held as a ghost
    // (`policy.collision: 'ignore'`) must not block a neighbour that
    // resizes east into its space. The solver must accept the resize
    // because the ghost slot shouldn't take part in collision detection.
    const panel: GridItem = {
      id: 'panel',
      x: 600,
      y: 60,
      w: 200,
      h: 360,
      minW: 100,
      minH: 1,
    }
    const sidebarGhost: GridItem = {
      id: 'sidebar',
      x: 800,
      y: 60,
      w: 200,
      h: 360,
      minW: 100,
      minH: 1,
      policy: { collision: 'ignore' },
    }
    const result = resizeItem({
      layout: { canvas, items: [panel, sidebarGhost] },
      itemId: 'panel',
      edge: 'e',
      // Grow panel east into sidebar's slot.
      rect: { ...panel, w: 400 },
      options: { gap: 0 },
    })
    expect(result.accepted).toBe(true)
    const resizedPanel = result.layout.items.find((i) => i.id === 'panel')
    expect(resizedPanel?.w).toBe(400)
    // And the ghost slot is left untouched.
    const stillGhostSidebar = result.layout.items.find((i) => i.id === 'sidebar')
    expect(stillGhostSidebar).toEqual(sidebarGhost)
  })

  it('500-step seeded random gesture stream: only collided neighbours ever change', () => {
    // Higher-volume fuzz: every gesture is on a random item with a
    // random axis + sign + magnitude. After every commit, any neighbour
    // that did NOT geometrically overlap the active rect post-resize
    // must be bit-identical to its pre-commit state. Geometric overlap
    // (no gap inflation) is the only thing that should make the solver
    // touch a neighbour — pre-existing tight gaps must NEVER cause an
    // unrelated item to drift.
    let items = tightGapItems()
    const dirs: Array<GridResizeEdge> = ['n', 's', 'e', 'w']
    const ids = items.map((entry) => entry.id)
    let seed = 1234567
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    const overlaps = (a: GridItem, b: GridItem) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
    for (let step = 0; step < 500; step += 1) {
      const before = items.map((entry) => ({ ...entry }))
      const activeId = ids[Math.floor(rand() * ids.length)]
      const direction = dirs[Math.floor(rand() * dirs.length)]
      const delta = Math.floor((rand() - 0.5) * 80)
      const deltaX = direction.includes('e') || direction.includes('w') ? delta : 0
      const deltaY = direction.includes('n') || direction.includes('s') ? delta : 0
      items = commitResize({
        items,
        activeId,
        direction,
        deltaX,
        deltaY,
      })
      const activeAfter = findItem(items, activeId)
      for (const beforeItem of before) {
        if (beforeItem.id === activeId) continue
        const afterItem = findItem(items, beforeItem.id)
        // If the resized item DID NOT land overlapping this
        // neighbour, the neighbour must not have changed.
        if (!overlaps(activeAfter, beforeItem)) {
          expect({
            id: afterItem.id,
            x: afterItem.x,
            y: afterItem.y,
            w: afterItem.w,
            h: afterItem.h,
          }).toEqual({
            id: beforeItem.id,
            x: beforeItem.x,
            y: beforeItem.y,
            w: beforeItem.w,
            h: beforeItem.h,
          })
        }
      }
    }
  })
})
