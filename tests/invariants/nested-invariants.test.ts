import { describe, expect, it } from 'bun:test'
import fc from 'fast-check'

import { findContainerAt, flattenLayout, hitTest, pointInRect, type FlatLayout } from 'gridla'

import { deepFreeze, snapshot, treeArb, type TreeCase } from './arbitraries'

/**
 * Property-based invariants for nested trees flattened with `flattenLayout`:
 * containment of every child inside its parent, index consistency, and the
 * hit-testing queries returning the deepest matching item/container.
 */

const TOL = 1

const pointArb = fc.record({
  px: fc.integer({ min: -10, max: 110 }),
  py: fc.integer({ min: -10, max: 110 }),
})

function flatten(tree: TreeCase): FlatLayout {
  const frozen = deepFreeze(structuredClone(tree))
  return flattenLayout(frozen.root, frozen.rootRect)
}

describe('nested invariants', () => {
  it('every child rect lies inside its parent rect', () => {
    fc.assert(
      fc.property(treeArb, (tree) => {
        const flat = flatten(tree)
        for (const item of flat.items) {
          if (item.parentId === null) continue
          const parent = flat.itemsById.get(item.parentId)!
          expect(item.rect.x).toBeGreaterThanOrEqual(parent.rect.x - TOL)
          expect(item.rect.y).toBeGreaterThanOrEqual(parent.rect.y - TOL)
          expect(item.rect.x + item.rect.w).toBeLessThanOrEqual(parent.rect.x + parent.rect.w + TOL)
          expect(item.rect.y + item.rect.h).toBeLessThanOrEqual(parent.rect.y + parent.rect.h + TOL)
        }
      }),
      { numRuns: 500 },
    )
  })

  it('itemsById and childrenByParentId agree with the item list', () => {
    fc.assert(
      fc.property(treeArb, (tree) => {
        const flat = flatten(tree)
        expect(flat.itemsById.size).toBe(flat.items.length)
        const root = flat.itemsById.get(flat.rootId)!
        expect(root.parentId).toBeNull()
        expect(root.depth).toBe(0)
        expect(flat.childrenByParentId.get(null)).toEqual([flat.rootId])

        const expected = new Map<string | null, string[]>()
        for (const item of flat.items) {
          expect(flat.itemsById.get(item.id)).toBe(item)
          const list = expected.get(item.parentId) ?? []
          list.push(item.id)
          expected.set(item.parentId, list)
          if (item.parentId !== null) {
            const parent = flat.itemsById.get(item.parentId)!
            expect(parent.isContainer).toBe(true)
            expect(item.depth).toBe(parent.depth + 1)
            // the flat entry is the parent's rendered item translated to root coordinates
            expect(item.sizing).not.toBeNull()
            expect(item.rect).toEqual({
              x: parent.rect.x + item.sizing!.x,
              y: parent.rect.y + item.sizing!.y,
              w: item.sizing!.w,
              h: item.sizing!.h,
            })
          }
        }
        expect(flat.childrenByParentId.size).toBe(expected.size)
        for (const [parentId, ids] of expected) {
          expect(flat.childrenByParentId.get(parentId)).toEqual(ids)
        }
        // every authored child appears exactly once
        const authored = new Set<string>()
        const walk = (node: typeof tree.root) => {
          authored.add(node.id)
          for (const child of node.children ?? []) walk(child)
        }
        walk(tree.root)
        expect(new Set(flat.items.map((item) => item.id))).toEqual(authored)
      }),
      { numRuns: 500 },
    )
  })

  it('hitTest returns the deepest item containing the point', () => {
    fc.assert(
      fc.property(treeArb, pointArb, (tree, { px, py }) => {
        const flat = flatten(tree)
        const point = {
          x: Math.round(tree.rootRect.x + (tree.rootRect.w * px) / 100),
          y: Math.round(tree.rootRect.y + (tree.rootRect.h * py) / 100),
        }
        const hit = hitTest(flat, point)
        const containing = flat.items.filter((item) => pointInRect(point, item.rect))
        if (containing.length === 0) {
          expect(hit).toBeNull()
          return
        }
        expect(hit).not.toBeNull()
        expect(pointInRect(point, hit!.rect)).toBe(true)
        const deepest = Math.max(...containing.map((item) => item.depth))
        expect(hit!.depth).toBe(deepest)
      }),
      { numRuns: 500 },
    )
  })

  it('findContainerAt returns the deepest accepting container containing the point', () => {
    fc.assert(
      fc.property(treeArb, pointArb, (tree, { px, py }) => {
        const flat = flatten(tree)
        const point = {
          x: Math.round(tree.rootRect.x + (tree.rootRect.w * px) / 100),
          y: Math.round(tree.rootRect.y + (tree.rootRect.h * py) / 100),
        }
        const container = findContainerAt(flat, point)
        const candidates = flat.items.filter(
          (item) => item.acceptsChildren && pointInRect(point, item.rect),
        )
        if (candidates.length === 0) {
          expect(container).toBeNull()
          return
        }
        expect(container).not.toBeNull()
        expect(container!.acceptsChildren).toBe(true)
        expect(pointInRect(point, container!.rect)).toBe(true)
        const deepest = Math.max(...candidates.map((item) => item.depth))
        expect(container!.depth).toBe(deepest)
      }),
      { numRuns: 500 },
    )
  })

  it('flattening is deterministic and does not mutate the tree', () => {
    fc.assert(
      fc.property(treeArb, (tree) => {
        const frozen = deepFreeze(structuredClone(tree))
        const before = snapshot(frozen)
        const first = flattenLayout(frozen.root, frozen.rootRect)
        const second = flattenLayout(frozen.root, frozen.rootRect)
        expect(snapshot(frozen)).toBe(before)
        expect(
          snapshot(
            second.items.map(({ id, parentId, depth, rect }) => ({ id, parentId, depth, rect })),
          ),
        ).toBe(
          snapshot(
            first.items.map(({ id, parentId, depth, rect }) => ({ id, parentId, depth, rect })),
          ),
        )
      }),
      { numRuns: 200 },
    )
  })
})
