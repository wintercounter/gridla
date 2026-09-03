/**
 * Every group canvas registers here so panels outside the provider tree (the
 * palette, the inspector, the debug overlay) can reach its actions, and so a
 * palette drag can find the canvas under the pointer.
 */

import { createContext, useContext } from 'react'

import type { GridActions, GridContextValue, GridLayout, GridPoint } from 'gridla/react'

export type CanvasEntry = {
  groupId: string
  getElement: () => HTMLElement | null
  actions: GridActions
  gesture: GridContextValue['gesture']
  getLayout: () => GridLayout
  /** Fine-grained accept check for palette drops. */
  accepts: () => boolean
}

export type CanvasRegistry = {
  register: (entry: CanvasEntry) => () => void
  get: (groupId: string) => CanvasEntry | null
  entries: () => CanvasEntry[]
  /** The deepest accepting canvas under a client point. */
  findAt: (client: GridPoint) => CanvasEntry | null
}

function containsPoint(element: HTMLElement, client: GridPoint): boolean {
  const rect = element.getBoundingClientRect()
  return (
    client.x >= rect.left &&
    client.x <= rect.right &&
    client.y >= rect.top &&
    client.y <= rect.bottom
  )
}

export function createCanvasRegistry(): CanvasRegistry {
  const entries = new Map<string, CanvasEntry>()
  return {
    register: (entry) => {
      entries.set(entry.groupId, entry)
      return () => {
        if (entries.get(entry.groupId) === entry) entries.delete(entry.groupId)
      }
    },
    get: (groupId) => entries.get(groupId) ?? null,
    entries: () => [...entries.values()],
    findAt: (client) => {
      let best: { entry: CanvasEntry; depth: number } | null = null
      for (const entry of entries.values()) {
        const element = entry.getElement()
        if (!element || !containsPoint(element, client) || !entry.accepts()) continue
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
