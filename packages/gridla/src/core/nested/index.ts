/**
 * Nested layouts. A tree of nodes where any node may carry a layout for its
 * children is flattened into a single list of items positioned in root
 * coordinates. Containment and reflow stay a math problem: each container's
 * layout is projected into the rectangle its parent assigned it.
 */

import { canvasInnerHeight, canvasInnerWidth, normalizeCanvas, pointInRect } from '../geometry'
import {
  isFixedHeight,
  type GridCanvas,
  type GridItem,
  type GridLayout,
  type GridPadding,
  type GridPoint,
  type GridRect,
  type GridSize,
} from '../model'
import { projectItemsByChain } from '../projection/chain'

// ---------------------------------------------------------------------------
// Node model and adapter
// ---------------------------------------------------------------------------

/**
 * Per-node flags that control how a node takes part in nesting: whether it is a
 * container, accepts drops, confines its children, is locked, or keeps its
 * height during compaction. Every flag is optional.
 */
export type GridNodeBehavior = {
  /** Treat the node as a container even without children. Defaults to `layout !== undefined`. */
  container?: boolean
  /** Whether items may be dropped into this node. Defaults to `container`. */
  acceptsChildren?: boolean
  /** Direct children cannot leave, and outside items cannot enter. */
  contained?: boolean
  /** The subtree is a wall: nothing inside moves, nothing outside enters. */
  locked?: boolean
  /** Keeps its height during compaction (content scrolls instead). */
  scrollable?: boolean
}

/** Normalized tree node. Use `GridTreeAdapter` to flatten other shapes directly. */
export type GridNode<TData = unknown> = {
  id: string
  /** Layout of this node's children. Present on containers. */
  layout?: GridLayout
  children?: GridNode<TData>[]
  /** Gap between children in pixels. Kept fixed during projection. */
  gap?: number
  /** Rendering padding for children. Overrides `layout.canvas.padding`. */
  padding?: Partial<GridPadding>
  behavior?: GridNodeBehavior
  data?: TData
}

/** Callbacks that let `flattenLayout` read any tree shape without conversion. */
export type GridTreeAdapter<TNode> = {
  getId(node: TNode): string
  getChildren(node: TNode): readonly TNode[]
  getLayout(node: TNode): GridLayout | null | undefined
  getBehavior?(node: TNode): GridNodeBehavior | undefined
  getGap?(node: TNode): number | undefined
  getPadding?(node: TNode): Partial<GridPadding> | undefined
}

/**
 * The `GridTreeAdapter` for plain `GridNode` trees. `flattenLayout` uses it
 * when no adapter is given.
 */
export const gridNodeAdapter: GridTreeAdapter<GridNode> = {
  getId: (node) => node.id,
  getChildren: (node) => node.children ?? [],
  getLayout: (node) => node.layout,
  getBehavior: (node) => node.behavior,
  getGap: (node) => node.gap,
  getPadding: (node) => node.padding,
}

type ResolvedAdapter<TNode> = Required<GridTreeAdapter<TNode>>

function resolveAdapter<TNode>(adapter: GridTreeAdapter<TNode>): ResolvedAdapter<TNode> {
  return {
    getId: (node) => adapter.getId(node),
    getChildren: (node) => adapter.getChildren(node),
    getLayout: (node) => adapter.getLayout(node),
    getBehavior: (node) => adapter.getBehavior?.(node),
    getGap: (node) => adapter.getGap?.(node),
    getPadding: (node) => adapter.getPadding?.(node),
  }
}

// ---------------------------------------------------------------------------
// Flat layout
// ---------------------------------------------------------------------------

/**
 * One node of a flattened tree: its rectangle in root coordinates, its place in
 * the hierarchy, its rendered and authored layouts, and its resolved behavior flags.
 */
export type FlatItem<TNode = GridNode> = {
  id: string
  /** Id of the enclosing container, or `null` for the root. */
  parentId: string | null
  /** 0 for the root, 1 for its children, and so on. */
  depth: number
  /** Rectangle in root coordinates. */
  rect: GridRect
  /** The node's item entry in its parent's authored layout. `null` for the root. */
  canonicalRect: GridRect | null
  /** The node's item entry in its parent's rendered layout. `null` for the root. */
  sizing: GridItem | null
  /**
   * For containers: the authored layout projected into `rect`. Solvers and
   * hit testing for children operate in this coordinate system.
   */
  layout: GridLayout | null
  /** The authored layout, untouched. `null` for leaves. */
  sourceLayout: GridLayout | null
  /** Gap used when projecting and solving this container's children. */
  gap: number
  node: TNode
  isContainer: boolean
  acceptsChildren: boolean
  locked: boolean
  contained: boolean
  scrollable: boolean
}

