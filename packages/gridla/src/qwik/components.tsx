/** @jsxImportSource @builder.io/qwik */
import {
  component$,
  Slot,
  useSignal,
  useVisibleTask$,
  type CSSProperties,
  type PropFunction,
  type PropsOf,
} from '@builder.io/qwik'

import type { GridResizeEdge } from '../core'
import { GRID_DATA } from '../interaction/attributes'
import { createPointerGesture } from '../interaction/gesture'
import { observeSize } from '../interaction/measure'
import { useGridContext } from './context'
import { rectStyle, resizeHandleStyle, selectItemView, type GridPositioning } from './view'

type DivProps = Omit<PropsOf<'div'>, 'style' | 'children' | 'ref'> & {
  /** Inline styles merged over the geometry styles. Object form only. */
  style?: CSSProperties
}

// ---------------------------------------------------------------------------
// GridCanvas
// ---------------------------------------------------------------------------

/**
 * Props for `GridCanvas`: `div` attributes (except `style`, which must be an
 * object) plus the pointer gesture options.
 */
export type GridCanvasProps = DivProps & {
  /** Fires when a press on an item ends without a drag. */
  onItemClick$?: PropFunction<(itemId: string) => void>
  /** Fires when Delete or Backspace is pressed while an item is selected. */
  onDeleteKey$?: PropFunction<(itemId: string) => void>
  /** Set to `false` to ignore pointer input. Default `true`. */
  enabled?: boolean
}

/**
 * The element items are positioned in. Measures itself, feeds the size to the
 * provider, and binds pointer and keyboard handling with native listeners.
 * Renders a `div` with `position: relative`; give it a height (or let it
 * follow the layout with `responsive={false}` on the provider).
 */
export const GridCanvas = component$<GridCanvasProps>(
  ({ onItemClick$, onDeleteKey$, enabled, style, ...rest }) => {
    const ctx = useGridContext()
    const ref = useSignal<HTMLDivElement>()

    // eslint-disable-next-line qwik/no-use-visible-task -- pointer binding needs the element
    useVisibleTask$(
      // oxlint-disable-next-line typescript/unbound-method -- task context methods are bound by Qwik
      ({ track, cleanup }) => {
        const controller = track(() => ctx.runtime.controller)
        const isEnabled = track(() => enabled)
        const element = ref.value
        if (!controller || !element) return
        controller.gesture.setElement(element)
        const pointer = createPointerGesture(controller, {
          scope: ctx.runtime.scope ?? null,
          enabled: isEnabled,
          onItemClick: onItemClick$ ? (itemId) => void onItemClick$(itemId) : undefined,
          onDeleteKey: onDeleteKey$ ? (itemId) => void onDeleteKey$(itemId) : undefined,
        })
        cleanup(pointer.bindPointer(element))
        cleanup(pointer.bindKeyboard(element))
        if (ctx.runtime.responsive) {
          cleanup(observeSize(element, (size) => controller.setSize(size)))
        }
        cleanup(() => {
          pointer.destroy()
          controller.gesture.setElement(null)
        })
      },
      { strategy: 'document-ready' },
    )

    const state = ctx.state.value
    const canvas = state.layout.canvas
    const dragging = state.interaction !== null
    const canvasStyle: CSSProperties = {
      position: 'relative',
      boxSizing: 'border-box',
      touchAction: 'none',
      userSelect: dragging ? 'none' : undefined,
      ...(ctx.runtime.responsive
        ? canvas.heightMode === 'scrollable'
          ? { minHeight: `${canvas.height}px` }
          : {}
        : { width: `${canvas.width}px`, height: `${canvas.height}px` }),
      ...style,
    }

    return (
      <div
        ref={ref}
        data-gridla-canvas=""
        data-gridla-active={dragging ? '' : undefined}
        tabIndex={rest.tabIndex ?? 0}
        {...rest}
        style={canvasStyle}
      >
        <Slot />
      </div>
    )
  },
)

