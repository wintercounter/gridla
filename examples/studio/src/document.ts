/**
 * Studio document model.
 *
 * A document is a tree of nodes. Every node has a `kind` from the component
 * registry and `props` for that kind. Group nodes (and the root) additionally
 * carry a `layout`: a Gridla `GridLayout` whose item ids are the ids of the
 * group's `children`. Geometry therefore lives in the parent's layout while
 * content lives on the child node. JSON is only used to serialize this tree.
 */

import type { GridCanvas, GridItem, GridLayout, GridPadding } from 'gridla'

import { KINDS, isKind, type NodeKind, type NodeProps } from './registry'

export type StudioNode = {
  id: string
  kind: NodeKind
  props: NodeProps
  /** Present on groups: the layout of `children`. */
  layout?: GridLayout
  children?: StudioNode[]
  /** Gap between children (groups only). */
  gap?: number
  /**
   * Scrollable groups grow to fit their content; this is the floor. The
   * stored `layout.canvas.height` is always the settled value.
   */
  minHeight?: number
  /** Hidden nodes stay in the document but leave the solver and the canvas. */
  hidden?: boolean
}

export type StudioDocument = {
  format: 'gridla-studio'
  version: 1
  name: string
  root: StudioNode
}

export const DOCUMENT_FORMAT = 'gridla-studio'
export const DOCUMENT_VERSION = 1

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

let counter = 0

export function nextId(prefix: string): string {
  counter += 1
  const stamp = Date.now().toString(36).slice(-4)
  return `${prefix}-${stamp}${counter.toString(36)}`
}

// ---------------------------------------------------------------------------
// Construction helpers
// ---------------------------------------------------------------------------

export function padding(all: number): GridPadding {
  return { top: all, right: all, bottom: all, left: all }
}

export function canvas(
  width: number,
  height: number,
  inset = 16,
  heightMode: GridCanvas['heightMode'] = 'bounded',
): GridCanvas {
  return { width, height, padding: padding(inset), heightMode }
}

export function isGroup(node: StudioNode): boolean {
  return node.kind === 'group' || node.layout !== undefined
}

/**
 * Keep a scrollable canvas exactly as tall as its content (or its floor).
 * The provider re-projects the layout onto the measured element size; if the
 * element is taller than the stored canvas, heights scale up, the canvas
 * grows to fit, and the cycle repeats. Settling the height here keeps the
 * measured size equal to the stored size so no vertical rescale happens.
 */
export function settleHeights(root: StudioNode): StudioNode {
  const layout = root.layout
  let next = root
  if (layout && layout.canvas.heightMode === 'scrollable') {
    const bottom = layout.items.reduce((max, item) => Math.max(max, item.y + item.h), 0)
    const height = Math.max(root.minHeight ?? 0, Math.round(bottom + layout.canvas.padding.bottom))
    if (height !== layout.canvas.height) {
      next = { ...root, layout: { ...layout, canvas: { ...layout.canvas, height } } }
    }
  }
  const children = next.children
  if (!children) return next
  let changed = false
  const settled = children.map((child) => {
    const updated = settleHeights(child)
    if (updated !== child) changed = true
    return updated
  })
  return changed ? { ...next, children: settled } : next
}

export function emptyGroupLayout(width = 600, height = 320): GridLayout {
  return { canvas: canvas(width, height, 12), items: [] }
}

export function createDocument(name = 'Untitled layout', width = 1200): StudioDocument {
  return {
    format: DOCUMENT_FORMAT,
    version: DOCUMENT_VERSION,
    name,
    root: {
      id: 'root',
      kind: 'group',
      props: { title: 'Page', tone: 'plain' },
      gap: 16,
      minHeight: 720,
      layout: { canvas: canvas(width, 720, 24, 'scrollable'), items: [] },
      children: [],
    },
  }
}

// ---------------------------------------------------------------------------
// Tree queries
// ---------------------------------------------------------------------------

export type NodePath = { node: StudioNode; parent: StudioNode | null; item: GridItem | null }

