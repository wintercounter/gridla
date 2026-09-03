import { useEffect, useMemo, useRef, useState } from 'react'

import type { GridLayout, TraceEvent } from 'gridla'
import {
  GridCanvas,
  GridItem,
  GridPreviewOutline,
  GridProvider,
  useGridInteractionState,
} from 'gridla/react'
import { tiledLayout } from '@gridla/demo-kit'
import {
  Button,
  ControlGroup,
  DemoFrame,
  Inspector,
  RangeField,
  Segmented,
} from '@gridla/demo-kit/react'

import { CodeExample } from '../lib/code'
import { useHashState } from '../lib/hash-state'

const SNIPPET = `import { GridProvider } from 'gridla/react'

// onTrace fires once per solve, synchronously, with the strategy that won.
// Stamp the pointer event on the way in to measure the solver's share.
let pointerAt = 0
<div onPointerMoveCapture={() => { pointerAt = performance.now() }}>
  <GridProvider
    layout={layout}
    onLayoutChange={setLayout}
    onTrace={(event) => samples.push({ ...event, ms: performance.now() - pointerAt })}
  >
    <GridCanvas>{items.map((item) => <GridItem key={item.id} id={item.id} positioning="transform" />)}</GridCanvas>
  </GridProvider>
</div>`

type Data = { label: string }

const DEFAULTS = { count: 200, columns: 20, positioning: 'transform', gap: 4 }

type Stats = { fps: number; last: number; avg: number; solves: number; strategy: string }

function Meter({ stats, live }: { stats: Stats; live: boolean }) {
  return (
    <div className="gl-meter" data-live={live ? '' : undefined} aria-live="off">
      <div>
        <b>{live ? stats.fps : '—'}</b>
        <span>fps while dragging</span>
      </div>
      <div>
        <b>{stats.last ? stats.last.toFixed(2) : '—'}</b>
        <span>last solve ms</span>
      </div>
      <div>
        <b>{stats.avg ? stats.avg.toFixed(2) : '—'}</b>
        <span>avg of last 60</span>
      </div>
    </div>
  )
}

function FpsProbe({ onFrame }: { onFrame: (fps: number, dragging: boolean) => void }) {
  const interaction = useGridInteractionState()
  const dragging = interaction !== null
  useEffect(() => {
    if (!dragging) {
      onFrame(0, false)
      return
    }
    let frames = 0
    let start = performance.now()
    let handle = 0
    const tick = (now: number) => {
      frames += 1
      if (now - start >= 500) {
        onFrame(Math.round((frames * 1000) / (now - start)), true)
        frames = 0
        start = now
      }
      handle = requestAnimationFrame(tick)
    }
    handle = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(handle)
  }, [dragging, onFrame])
  return null
}

export function ReactStressDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const initial = useMemo(
    () => tiledLayout(state.count, state.columns, state.gap),
    [state.count, state.columns, state.gap],
  )
  const [layout, setLayout] = useState<GridLayout<Data>>(initial)
  // Adjust state during render when the generated layout changes (count, columns, gap).
  const [seen, setSeen] = useState(initial)
  if (seen !== initial) {
    setSeen(initial)
    setLayout(initial)
  }

  const pointerAt = useRef(0)
  const samples = useRef<number[]>([])
  const [stats, setStats] = useState<Stats>({ fps: 0, last: 0, avg: 0, solves: 0, strategy: '—' })
  const [live, setLive] = useState(false)

  const onTrace = useMemo(
    () => (event: TraceEvent) => {
      const ms = performance.now() - pointerAt.current
      if (ms < 0 || ms > 1000) return
      const list = samples.current
      list.push(ms)
      if (list.length > 60) list.shift()
      const avg = list.reduce((sum, value) => sum + value, 0) / list.length
      setStats((previous) => ({
        ...previous,
        last: ms,
        avg,
        solves: previous.solves + 1,
        strategy: event.strategy,
      }))
    },
    [],
  )
  const onFrame = useMemo(
    () => (fps: number, dragging: boolean) => {
      setLive(dragging)
      if (dragging) setStats((previous) => ({ ...previous, fps }))
    },
    [],
  )

  return (
    <GridProvider<Data>
      layout={layout}
      onLayoutChange={setLayout}
      gap={state.gap}
      snapDistance={8}
      onTrace={onTrace}
    >
      <FpsProbe onFrame={onFrame} />
      <DemoFrame
        stageLabel={`${layout.items.length} items · drag one`}
        stageStyle={{ height: 600 }}
        stage={
          <div
            style={{ height: '100%' }}
            onPointerMoveCapture={() => {
              pointerAt.current = performance.now()
            }}
          >
            <GridCanvas
              aria-label={`Stress grid with ${layout.items.length} items`}
              style={{ minHeight: '100%' }}
            >
              {layout.items.map((item) => (
                <GridItem
                  key={item.id}
                  id={item.id}
                  className="gd-item"
                  positioning={state.positioning === 'absolute' ? 'absolute' : 'transform'}
                >
                  <div className="gl-item-dense">{item.id.replace('item-', '')}</div>
                </GridItem>
              ))}
              <GridPreviewOutline className="gd-preview" />
            </GridCanvas>
          </div>
        }
        controls={
          <>
            <ControlGroup title="Performance">
              <Meter stats={stats} live={live} />
              <dl className="gl-readout">
                <dt>solves</dt>
                <dd>{stats.solves}</dd>
                <dt>last strategy</dt>
                <dd data-accent>{stats.strategy}</dd>
              </dl>
            </ControlGroup>
            <ControlGroup title="Items">
              <RangeField
                label="Count"
                value={state.count}
                min={100}
                max={500}
                step={50}
                onChange={(count) => update({ count })}
              />
              <RangeField
                label="Columns"
                value={state.columns}
                min={5}
                max={40}
                step={1}
                onChange={(columns) => update({ columns })}
              />
              <RangeField
                label="Gap"
                value={state.gap}
                min={0}
                max={16}
                step={1}
                onChange={(gap) => update({ gap })}
              />
              <Segmented
                ariaLabel="Positioning"
                value={state.positioning}
                options={[
                  { value: 'transform', label: 'transform' },
                  { value: 'absolute', label: 'left/top' },
                ]}
                onChange={(positioning) => update({ positioning })}
              />
            </ControlGroup>
            <div className="gd-actions">
              <Button
                onClick={() => {
                  reset()
                  samples.current = []
                  setStats({ fps: 0, last: 0, avg: 0, solves: 0, strategy: '—' })
                  setLayout(initial)
                }}
              >
                Reset
              </Button>
            </div>
          </>
        }
        inspector={
          <>
            <Inspector />
            <CodeExample code={SNIPPET} />
          </>
        }
      />
    </GridProvider>
  )
}
