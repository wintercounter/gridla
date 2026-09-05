import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react'

import type { GridRect, GridResizeEdge } from '../core'
import { useGridContext } from './context'
import { useGridItemView, useGridStore, type GridItemView } from './hooks'
import { GRID_DATA, useGridInteraction, type UseGridInteractionOptions } from './interaction'
import { useElementSize } from './measure'
import { applyMeasuredSize } from './provider'

// ---------------------------------------------------------------------------
// GridCanvas
// ---------------------------------------------------------------------------

/**
 * Props for `GridCanvas`: `div` attributes (except `onKeyDown`, which the canvas
 * owns) plus `UseGridInteractionOptions`.
 */
export type GridCanvasProps = Omit<HTMLAttributes<HTMLDivElement>, 'onKeyDown'> &
  UseGridInteractionOptions & {
    children?: ReactNode
  }

/**
 * The element items are positioned in. Measures itself, feeds the size to the
 * provider, and wires pointer and keyboard handling. Renders a `div` with
 * `position: relative`; give it a height (or let it follow the layout with
 * `responsive={false}`).
 */
export const GridCanvas = forwardRef<HTMLDivElement, GridCanvasProps>(function GridCanvas(
  { children, style, onItemClick, onDeleteKey, enabled, ...rest },
  forwardedRef,
) {
  const ref = useRef<HTMLDivElement | null>(null)
  useImperativeHandle(forwardedRef, () => ref.current as HTMLDivElement)
  const { store, config } = useGridContext()
  const size = useElementSize(ref, config.responsive)
  useEffect(() => {
    applyMeasuredSize(store, size, config)
  }, [store, size, config])

  const handlers = useGridInteraction(ref, { onItemClick, onDeleteKey, enabled })
  const canvas = useGridStore((state) => state.layout.canvas)
  const dragging = useGridStore((state) => state.interaction !== null)

  const canvasStyle = useMemo<CSSProperties>(
    () => ({
      position: 'relative',
      boxSizing: 'border-box',
      touchAction: 'none',
      userSelect: dragging ? 'none' : undefined,
      ...(config.responsive
        ? canvas.heightMode === 'scrollable'
          ? { minHeight: canvas.height }
          : {}
        : { width: canvas.width, height: canvas.height }),
      ...style,
    }),
    [canvas.height, canvas.heightMode, canvas.width, config.responsive, dragging, style],
  )

  return (
    <div
      ref={ref}
      data-gridla-canvas=""
      data-gridla-active={dragging ? '' : undefined}
      tabIndex={rest.tabIndex ?? 0}
      {...rest}
      {...handlers}
      style={canvasStyle}
    >
      {children}
    </div>
  )
})

// ---------------------------------------------------------------------------
// GridItem
// ---------------------------------------------------------------------------

/**
 * Passed to a `GridItem` render function: the item's `GridItemView` plus props
 * for drag and resize handles.
 */
export type GridItemRenderProps = GridItemView & {
  /** Spread on the element that starts a move. */
  dragHandleProps: { [GRID_DATA.dragHandle]: string }
  /** Props for a resize handle on the given edge. */
  getResizeHandleProps: (edge: GridResizeEdge) => {
    [GRID_DATA.resizeHandle]: string
    [GRID_DATA.edge]: GridResizeEdge
  }
}

/**
 * Props for `GridItem`. `id` selects the item; the rest control drag surfaces,
 * built-in resize handles, and how the element is positioned.
 */
export type GridItemProps = Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'id'> & {
  /** Id of the item in the layout. */
  id: string
  /**
   * `true` (default): the whole element is a drag surface. `false`: only
   * elements with `dragHandleProps` start a move.
   */
  draggable?: boolean
  /** Edges to render built-in resize handles for. Default: none. */
  resizeEdges?: readonly GridResizeEdge[]
  /** Class for built-in resize handles. */
  resizeHandleClassName?: string
  /**
   * Position the element with `transform` (default) or with `left`/`top`.
   * Transform keeps layout work off the main thread during gestures.
   */
  positioning?: 'transform' | 'absolute'
  /** Render the cursor-tracked rect while dragging instead of the solved preview. Default `true`. */
  followPointer?: boolean
  children?: ReactNode | ((view: GridItemRenderProps) => ReactNode)
}

