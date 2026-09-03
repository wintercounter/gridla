import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'

import type { GridSize } from '../core'
import { observeSize } from '../interaction/measure'

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
    return observeSize(element, (next) =>
      setSize((prev) => (prev && prev.w === next.w && prev.h === next.h ? prev : next)),
    )
  }, [ref, enabled])

  return size
}
