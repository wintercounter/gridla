import type { GridRect, GridResizeEdge } from '../core'

/**
 * Inline geometry of a built-in resize handle. Every length is a CSS string
 * that reads a `--gridla-handle-*` custom property with a fallback, so a
 * stylesheet can restyle the handles without `!important`.
 */
export type GridResizeHandleStyle = {
  position: 'absolute'
  touchAction: 'none'
  cursor: string
  top?: string
  bottom?: string
  left?: string
  right?: string
  width?: string
  height?: string
}

/** Fallback values of `resizeHandleStyle`, used when the custom properties are unset. */
export type GridResizeHandleStyleOptions = {
  /** Thickness of the handle when `--gridla-handle-size` is unset. Default `10px`. */
  size?: number | string
  /**
   * Distance an edge handle keeps from the corners when
   * `--gridla-handle-inset` is unset. Default: the size.
   */
  inset?: number | string
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

const length = (value: number | string) => (typeof value === 'number' ? `${value}px` : value)

/**
 * Inline styles for a built-in resize handle on `edge`. Handles sit fully
 * inside the item so they stay hit-testable when the item clips its overflow:
 * corner handles are `size` squares in the corners, edge handles run along
 * the side and stop `inset` short of each corner.
 *
 * The geometry reads three custom properties, each with a fallback, so
 * plain CSS on `[data-gridla-resize-handle]` (or the handle class) restyles
 * them without fighting the inline declaration:
 *
 * - `--gridla-handle-size`: thickness (default `10px`).
 * - `--gridla-handle-inset`: corner clearance of edge handles (default: the size).
 * - `--gridla-handle-cursor-<edge>` or `--gridla-handle-cursor`: the cursor
 *   (default: the matching `*-resize` cursor).
 *
 * Every adapter's built-in handles use this; call it yourself when you render
 * handles by hand and want the same geometry.
 */
export function resizeHandleStyle(
  edge: GridResizeEdge,
  options: GridResizeHandleStyleOptions = {},
): GridResizeHandleStyle {
  const size = `var(--gridla-handle-size, ${length(options.size ?? 10)})`
  const inset =
    options.inset === undefined
      ? `var(--gridla-handle-inset, ${size})`
      : `var(--gridla-handle-inset, ${length(options.inset)})`
  const base: GridResizeHandleStyle = {
    position: 'absolute',
    touchAction: 'none',
    cursor: `var(--gridla-handle-cursor-${edge}, var(--gridla-handle-cursor, ${EDGE_CURSORS[edge]}))`,
  }
  if (edge === 'n' || edge === 's') {
    return {
      ...base,
      left: inset,
      right: inset,
      height: size,
      [edge === 'n' ? 'top' : 'bottom']: '0px',
    }
  }
  if (edge === 'e' || edge === 'w') {
    return {
      ...base,
      top: inset,
      bottom: inset,
      width: size,
      [edge === 'w' ? 'left' : 'right']: '0px',
    }
  }
  return {
    ...base,
    width: size,
    height: size,
    [edge.includes('n') ? 'top' : 'bottom']: '0px',
    [edge.includes('w') ? 'left' : 'right']: '0px',
  }
}

/** Inline geometry that places an element at a rect inside a canvas. */
export type GridRectStyle = {
  position: 'absolute'
  left: string
  top: string
  width: string
  height: string
  transform?: string
}

/**
 * Inline styles that place an element at `rect` inside a canvas: with a
 * `transform` (default, keeps layout work off the main thread during
 * gestures) or with `left`/`top` (`'absolute'`). Lengths are `px` strings.
 */
export function rectStyle(rect: GridRect, positioning: 'transform' | 'absolute'): GridRectStyle {
  if (positioning === 'absolute') {
    return {
      position: 'absolute',
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.w}px`,
      height: `${rect.h}px`,
    }
  }
  return {
    position: 'absolute',
    left: '0px',
    top: '0px',
    width: `${rect.w}px`,
    height: `${rect.h}px`,
    transform: `translate(${rect.x}px, ${rect.y}px)`,
  }
}

/** Serialize a style object with camelCase keys to a `style` attribute value. */
export function styleToText(style: Record<string, string | number | undefined>): string {
  let text = ''
  for (const key in style) {
    const value = style[key]
    if (value === undefined) continue
    text += `${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}:${value};`
  }
  return text
}
