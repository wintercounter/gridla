import type { GridPoint, GridResizeEdge } from '../core'
import { GRID_DATA } from './attributes'
import type { GridController } from './controller'
import type { TransferScope } from './transfer'

const RESIZE_EDGES: ReadonlySet<string> = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'])

/**
 * The subset of a pointer event the gesture reads. Native `PointerEvent`s and
 * React's synthetic pointer events both satisfy it.
 */
export type GridPointerEventLike = {
  pointerId: number
  clientX: number
  clientY: number
  button?: number
  pointerType?: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  target: unknown
  preventDefault: () => void
}

/**
 * The subset of a keyboard event the gesture reads. Native `KeyboardEvent`s
 * and React's synthetic keyboard events both satisfy it.
 */
export type GridKeyboardEventLike = {
  key: string
  shiftKey?: boolean
  altKey?: boolean
  preventDefault: () => void
}

/** Per-gesture callbacks and switches. Change them at any time with `setOptions`. */
export type GridPointerGestureOptions = {
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
 * Dependencies of `createPointerGesture` beyond the controller. Everything is
 * optional: by default the canvas element is the one registered on the
 * controller's gesture API, and no transfer scope is consulted.
 */
export type GridPointerGestureDeps = GridPointerGestureOptions & {
  /** The canvas element; used for pointer capture and coordinate conversion. */
  getElement?: () => HTMLElement | null
  /** Convert client coordinates to canvas pixels. Defaults to subtracting the element's rect. */
  toLocal?: (client: GridPoint) => GridPoint | null
  /** Transfer scope the controller is registered in, for cross-canvas drags. */
  scope?: TransferScope | null
}

/**
 * Pointer and keyboard state machine for one canvas. Feed it events (or let
 * `bindPointer`/`bindKeyboard` attach native listeners) and it drives the
 * controller's gesture API.
 */
export type GridPointerGesture = {
  /** Press: selects the item under a drag handle, or starts a resize on a resize handle. */
  pointerDown: (event: GridPointerEventLike) => void
  /** Move: turns a press into a drag past the threshold, then tracks the gesture. */
  pointerMove: (event: GridPointerEventLike) => void
  /** Release: reports a click for an unmoved press, otherwise commits the gesture. */
  pointerUp: (event: GridPointerEventLike) => void
  /** Cancel: abandons the gesture without committing. */
  pointerCancel: (event: GridPointerEventLike) => void
  /** Escape cancels; arrows nudge the selected item (Alt resizes, Shift x4); Delete reports. */
  keyDown: (event: GridKeyboardEventLike) => void
  /** Replace the callbacks and the `enabled` switch. */
  setOptions: (options: GridPointerGestureOptions) => void
  /**
   * Attach `pointerdown`/`pointermove`/`pointerup`/`pointercancel` listeners to
   * `element`. Returns a function that removes them.
   */
  bindPointer: (element: HTMLElement) => () => void
  /** Attach a `keydown` listener to `element`. Returns a function that removes it. */
  bindKeyboard: (element: HTMLElement) => () => void
  /** Abandon any gesture in progress and release pointer capture. */
  destroy: () => void
}

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

function closestElement(target: unknown): Element | null {
  return typeof Element !== 'undefined' && target instanceof Element ? target : null
}

/**
 * Create the pointer and keyboard state machine for `controller`. Mark items
 * with `data-gridla-item`, drag surfaces with `data-gridla-drag-handle`, and
 * resize handles with `data-gridla-resize-handle` + `data-gridla-edge`
 * (see `GRID_DATA`).
 *
 * Behavior:
 * - press on a drag handle selects the item; moving past the threshold starts a move;
 * - press on a resize handle starts a resize immediately;
 * - Shift locks a move to the dominant axis; Ctrl/Cmd bypasses alignment snapping;
 * - Escape cancels; arrow keys nudge the selected item (Alt resizes, Shift x4).
 */
export function createPointerGesture<TData = unknown>(
  controller: GridController<TData>,
  deps: GridPointerGestureDeps = {},
): GridPointerGesture {
  const { id, gesture, store, actions } = controller
  const scope = deps.scope ?? null
  const getElement = deps.getElement ?? gesture.getElement
  const toLocal =
    deps.toLocal ??
    ((client: GridPoint): GridPoint | null => {
      const element = getElement()
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { x: client.x - rect.left, y: client.y - rect.top }
    })
  let options: GridPointerGestureOptions = deps
  let pending: Pending | null = null
  let active: Active | null = null

  const capture = (pointerId: number) => {
    try {
      getElement()?.setPointerCapture(pointerId)
    } catch {
      // ignore
    }
  }

  const finish = (event: GridPointerEventLike | null, commit: boolean) => {
    const current = active
    active = null
    pending = null
    const element = getElement()
    if (event && element) {
      try {
        element.releasePointerCapture(event.pointerId)
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
  }

  const pointerDown = (event: GridPointerEventLike) => {
    if (options.enabled === false) return
    if (event.button !== 0 && event.pointerType === 'mouse') return
    const target = closestElement(event.target)
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
      active = {
        pointerId: event.pointerId,
        mode: 'resize',
        clientStart: { x: event.clientX, y: event.clientY },
        axisLock: null,
      }
      capture(event.pointerId)
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
    pending = {
      itemId,
      pointerId: event.pointerId,
      clientStart: { x: event.clientX, y: event.clientY },
      local,
    }
  }

  const pointerMove = (event: GridPointerEventLike) => {
    const waiting = pending
    if (waiting && waiting.pointerId === event.pointerId) {
      const dx = event.clientX - waiting.clientStart.x
      const dy = event.clientY - waiting.clientStart.y
      if (Math.hypot(dx, dy) < controller.getConfig().dragThreshold) return
      pending = null
      if (!gesture.beginMove(waiting.itemId, waiting.local, event.pointerId)) return
      active = {
        pointerId: event.pointerId,
        mode: 'move',
        clientStart: waiting.clientStart,
        axisLock: null,
      }
      capture(event.pointerId)
      setSelectionSuppressed(true)
    }

    const current = active
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
  }

  const pointerUp = (event: GridPointerEventLike) => {
    const waiting = pending
    if (waiting && waiting.pointerId === event.pointerId) {
      pending = null
      options.onItemClick?.(waiting.itemId)
      return
    }
    if (!active || active.pointerId !== event.pointerId) return
    finish(event, true)
  }

  const pointerCancel = (event: GridPointerEventLike) => {
    if (pending?.pointerId === event.pointerId) pending = null
    if (!active || active.pointerId !== event.pointerId) return
    finish(event, false)
  }

  const keyDown = (event: GridKeyboardEventLike) => {
    if (event.key === 'Escape') {
      if (active) {
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
      if (options.onDeleteKey) {
        options.onDeleteKey(selectedId)
        event.preventDefault()
      }
      return
    }
    const step = controller.getConfig().keyboardStep * (event.shiftKey ? 4 : 1)
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
  }

  return {
    pointerDown,
    pointerMove,
    pointerUp,
    pointerCancel,
    keyDown,
    setOptions: (next) => {
      options = next
    },
    bindPointer: (element) => {
      const down = (event: PointerEvent) => pointerDown(event)
      const move = (event: PointerEvent) => pointerMove(event)
      const up = (event: PointerEvent) => pointerUp(event)
      const cancel = (event: PointerEvent) => pointerCancel(event)
      element.addEventListener('pointerdown', down)
      element.addEventListener('pointermove', move)
      element.addEventListener('pointerup', up)
      element.addEventListener('pointercancel', cancel)
      return () => {
        element.removeEventListener('pointerdown', down)
        element.removeEventListener('pointermove', move)
        element.removeEventListener('pointerup', up)
        element.removeEventListener('pointercancel', cancel)
      }
    },
    bindKeyboard: (element) => {
      const down = (event: KeyboardEvent) => keyDown(event)
      element.addEventListener('keydown', down)
      return () => element.removeEventListener('keydown', down)
    },
    destroy: () => {
      if (active) finish(null, false)
      pending = null
    },
  }
}
