/**
 * One group rendered as a Gridla canvas. The root is a `GroupCanvas`; every
 * nested group is a `GridItem` in its parent that mounts its own provider and
 * canvas, so a group's children reflow whenever the group is resized. The
 * surrounding `GridTransferScope` (in App) lets items move between them.
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'

import {
  isLocked,
  type GridItem as GridItemModel,
  type GridLayout,
  type GridResizeEdge,
} from 'gridla'
import {
  GridCanvas,
  type GridChangeDetail,
  GridItem,
  GridPreviewOutline,
  GridProvider,
  useGridActions,
  useGridContext,
} from 'gridla/react'

import { addAtOpenSlot, pendingNodes } from '../add'
import { useCanvasRegistry } from '../canvas-registry'
import { findNode, isAncestorOrSelf, type StudioNode } from '../document'
import { perf, traceCallback } from '../instrumentation'
import { renderKind } from '../registry'
import { selectionInfo, useStudio } from '../store'

/** Modifier keys captured on pointer down so selection callbacks can read them. */
export const pointerModifiers = { shift: false }

const EDGES: readonly GridResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

function stop(event: { stopPropagation: () => void }) {
  event.stopPropagation()
}

// ---------------------------------------------------------------------------
// Registration with the studio-wide canvas registry
// ---------------------------------------------------------------------------

function Registrar({
  groupId,
  canvasRef,
  locked,
}: {
  groupId: string
  canvasRef: RefObject<HTMLDivElement | null>
  locked: boolean
}) {
  const registry = useCanvasRegistry()
  const context = useGridContext()
  const actions = useGridActions()
  const lockedRef = useRef(locked)
  useEffect(() => {
    lockedRef.current = locked
  })
  useEffect(
    () =>
      registry.register({
        groupId,
        getElement: () => canvasRef.current,
        actions,
        gesture: context.gesture,
        getLayout: () => context.store.getSnapshot().layout,
        subscribe: context.store.subscribe,
        accepts: () => !lockedRef.current,
      }),
    [registry, groupId, canvasRef, actions, context],
  )
  return null
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

const StudioItem = memo(function StudioItem({
  item,
  node,
  selected,
  multi,
}: {
  item: GridItemModel
  node: StudioNode
  selected: boolean
  multi: boolean
}) {
  perf.countRender(node.id)
  const locked = isLocked(item)
  const ghost = item.policy?.collision === 'ignore'
  const group = node.layout !== undefined

  return (
    <GridItem
      id={node.id}
      className="st-item"
      draggable={!locked && !group}
      data-kind={node.kind}
      data-locked={locked ? '' : undefined}
      data-ghost={ghost ? '' : undefined}
      data-studio-selected={selected ? '' : undefined}
      data-studio-multi={multi ? '' : undefined}
      aria-label={`${node.kind} ${String(node.props.title ?? node.props.text ?? node.props.label ?? '')}`}
    >
      {(view) => (
        <>
          {group ? (
            <GroupFrame
              node={node}
              item={item}
              locked={locked}
              dragHandleProps={view.dragHandleProps}
            />
          ) : (
            <div className="st-item-content">{renderKind(node.kind, node.props)}</div>
          )}
          {locked ? (
            <span className="st-item-badge" title="Locked">
              <LockGlyph />
            </span>
          ) : (
            EDGES.map((edge) => (
              <div
                key={edge}
                className="st-handle"
                data-edge={edge}
                {...view.getResizeHandleProps(edge)}
              />
            ))
          )}
        </>
      )}
    </GridItem>
  )
})

function LockGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  )
}