/**
 * Result of `flattenLayout`: every node in paint order (each parent before its
 * children) plus lookups by id and by parent id. The root's parent id is `null`.
 */
export type FlatLayout<TNode = GridNode> = {
  rootId: string
  items: readonly FlatItem<TNode>[]
  itemsById: ReadonlyMap<string, FlatItem<TNode>>
  childrenByParentId: ReadonlyMap<string | null, readonly string[]>
}

/** Options for `flattenLayout`. */
export type FlattenOptions<TNode> = {
  /** Reads your own tree shape. Defaults to the `GridNode` adapter. */
  adapter?: GridTreeAdapter<TNode>
}

/**
 * Project a container's authored layout into the rectangle it renders in.
 * Returns a layout whose canvas matches `rect` (with the node's padding) and
 * whose items are in that canvas's coordinates.
 */
export function renderLayoutForRect(
  layout: GridLayout,
  rect: GridSize,
  padding: Partial<GridPadding> | undefined,
  gap: number,
): GridLayout {
  const targetCanvas = normalizeCanvas(
    {
      heightMode: layout.canvas.heightMode,
      padding: padding ? { ...layout.canvas.padding, ...padding } : layout.canvas.padding,
      width: Math.max(1, Math.round(rect.w)),
      height: Math.max(1, Math.round(rect.h)),
    },
    layout.canvas,
  )
  return {
    canvas: targetCanvas,
    items: projectItemsByChain(layout.items, layout.canvas, targetCanvas, gap),
  }
}

/**
 * Flatten a tree of nested layouts into root-relative rectangles. Every
 * container's children are projected into the container's rendered rect.
 */
