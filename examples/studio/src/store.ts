/**
 * Studio state: the document, an undo/redo history of document snapshots, and
 * the selection. A plain reducer; providers dispatch `layout-changed` after
 * every accepted gesture and the reducer reconciles the tree.
 */

import { createContext, useContext, type Dispatch } from 'react'

import {
  applyPreset,
  isLocked,
  placeItem,
  type GridItem,
  type GridLayout,
  type GridPadding,
  type LayoutPreset,
} from 'gridla'
import type { GridChangeDetail } from 'gridla/react'

import {
  cloneSubtree,
  findNode,
  insertNode,
  isAncestorOrSelf,
  removeNodes,
  setGroupLayout,
  updateNode,
  type StudioDocument,
  type StudioNode,
} from './document'
import type { NodeProps } from './registry'

export type StudioState = {
  doc: StudioDocument
  past: StudioDocument[]
  future: StudioDocument[]
  /** Selected node ids, most recent last. */
  selection: string[]
  /** Last history entry key and time, used to coalesce rapid edits. */
  lastEntry: { key: string; at: number } | null
}

export type GroupPatch = {
  gap?: number
  padding?: Partial<GridPadding>
  height?: number
  heightMode?: GridLayout['canvas']['heightMode']
}

export type StudioAction =
  | {
      type: 'layout-changed'
      groupId: string
      layout: GridLayout
      detail: GridChangeDetail
      /** The node being added when `detail.reason` is `place`. */
      node?: StudioNode
    }
  | { type: 'replace-document'; doc: StudioDocument; history?: boolean }
  | { type: 'update-props'; id: string; props: NodeProps }
  | { type: 'update-group'; id: string; patch: GroupPatch }
  | { type: 'update-item'; id: string; patch: Partial<GridItem> }
  | { type: 'remove'; ids: readonly string[] }
  | { type: 'duplicate'; ids: readonly string[] }
  | { type: 'toggle-lock'; ids: readonly string[] }
  | { type: 'toggle-hidden'; ids: readonly string[] }
  | { type: 'apply-preset'; groupId: string; preset: LayoutPreset; columns?: number }
  | { type: 'select'; ids: readonly string[] }
  | { type: 'toggle-select'; id: string }
  | { type: 'undo' }
  | { type: 'redo' }

const HISTORY_LIMIT = 100
const COALESCE_MS = 600

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function commit(
  state: StudioState,
  root: StudioNode,
  key: string | null,
  selection = state.selection,
): StudioState {
  if (root === state.doc.root)
    return selection === state.selection ? state : { ...state, selection }
  const now = Date.now()
  const coalesce =
    key !== null && state.lastEntry?.key === key && now - state.lastEntry.at < COALESCE_MS
  const past = coalesce ? state.past : [...state.past, state.doc].slice(-HISTORY_LIMIT)
  return {
    doc: { ...state.doc, root },
    past,
    future: [],
    selection,
    lastEntry: key === null ? null : { key, at: now },
  }
}

/** Map over the items of the group that owns `id`. No-op when the id has no parent. */
function patchParentItems(
  root: StudioNode,
  id: string,
  map: (item: GridItem) => GridItem,
): StudioNode {
  const path = findNode(root, id)
  const parent = path?.parent
  if (!parent?.layout) return root
  return setGroupLayout(root, parent.id, {
    ...parent.layout,
    items: parent.layout.items.map((item) => (item.id === id ? map(item) : item)),
  })
}

function existingIds(root: StudioNode, ids: readonly string[]): string[] {
  return ids.filter((id) => findNode(root, id) !== null)
}

function nodeOf(root: StudioNode, id: string): StudioNode | null {
  return findNode(root, id)?.node ?? null
}

/** Re-place hidden or unhidden items so the stored layout stays valid. */
function reinsertItem(layout: GridLayout, item: GridItem, gap: number): GridLayout {
  const others = { ...layout, items: layout.items.filter((entry) => entry.id !== item.id) }
  const result = placeItem({
    layout: others,
    item,
    position: { x: item.x, y: item.y },
    options: { gap, snap: false },
  })
  return result.accepted ? result.layout : { ...layout, items: [...others.items, item] }
}

