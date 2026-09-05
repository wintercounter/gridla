import { useMemo, useRef, type ReactNode } from 'react'

import type { GridItem, GridPoint } from '../core'
import {
  TransferScopeContext,
  type TransferRegistration,
  type TransferScopeValue,
} from './transfer-context'

type TransferSession = {
  sourceId: string
  itemId: string
  targetId: string | null
}

function pointToCanvas(element: HTMLElement, client: GridPoint): GridPoint {
  const rect = element.getBoundingClientRect()
  return { x: client.x - rect.left, y: client.y - rect.top }
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

/**
 * How far the current target's preview has moved the item that hosts
 * `element`, right now. A drop preview pushes neighbors aside, and one of
 * them may be the canvas the drag came from (or another candidate). Hit-testing
 * the moving rect would let that canvas reclaim the pointer as it slides
 * under it, clear the preview, slide back, and reclaim again. Comparing
 * against the resting rect keeps the target stable until the pointer really
 * moves elsewhere.
 */
function previewShift(target: TransferRegistration | null, element: HTMLElement): GridPoint {
  const targetElement = target?.getElement()
  if (!target || !targetElement || !targetElement.contains(element)) return NO_SHIFT
  const state = target.store.getSnapshot()
  if (!state.preview) return NO_SHIFT
  // The target's own child item that contains `element`.
  let host: HTMLElement | null = element.closest('[data-gridla-item]')
  while (host && host.parentElement?.closest('[data-gridla-canvas]') !== targetElement) {
    host = host.parentElement?.closest('[data-gridla-item]') ?? null
  }
  const hostId = host?.getAttribute('data-gridla-item')
  const base = hostId ? state.layout.items.find((item) => item.id === hostId) : undefined
  if (!host || !base) return NO_SHIFT
  const canvasRect = targetElement.getBoundingClientRect()
  const scaleX = canvasRect.width / Math.max(1, state.layout.canvas.width)
  const scaleY = canvasRect.height / Math.max(1, state.layout.canvas.height)
  const hostRect = host.getBoundingClientRect()
  return {
    x: hostRect.left - (canvasRect.left + base.x * scaleX),
    y: hostRect.top - (canvasRect.top + base.y * scaleY),
  }
}

/**
 * Lets items move between every `GridProvider` rendered inside it. The
 * pointer decides the target: the deepest registered canvas under the pointer
 * that accepts the item previews the drop; releasing there commits it.
 */
export function GridTransferScope({ children }: { children?: ReactNode }) {
  const registrations = useRef(new Map<string, TransferRegistration>())
  const session = useRef<TransferSession | null>(null)

  const value = useMemo<TransferScopeValue>(() => {
    const clearTarget = () => {
      const current = session.current
      if (!current?.targetId) return
      registrations.current.get(current.targetId)?.gesture.clearIncoming()
      registrations.current.get(current.sourceId)?.gesture.setTransferring(false)
      current.targetId = null
    }

    const findTarget = (source: TransferRegistration, item: GridItem, client: GridPoint) => {
      const sourceElement = source.getElement()
      const current = session.current?.targetId
        ? (registrations.current.get(session.current.targetId) ?? null)
        : null
      const insideSource =
        !!sourceElement &&
        containsPoint(sourceElement, client, previewShift(current, sourceElement))
      const candidates: Array<{ registration: TransferRegistration; area: number; depth: number }> =
        []
      for (const registration of registrations.current.values()) {
        if (registration.id === source.id) continue
        const element = registration.getElement()
        if (!element || !containsPoint(element, client, previewShift(current, element))) continue
        if (!registration.accepts(item, source.id)) continue
        // Only descendants of the source may win while the pointer is still
        // inside the source; siblings and ancestors wait until it leaves.
        if (sourceElement && insideSource && !sourceElement.contains(element)) continue
        const rect = element.getBoundingClientRect()
        let depth = 0
        for (let node = element.parentElement; node; node = node.parentElement) depth += 1
        candidates.push({ registration, area: rect.width * rect.height, depth })
      }
      candidates.sort((a, b) => b.depth - a.depth || a.area - b.area)
      return candidates[0]?.registration ?? null
    }

    return {
      register: (registration) => {
        registrations.current.set(registration.id, registration)
        return () => {
          registrations.current.delete(registration.id)
          if (session.current?.targetId === registration.id) clearTarget()
        }
      },
      track: (sourceId, itemId, client) => {
        const source = registrations.current.get(sourceId)
        if (!source) return
        if (
          !session.current ||
          session.current.sourceId !== sourceId ||
          session.current.itemId !== itemId
        ) {
          session.current = { sourceId, itemId, targetId: null }
        }
        const current = session.current
        const item = source.store.getSnapshot().layout.items.find((entry) => entry.id === itemId)
        if (!item) return
        const target = findTarget(source, item, client)
        if (!target) {
          clearTarget()
          return
        }
        if (current.targetId && current.targetId !== target.id) clearTarget()
        const element = target.getElement()
        if (!element) return
        const local = pointToCanvas(element, client)
        const sourceElement = source.getElement()
        const targetElement = target.getElement()
        const sizeInTarget = sourceElement && targetElement ? scaleSize(item, source, target) : item
        const preview = target.gesture.previewIncoming({ ...item, ...sizeInTarget }, local)
        if (preview) {
          current.targetId = target.id
          source.gesture.setTransferring(true)
        } else {
          clearTarget()
        }
      },
      drop: (sourceId) => {
        const current = session.current
        session.current = null
        if (!current || current.sourceId !== sourceId || !current.targetId) return false
        const source = registrations.current.get(current.sourceId)
        const target = registrations.current.get(current.targetId)
        if (!source || !target) return false
        const item = source.store
          .getSnapshot()
          .layout.items.find((entry) => entry.id === current.itemId)
        const committed = target.gesture.commitIncoming()
        if (!committed || !item) {
          source.gesture.setTransferring(false)
          return false
        }
        source.gesture.completeOutgoing(current.itemId)
        source.notifyTransferOut(current.itemId, target.id)
        const placed = committed.items.find((entry) => entry.id === current.itemId) ?? item
        target.notifyTransferIn(placed, source.id)
        return true
      },
      cancel: () => {
        clearTarget()
        session.current = null
      },
    }
  }, [])

  return <TransferScopeContext.Provider value={value}>{children}</TransferScopeContext.Provider>
}

/**
 * Keep the item's on-screen size when it crosses canvases with different
 * scales: convert source canvas units to target canvas units through pixels.
 */
function scaleSize(item: GridItem, source: TransferRegistration, target: TransferRegistration) {
  const sourceLayout = source.store.getSnapshot().layout
  const targetLayout = target.store.getSnapshot().layout
  const sourceElement = source.getElement()
  const targetElement = target.getElement()
  if (!sourceElement || !targetElement) return { w: item.w, h: item.h }
  const sourceRect = sourceElement.getBoundingClientRect()
  const targetRect = targetElement.getBoundingClientRect()
  const sourcePxPerUnitX = sourceRect.width / Math.max(1, sourceLayout.canvas.width)
  const sourcePxPerUnitY = sourceRect.height / Math.max(1, sourceLayout.canvas.height)
  const targetPxPerUnitX = targetRect.width / Math.max(1, targetLayout.canvas.width)
  const targetPxPerUnitY = targetRect.height / Math.max(1, targetLayout.canvas.height)
  return {
    w: (item.w * sourcePxPerUnitX) / Math.max(1e-6, targetPxPerUnitX),
    h: (item.h * sourcePxPerUnitY) / Math.max(1e-6, targetPxPerUnitY),
  }
}
