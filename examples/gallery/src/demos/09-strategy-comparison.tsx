import { useEffect, useMemo, useRef, useState } from 'react'

import { createItem, moveItem, type GridLayout, type GridPoint, type SolveStrategy } from 'gridla'
import { canvas, formatLayout } from '@gridla/demo-kit'
import { Button, ControlGroup, RangeField, Toggle } from '@gridla/demo-kit/react'

import { CodeExample } from '../lib/code'
import { CoreStage } from '../lib/core-stage'
import { useHashState } from '../lib/hash-state'
import { useMediaQuery } from '../lib/route'

const SNIPPET = `import { moveItem } from 'gridla'

// The solver picks the strategy from the geometry: there is no mode switch.
// Room below the target       -> push-y / push-down
// Sibling of the same size    -> swap
// Row of equal items          -> reorder-row
// No room to push, minH slack -> push-shrink-y / shrink-neighbor
const result = moveItem({ layout, itemId: 'card', position, options: { gap: 8 } })
result.strategy // one of the names above, or 'rejected'`

type Data = { label: string }

type Scenario = {
  id: string
  title: string
  hint: string
  layout: GridLayout<Data>
  itemId: string
  to: GridPoint
}

const locked = (item: GridLayout<Data>['items'][number]) => ({
  ...item,
  policy: { movement: 'locked' as const },
})

// Each canvas is shaped so that only one strategy can succeed. Verified
// against the solver at every step of the scripted move. `PAD` is canvas
// padding: it keeps tiles off the stage edges without changing the inner geometry.
const PAD = 12

const SCENARIOS: Scenario[] = [
  {
    id: 'push',
    title: 'Push',
    hint: 'Room below and none beside: the sibling is pushed down.',
    layout: {
      canvas: canvas(200 + PAD * 2, 336 + PAD * 2, PAD),
      items: [
        createItem('card', { w: 200, h: 100, minH: 40 }, PAD, PAD, { label: 'Card' }),
        createItem('panel', { w: 200, h: 100, minH: 40 }, PAD, PAD + 108, { label: 'Panel' }),
      ],
    },
    itemId: 'card',
    to: { x: PAD, y: PAD + 108 },
  },
  {
    id: 'swap',
    title: 'Swap',
    hint: 'A locked footer leaves no room to push: the two trade places.',
    layout: {
      canvas: canvas(200 + PAD * 2, 336 + PAD * 2, PAD),
      items: [
        createItem('card', { w: 200, h: 100, minH: 40 }, PAD, PAD, { label: 'Card' }),
        createItem('panel', { w: 200, h: 100, minH: 40 }, PAD, PAD + 108, { label: 'Panel' }),
        locked(
          createItem('footer', { w: 200, h: 120 }, PAD, PAD + 216, { label: 'Footer · locked' }),
        ),
      ],
    },
    itemId: 'card',
    to: { x: PAD, y: PAD + 100 },
  },
  {
    id: 'reorder',
    title: 'Reorder',
    hint: 'Equal tiles in a full row: the row reorders around the card.',
    layout: {
      canvas: canvas(376 + PAD * 2, 336 + PAD * 2, PAD),
      items: [
        createItem('card', { w: 120, h: 100, minH: 40 }, PAD, PAD, { label: 'Card' }),
        createItem('tile-2', { w: 120, h: 100, minH: 40 }, PAD + 128, PAD, { label: 'Tile 2' }),
        createItem('tile-3', { w: 120, h: 100, minH: 40 }, PAD + 256, PAD, { label: 'Tile 3' }),
        locked(
          createItem('footer', { w: 376, h: 216 }, PAD, PAD + 120, { label: 'Footer · locked' }),
        ),
      ],
    },
    itemId: 'card',
    to: { x: PAD + 196, y: PAD },
  },
  {
    id: 'shrink',
    title: 'Shrink',
    hint: 'Nowhere to push and no swap fits: the neighbor shrinks toward minH.',
    layout: {
      canvas: canvas(200 + PAD * 2, 336 + PAD * 2, PAD),
      items: [
        createItem('panel', { w: 200, h: 100, minH: 40 }, PAD, PAD, { label: 'Panel · minH 40' }),
        createItem('card', { w: 200, h: 220, minH: 60 }, PAD, PAD + 108, { label: 'Card' }),
      ],
    },
    itemId: 'card',
    to: { x: PAD, y: PAD + 52 },
  },
]

const DEFAULTS = { speed: 1, loop: true }

function ease(t: number) {
  return 1 - Math.pow(1 - t, 5)
}

type Solved = { layout: GridLayout<Data>; strategy: SolveStrategy | null }

