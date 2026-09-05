/**
 * Every group canvas registers here so panels outside the provider tree (the
 * palette, the inspector, the debug overlay) can reach its actions, and so a
 * palette drag can find the canvas under the pointer.
 */

import { createContext, useContext } from 'react'

import type { GridLayout, GridPoint } from 'gridla'
import { measurePreviewShift, type GridState } from 'gridla/interaction'
import type { GridActions, GridContextValue } from 'gridla/react'

export type CanvasEntry = {
  groupId: string
  getElement: () => HTMLElement | null
  actions: GridActions
  gesture: GridContextValue['gesture']
  getLayout: () => GridLayout
  /** Current provider state (rendered layout and any drop preview). */
  getState: () => GridState
  /** Subscribe to the provider's store (rendered layout changes). */
  subscribe: (listener: () => void) => () => void
  /** Fine-grained accept check for palette drops. */
  accepts: () => boolean
}

export type CanvasRegistry = {
  register: (entry: CanvasEntry) => () => void
  get: (groupId: string) => CanvasEntry | null
  entries: () => CanvasEntry[]
  /**
   * The deepest accepting canvas under a client point. Pass the canvas that
   * currently shows a drop preview: its preview pushes neighbors (other
   * canvases among them) aside, and those are hit-tested at their resting
   * position so the target does not change just because it moved them.
   */
  findAt: (client: GridPoint, current?: CanvasEntry | null) => CanvasEntry | null
  /** Notified when canvases register or unregister. */
  subscribe: (listener: () => void) => () => void
}

function containsPoint(element: HTMLElement, client: GridPoint, shift: GridPoint): boolean {
  const rect = element.getBoundingClientRect()
  return (
    client.x >= rect.left - shift.x &&
    client.x <= rect.right - shift.x &&
    client.y >= rect.top - shift.y &&
    client.y <= rect.bottom - shift.y
  )
}

const NO_SHIFT: GridPoint = { x: 0, y: 0 }

export function createCanvasRegistry(): CanvasRegistry {
  const entries = new Map<string, CanvasEntry>()
  const listeners = new Set<() => void>()
  // Stable snapshot for `useSyncExternalStore`; rebuilt only on changes.
  let list: CanvasEntry[] = []
  const notify = () => {
    list = [...entries.values()]
    for (const listener of listeners) listener()
  }
  return {
    register: (entry) => {
      entries.set(entry.groupId, entry)
      notify()
      return () => {
        if (entries.get(entry.groupId) === entry) {
          entries.delete(entry.groupId)
          notify()
        }
      }
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    get: (groupId) => entries.get(groupId) ?? null,
    entries: () => list,
    findAt: (client, current = null) => {
      const currentElement = current?.getElement() ?? null
      let best: { entry: CanvasEntry; depth: number } | null = null
      for (const entry of entries.values()) {
        const element = entry.getElement()
        if (!element || !entry.accepts()) continue
        const shift =
          currentElement && current && entry !== current
            ? measurePreviewShift(currentElement, current.getState(), element)
            : NO_SHIFT
        if (!containsPoint(element, client, shift)) continue
        let depth = 0
        for (let node = element.parentElement; node; node = node.parentElement) depth += 1
        if (!best || depth > best.depth) best = { entry, depth }
      }
      return best?.entry ?? null
    },
  }
}

export const CanvasRegistryContext = createContext<CanvasRegistry | null>(null)

export function useCanvasRegistry(): CanvasRegistry {
  const value = useContext(CanvasRegistryContext)
  if (!value) throw new Error('useCanvasRegistry must be used inside the studio')
  return value
}

/** Client-to-canvas coordinates for a registered canvas. */
export function toCanvasPoint(entry: CanvasEntry, client: GridPoint): GridPoint | null {
  const element = entry.getElement()
  if (!element) return null
  const rect = element.getBoundingClientRect()
  return { x: client.x - rect.left, y: client.y - rect.top }
}
