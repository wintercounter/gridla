import { useEffect, useMemo, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'

import { createPointerGesture, type GridPointerGestureOptions } from '../interaction/gesture'
import { useGridContext } from './context'
import { useTransferScope } from './transfer-context'

export { GRID_DATA } from '../interaction/attributes'

/**
 * Pointer and keyboard handlers returned by `useGridInteraction`. Spread them
 * onto the canvas element.
 */
export type GridPointerHandlers = {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onPointerMove: (event: PointerEvent<HTMLElement>) => void
  onPointerUp: (event: PointerEvent<HTMLElement>) => void
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

/** Options for `useGridInteraction`. `GridCanvas` accepts the same fields as props. */
export type UseGridInteractionOptions = GridPointerGestureOptions

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
 *
 * A binding over `createPointerGesture` from `gridla/interaction`.
 */
export function useGridInteraction<TData = unknown>(
  ref: RefObject<HTMLElement | null>,
  options: UseGridInteractionOptions = {},
): GridPointerHandlers {
  const { controller, gesture } = useGridContext<TData>()
  const scope = useTransferScope()

  useEffect(() => {
    gesture.setElement(ref.current)
    return () => gesture.setElement(null)
  }, [gesture, ref])

  // The element registered on the gesture API (see the effect above) is the
  // one `createPointerGesture` captures and converts coordinates against.
  const pointer = useMemo(() => createPointerGesture(controller, { scope }), [controller, scope])
  pointer.setOptions(options)
  useEffect(() => () => pointer.destroy(), [pointer])

  return useMemo<GridPointerHandlers>(
    () => ({
      onPointerDown: (event) => pointer.pointerDown(event),
      onPointerMove: (event) => pointer.pointerMove(event),
      onPointerUp: (event) => pointer.pointerUp(event),
      onPointerCancel: (event) => pointer.pointerCancel(event),
      onKeyDown: (event) => pointer.keyDown(event),
    }),
    [pointer],
  )
}