// ---------------------------------------------------------------------------
// GridItem
// ---------------------------------------------------------------------------

/**
 * Props for `GridItem`. `id` selects the item; the rest control drag surfaces,
 * built-in resize handles, and how the element is positioned. Children are
 * projected through a `Slot`; read `useGridItemView(id)` for the item's
 * geometry and flags.
 */
export type GridItemProps = Omit<DivProps, 'id'> & {
  /** Id of the item in the layout. */
  id: string
  /**
   * `true` (default): the whole element is a drag surface. `false`: only
   * descendants marked with `data-gridla-drag-handle="<id>"` start a move.
   */
  draggable?: boolean
  /** Edges to render built-in resize handles for. Default: none. */
  resizeEdges?: readonly GridResizeEdge[]
  /** Class for built-in resize handles. */
  resizeHandleClass?: string
  /**
   * Position the element with `transform` (default) or with `left`/`top`.
   * Transform keeps layout work off the main thread during gestures.
   */
  positioning?: GridPositioning
  /** Render the cursor-tracked rect while dragging instead of the solved preview. Default `true`. */
  followPointer?: boolean
}

/**
 * Positions one item inside `GridCanvas`. Headless: it renders a `div` with
 * geometry styles and data attributes and leaves appearance to you.
 */
export const GridItem = component$<GridItemProps>(
  ({
    id,
    draggable = true,
    resizeEdges,
    resizeHandleClass,
    positioning = 'transform',
    followPointer = true,
    style,
    ...rest
  }) => {
    const ctx = useGridContext()
    const view = selectItemView(ctx.state.value, id)
    const shownRect =
      view.isActive && followPointer && view.activeRect && view.interaction?.mode === 'move'
        ? view.activeRect
        : view.rect
    const itemStyle: CSSProperties = {
      boxSizing: 'border-box',
      ...rectStyle(shownRect, positioning),
      ...(view.isActive ? { zIndex: 2 } : {}),
      ...(view.isTransferring ? { opacity: 0.4 } : {}),
      ...style,
    }

    return (
      <div
        {...rest}
        data-gridla-item={id}
        data-gridla-drag-handle={draggable ? id : undefined}
        data-gridla-active={view.isActive ? '' : undefined}
        data-gridla-selected={view.isSelected ? '' : undefined}
        data-gridla-shifted={view.isShifted ? '' : undefined}
        data-gridla-transferring={view.isTransferring ? '' : undefined}
        style={itemStyle}
      >
        <Slot />
        {resizeEdges?.map((edge) => (
          <div
            key={edge}
            class={resizeHandleClass}
            data-gridla-resize-handle={id}
            data-gridla-edge={edge}
            style={resizeHandleStyle(edge)}
          />
        ))}
      </div>
    )
  },
)

// ---------------------------------------------------------------------------
// GridPreviewOutline
// ---------------------------------------------------------------------------

/**
 * Props for `GridPreviewOutline`: `div` attributes plus the positioning mode
 * (`transform` by default).
 */
export type GridPreviewOutlineProps = DivProps & {
  positioning?: GridPositioning
}

/**
 * Renders a box where the active item will land when released. Renders
 * nothing when no gesture is in progress.
 */
export const GridPreviewOutline = component$<GridPreviewOutlineProps>(
  ({ positioning = 'transform', style, ...rest }) => {
    const ctx = useGridContext()
    const preview = ctx.state.value.preview
    if (!preview || !preview.accepted) return null
    // Read the fields directly: the optimizer drops an intermediate `const`
    // here and leaves an uninitialized declaration behind.
    const rect = { x: preview.item.x, y: preview.item.y, w: preview.item.w, h: preview.item.h }
    return (
      <div
        data-gridla-preview=""
        {...rest}
        style={{
          pointerEvents: 'none',
          boxSizing: 'border-box',
          ...rectStyle(rect, positioning),
          ...style,
        }}
      />
    )
  },
)

/** Attribute names the pointer gesture looks for. Re-exported from `gridla/interaction`. */
export { GRID_DATA }