/** Walk the tree depth-first. Return `false` from the visitor to stop. */
export function walk(
  root: StudioNode,
  visit: (node: StudioNode, parent: StudioNode | null, depth: number) => void | false,
): void {
  const stack: Array<{ node: StudioNode; parent: StudioNode | null; depth: number }> = [
    { node: root, parent: null, depth: 0 },
  ]
  while (stack.length > 0) {
    const entry = stack.pop()
    if (!entry) break
    if (visit(entry.node, entry.parent, entry.depth) === false) return
    const children = entry.node.children ?? []
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: children[index], parent: entry.node, depth: entry.depth + 1 })
    }
  }
}

export function findNode(root: StudioNode, id: string): NodePath | null {
  let found: NodePath | null = null
  walk(root, (node, parent) => {
    if (node.id !== id) return
    found = {
      node,
      parent,
      item: parent?.layout?.items.find((entry) => entry.id === id) ?? null,
    }
    return false
  })
  return found
}

export function findParent(root: StudioNode, id: string): StudioNode | null {
  return findNode(root, id)?.parent ?? null
}

export function ancestorIds(root: StudioNode, id: string): string[] {
  const chain: string[] = []
  let current = findParent(root, id)
  while (current) {
    chain.push(current.id)
    current = findParent(root, current.id)
  }
  return chain
}

export function isAncestorOrSelf(root: StudioNode, maybeAncestorId: string, id: string): boolean {
  if (maybeAncestorId === id) return true
  return ancestorIds(root, id).includes(maybeAncestorId)
}

export function collectIds(node: StudioNode): string[] {
  const ids: string[] = []
  walk(node, (entry) => {
    ids.push(entry.id)
  })
  return ids
}

export function countNodes(node: StudioNode): number {
  return collectIds(node).length - 1
}

// ---------------------------------------------------------------------------
// Tree updates (structural sharing: only the path to the changed node is new)
// ---------------------------------------------------------------------------

export function updateNode(
  root: StudioNode,
  id: string,
  update: (node: StudioNode) => StudioNode,
): StudioNode {
  if (root.id === id) return update(root)
  const children = root.children
  if (!children) return root
  let changed = false
  const next = children.map((child) => {
    const updated = updateNode(child, id, update)
    if (updated !== child) changed = true
    return updated
  })
  return changed ? { ...root, children: next } : root
}

/** Replace a group's layout and keep `children` consistent with the item ids. */
export function setGroupLayout(root: StudioNode, groupId: string, layout: GridLayout): StudioNode {
  return updateNode(root, groupId, (group) => ({ ...group, layout }))
}

export function removeNodes(root: StudioNode, ids: ReadonlySet<string>): StudioNode {
  const children = root.children
  if (!children) return root
  const keep = children.filter((child) => !ids.has(child.id))
  let changed = keep.length !== children.length
  const next = keep.map((child) => {
    const updated = removeNodes(child, ids)
    if (updated !== child) changed = true
    return updated
  })
  if (!changed) return root
  const layout = root.layout
    ? { ...root.layout, items: root.layout.items.filter((item) => !ids.has(item.id)) }
    : undefined
  return { ...root, children: next, ...(layout ? { layout } : {}) }
}

/** Append a node to a group, with its layout item. */
export function insertNode(
  root: StudioNode,
  groupId: string,
  node: StudioNode,
  item: GridItem,
): StudioNode {
  return updateNode(root, groupId, (group) => {
    const layout = group.layout ?? emptyGroupLayout()
    return {
      ...group,
      children: [...(group.children ?? []), node],
      layout: {
        ...layout,
        items: [...layout.items.filter((entry) => entry.id !== item.id), { ...item, id: node.id }],
      },
    }
  })
}

