import type { GridItem, GridPoint } from '../core'
import type { GridStore } from './store'
import type { GridGestureApi, GridState } from './types'

/** One canvas registered in a `TransferScope`. `createGridController` builds this from its options. */
export type TransferRegistration = {
  /** Controller id; unique within the scope. */
  id: string
  /** The canvas element, when mounted. Used for hit-testing. */
  getElement: () => HTMLElement | null
  /** Whether `item`, dragged from the canvas `sourceId`, may be dropped here. */
  accepts: (item: GridItem, sourceId: string) => boolean
  gesture: GridGestureApi
  store: GridStore<GridState>
  /** Called on the source after a successful drop. */
  notifyTransferOut: (itemId: string, targetId: string) => void
  /** Called on the target after a successful drop. */
  notifyTransferIn: (item: GridItem, sourceId: string) => void
}

/**
 * Coordinates item moves between canvases. The pointer decides the target: the
 * deepest registered canvas under the pointer that accepts the item previews
 * the drop; releasing there commits it.
 */
export type TransferScope = {
  /** Add a canvas. Returns a function that removes it again. */
  register: (registration: TransferRegistration) => () => void
  /** Called by the source canvas on every pointer move during a drag (client coordinates). */
  track: (sourceId: string, itemId: string, client: GridPoint) => void
  /** Called by the source canvas on release. Returns `true` when a transfer happened. */
  drop: (sourceId: string) => boolean
  /** Abandon the current transfer session and clear any target preview. */
  cancel: () => void
}

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
 * How far a canvas' drop preview has moved the item that hosts `element`,
 * right now, in client pixels. A preview pushes neighbors aside, and one of
 * them may be another canvas that a drag is being hit-tested against (the
 * source it came from, or a candidate target). Testing the moving rect lets
 * that canvas win as it slides under the pointer, which clears the preview,
 * slides it back, and repeats. Subtract this displacement from the element's
 * rect to test against its resting position instead. Returns zero when
 * `element` is not inside `targetElement` or no preview is active.
 */
export function measurePreviewShift(
  targetElement: HTMLElement,
  state: Pick<GridState, 'layout' | 'preview'>,
  element: HTMLElement,
): GridPoint {
  if (!targetElement.contains(element) || !state.preview) return NO_SHIFT
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

function previewShift(target: TransferRegistration | null, element: HTMLElement): GridPoint {
  const targetElement = target?.getElement()
  if (!target || !targetElement) return NO_SHIFT
  return measurePreviewShift(targetElement, target.store.getSnapshot(), element)
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

/**
 * Create a `TransferScope`. Pass it to every `createGridController` whose
 * items may move between each other (option `scope`); the controllers register
 * themselves and unregister on `destroy()`.
 */
export function createTransferScope(): TransferScope {
  const registrations = new Map<string, TransferRegistration>()
  let session: TransferSession | null = null

  const clearTarget = () => {
    const current = session
    if (!current?.targetId) return
    registrations.get(current.targetId)?.gesture.clearIncoming()
    registrations.get(current.sourceId)?.gesture.setTransferring(false)
    current.targetId = null
  }

  const findTarget = (source: TransferRegistration, item: GridItem, client: GridPoint) => {
    const sourceElement = source.getElement()
    const current = session?.targetId ? (registrations.get(session.targetId) ?? null) : null
    const insideSource =
      !!sourceElement && containsPoint(sourceElement, client, previewShift(current, sourceElement))
    const candidates: Array<{ registration: TransferRegistration; area: number; depth: number }> =
      []
    for (const registration of registrations.values()) {
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
      registrations.set(registration.id, registration)
      return () => {
        registrations.delete(registration.id)
        if (session?.targetId === registration.id) clearTarget()
      }
    },
    track: (sourceId, itemId, client) => {
      const source = registrations.get(sourceId)
      if (!source) return
      if (!session || session.sourceId !== sourceId || session.itemId !== itemId) {
        session = { sourceId, itemId, targetId: null }
      }
      const current = session
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
      const sizeInTarget = sourceElement && element ? scaleSize(item, source, target) : item
      const preview = target.gesture.previewIncoming({ ...item, ...sizeInTarget }, local)
      if (preview) {
        current.targetId = target.id
        source.gesture.setTransferring(true)
      } else {
        clearTarget()
      }
    },
    drop: (sourceId) => {
      const current = session
      session = null
      if (!current || current.sourceId !== sourceId || !current.targetId) return false
      const source = registrations.get(current.sourceId)
      const target = registrations.get(current.targetId)
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
      session = null
    },
  }
}
