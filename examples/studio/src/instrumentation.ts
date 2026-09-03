/**
 * Performance instrumentation for the debug overlay. A tiny external store so
 * canvases can report without re-rendering anything unless the overlay is on.
 */

import { useSyncExternalStore } from 'react'

import type { SolveStrategy, TraceEvent } from 'gridla'
import type { GridChangeDetail } from 'gridla/react'

export type PerfSnapshot = {
  lastStrategy: SolveStrategy | null
  lastOperation: TraceEvent['operation'] | GridChangeDetail['reason'] | null
  lastItemId: string | null
  lastAccepted: boolean
  traceCount: number
  /** Time spent inside pointer-move handlers (solver + store update), ms. */
  lastMoveMs: number
  maxMoveMs: number
  commits: number
  /** Bumped whenever render counts change so subscribers refresh. */
  version: number
}

type Listener = () => void

const renderCounts = new Map<string, number>()
const listeners = new Set<Listener>()
let snapshot: PerfSnapshot = {
  lastStrategy: null,
  lastOperation: null,
  lastItemId: null,
  lastAccepted: true,
  traceCount: 0,
  lastMoveMs: 0,
  maxMoveMs: 0,
  commits: 0,
  version: 0,
}
let enabled = false
let scheduled = false

function emit() {
  if (!enabled || scheduled) return
  scheduled = true
  requestAnimationFrame(() => {
    scheduled = false
    for (const listener of listeners) listener()
  })
}

function patch(next: Partial<PerfSnapshot>) {
  snapshot = { ...snapshot, ...next, version: snapshot.version + 1 }
  emit()
}

export const perf = {
  trace(event: TraceEvent) {
    patch({
      lastStrategy: event.strategy,
      lastOperation: event.operation,
      lastItemId: event.itemId,
      lastAccepted: event.accepted,
      traceCount: snapshot.traceCount + 1,
    })
  },
  commit(detail: GridChangeDetail) {
    patch({
      lastStrategy: detail.strategy ?? snapshot.lastStrategy,
      lastOperation: detail.reason,
      lastItemId: detail.itemId ?? snapshot.lastItemId,
      lastAccepted: true,
      commits: snapshot.commits + 1,
    })
  },
  moveHandler(ms: number) {
    patch({ lastMoveMs: ms, maxMoveMs: Math.max(snapshot.maxMoveMs, ms) })
  },
  countRender(id: string) {
    renderCounts.set(id, (renderCounts.get(id) ?? 0) + 1)
    if (enabled) patch({})
  },
  renders(id: string | null): number {
    return id ? (renderCounts.get(id) ?? 0) : 0
  },
  resetMax() {
    patch({ maxMoveMs: 0 })
  },
  setEnabled(next: boolean) {
    enabled = next
  },
  subscribe(listener: Listener) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  getSnapshot: () => snapshot,
}

export function usePerf(): PerfSnapshot {
  return useSyncExternalStore(perf.subscribe, perf.getSnapshot, perf.getSnapshot)
}

/** Stable trace callback for every provider. */
export const traceCallback = (event: TraceEvent) => perf.trace(event)

/**
 * Measure how long the React pointer-move handlers take. The capture listener
 * runs before React's root listener and the bubble listener after it, so the
 * difference is the solver plus the store update for that move.
 */
export function installMoveTimer(): () => void {
  let started = 0
  let active = false
  const start = () => {
    active = document.documentElement.hasAttribute('data-gridla-dragging')
    if (active) started = performance.now()
  }
  const end = () => {
    if (!active) return
    perf.moveHandler(performance.now() - started)
  }
  document.addEventListener('pointermove', start, true)
  document.addEventListener('pointermove', end, false)
  return () => {
    document.removeEventListener('pointermove', start, true)
    document.removeEventListener('pointermove', end, false)
  }
}
