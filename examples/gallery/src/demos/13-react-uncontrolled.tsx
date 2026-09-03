import { useEffect, useMemo, useRef, useState } from 'react'

import { applyGap, type GridLayout } from 'gridla'
import {
  GridCanvas,
  GridProvider,
  useGridActions,
  useGridLayout,
  useGridSourceLayout,
  type GridChangeDetail,
} from 'gridla/react'
import { dashboardLayout } from '@gridla/demo-kit'
import {
  Button,
  ControlGroup,
  DemoFrame,
  DemoItem,
  DemoPreview,
  Inspector,
  RangeField,
  Toggle,
} from '@gridla/demo-kit/react'

import { CodeExample } from '../lib/code'
import { useHashState } from '../lib/hash-state'

const SNIPPET = `import { GridProvider, GridCanvas, GridItem } from 'gridla/react'

// Uncontrolled: the provider owns the layout. You only observe changes.
export function Board() {
  return (
    <GridProvider defaultLayout={initialLayout} gap={12} onLayoutChange={(layout, detail) => console.log(detail.reason, detail.strategy)}>
      <GridCanvas style={{ height: 480 }}>
        {initialLayout.items.map((item) => (
          <GridItem key={item.id} id={item.id} resizeEdges={['e', 's', 'se']}>{item.id}</GridItem>
        ))}
      </GridCanvas>
    </GridProvider>
  )
}`

type Data = { label: string }
type Change = { seq: number; at: string; reason: string; itemId?: string; strategy?: string }

const DEFAULTS = { gap: 12, snapDistance: 24, responsive: true }

function Toolbar({ onReset, initial }: { onReset: () => void; initial: GridLayout<Data> }) {
  const actions = useGridActions<Data>()
  const [counter, setCounter] = useState(0)
  return (
    <div className="gd-actions">
      <Button
        variant="primary"
        onClick={() => {
          const n = counter + 1
          setCounter(n)
          actions.place(
            { id: `note-${n}`, w: 220, h: 140, minW: 80, minH: 60, data: { label: `Note ${n}` } },
            { pointer: { x: 480, y: 300 } },
          )
        }}
      >
        Add item
      </Button>
      <Button
        onClick={() => {
          actions.setLayout(initial)
          onReset()
        }}
      >
        Reset
      </Button>
    </div>
  )
}

/** Reads the live layout from the provider so newly placed items render too. */
function Items() {
  const layout = useLayoutIds()
  return (
    <>
      {layout.map((entry) => (
        <DemoItem key={entry.id} id={entry.id} label={entry.label}>
          {entry.id === 'header'
            ? 'fixed height · flexes horizontally'
            : 'drag · resize from the edges'}
        </DemoItem>
      ))}
      <DemoPreview />
    </>
  )
}

/**
 * The provider owns the layout here, so a gap change re-spaces it through
 * `actions.setLayout` (reported as a `set` change) instead of local state.
 */
function GapSync({ gap }: { gap: number }) {
  const actions = useGridActions<Data>()
  const source = useGridSourceLayout<Data>()
  const sourceRef = useRef(source)
  const applied = useRef(gap)
  useEffect(() => {
    sourceRef.current = source
  }, [source])
  useEffect(() => {
    if (applied.current === gap) return
    applied.current = gap
    actions.setLayout(applyGap(sourceRef.current, gap))
  }, [gap, actions])
  return null
}

function useLayoutIds() {
  const layout = useGridLayout<Data>()
  return layout.items.map((item) => ({ id: item.id, label: item.data?.label }))
}

export function ReactUncontrolledDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const initial = useMemo(() => dashboardLayout(12), [])
  const [changes, setChanges] = useState<Change[]>([])
  const seq = useRef(0)
  const record = (_layout: GridLayout<Data>, detail: GridChangeDetail) =>
    setChanges((list) =>
      [
        {
          seq: (seq.current += 1),
          at: new Date().toLocaleTimeString(),
          reason: detail.reason,
          itemId: detail.itemId,
          strategy: detail.strategy,
        },
        ...list,
      ].slice(0, 8),
    )

  return (
    <GridProvider<Data>
      defaultLayout={initial}
      gap={state.gap}
      snapDistance={state.snapDistance}
      responsive={state.responsive}
      onLayoutChange={record}
    >
      <GapSync gap={state.gap} />
      <DemoFrame
        stageLabel="uncontrolled · defaultLayout"
        stageStyle={{ height: 480 }}
        scrollable={!state.responsive}
        stage={
          <GridCanvas aria-label="Uncontrolled dashboard" style={{ minHeight: '100%' }}>
            <Items />
          </GridCanvas>
        }
        controls={
          <>
            <ControlGroup title="Provider props">
              <RangeField
                label="gap"
                value={state.gap}
                min={0}
                max={32}
                step={2}
                onChange={(gap) => update({ gap })}
              />
              <RangeField
                label="snapDistance"
                value={state.snapDistance}
                min={0}
                max={64}
                step={4}
                onChange={(snapDistance) => update({ snapDistance })}
              />
              <Toggle
                label="responsive (project to canvas size)"
                checked={state.responsive}
                onChange={(responsive) => update({ responsive })}
              />
            </ControlGroup>
            <ControlGroup title="Actions">
              <Toolbar
                initial={initial}
                onReset={() => {
                  reset()
                  setChanges([])
                }}
              />
            </ControlGroup>
            <ControlGroup title="onLayoutChange">
              <ol className="gl-legend" aria-live="polite">
                {changes.length === 0 ? <li>No changes yet. Drag something.</li> : null}
                {changes.map((change) => (
                  <li key={change.seq}>
                    <code>{change.reason}</code> {change.itemId ?? ''}{' '}
                    {change.strategy ? <code>{change.strategy}</code> : null}
                  </li>
                ))}
              </ol>
            </ControlGroup>
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