function reconcileLayout(
  root: StudioNode,
  groupId: string,
  layout: GridLayout,
  incoming: StudioNode | undefined,
): StudioNode {
  const path = findNode(root, groupId)
  const group = path?.node
  if (!group?.layout) return root
  const children = group.children ?? []
  const hiddenItems = group.layout.items.filter(
    (item) => children.find((child) => child.id === item.id)?.hidden,
  )
  const visibleIds = new Set(layout.items.map((item) => item.id))
  let next = root
  let nextChildren = children
  const arrivals: StudioNode[] = []

  // Items that arrived: a new node from the palette, or a transfer from another group.
  for (const item of layout.items) {
    if (children.some((child) => child.id === item.id)) continue
    if (incoming && incoming.id === item.id) {
      arrivals.push(incoming)
      continue
    }
    const moved = findNode(next, item.id)
    if (!moved || !moved.parent) continue
    if (isAncestorOrSelf(next, item.id, groupId)) continue
    next = removeNodes(next, new Set([item.id]))
    arrivals.push(moved.node)
  }
  nextChildren = [...nextChildren, ...arrivals]

  // Items that left: removed, or transferred out (their new group already took the node).
  nextChildren = nextChildren.filter((child) => child.hidden || visibleIds.has(child.id))

  return updateNode(next, groupId, (entry) => ({
    ...entry,
    children: nextChildren,
    layout: { ...layout, items: [...layout.items, ...hiddenItems] },
  }))
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function studioReducer(state: StudioState, action: StudioAction): StudioState {
  const root = state.doc.root
  switch (action.type) {
    case 'layout-changed': {
      // DEBUG-TEMP
      console.warn('layout-changed', action.groupId, action.detail.reason, action.detail.itemId, action.layout.items.map((i) => i.id).join(','))
      const next = reconcileLayout(root, action.groupId, action.layout, action.node)
      console.warn('  -> changed', next !== root)
      const { reason, itemId } = action.detail
      const key =
        reason === 'move' || reason === 'update' || reason === 'transfer' || reason === 'resize'
          ? `${reason}:${itemId ?? ''}`
          : null
      const selection = action.node ? [action.node.id] : state.selection
      return commit(state, next, key, selection)
    }
    case 'replace-document': {
      if (action.history === false) {
        return { doc: action.doc, past: [], future: [], selection: [], lastEntry: null }
      }
      return {
        doc: action.doc,
        past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
        future: [],
        selection: [],
        lastEntry: null,
      }
    }
    case 'update-props': {
      const next = updateNode(root, action.id, (node) => ({
        ...node,
        props: { ...node.props, ...action.props },
      }))
      return commit(state, next, `props:${action.id}`)
    }
    case 'update-group': {
      const next = updateNode(root, action.id, (node) => {
        if (!node.layout) return node
        const canvas = node.layout.canvas
        return {
          ...node,
          ...(action.patch.gap !== undefined ? { gap: action.patch.gap } : {}),
          layout: {
            ...node.layout,
            canvas: {
              ...canvas,
              ...(action.patch.height !== undefined ? { height: action.patch.height } : {}),
              ...(action.patch.heightMode ? { heightMode: action.patch.heightMode } : {}),
              padding: { ...canvas.padding, ...action.patch.padding },
            },
          },
        }
      })
      return commit(state, next, `group:${action.id}`)
    }
    case 'update-item': {
      const next = patchParentItems(root, action.id, (item) => ({
        ...item,
        ...action.patch,
        id: item.id,
      }))
      return commit(state, next, `item:${action.id}`)
    }
    case 'remove': {
      const ids = new Set(existingIds(root, action.ids).filter((id) => id !== root.id))
      if (ids.size === 0) return state
      const next = removeNodes(root, ids)
      return commit(
        state,
        next,
        null,
        state.selection.filter((id) => !ids.has(id)),
      )
    }
    case 'duplicate': {
      let next = root
      const created: string[] = []
      for (const id of existingIds(root, action.ids)) {
        const path = findNode(next, id)
        if (!path?.parent?.layout || !path.item) continue
        const copy = cloneSubtree(path.node)
        const parent = findNode(next, path.parent.id)?.node
        if (!parent?.layout) continue
        const result = placeItem({
          layout: parent.layout,
          item: { ...path.item, id: copy.id, x: undefined, y: undefined },
          position: { x: path.item.x + 24, y: path.item.y + 24 },
          options: { gap: parent.gap ?? 0, snap: false },
        })
        if (!result.accepted) continue
        next = insertNode(next, parent.id, copy, result.item)
        next = setGroupLayout(next, parent.id, result.layout)
        created.push(copy.id)
      }
      if (created.length === 0) return state
      return commit(state, next, null, created)
    }
    case 'toggle-lock': {
      const ids = existingIds(root, action.ids).filter((id) => id !== root.id)
      if (ids.length === 0) return state
      const allLocked = ids.every((id) => {
        const item = findNode(root, id)?.item
        return item ? isLocked(item) : false
      })
      let next = root
      for (const id of ids) {
        next = patchParentItems(next, id, (item) => ({
          ...item,
          policy: { ...item.policy, movement: allLocked ? 'movable' : 'locked' },
        }))
      }
      return commit(state, next, null)
    }
    case 'toggle-hidden': {
      const ids = existingIds(root, action.ids).filter((id) => id !== root.id)
      if (ids.length === 0) return state
      const allHidden = ids.every((id) => nodeOf(root, id)?.hidden)
      let next = root
      for (const id of ids) {
        const path = findNode(next, id)
        if (!path?.parent?.layout || !path.item) continue
        const parent = path.parent
        next = updateNode(next, id, (node) => ({ ...node, hidden: !allHidden }))
        if (allHidden) {
          // Coming back: make sure the stored rect does not overlap what moved in meanwhile.
          const group = findNode(next, parent.id)?.node
          if (!group?.layout) continue
          next = setGroupLayout(
            next,
            parent.id,
            reinsertItem(group.layout, path.item, group.gap ?? 0),
          )
        }
      }
      return commit(state, next, null)
    }
    case 'apply-preset': {
      const group = nodeOf(root, action.groupId)
      if (!group?.layout) return state
      const children = group.children ?? []
      const visible = children.filter((child) => !child.hidden).map((child) => child.id)
      if (visible.length === 0) return state
      const hiddenItems = group.layout.items.filter((item) => !visible.includes(item.id))
      const arranged = applyPreset(group.layout, action.preset, visible, {
        gap: group.gap ?? 0,
        columns: action.columns,
      })
      const next = setGroupLayout(root, action.groupId, {
        ...arranged,
        items: [...arranged.items, ...hiddenItems],
      })
      return commit(state, next, null)
    }
    case 'select': {
      const ids = existingIds(root, action.ids)
      if (ids.length === state.selection.length && ids.every((id, i) => id === state.selection[i]))
        return state
      return { ...state, selection: ids }
    }
    case 'toggle-select': {
      if (!findNode(root, action.id)) return state
      const selection = state.selection.includes(action.id)
        ? state.selection.filter((id) => id !== action.id)
        : [...state.selection, action.id]
      return { ...state, selection }
    }
    case 'undo': {
      const previous = state.past[state.past.length - 1]
      if (!previous) return state
      return {
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future],
        selection: existingIds(previous.root, state.selection),
        lastEntry: null,
      }
    }
    case 'redo': {
      const [next, ...rest] = state.future
      if (!next) return state
      return {
        doc: next,
        past: [...state.past, state.doc],
        future: rest,
        selection: existingIds(next.root, state.selection),
        lastEntry: null,
      }
    }
    default:
      return state
  }
}

export function initialState(doc: StudioDocument): StudioState {
  return { doc, past: [], future: [], selection: [], lastEntry: null }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export type StudioContextValue = {
  state: StudioState
  dispatch: Dispatch<StudioAction>
}

export const StudioContext = createContext<StudioContextValue | null>(null)

export function useStudio(): StudioContextValue {
  const value = useContext(StudioContext)
  if (!value) throw new Error('useStudio must be used inside <StudioContext.Provider>')
  return value
}

/** Derived selection facts used by several panels. */
export function selectionInfo(state: StudioState) {
  const root = state.doc.root
  const primaryId = state.selection[state.selection.length - 1] ?? null
  const primary = primaryId ? findNode(root, primaryId) : null
  const activeGroupId = primary
    ? primary.node.layout
      ? primary.node.id
      : (primary.parent?.id ?? root.id)
    : root.id
  return { primaryId, primary, activeGroupId }
}