/** Deep-copy a subtree with fresh ids (layout item ids are remapped too). */
export function cloneSubtree(node: StudioNode): StudioNode {
  const map = new Map<string, string>()
  walk(node, (entry) => {
    map.set(entry.id, nextId(entry.kind))
  })
  const rename = (entry: StudioNode): StudioNode => ({
    ...entry,
    id: map.get(entry.id) ?? entry.id,
    props: { ...entry.props },
    ...(entry.children ? { children: entry.children.map(rename) } : {}),
    ...(entry.layout
      ? {
          layout: {
            canvas: { ...entry.layout.canvas, padding: { ...entry.layout.canvas.padding } },
            items: entry.layout.items.map((item) => ({
              ...item,
              id: map.get(item.id) ?? item.id,
            })),
          },
        }
      : {}),
  })
  return rename(node)
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export function serializeDocument(doc: StudioDocument): string {
  return JSON.stringify(doc, null, 2)
}

export type ParseResult = { ok: true; doc: StudioDocument } | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validateLayout(value: unknown, path: string): string | null {
  if (!isRecord(value)) return `${path}: layout must be an object`
  const c = value.canvas
  if (!isRecord(c)) return `${path}.canvas: missing`
  if (!isFiniteNumber(c.width) || !isFiniteNumber(c.height))
    return `${path}.canvas: width and height must be numbers`
  if (c.heightMode !== 'bounded' && c.heightMode !== 'scrollable')
    return `${path}.canvas.heightMode: expected "bounded" or "scrollable"`
  if (!isRecord(c.padding)) return `${path}.canvas.padding: missing`
  for (const side of ['top', 'right', 'bottom', 'left']) {
    if (!isFiniteNumber(c.padding[side])) return `${path}.canvas.padding.${side}: must be a number`
  }
  if (!Array.isArray(value.items)) return `${path}.items: must be an array`
  for (const [index, item] of value.items.entries()) {
    if (!isRecord(item)) return `${path}.items[${index}]: must be an object`
    if (typeof item.id !== 'string') return `${path}.items[${index}].id: must be a string`
    for (const key of ['x', 'y', 'w', 'h']) {
      if (!isFiniteNumber(item[key])) return `${path}.items[${index}].${key}: must be a number`
    }
  }
  return null
}

function validateNode(value: unknown, path: string, seen: Set<string>): string | null {
  if (!isRecord(value)) return `${path}: node must be an object`
  if (typeof value.id !== 'string' || value.id.length === 0)
    return `${path}.id: must be a non-empty string`
  if (seen.has(value.id)) return `${path}.id: duplicate id "${value.id}"`
  seen.add(value.id)
  if (!isKind(value.kind))
    return `${path}.kind: "${String(value.kind)}" is not one of ${KINDS.map((k) => k.kind).join(', ')}`
  if (!isRecord(value.props)) return `${path}.props: must be an object`
  if (value.kind === 'group') {
    const layoutError = validateLayout(value.layout, `${path}.layout`)
    if (layoutError) return layoutError
    if (!Array.isArray(value.children)) return `${path}.children: must be an array`
    const layout = value.layout as GridLayout
    const childIds = new Set<string>()
    for (const [index, child] of value.children.entries()) {
      const error = validateNode(child, `${path}.children[${index}]`, seen)
      if (error) return error
      childIds.add((child as StudioNode).id)
    }
    for (const item of layout.items) {
      if (!childIds.has(item.id))
        return `${path}.layout: item "${item.id}" has no matching child node`
    }
    for (const id of childIds) {
      if (!layout.items.some((item) => item.id === id))
        return `${path}.layout: child "${id}" has no layout item`
    }
  }
  return null
}

/** Parse JSON text into a document, with a readable error on failure. */
export function parseDocument(text: string): ParseResult {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    return { ok: false, error: `Not valid JSON: ${(error as Error).message}` }
  }
  if (!isRecord(value)) return { ok: false, error: 'Expected a JSON object at the top level' }
  if (value.format !== DOCUMENT_FORMAT)
    return { ok: false, error: `Expected "format": "${DOCUMENT_FORMAT}"` }
  if (value.version !== DOCUMENT_VERSION)
    return { ok: false, error: `Unsupported document version ${String(value.version)}` }
  const error = validateNode(value.root, 'root', new Set())
  if (error) return { ok: false, error }
  const root = value.root as StudioNode
  if (root.kind !== 'group') return { ok: false, error: 'root must be a group' }
  return {
    ok: true,
    doc: {
      format: DOCUMENT_FORMAT,
      version: DOCUMENT_VERSION,
      name: typeof value.name === 'string' ? value.name : 'Imported layout',
      root,
    },
  }
}
