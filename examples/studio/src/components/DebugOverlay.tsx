/**
 * Debug overlay: last solver strategy, handler time, render count for the
 * selected item, and the measured size of every canvas.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'

import { useCanvasRegistry } from '../canvas-registry'
import { findNode } from '../document'
import { installMoveTimer, perf, usePerf } from '../instrumentation'
import { selectionInfo, useStudio } from '../store'

export function DebugOverlay() {
  const { state } = useStudio()
  const registry = useCanvasRegistry()
  const snapshot = usePerf()
  const [tick, setTick] = useState(0)
  const entries = useSyncExternalStore(registry.subscribe, registry.entries, () => [])

  useEffect(() => {
    perf.setEnabled(true)
    const stop = installMoveTimer()
    const timer = window.setInterval(() => setTick((value) => value + 1), 500)
    return () => {
      perf.setEnabled(false)
      stop()
      window.clearInterval(timer)
    }
  }, [])

  const { primaryId } = selectionInfo(state)
  const renders = perf.renders(primaryId)
  void tick

  return (
    <aside className="st-debug" aria-label="Debug overlay">
      <div className="st-debug-row">
        <span>strategy</span>
        <b data-strategy>{snapshot.lastStrategy ?? '—'}</b>
      </div>
      <div className="st-debug-row">
        <span>last op</span>
        <b>
          {snapshot.lastOperation ?? '—'}
          {snapshot.lastItemId ? ` · ${snapshot.lastItemId}` : ''}
          {snapshot.lastAccepted ? '' : ' · rejected'}
        </b>
      </div>
      <div className="st-debug-row">
        <span>move handler</span>
        <b>
          {snapshot.lastMoveMs.toFixed(2)} ms · max {snapshot.maxMoveMs.toFixed(2)} ms
        </b>
        <button type="button" className="st-debug-reset" onClick={() => perf.resetMax()}>
          reset
        </button>
      </div>
      <div className="st-debug-row">
        <span>solves · commits</span>
        <b>
          {snapshot.traceCount} · {snapshot.commits}
        </b>
      </div>
      <div className="st-debug-row">
        <span>selected renders</span>
        <b>{primaryId ? `${renders} · ${primaryId}` : '—'}</b>
      </div>
      <div className="st-debug-row st-debug-canvases">
        <span>canvases</span>
        <ul>
          {entries.map((entry) => {
            const element = entry.getElement()
            const rect = element?.getBoundingClientRect()
            const layout = entry.getLayout()
            const node = findNode(state.doc.root, entry.groupId)?.node
            return (
              <li key={entry.groupId}>
                <span>
                  {entry.groupId === 'root' ? 'page' : String(node?.props.title ?? entry.groupId)}
                </span>
                <b>
                  {rect ? `${Math.round(rect.width)}×${Math.round(rect.height)}` : '—'} px ·{' '}
                  {layout.items.length} items · {layout.canvas.width}×{layout.canvas.height}
                </b>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}