function solveAt(scenario: Scenario, t: number): Solved {
  const { layout: base, itemId, to } = scenario
  const from = base.items.find((item) => item.id === itemId) as GridLayout<Data>['items'][number]
  if (t <= 0) return { layout: base, strategy: null }
  const k = ease(Math.min(1, t))
  const result = moveItem({
    layout: base,
    itemId,
    position: { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k },
    options: { gap: 8, snapDistance: 8 },
  })
  return { layout: result.accepted ? result.layout : base, strategy: result.strategy }
}

function Pane({ scenario, shown }: { scenario: Scenario; shown: Solved }) {
  return (
    <div className="gl-pane">
      <div className="gl-pane-head">
        <h3>{scenario.title}</h3>
        <b aria-live="polite">{shown.strategy ?? 'origin'}</b>
      </div>
      <CoreStage layout={shown.layout} ariaLabel={`${scenario.title} scenario: ${scenario.hint}`} />
      <p className="gl-pane-hint">{scenario.hint}</p>
    </div>
  )
}

export function StrategyComparisonDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [playing, setPlaying] = useState(!reduced)
  const [t, setT] = useState(0)
  const solved = useMemo(() => SCENARIOS.map((scenario) => solveAt(scenario, t)), [t])
  const frame = useRef<number | null>(null)
  const clock = useRef<{ start: number; phase: 'move' | 'hold' | 'rest' }>({
    start: 0,
    phase: 'move',
  })

  useEffect(() => {
    if (!playing) return
    const durations = { move: 1800 / state.speed, hold: 900, rest: 500 }
    clock.current = { start: performance.now(), phase: 'move' }
    const tick = (now: number) => {
      const { start, phase } = clock.current
      const elapsed = now - start
      if (phase === 'move') {
        setT(Math.min(1, elapsed / durations.move))
        if (elapsed >= durations.move) clock.current = { start: now, phase: 'hold' }
      } else if (phase === 'hold') {
        if (elapsed >= durations.hold) {
          setT(0)
          clock.current = { start: now, phase: 'rest' }
        }
      } else if (elapsed >= durations.rest) {
        if (!state.loop) {
          setPlaying(false)
          return
        }
        clock.current = { start: now, phase: 'move' }
      }
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    }
  }, [playing, state.speed, state.loop])

  return (
    <div className="gd-frame">
      <div className="gl-compare-wrap">
        <div className="gd-compare">
          {SCENARIOS.map((scenario, index) => (
            <Pane key={scenario.id} scenario={scenario} shown={solved[index] as Solved} />
          ))}
        </div>
      </div>
      <aside className="gd-controls">
        <ControlGroup title="Playback">
          <div className="gd-actions">
            <Button variant="primary" onClick={() => setPlaying((p) => !p)}>
              {playing ? 'Pause' : 'Play'}
            </Button>
            <Button
              onClick={() => {
                setPlaying(false)
                setT(0)
              }}
            >
              Rewind
            </Button>
          </div>
          <RangeField
            label="Scrub"
            value={Math.round(t * 100)}
            min={0}
            max={100}
            step={1}
            onChange={(value) => {
              setPlaying(false)
              setT(value / 100)
            }}
            format={(v) => `${v}%`}
          />
          <RangeField
            label="Speed"
            value={state.speed}
            min={0.25}
            max={3}
            step={0.25}
            onChange={(speed) => update({ speed })}
            format={(v) => `${v}×`}
          />
          <Toggle label="Loop" checked={state.loop} onChange={(loop) => update({ loop })} />
        </ControlGroup>
        <div className="gd-actions">
          <Button
            onClick={() => {
              reset()
              setPlaying(!reduced)
              setT(0)
            }}
          >
            Reset
          </Button>
        </div>
        {reduced ? (
          <p className="gl-note">
            Reduced motion is on, so playback starts paused. Use the scrub slider.
          </p>
        ) : null}
      </aside>
      <div className="gd-inspector">
        <div className="gd-inspector-bar">
          <span>
            progress <b>{Math.round(t * 100)}%</b>
          </span>
          {SCENARIOS.map((scenario, index) => (
            <span key={scenario.id}>
              {scenario.title.toLowerCase()}{' '}
              <b data-strategy>{solved[index]?.strategy ?? 'origin'}</b>
            </span>
          ))}
        </div>
        <details>
          <summary>Layout data for all four scenarios</summary>
          <pre>
            {SCENARIOS.map(
              (scenario, index) =>
                `// ${scenario.title}\n${formatLayout(solved[index]?.layout ?? scenario.layout)}`,
            ).join('\n\n')}
          </pre>
        </details>
      </div>
      <CodeExample code={SNIPPET} />
    </div>
  )
}