const EDGE_CURSORS: Record<GridResizeEdge, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
}

function resizeHandleStyle(edge: GridResizeEdge, size = 10): CSSProperties {
  const half = size / 2
  const base: CSSProperties = {
    position: 'absolute',
    cursor: EDGE_CURSORS[edge],
    touchAction: 'none',
  }
  const vertical = edge === 'n' || edge === 's'
  const horizontal = edge === 'e' || edge === 'w'
  if (vertical) {
    return {
      ...base,
      left: half,
      right: half,
      height: size,
      [edge === 'n' ? 'top' : 'bottom']: -half,
    }
  }
  if (horizontal) {
    return {
      ...base,
      top: half,
      bottom: half,
      width: size,
      [edge === 'w' ? 'left' : 'right']: -half,
    }
  }
  return {
    ...base,
    width: size,
    height: size,
    [edge.includes('n') ? 'top' : 'bottom']: -half,
    [edge.includes('w') ? 'left' : 'right']: -half,
  }
}

function rectStyle(rect: GridRect, positioning: 'transform' | 'absolute'): CSSProperties {
  if (positioning === 'absolute') {
    return { position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h }
  }
  return {
    position: 'absolute',
    left: 0,
    top: 0,
    width: rect.w,
    height: rect.h,
    transform: `translate(${rect.x}px, ${rect.y}px)`,
  }
}

/**
 * Positions one item inside `GridCanvas`. Headless: it renders a `div` with
 * geometry styles and data attributes and leaves appearance to you.
 */
export const GridItem = forwardRef<HTMLDivElement, GridItemProps>(function GridItem(
  {
    id,
    draggable = true,
    resizeEdges,
    resizeHandleClassName,
    positioning = 'transform',
    followPointer = true,
    children,
    style,
    ...rest
  },
  ref,
) {
  const view = useGridItemView(id)
  const dragHandleProps = useMemo(
    () => ({ [GRID_DATA.dragHandle]: id }) as { [GRID_DATA.dragHandle]: string },
    [id],
  )
  const getResizeHandleProps = useCallback(
    (edge: GridResizeEdge) =>
      ({ [GRID_DATA.resizeHandle]: id, [GRID_DATA.edge]: edge }) as {
        [GRID_DATA.resizeHandle]: string
        [GRID_DATA.edge]: GridResizeEdge
      },
    [id],
  )
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
  const renderProps: GridItemRenderProps = { ...view, dragHandleProps, getResizeHandleProps }

  return (
    <div
      ref={ref}
      {...rest}
      {...(draggable ? dragHandleProps : {})}
      {...{ [GRID_DATA.item]: id }}
      data-gridla-active={view.isActive ? '' : undefined}
      data-gridla-selected={view.isSelected ? '' : undefined}
      data-gridla-shifted={view.isShifted ? '' : undefined}
      data-gridla-transferring={view.isTransferring ? '' : undefined}
      style={itemStyle}
    >
      {typeof children === 'function' ? children(renderProps) : children}
      {resizeEdges?.map((edge) => (
        <div
          key={edge}
          className={resizeHandleClassName}
          {...getResizeHandleProps(edge)}
          style={resizeHandleStyle(edge)}
        />
      ))}
    </div>
  )
})

// ---------------------------------------------------------------------------
// GridPreview
// ---------------------------------------------------------------------------

/**
 * Props for `GridPreviewOutline`: `div` attributes plus the positioning mode
 * (`transform` by default).
 */
export type GridPreviewOutlineProps = HTMLAttributes<HTMLDivElement> & {
  positioning?: 'transform' | 'absolute'
}

/**
 * Renders a box where the active item will land when released. Renders
 * nothing when no gesture is in progress.
 */
export function GridPreviewOutline({
  positioning = 'transform',
  style,
  ...rest
}: GridPreviewOutlineProps) {
  const rect = useGridStore((state) => {
    if (!state.preview || !state.preview.accepted) return null
    const item = state.preview.item
    return { x: item.x, y: item.y, w: item.w, h: item.h }
  })
  if (!rect) return null
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
}