function GroupFrame({
  node,
  item,
  locked,
  dragHandleProps,
}: {
  node: StudioNode
  item: GridItemModel
  locked: boolean
  dragHandleProps: Record<string, string>
}) {
  const count = (node.children ?? []).filter((child) => !child.hidden).length
  return (
    <div className="st-group" data-tone={String(node.props.tone ?? 'plain')}>
      <div
        className="st-group-head"
        {...(locked ? {} : dragHandleProps)}
        title={locked ? 'Locked group' : 'Drag to move the group'}
      >
        <span className="st-group-title">{String(node.props.title ?? 'Group')}</span>
        <span className="st-group-meta">
          {count} {count === 1 ? 'item' : 'items'} · {Math.round(item.w)}×{Math.round(item.h)}
        </span>
      </div>
      <div
        className="st-group-body"
        role="presentation"
        onPointerDown={stop}
        onKeyDown={stop}
        onClick={stop}
      >
        <GroupCanvas groupId={node.id} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state for the root canvas
// ---------------------------------------------------------------------------

function EmptyRoot({ onTemplates }: { onTemplates: () => void }) {
  const registry = useCanvasRegistry()
  return (
    <div className="st-empty" role="note">
      <div className="st-empty-card">
        <p className="st-empty-title">Nothing on the page yet</p>
        <p className="st-empty-text">
          Drag a block from the palette onto this canvas, or click one to drop it at the first open
          spot. Groups are canvases of their own: put blocks inside and resize the group to reflow
          them.
        </p>
        <div className="st-empty-actions">
          <button
            type="button"
            className="st-button"
            data-variant="primary"
            onClick={() => {
              const entry = registry.get('root')
              if (entry) addAtOpenSlot(entry, 'heading')
            }}
          >
            Add a heading
          </button>
          <button type="button" className="st-button" onClick={onTemplates}>
            Start from a template
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Group canvas
// ---------------------------------------------------------------------------

export function GroupCanvas({
  groupId,
  root = false,
  onTemplates,
  style,
}: {
  groupId: string
  root?: boolean
  onTemplates?: () => void
  style?: CSSProperties
}) {
  const { state, dispatch } = useStudio()
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  })
  const path = useMemo(() => findNode(state.doc.root, groupId), [state.doc.root, groupId])
  const node = path?.node ?? null
  const groupLocked = path?.item ? isLocked(path.item) : false
  const canvasRef = useRef<HTMLDivElement | null>(null)

  const children = node?.children
  const layout = node?.layout
  const childById = useMemo(
    () => new Map((children ?? []).map((child) => [child.id, child])),
    [children],
  )
  const visibleLayout = useMemo<GridLayout>(() => {
    if (!layout)
      return {
        canvas: {
          width: 1,
          height: 1,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          heightMode: 'bounded',
        },
        items: [],
      }
    const hasHidden = layout.items.some((item) => childById.get(item.id)?.hidden)
    return hasHidden
      ? { ...layout, items: layout.items.filter((item) => !childById.get(item.id)?.hidden) }
      : layout
  }, [layout, childById])

  const { primaryId } = selectionInfo(state)
  const selectedHere = primaryId && childById.has(primaryId) ? primaryId : null
  const selectionSet = useMemo(() => new Set(state.selection), [state.selection])

  const onLayoutChange = useCallback(
    (next: GridLayout, detail: GridChangeDetail) => {
      const pending = detail.itemId ? pendingNodes.get(detail.itemId) : undefined
      if (pending) pendingNodes.delete(pending.id)
      dispatch({ type: 'layout-changed', groupId, layout: next, detail, node: pending })
    },
    [dispatch, groupId],
  )

  const onSelectedIdChange = useCallback(
    (id: string | null) => {
      if (!id) return
      if (pointerModifiers.shift) dispatch({ type: 'toggle-select', id })
      else if (!stateRef.current.selection.includes(id) || stateRef.current.selection.length > 1)
        dispatch({ type: 'select', ids: [id] })
    },
    [dispatch],
  )

  const acceptTransfers = useCallback(
    (item: GridItemModel) => {
      const doc = stateRef.current.doc.root
      const entry = findNode(doc, groupId)
      if (entry?.item && isLocked(entry.item)) return false
      return !isAncestorOrSelf(doc, item.id, groupId)
    },
    [groupId],
  )

  const onCanvasClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return
      dispatch({ type: 'select', ids: [groupId] })
    },
    [dispatch, groupId],
  )

  const onPointerDownCapture = useCallback((event: PointerEvent<HTMLDivElement>) => {
    pointerModifiers.shift = event.shiftKey
  }, [])

  const onDeleteKey = useCallback(() => {
    dispatch({ type: 'remove', ids: stateRef.current.selection })
  }, [dispatch])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' && event.target === event.currentTarget && root) {
        const first = stateRef.current.doc.root.children?.[0]
        if (first) dispatch({ type: 'select', ids: [first.id] })
      }
    },
    [dispatch, root],
  )

  if (!node || !layout) return null

  let content: ReactNode
  if (root && visibleLayout.items.length === 0 && onTemplates) {
    content = <EmptyRoot onTemplates={onTemplates} />
  } else {
    content = visibleLayout.items.map((item) => {
      const child = childById.get(item.id)
      if (!child) return null
      return (
        <StudioItem
          key={item.id}
          item={item}
          node={child}
          selected={selectionSet.has(item.id)}
          multi={selectionSet.size > 1 && selectionSet.has(item.id)}
        />
      )
    })
  }

  return (
    <GridProvider
      layout={visibleLayout}
      onLayoutChange={onLayoutChange}
      onCommit={(detail) => perf.commit(detail)}
      onTrace={traceCallback}
      gap={node.gap ?? 0}
      selectedId={selectedHere}
      onSelectedIdChange={onSelectedIdChange}
      acceptTransfers={acceptTransfers}
    >
      <Registrar groupId={groupId} canvasRef={canvasRef} locked={groupLocked} />
      <GridCanvas
        ref={canvasRef}
        className="st-canvas"
        data-root={root ? '' : undefined}
        data-group-id={groupId}
        aria-label={root ? 'Page canvas' : `${String(node.props.title ?? 'Group')} canvas`}
        onClick={onCanvasClick}
        onPointerDownCapture={onPointerDownCapture}
        onDeleteKey={onDeleteKey}
        onKeyDownCapture={onKeyDown}
        // TODO(gridla): a responsive scrollable canvas projects onto its measured
        // height, and its rendered height (fit to content) sets that same
        // element's min-height. Once content is taller than the source canvas
        // the two feed each other and heights run away. Pinning the element to
        // the settled source height keeps the vertical projection an identity.
        style={
          root && layout.canvas.heightMode === 'scrollable'
            ? { ...style, height: layout.canvas.height, minHeight: layout.canvas.height }
            : style
        }
      >
        {content}
        <GridPreviewOutline className="st-preview" />
      </GridCanvas>
    </GridProvider>
  )
}
