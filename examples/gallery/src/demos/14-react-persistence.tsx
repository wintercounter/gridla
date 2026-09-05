import { useEffect, useMemo, useRef, useState } from 'react'

import { findLayoutViolations, normalizeLayout, type GridLayout } from 'gridla'
import { GridCanvas, GridProvider, type GridChangeDetail } from 'gridla/react'
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

const KEY = 'my-board'

export function Board() {
  const [layout, setLayout] = useState(() => {
    const stored = localStorage.getItem(KEY)
    return stored ? JSON.parse(stored) : initialLayout
  })

  // Controlled: every accepted change comes back through onLayoutChange with a reason.
  const handleChange = (next, detail) => {
    setLayout(next)
    if (detail.reason !== 'set') localStorage.setItem(KEY, JSON.stringify(next))
  }

  return (
    <GridProvider layout={layout} onLayoutChange={handleChange} gap={12}>
      <GridCanvas style={{ height: 480 }}>
        {layout.items.map((item) => <GridItem key={item.id} id={item.id}>{item.id}</GridItem>)}
      </GridCanvas>
    </GridProvider>
  )
}`

type Data = { label: string }

const KEY = 'gridla-gallery-persistence'
const DEFAULTS = { gap: 12, autosave: true, debounce: 400 }

function readStored(): GridLayout<Data> | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = normalizeLayout(JSON.parse(raw) as GridLayout<Data>)
    return findLayoutViolations(parsed).length === 0 ? parsed : null
  } catch {
    return null
  }
}

export function ReactPersistenceDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const initial = useMemo(() => dashboardLayout(12), [])
  const [layout, setLayout] = useState<GridLayout<Data>>(() => readStored() ?? initial)
  const [savedAt, setSavedAt] = useState<string | null>(() =>
    readStored() ? 'earlier session' : null,
  )
  const [dirty, setDirty] = useState(false)
  const [lastReason, setLastReason] = useState<string>('—')
  const timer = useRef<number | null>(null)

  const save = (next: GridLayout<Data>) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
      setSavedAt(new Date().toLocaleTimeString())
      setDirty(false)
    } catch {
      setSavedAt('storage unavailable')
    }
  }

  const onChange = (next: GridLayout<Data>, detail: GridChangeDetail) => {
    setLayout(next)
    setLastReason(detail.strategy ? `${detail.reason} · ${detail.strategy}` : detail.reason)
    setDirty(true)
    if (!state.autosave) return
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => save(next), state.debounce)
  }

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  return (
    <GridProvider<Data> layout={layout} onLayoutChange={onChange} gap={state.gap}>
      <DemoFrame
        stageLabel="controlled · saved to localStorage"
        stageStyle={{ height: 480 }}
        stage={
          <GridCanvas aria-label="Persisted dashboard" style={{ minHeight: '100%' }}>
            {layout.items.map((item) => (
              <DemoItem key={item.id} id={item.id} label={item.data?.label}>
                drag · resize · reload the page
              </DemoItem>
            ))}
            <DemoPreview />
          </GridCanvas>
        }
        controls={
          <>
            <ControlGroup title="Persistence">
              <span
                className="gl-status"
                data-state={dirty ? 'dirty' : savedAt ? 'saved' : 'none'}
                aria-live="polite"
              >
                {dirty ? 'unsaved changes' : savedAt ? `saved at ${savedAt}` : 'nothing saved yet'}
              </span>
              <Toggle
                label="Autosave"
                checked={state.autosave}
                onChange={(autosave) => update({ autosave })}
              />
              <RangeField
                label="Debounce"
                value={state.debounce}
                min={0}
                max={2000}
                step={100}
                onChange={(debounce) => update({ debounce })}
                format={(v) => `${v}ms`}
              />
              <div className="gd-actions">
                <Button variant="primary" onClick={() => save(layout)}>
                  Save now
                </Button>
                <Button
                  onClick={() => {
                    const stored = readStored()
                    if (stored) {
                      setLayout(stored)
                      setDirty(false)
                    }
                  }}
                >
                  Load
                </Button>
                <Button
                  onClick={() => {
                    localStorage.removeItem(KEY)
                    setSavedAt(null)
                    setDirty(false)
                  }}
                >
                  Clear storage
                </Button>
              </div>
            </ControlGroup>
            <ControlGroup title="Provider">
              <RangeField
                label="gap"
                value={state.gap}
                min={0}
                max={32}
                step={2}
                onChange={(gap) => update({ gap })}
              />
              <dl className="gl-readout">
                <dt>last change</dt>
                <dd data-accent>{lastReason}</dd>
              </dl>
            </ControlGroup>
            <div className="gd-actions">
              <Button
                onClick={() => {
                  reset()
                  setLayout(initial)
                  setDirty(true)
                }}
              >
                Reset layout
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
