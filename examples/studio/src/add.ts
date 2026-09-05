/**
 * Adding nodes. Both the palette (click and drag) and keyboard paths create a
 * node here, park it in `pendingNodes`, and let the group's provider place its
 * geometry. The provider's `onLayoutChange` then picks the node up by id.
 */

import { canvasInnerHeight, canvasInnerWidth, type GridItem, type GridPoint } from 'gridla'

import type { CanvasEntry } from './canvas-registry'
import { emptyGroupLayout, nextId, type StudioNode } from './document'
import { getKind, type NodeKind } from './registry'

/** Nodes waiting for their layout item to be placed, keyed by id. */
export const pendingNodes = new Map<string, StudioNode>()

export type NewNode = { node: StudioNode; item: GridItem }

export function createNode(kind: NodeKind, target?: CanvasEntry): NewNode {
  const spec = getKind(kind)
  const id = nextId(kind)
  let w = spec.size.w
  let h = spec.size.h
  if (target) {
    const canvas = target.getLayout().canvas
    w = Math.min(w, Math.max(spec.size.minW ?? 1, canvasInnerWidth(canvas)))
    if (canvas.heightMode === 'bounded')
      h = Math.min(h, Math.max(spec.size.minH ?? 1, canvasInnerHeight(canvas)))
  }
  const node: StudioNode =
    kind === 'group'
      ? {
          id,
          kind,
          props: { ...spec.defaultProps },
          gap: 12,
          layout: emptyGroupLayout(w, h),
          children: [],
        }
      : { id, kind, props: { ...spec.defaultProps } }
  const item: GridItem = { ...spec.size, id, x: 0, y: 0, w, h }
  return { node, item }
}

/** Click-to-add: put a new node into the group at the first open slot. */
export function addAtOpenSlot(target: CanvasEntry, kind: NodeKind): boolean {
  const { node, item } = createNode(kind, target)
  const { canvas } = target.getLayout()
  pendingNodes.set(node.id, node)
  const accepted = target.actions.place(item, {
    position: { x: canvas.padding.left, y: canvas.padding.top },
  })
  if (!accepted) pendingNodes.delete(node.id)
  return accepted
}

/** Drop from a palette drag: commit the incoming preview, or place at the pointer. */
export function addAtPointer(target: CanvasEntry, pending: NewNode, local: GridPoint): boolean {
  pendingNodes.set(pending.node.id, pending.node)
  const committed = target.gesture.commitIncoming()
  if (committed) return true
  const accepted = target.actions.place(pending.item, { pointer: local })
  if (!accepted) pendingNodes.delete(pending.node.id)
  return accepted
}
