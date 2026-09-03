import '@gridla/demo-kit/tokens.css'
import '@gridla/demo-kit/demo.css'
import './style.css'

import { useState } from 'react'
import { createRoot } from 'react-dom/client'

import type { GridLayout } from 'gridla'
import { GridCanvas, GridProvider, useGridActions, type GridChangeDetail } from 'gridla/react'
import { dashboardLayout } from '@gridla/demo-kit'
import {
  Button,
  ControlGroup,
  DemoFrame,
  DemoItem,
  DemoPreview,
  Inspector,
  RangeField,
  ThemeSwitch,
  Toggle,
} from '@gridla/demo-kit/react'

// The Preact demo app. It is the React example rendered by Preact: `react`
// and `react-dom` are aliased to `preact/compat` in rsbuild.config.ts, and the
// code below imports from `gridla/react` unchanged. It drives the shared
// adapter contract tests (tests/e2e/specs/adapters.preact.e2e.ts).

type Data = { label: string }

function Toolbar({
  scrollable,
  setScrollable,
}: {
  scrollable: boolean
  setScrollable: (v: boolean) => void
}) {
  const actions = useGridActions<Data>()
  const [counter, setCounter] = useState(0)
  return (
    <ControlGroup title="Actions">
      <div className="gd-actions">
        <Button
          variant="primary"
          onClick={() => {
            const n = counter + 1
            setCounter(n)
            actions.place(
              { id: `new-${n}`, w: 220, h: 140, minW: 80, minH: 60, data: { label: `New ${n}` } },
              { pointer: { x: 480, y: 300 } },
            )
          }}
        >
          Add item
        </Button>
        <Button onClick={() => actions.setLayout(dashboardLayout())}>Reset</Button>
      </div>
      <Toggle label="Scrollable canvas" checked={scrollable} onChange={setScrollable} />
    </ControlGroup>
  )
}

function App() {
  const [layout, setLayout] = useState<GridLayout<Data>>(() => dashboardLayout())
  const [gap, setGap] = useState(12)
  const [snapDistance, setSnapDistance] = useState(24)
  const [scrollable, setScrollable] = useState(false)
  const [lastCommit, setLastCommit] = useState<GridChangeDetail | null>(null)
  const effective: GridLayout<Data> = scrollable
    ? { ...layout, canvas: { ...layout.canvas, heightMode: 'scrollable' } }
    : { ...layout, canvas: { ...layout.canvas, heightMode: 'bounded' } }

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1>Gridla with Preact</h1>
          <p>
            The React adapter running on <code>preact/compat</code>. <code>GridProvider</code> owns
            the layout, <code>GridCanvas</code> measures itself and handles pointer and keyboard
            input, and <code>GridItem</code> positions each child. Nothing in this page imports
            React itself.
          </p>
        </div>
        <ThemeSwitch />
      </header>
      <GridProvider<Data>
        layout={effective}
        onLayoutChange={setLayout}
        onCommit={setLastCommit}
        gap={gap}
        snapDistance={snapDistance}
      >
        <DemoFrame
          stageLabel="controlled · projected to the stage"
          stageStyle={{ height: 480 }}
          scrollable={scrollable}
          stage={
            <GridCanvas style={{ minHeight: '100%' }}>
              {layout.items.map((item) => (
                <DemoItem key={item.id} id={item.id} label={item.data?.label}>
                  {item.id === 'header'
                    ? 'fixed height · flexes horizontally'
                    : 'drag me · resize from the edges'}
                </DemoItem>
              ))}
              <DemoPreview />
            </GridCanvas>
          }
          controls={
            <>
              <ControlGroup title="Solver">
                <RangeField label="Gap" value={gap} min={0} max={32} step={2} onChange={setGap} />
                <RangeField
                  label="Snap distance"
                  value={snapDistance}
                  min={0}
                  max={64}
                  step={4}
                  onChange={setSnapDistance}
                />
              </ControlGroup>
              <Toolbar scrollable={scrollable} setScrollable={setScrollable} />
            </>
          }
          inspector={<Inspector />}
        />
      </GridProvider>
      <p className="page-note" data-testid="status">
        {layout.items.length} items · last strategy:{' '}
        {lastCommit ? `${lastCommit.strategy ?? 'none'} (${lastCommit.reason})` : 'none'}
      </p>
    </main>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />)
