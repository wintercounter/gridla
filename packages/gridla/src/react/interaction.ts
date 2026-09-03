import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react'

import type { GridPoint, GridResizeEdge } from '../core'
import { useGridContext } from './context'
import { useTransferScope } from './transfer-context'

/** Data attributes the interaction hook looks for on pointer down. */
export const GRID_DATA = {
  item: 'data-gridla-item',
  dragHandle: 'data-gridla-drag-handle',
  resizeHandle: 'data-gridla-resize-handle',
  edge: 'data-gridla-edge',
} as const

const RESIZE_EDGES: ReadonlySet<string> = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'])

type Pending = {
  itemId: string
  pointerId: number
  clientStart: GridPoint
  local: GridPoint
}

type Active = {
  pointerId: number
  mode: 'move' | 'resize'
  clientStart: GridPoint
  axisLock: { axis: 'x' | 'y'; anchor: GridPoint } | null
}

function setSelectionSuppressed(active: boolean) {
  if (typeof document === 'undefined') return
  if (active) {
    document.documentElement.setAttribute('data-gridla-dragging', '')
    document.getSelection()?.removeAllRanges()
  } else {
    document.documentElement.removeAttribute('data-gridla-dragging')
  }
}

export type GridPointerHandlers = {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onPointerMove: (event: PointerEvent<HTMLElement>) => void
  onPointerUp: (event: PointerEvent<HTMLElement>) => void
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

export type UseGridInteractionOptions = {
  /**
   * Called with the item id when a press does not turn into a drag (a click).
   * Selection already happened on pointer down.
   */
  onItemClick?: (itemId: string) => void
  /** Called when Delete or Backspace is pressed with an item selected. */
  onDeleteKey?: (itemId: string) => void
  /** Set `false` to disable pointer-driven gestures. Default `true`. */
  enabled?: boolean
}

/**
 * Pointer and keyboard orchestration for one canvas element. Attach the
 * returned handlers to the element that contains the items; mark items with
 * `data-gridla-item`, drag surfaces with `data-gridla-drag-handle`, and
 * resize handles with `data-gridla-resize-handle` + `data-gridla-edge`.
 *
 * Behavior:
 * - press on a drag handle selects the item; moving past the threshold starts a move;
 * - press on a resize handle starts a resize immediately;
 * - Shift locks a move to the dominant axis; Ctrl/Cmd bypasses alignment snapping;
 * - Escape cancels; arrow keys nudge the selected item (Alt resizes, Shift x4).
 */
export function useGridInteraction<TData = unknown>(
  ref: RefObject<HTMLElement | null>,
  options: UseGridInteractionOptions = {},
): GridPointerHandlers {
  const { id, gesture, config, store, actions } = useGridContext<TData>()
  const scope = useTransferScope()
  const pending = useRef<Pending | null>(null)
  const active = useRef<Active | null>(null)
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  useEffect(() => {
    gesture.setElement(ref.current)
    return () => gesture.setElement(null)
  }, [gesture, ref])

  const toLocal = useCallback(
    (client: GridPoint): GridPoint | null => {
      const element = ref.current
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { x: client.x - rect.left, y: client.y - rect.top }
    },
    [ref],
  )

  const finish = useCallback(
    (event: PointerEvent<HTMLElement> | null, commit: boolean) => {
      const current = active.current
      active.current = null
      pending.current = null
      if (event && ref.current) {
        try {
          ref.current.releasePointerCapture(event.pointerId)
        } catch {
          // not captured
        }
      }
      setSelectionSuppressed(false)
      if (!current) return
      if (commit && current.mode === 'move' && scope && scope.drop(id)) return
      if (!commit) scope?.cancel()
      if (commit) gesture.commit()
      else gesture.cancel()
    },
    [gesture, id, ref, scope],
  )

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (optionsRef.current.enabled === false) return
      if (event.button !== 0 && event.pointerType === 'mouse') return
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      const local = toLocal({ x: event.clientX, y: event.clientY })
      if (!local) return

      const resizeHandle = target.closest<HTMLElement>(`[${GRID_DATA.resizeHandle}]`)
      if (resizeHandle) {
        const owner = resizeHandle.closest<HTMLElement>(`[${GRID_DATA.item}]`)
        const itemId =
          resizeHandle.getAttribute(GRID_DATA.resizeHandle) || owner?.getAttribute(GRID_DATA.item)
        const edge = resizeHandle.getAttribute(GRID_DATA.edge)
        if (!itemId || !edge || !RESIZE_EDGES.has(edge)) return
        if (!gesture.beginResize(itemId, edge as GridResizeEdge, local, event.pointerId)) return
        active.current = {
          pointerId: event.pointerId,
          mode: 'resize',
          clientStart: { x: event.clientX, y: event.clientY },
          axisLock: null,
        }
        try {
          ref.current?.setPointerCapture(event.pointerId)
        } catch {
          // ignore
        }
        setSelectionSuppressed(true)
        event.preventDefault()
        return
      }

      const dragHandle = target.closest<HTMLElement>(`[${GRID_DATA.dragHandle}]`)
      if (!dragHandle) return
      const owner = dragHandle.closest<HTMLElement>(`[${GRID_DATA.item}]`)
      const itemId =
        dragHandle.getAttribute(GRID_DATA.dragHandle) || owner?.getAttribute(GRID_DATA.item)
      if (!itemId) return
      actions.select(itemId)
      pending.current = {
        itemId,
        pointerId: event.pointerId,
        clientStart: { x: event.clientX, y: event.clientY },
        local,
      }
    },
    [actions, gesture, ref, toLocal],
  )

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const waiting = pending.current
      if (waiting && waiting.pointerId === event.pointerId) {
        const dx = event.clientX - waiting.clientStart.x
        const dy = event.clientY - waiting.clientStart.y
        if (Math.hypot(dx, dy) < config.dragThreshold) return
        pending.current = null
        if (!gesture.beginMove(waiting.itemId, waiting.local, event.pointerId)) return
        active.current = {
          pointerId: event.pointerId,
          mode: 'move',
          clientStart: waiting.clientStart,
          axisLock: null,
        }
        try {
          ref.current?.setPointerCapture(event.pointerId)
        } catch {
          // ignore
        }
        setSelectionSuppressed(true)
      }

      const current = active.current
      if (!current || current.pointerId !== event.pointerId) return

      let clientX = event.clientX
      let clientY = event.clientY
      if (current.mode === 'move') {
        if (event.shiftKey && !current.axisLock) {
          const dx = event.clientX - current.clientStart.x
          const dy = event.clientY - current.clientStart.y
          current.axisLock = {
            axis: Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y',
            anchor: { x: event.clientX, y: event.clientY },
          }
        } else if (!event.shiftKey && current.axisLock) {
          current.axisLock = null
        }
        if (current.axisLock?.axis === 'x') clientY = current.axisLock.anchor.y
        if (current.axisLock?.axis === 'y') clientX = current.axisLock.anchor.x
      }
      const local = toLocal({ x: clientX, y: clientY })
      if (!local) return
      const modifiers = { snap: !(event.ctrlKey || event.metaKey) }

      if (current.mode === 'resize') {
        gesture.updateResize(local, modifiers)
        return
      }
      gesture.updateMove(local, modifiers)
      if (scope) {
        const interaction = store.getSnapshot().interaction
        if (interaction) scope.track(id, interaction.itemId, { x: clientX, y: clientY })
      }
    },
    [config.dragThreshold, gesture, id, ref, scope, store, toLocal],
  )

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const waiting = pending.current
      if (waiting && waiting.pointerId === event.pointerId) {
        pending.current = null
        optionsRef.current.onItemClick?.(waiting.itemId)
        return
      }
      if (!active.current || active.current.pointerId !== event.pointerId) return
      finish(event, true)
    },
    [finish],
  )

  const onPointerCancel = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (pending.current?.pointerId === event.pointerId) pending.current = null
      if (!active.current || active.current.pointerId !== event.pointerId) return
      finish(event, false)
    },
    [finish],
  )

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Escape') {
        if (active.current) {
          finish(null, false)
          event.preventDefault()
        }
        return
      }
      const state = store.getSnapshot()
      const selectedId = state.selectedId
      if (!selectedId) return
      const item = state.layout.items.find((entry) => entry.id === selectedId)
      if (!item) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (optionsRef.current.onDeleteKey) {
          optionsRef.current.onDeleteKey(selectedId)
          event.preventDefault()
        }
        return
      }
      const step = config.keyboardStep * (event.shiftKey ? 4 : 1)
      const delta: Record<string, GridPoint> = {
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
        ArrowUp: { x: 0, y: -step },
        ArrowDown: { x: 0, y: step },
      }
      const move = delta[event.key]
      if (!move) return
      event.preventDefault()
      if (event.altKey) {
        actions.resize(selectedId, { edge: 'se', delta: move }, { snap: false })
        return
      }
      actions.move(selectedId, { x: item.x + move.x, y: item.y + move.y }, { snap: false })
    },
    [actions, config.keyboardStep, finish, store],
  )

  return useMemo(
    () => ({ onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onKeyDown }),
    [onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onKeyDown],
  )
}
