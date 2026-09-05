import { useMemo, useRef, useState } from 'react'

import { createItem, type GridItem, type GridLayout } from 'gridla'
import { GridCanvas, GridProvider, GridTransferScope } from 'gridla/react'
import { canvas } from '@gridla/demo-kit'

import { CoreInspector } from '../lib/core-inspector'
import { Button, ControlGroup, DemoItem, DemoPreview, Toggle } from '@gridla/demo-kit/react'

import { CodeExample } from '../lib/code'
import { useHashState } from '../lib/hash-state'

const SNIPPET = `import { GridProvider, GridCanvas, GridTransferScope } from 'gridla/react'

// Providers are isolated by default: an item can never leave its canvas.
<GridProvider layout={a} onLayoutChange={setA}><GridCanvas /></GridProvider>
<GridProvider layout={b} onLayoutChange={setB}><GridCanvas /></GridProvider>

// Wrap providers in a GridTransferScope and drags can cross between them.
<GridTransferScope>
  <GridProvider layout={c} onLayoutChange={setC} onTransferOut={(id, to) => log(id, 'to', to)}>
    <GridCanvas />
  </GridProvider>
  <GridProvider layout={d} onLayoutChange={setD} acceptTransfers={(item) => item.w < 400} onTransferIn={(item, from) => log(item.id, 'from', from)}>
    <GridCanvas />
  </GridProvider>
</GridTransferScope>`

type Data = { label: string }

const DEFAULTS = { acceptC: true, acceptD: true }

function build(prefix: string, count: number): GridLayout<Data> {
  const c = canvas(480, 300, 12)
  const w = (456 - 12) / 2
  const items = Array.from({ length: count }, (_, index) =>
    createItem(
      `${prefix}-${index + 1}`,
      { w, h: 120, minW: 60, minH: 50 },
      12 + (index % 2) * (w + 12),
      12 + Math.floor(index / 2) * 132,
      {
        label: `${prefix.toUpperCase()} ${index + 1}`,
      },
    ),
  )
  return { canvas: c, items }
}

function Board({
  layout,
  onChange,
  label,
  accept,
  onLog,
}: {
  layout: GridLayout<Data>
  onChange: (layout: GridLayout<Data>) => void
  label: string
  accept?: boolean
  onLog?: (line: string) => void
}) {
  return (
    <GridProvider<Data>
      layout={layout}
      onLayoutChange={onChange}
      gap={12}
      acceptTransfers={accept ?? true}
      onTransferOut={
        onLog
          ? (itemId, targetId) => onLog(`${itemId} left ${label} for provider ${targetId}`)
          : undefined
      }
      onTransferIn={
        onLog
          ? (item: GridItem<Data>, sourceId) =>
              onLog(`${item.id} arrived in ${label} from provider ${sourceId}`)
          : undefined
      }
    >
      <div className="gl-pane">
        <div className="gl-pane-head">
          <h3>{label}</h3>
          <b>{accept === false ? 'rejects drops' : 'accepts drops'}</b>
        </div>
        <div className="gd-stage" style={{ height: 300 }}>
          <GridCanvas aria-label={label} style={{ height: '100%' }}>
            {layout.items.map((item) => (
              <DemoItem key={item.id} id={item.id} label={item.data?.label} />
            ))}
            <DemoPreview />
          </GridCanvas>
        </div>
      </div>
    </GridProvider>
  )
}

export function ReactMultiGridDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const initial = useMemo(
    () => ({ a: build('a', 3), b: build('b', 2), c: build('c', 3), d: build('d', 2) }),
    [],
  )
  const [a, setA] = useState(initial.a)
  const [b, setB] = useState(initial.b)
  const [c, setC] = useState(initial.c)
  const [d, setD] = useState(initial.d)
  const [log, setLog] = useState<{ seq: number; line: string }[]>([])
  const seq = useRef(0)
  const push = (line: string) =>
    setLog((list) => [{ seq: (seq.current += 1), line }, ...list].slice(0, 6))

  return (
    <div className="gd-frame">
      <div className="gl-compare-wrap">
        <h2 className="gl-section-title">Isolated providers</h2>
        <p className="gl-intro">
          Two separate providers. Drag an item toward the other canvas: it stays home.
        </p>
        <div className="gd-compare">
          <Board layout={a} onChange={setA} label="Grid A" />
          <Board layout={b} onChange={setB} label="Grid B" />
        </div>
        <h2 className="gl-section-title">Shared GridTransferScope</h2>
        <p className="gl-intro">
          Same providers inside one scope. Drag an item across the boundary to transfer it.
        </p>
        <GridTransferScope>
          <div className="gd-compare">
            <Board layout={c} onChange={setC} label="Grid C" accept={state.acceptC} onLog={push} />
            <Board layout={d} onChange={setD} label="Grid D" accept={state.acceptD} onLog={push} />
          </div>
        </GridTransferScope>
      </div>
      <aside className="gd-controls">
        <ControlGroup title="Scope boundaries">
          <Toggle
            label="Grid C accepts drops"
            checked={state.acceptC}
            onChange={(acceptC) => update({ acceptC })}
          />
          <Toggle
            label="Grid D accepts drops"
            checked={state.acceptD}
            onChange={(acceptD) => update({ acceptD })}
          />
        </ControlGroup>
        <ControlGroup title="Transfer log">
          <ol className="gl-legend" aria-live="polite">
            {log.length === 0 ? (
              <li>No transfers yet.</li>
            ) : (
              log.map((entry) => <li key={entry.seq}>{entry.line}</li>)
            )}
          </ol>
        </ControlGroup>
        <div className="gd-actions">
          <Button
            onClick={() => {
              reset()
              setA(initial.a)
              setB(initial.b)
              setC(initial.c)
              setD(initial.d)
              setLog([])
            }}
          >
            Reset
          </Button>
        </div>
      </aside>
      <CoreInspector layout={c} title="Grid C layout data" />
      <CoreInspector layout={d} title="Grid D layout data" />
      <CodeExample code={SNIPPET} />
    </div>
  )
}
