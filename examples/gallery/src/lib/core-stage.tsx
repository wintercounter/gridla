import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react'

import {
  itemBottom,
  type GridCanvas,
  type GridItem,
  type GridLayout,
  type GridPoint,
  type GridRect,
} from 'gridla'
import { renderLayout } from '@gridla/demo-kit'

export type StagePointer = {
  /** Pointer position in canvas coordinates. */
  point: GridPoint
  /** Id of the item under the pointer, if any. */
  itemId: string | null
  event: PointerEvent<HTMLElement>
}

export type CoreStageProps = {
  layout: GridLayout
  label?: string
  /** `scale` (default) shrinks the authored canvas to fit; `none` paints 1:1. */
  fit?: 'scale' | 'none'
  ariaLabel: string
  itemLabel?: (item: GridItem) => string
  /** Overlays in canvas coordinates (guides, previews, padding). */
  children?: ReactNode
  onPointerDown?: (pointer: StagePointer) => void
  onPointerMove?: (pointer: StagePointer) => void
  onPointerUp?: (pointer: StagePointer) => void
  onPointerLeave?: () => void
  style?: CSSProperties
}

export function canvasExtent(layout: GridLayout): number {
  const { canvas, items } = layout
  if (canvas.heightMode !== 'scrollable') return canvas.height
  const bottom = items.reduce((max, item) => Math.max(max, itemBottom(item)), 0)
  return Math.max(canvas.height, Math.ceil(bottom + canvas.padding.bottom))
}

/**
 * Paints a layout with the demo kit's `renderLayout` (plain DOM, no provider)
 * and scales the authored canvas to the available width so coordinates in the
 * inspector stay the authored ones at every viewport size.
 */
export function CoreStage({
  layout,
  label,
  fit = 'scale',
  ariaLabel,
  itemLabel,
  children,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  style,
}: CoreStageProps) {
  const outer = useRef<HTMLElement | null>(null)
  const items = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const element = outer.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const measure = () => setWidth(Math.round(element.getBoundingClientRect().width))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (items.current) renderLayout(items.current, layout, itemLabel ? { label: itemLabel } : {})
  }, [layout, itemLabel])

  const extent = canvasExtent(layout)
  const scale = fit === 'scale' && width > 0 ? Math.min(1, width / layout.canvas.width) : 1

  const toPointer = (event: PointerEvent<HTMLElement>): StagePointer => {
    const rect = (outer.current as HTMLDivElement).getBoundingClientRect()
    const target = event.target instanceof Element ? event.target.closest('[data-id]') : null
    return {
      point: { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale },
      itemId: target instanceof HTMLElement ? (target.dataset.id ?? null) : null,
      event,
    }
  }

  return (
    <section
      ref={outer}
      className="gl-stage"
      aria-label={ariaLabel}
      style={{ height: Math.round(extent * scale), ...style }}
      onPointerDown={onPointerDown ? (event) => onPointerDown(toPointer(event)) : undefined}
      onPointerMove={onPointerMove ? (event) => onPointerMove(toPointer(event)) : undefined}
      onPointerUp={onPointerUp ? (event) => onPointerUp(toPointer(event)) : undefined}
      onPointerLeave={onPointerLeave}
    >
      <div
        className="gl-canvas"
        style={{
          width: layout.canvas.width,
          height: extent,
          transform: `scale(${scale})`,
        }}
      >
        <div ref={items} className="gl-items" />
        {children}
      </div>
      {label ? <span className="gd-stage-label">{label}</span> : null}
    </section>
  )
}

/** Dashed outline of a canvas' inner rect (padding shown as hatched margin). */
export function PaddingGuide({ canvas }: { canvas: GridCanvas }) {
  const { padding } = canvas
  return (
    <div
      className="gl-padding-guide"
      style={{
        left: padding.left,
        top: padding.top,
        right: padding.right,
        bottom: padding.bottom,
      }}
      aria-hidden="true"
    />
  )
}

/** A rectangle overlay: preview, rejected candidate, or hover highlight. */
export function RectOutline({
  rect,
  kind = 'preview',
  label,
}: {
  rect: GridRect
  kind?: 'preview' | 'rejected' | 'hover' | 'source'
  label?: string
}) {
  return (
    <div
      className="gl-outline"
      data-kind={kind}
      aria-hidden="true"
      style={{
        width: rect.w,
        height: rect.h,
        transform: `translate(${rect.x}px, ${rect.y}px)`,
      }}
    >
      {label ? <span>{label}</span> : null}
    </div>
  )
}

/** A snap guide line, drawn where two edges align. */
export function Guide({ axis, at }: { axis: 'x' | 'y'; at: number }) {
  return (
    <div
      className="gd-guide"
      data-axis={axis}
      aria-hidden="true"
      style={axis === 'x' ? { left: at } : { top: at }}
    />
  )
}
