import type { GridCanvas, GridLayout, GridNode, GridNodeBehavior, GridPadding } from 'gridla'

/** Caller-owned data attached to every fixture node. */
export type NodeData = { kind: string }

export type FixtureNode = GridNode<NodeData>

/** Spacing tokens used by the fixture trees, in pixels. */
export const SPACING = { none: 0, px: 1, sm: 6, md: 12, lg: 18 } as const

export type SpacingToken = keyof typeof SPACING

export function spacing(value: SpacingToken | number | undefined): number | undefined {
  if (value === undefined) return undefined
  return typeof value === 'number' ? value : SPACING[value]
}

/** A bounded canvas with uniform padding. */
export function boundedCanvas(width: number, height: number, padding: number): GridCanvas {
  return {
    height,
    heightMode: 'bounded',
    padding: { bottom: padding, left: padding, right: padding, top: padding },
    width,
  }
}

export type NodeInput = {
  id: string
  /** Neutral node kind: `group`, `tabs`, `text`, `stat`, `chart`, `table`, `control`, `card`. */
  kind: string
  layout?: GridLayout
  children?: FixtureNode[]
  /** Render order of children. Listed ids first, then the rest in source order. */
  order?: string[]
  gap?: SpacingToken | number
  padding?: SpacingToken | Partial<Record<keyof GridPadding, SpacingToken>>
  locked?: boolean
  contained?: boolean
  scrollable?: boolean
}

function resolvePadding(value: NodeInput['padding']): Partial<GridPadding> | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'string') {
    const px = SPACING[value]
    return { top: px, right: px, bottom: px, left: px }
  }
  const out: Partial<GridPadding> = {}
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const token = value[side]
    if (token !== undefined) out[side] = SPACING[token]
  }
  return out
}

function orderChildren(children: FixtureNode[], order: string[] | undefined): FixtureNode[] {
  if (!order || order.length === 0) return children
  const byId = new Map(children.map((child) => [child.id, child]))
  const ordered: FixtureNode[] = []
  for (const id of order) {
    const child = byId.get(id)
    if (child) {
      ordered.push(child)
      byId.delete(id)
    }
  }
  for (const child of children) if (byId.has(child.id)) ordered.push(child)
  return ordered
}

/**
 * Build a fixture node. `group` nodes are containers (their layout is
 * flattened). `tabs` nodes are not containers but accept children and
 * default to `contained`. Everything else is a leaf.
 */
export function node(input: NodeInput): FixtureNode {
  const isTabs = input.kind === 'tabs'
  const behavior: GridNodeBehavior = {}
  if (isTabs) {
    behavior.container = false
    behavior.acceptsChildren = true
    behavior.contained = input.contained ?? true
  } else if (input.contained !== undefined) {
    behavior.contained = input.contained
  }
  if (input.locked !== undefined) behavior.locked = input.locked
  if (input.scrollable !== undefined) behavior.scrollable = input.scrollable

  const out: FixtureNode = { id: input.id, data: { kind: input.kind } }
  if (input.layout) out.layout = input.layout
  if (input.children) out.children = orderChildren(input.children, input.order)
  const gap = spacing(input.gap)
  if (gap !== undefined) out.gap = gap
  const padding = resolvePadding(input.padding)
  if (padding) out.padding = padding
  if (Object.keys(behavior).length > 0) out.behavior = behavior
  return out
}

/** A leaf node with no layout. */
export function leaf(id: string, kind = 'text'): FixtureNode {
  return node({ id, kind })
}