export function flattenLayout<TNode = GridNode>(
  root: TNode,
  rootRect: GridRect,
  options: FlattenOptions<TNode> = {},
): FlatLayout<TNode> {
  const adapter = resolveAdapter(
    (options.adapter ??
      (gridNodeAdapter as unknown as GridTreeAdapter<TNode>)) as GridTreeAdapter<TNode>,
  )
  const items: FlatItem<TNode>[] = []

  const describe = (
    node: TNode,
    rect: GridRect,
    parentId: string | null,
    depth: number,
    canonicalRect: GridRect | null,
    sizing: GridItem | null,
  ): FlatItem<TNode> => {
    const sourceLayout = adapter.getLayout(node) ?? null
    const behavior = adapter.getBehavior(node) ?? {}
    const gap = Math.max(0, adapter.getGap(node) ?? 0)
    const isContainer = behavior.container ?? sourceLayout !== null
    const acceptsChildren = behavior.acceptsChildren ?? isContainer
    // A drop target without an authored layout still needs a canvas to solve
    // against, so synthesize an empty one sized to its rect.
    const layout = sourceLayout
      ? renderLayoutForRect(sourceLayout, rect, adapter.getPadding(node), gap)
      : acceptsChildren
        ? renderLayoutForRect(
            {
              canvas: {
                width: Math.max(1, rect.w),
                height: Math.max(1, rect.h),
                padding: { top: 0, right: 0, bottom: 0, left: 0 },
                heightMode: 'bounded',
              },
              items: [],
            },
            rect,
            adapter.getPadding(node),
            gap,
          )
        : null
    return {
      id: adapter.getId(node),
      parentId,
      depth,
      rect,
      canonicalRect,
      sizing,
      layout,
      sourceLayout,
      gap,
      node,
      isContainer,
      acceptsChildren,
      locked: behavior.locked === true,
      contained: behavior.contained === true,
      scrollable: behavior.scrollable === true,
    }
  }

  const walk = (parent: FlatItem<TNode>, depth: number) => {
    if (!parent.layout) return
    const children = adapter.getChildren(parent.node)
    if (children.length === 0) return
    const projectedById = new Map(parent.layout.items.map((item) => [item.id, item]))
    const canonicalById = new Map((parent.sourceLayout?.items ?? []).map((item) => [item.id, item]))
    for (const child of children) {
      const childId = adapter.getId(child)
      const projected = projectedById.get(childId)
      if (!projected) continue
      const canonical = canonicalById.get(childId) ?? projected
      const childRect: GridRect = {
        x: parent.rect.x + projected.x,
        y: parent.rect.y + projected.y,
        w: projected.w,
        h: projected.h,
      }
      const flat = describe(
        child,
        childRect,
        parent.id,
        depth,
        { x: canonical.x, y: canonical.y, w: canonical.w, h: canonical.h },
        projected,
      )
      items.push(flat)
      if (flat.isContainer) walk(flat, depth + 1)
    }
  }

  const rootItem = describe(root, rootRect, null, 0, null, null)
  items.push(rootItem)
  if (rootItem.isContainer) walk(rootItem, 1)

  const itemsById = new Map<string, FlatItem<TNode>>()
  const childrenByParentId = new Map<string | null, string[]>()
  for (const item of items) {
    itemsById.set(item.id, item)
    const list = childrenByParentId.get(item.parentId) ?? []
    list.push(item.id)
    childrenByParentId.set(item.parentId, list)
  }
  return { rootId: rootItem.id, items, itemsById, childrenByParentId }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Deepest item whose rect contains the point (last in paint order wins). */
export function hitTest<TNode>(
  layout: FlatLayout<TNode>,
  point: GridPoint,
): FlatItem<TNode> | null {
  for (let index = layout.items.length - 1; index >= 0; index -= 1) {
    const item = layout.items[index]
    if (item && pointInRect(point, item.rect)) return item
  }
  return null
}

/** Options for `findContainerAt`. */
export type FindContainerOptions = {
  /**
   * Containers other than `sourceId` must contain the point at least this
   * far inside their edges. Keeps edge brushes from switching targets.
   */
  inset?: number
  /** Container the interaction started in; it wins without any inset. */
  sourceId?: string
}

/** Deepest container that accepts children and contains the point. */
export function findContainerAt<TNode>(
  layout: FlatLayout<TNode>,
  point: GridPoint,
  options: FindContainerOptions = {},
): FlatItem<TNode> | null {
  const inset = Math.max(0, options.inset ?? 0)
  for (let index = layout.items.length - 1; index >= 0; index -= 1) {
    const item = layout.items[index]
    if (!item || !item.acceptsChildren) continue
    if (inset === 0 || item.id === options.sourceId) {
      if (pointInRect(point, item.rect)) return item
      continue
    }
    const r = item.rect
    const effectiveInset = Math.min(inset, Math.max(0, (r.w - 1) / 2), Math.max(0, (r.h - 1) / 2))
    if (
      point.x >= r.x + effectiveInset &&
      point.x <= r.x + r.w - effectiveInset &&
      point.y >= r.y + effectiveInset &&
      point.y <= r.y + r.h - effectiveInset
    ) {
      return item
    }
  }
  return null
}

/** Ancestors of an item from parent to root. */
export function getAncestors<TNode>(layout: FlatLayout<TNode>, itemId: string): FlatItem<TNode>[] {
  const result: FlatItem<TNode>[] = []
  let cursor = layout.itemsById.get(itemId)
  while (cursor?.parentId) {
    const parent = layout.itemsById.get(cursor.parentId)
    if (!parent) break
    result.push(parent)
    cursor = parent
  }
  return result
}

/** All descendants of an item in paint order. */
export function getDescendants<TNode>(
  layout: FlatLayout<TNode>,
  itemId: string,
): FlatItem<TNode>[] {
  const result: FlatItem<TNode>[] = []
  const queue: string[] = [itemId]
  while (queue.length > 0) {
    const next = queue.shift()
    if (next === undefined) break
    for (const childId of layout.childrenByParentId.get(next) ?? []) {
      const child = layout.itemsById.get(childId)
      if (!child) continue
      result.push(child)
      queue.push(childId)
    }
  }
  return result
}

/** True when the item or any ancestor is locked. */
export function isInsideLockedSubtree<TNode>(layout: FlatLayout<TNode>, itemId: string): boolean {
  let cursor = layout.itemsById.get(itemId)
  while (cursor) {
    if (cursor.locked) return true
    cursor = cursor.parentId ? layout.itemsById.get(cursor.parentId) : undefined
  }
  return false
}

/** Nearest ancestor (or the item itself) that is outside every locked subtree. */
export function findFirstUnlockedAncestor<TNode>(
  layout: FlatLayout<TNode>,
  itemId: string,
): FlatItem<TNode> | undefined {
  let cursor = layout.itemsById.get(itemId)
  while (cursor) {
    if (!isInsideLockedSubtree(layout, cursor.id)) return cursor
    cursor = cursor.parentId ? layout.itemsById.get(cursor.parentId) : undefined
  }
  return undefined
}

/** True when the item's direct parent is a contained container. */
export function isDirectChildOfContained<TNode>(
  layout: FlatLayout<TNode>,
  itemId: string,
): boolean {
  const item = layout.itemsById.get(itemId)
  if (!item?.parentId) return false
  return layout.itemsById.get(item.parentId)?.contained === true
}

/**
 * Mark items whose node is locked as `policy.movement: 'locked'` so solvers
 * treat them as walls. Returns the input when nothing changes.
 */
export function markLockedItems<TNode>(
  items: readonly GridItem[],
  layout: FlatLayout<TNode>,
): readonly GridItem[] {
  let changed = false
  const next = items.map((item) => {
    const flat = layout.itemsById.get(item.id)
    if (!flat?.locked || item.policy?.movement === 'locked') return item
    changed = true
    return { ...item, policy: { ...item.policy, movement: 'locked' as const } }
  })
  return changed ? next : items
}

// ---------------------------------------------------------------------------
// Coordinate conversion
// ---------------------------------------------------------------------------

/**
 * Project items expressed in a container's rendered canvas into root
 * coordinates using the same pipeline `flattenLayout` uses. Pass a full
 * solver result so gap preservation sees every neighbor.
 */
export function projectItemsToRoot<TNode>(
  container: FlatItem<TNode>,
  items: readonly GridItem[],
): Map<string, GridRect> {
  const rects = new Map<string, GridRect>()
  if (!container.layout) {
    for (const item of items) rects.set(item.id, { x: item.x, y: item.y, w: item.w, h: item.h })
    return rects
  }
  const sourceCanvas = container.layout.canvas
  const targetCanvas = normalizeCanvas(
    {
      heightMode: sourceCanvas.heightMode,
      padding: sourceCanvas.padding,
      width: container.rect.w,
      height: container.rect.h,
    },
    sourceCanvas,
  )
  const projected = projectItemsByChain(items, sourceCanvas, targetCanvas, container.gap)
  for (const item of projected) {
    rects.set(item.id, {
      x: container.rect.x + item.x,
      y: container.rect.y + item.y,
      w: item.w,
      h: item.h,
    })
  }
  return rects
}

/** Root coordinates of one item after projecting `contextItems`. */
export function projectItemToRoot<TNode>(
  container: FlatItem<TNode>,
  item: GridItem,
  contextItems: readonly GridItem[],
): GridRect {
  const items = contextItems.some((entry) => entry.id === item.id)
    ? contextItems
    : [...contextItems, item]
  return (
    projectItemsToRoot(container, items).get(item.id) ?? {
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
    }
  )
}

/**
 * Convert a root-relative point into a container's rendered canvas
 * coordinates. Returns `null` for leaves.
 */
export function rootPointToContainer<TNode>(
  container: FlatItem<TNode>,
  point: GridPoint,
  canvas: GridCanvas | null = container.layout?.canvas ?? null,
): GridPoint | null {
  if (!container.layout || !canvas) return null
  const inner = container.rect
  if (inner.w <= 0 || inner.h <= 0) return null
  const targetPadding = container.layout.canvas.padding
  const sourceInnerW = canvasInnerWidth(canvas)
  const sourceInnerH = canvasInnerHeight(canvas)
  const targetInnerW = Math.max(1, inner.w - targetPadding.left - targetPadding.right)
  const targetInnerH = Math.max(1, inner.h - targetPadding.top - targetPadding.bottom)
  const ratioX = sourceInnerW / targetInnerW
  const ratioY = sourceInnerH / targetInnerH
  return {
    x: canvas.padding.left + (point.x - inner.x - targetPadding.left) * ratioX,
    y: canvas.padding.top + (point.y - inner.y - targetPadding.top) * ratioY,
  }
}

/**
 * Translate a size authored in `source`'s canvas units to `target`'s so it
 * covers the same number of root pixels.
 */
export function scaleSizeBetweenContainers<TNode>(
  source: FlatItem<TNode>,
  target: FlatItem<TNode>,
  size: GridSize,
): GridSize {
  if (!source.layout || !target.layout) return { ...size }
  const srcInner = source.rect
  const dstInner = target.rect
  if (srcInner.w <= 0 || srcInner.h <= 0 || dstInner.w <= 0 || dstInner.h <= 0) return { ...size }
  const srcPxPerUnitX = srcInner.w / canvasInnerWidth(source.layout.canvas)
  const srcPxPerUnitY = srcInner.h / canvasInnerHeight(source.layout.canvas)
  const dstPxPerUnitX = dstInner.w / canvasInnerWidth(target.layout.canvas)
  const dstPxPerUnitY = dstInner.h / canvasInnerHeight(target.layout.canvas)
  return {
    w: (size.w * srcPxPerUnitX) / dstPxPerUnitX,
    h: (size.h * srcPxPerUnitY) / dstPxPerUnitY,
  }
}

/**
 * Build the layout to persist after a solve inside `container`: the canvas
 * is rebased to the container's rendered size and the items are projected
 * into it. Subsequent renders at the same size are then identity.
 */
export function toRenderedLayout<TNode>(
  container: FlatItem<TNode>,
  items: readonly GridItem[],
): GridLayout {
  if (!container.layout) {
    return {
      canvas: {
        heightMode: 'bounded',
        height: container.rect.h,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        width: container.rect.w,
      },
      items: items.map((item) => ({ ...item })),
    }
  }
  const sourceCanvas = container.layout.canvas
  const targetCanvas: GridCanvas = {
    ...sourceCanvas,
    width: Math.max(1, Math.round(container.rect.w)),
    height: Math.max(1, Math.round(container.rect.h)),
  }
  return {
    canvas: targetCanvas,
    items: projectItemsByChain(items, sourceCanvas, targetCanvas, container.gap),
  }
}

// ---------------------------------------------------------------------------
// Compaction
// ---------------------------------------------------------------------------

/** Options for `compactLayout`. */
export type CompactOptions = {
  /** Items that keep their height. Fixed-height items always do. */
  isRigid?: (item: GridItem) => boolean
}

/** Result of `compactLayout`: the compacted layout and whether everything fit. */
export type CompactResult<T = unknown> = {
  layout: GridLayout<T>
  /** `false` when rigid heights, minimums, and gaps exceed the canvas. */
  fits: boolean
}

/**
 * Shrink items vertically until the layout fits a bounded canvas. Authored
 * gaps between rows are preserved, flexible items shrink proportionally down
 * to `minH`, rigid items keep their height. Horizontal geometry is untouched.
 */
export function compactLayout<T>(
  layout: GridLayout<T>,
  options: CompactOptions = {},
): CompactResult<T> {
  const { canvas } = layout
  const minTop = canvas.padding.top
  const maxBottom = canvas.height - canvas.padding.bottom
  const available = maxBottom - minTop
  const next = layout.items.map((item) => ({ ...item }))
  const result = (fits: boolean): CompactResult<T> => ({ layout: { canvas, items: next }, fits })
  if (available <= 0 || next.length === 0) return result(true)
  const extent = next.reduce((acc, item) => Math.max(acc, item.y + item.h - minTop), 0)
  if (extent <= available) return result(true)

  const isRigid = (item: GridItem<T>): boolean =>
    isFixedHeight(item) || options.isRigid?.(item) === true
  const minHeightOf = (item: GridItem<T>): number => item.minH ?? 0

  const sorted = next.map((item, index) => ({ item, index })).sort((a, b) => a.item.y - b.item.y)
  const leadingGap = Math.max(0, sorted[0].item.y - minTop)
  const gapsBefore: number[] = [leadingGap]
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1].item
    const curr = sorted[i].item
    gapsBefore.push(Math.max(0, curr.y - (prev.y + prev.h)))
  }

  let rigidSum = 0
  let flexSum = 0
  let flexMinSum = 0
  const flexItems: GridItem<T>[] = []
  for (const { item } of sorted) {
    if (isRigid(item)) {
      rigidSum += item.h
    } else {
      flexItems.push(item)
      flexSum += item.h
      flexMinSum += minHeightOf(item)
    }
  }
  const gapSum = gapsBefore.reduce((acc, gap) => acc + gap, 0)
  if (rigidSum + flexMinSum + gapSum > available) return result(false)

  const flexBudget = Math.max(0, available - rigidSum - gapSum)
  if (flexSum > 0 && flexBudget > 0) {
    const locked = new Map<string, number>()
    let remainingFlexSum = flexSum
    let remainingBudget = flexBudget
    let safety = flexItems.length + 4
    while (safety > 0) {
      safety -= 1
      let didLock = false
      for (const item of flexItems) {
        if (locked.has(item.id)) continue
        const share = (item.h / remainingFlexSum) * remainingBudget
        const min = minHeightOf(item)
        if (share < min) {
          locked.set(item.id, min)
          remainingFlexSum -= item.h
          remainingBudget -= min
          didLock = true
        }
      }
      if (!didLock) break
    }
    for (const item of flexItems) {
      const lockedH = locked.get(item.id)
      if (lockedH !== undefined) item.h = lockedH
      else if (remainingFlexSum > 0)
        item.h = Math.round((item.h / remainingFlexSum) * remainingBudget)
    }
  }

  let cursor = minTop
  for (let i = 0; i < sorted.length; i += 1) {
    const { item } = sorted[i]
    cursor += gapsBefore[i]
    item.y = Math.round(cursor)
    cursor += item.h
  }
  const finalExtent = next.reduce((acc, item) => Math.max(acc, item.y + item.h - minTop), 0)
  return result(finalExtent <= available + 1)
}
