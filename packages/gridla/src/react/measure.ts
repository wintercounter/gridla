import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'

import type { GridSize } from '../core'

// Measure before paint in the browser; fall back to a passive effect on the server.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * Observe an element's content box size with `ResizeObserver`. The first
 * measurement happens in a layout effect so the projected layout paints on the
 * first frame. Returns `null` until measured. Safe to import during server
 * rendering.
 */
export function useElementSize(
  ref: RefObject<HTMLElement | null>,
  enabled = true,
): GridSize | null {
  const [size, setSize] = useState<GridSize | null>(null)

  useIsomorphicLayoutEffect(() => {
    if (!enabled) return
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const rect = element.getBoundingClientRect()
      const next = { w: Math.round(rect.width), h: Math.round(rect.height) }
      // A hidden or detached element measures 0x0; keep the last real size.
      if (next.w <= 0 || next.h <= 0) return
      setSize((prev) => (prev && prev.w === next.w && prev.h === next.h ? prev : next))
    }
    measure()
    const observer = new ResizeObserver(() => measure())
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, enabled])

  return size
}
