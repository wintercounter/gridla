import type { GridSize } from '../core'

/**
 * Report an element's content box size: once synchronously, then on every
 * `ResizeObserver` notification. A hidden or detached element measures 0x0 and
 * is ignored so the last real size stays in effect. Returns an unsubscribe
 * function. Safe to import during server rendering; call it only with a
 * mounted element.
 */
export function observeSize(element: Element, callback: (size: GridSize) => void): () => void {
  let last: GridSize | null = null
  const measure = () => {
    const rect = element.getBoundingClientRect()
    const next = { w: Math.round(rect.width), h: Math.round(rect.height) }
    if (next.w <= 0 || next.h <= 0) return
    if (last && last.w === next.w && last.h === next.h) return
    last = next
    callback(next)
  }
  measure()
  if (typeof ResizeObserver === 'undefined') return () => {}
  const observer = new ResizeObserver(() => measure())
  observer.observe(element)
  return () => observer.disconnect()
}
