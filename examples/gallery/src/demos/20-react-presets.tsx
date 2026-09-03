import { useMemo, useState } from 'react'

import {
  applyGap,
  applyPreset,
  findLayoutViolations,
  normalizeLayout,
  type GridLayout,
  type LayoutPreset,
} from 'gridla'
import { GridCanvas, GridProvider } from 'gridla/react'
import { dashboardLayout } from '@gridla/demo-kit'
import {
  Button,
  ControlGroup,
  DemoFrame,
  DemoItem,
  DemoPreview,
  Inspector,
  RangeField,
} from '@gridla/demo-kit/react'

import { CodeExample } from '../lib/code'
import { useHashState } from '../lib/hash-state'

const SNIPPET = `import { applyPreset, findLayoutViolations, normalizeLayout } from 'gridla'

// Export: a layout is JSON already.
const json = JSON.stringify(layout)

// Import: normalize, then validate before handing it to the provider.
const parsed = normalizeLayout(JSON.parse(json))
if (findLayoutViolations(parsed).length === 0) setLayout(parsed)

// Presets rebuild positions while keeping each item's constraints.
setLayout(applyPreset(layout, 'grid', undefined, { columns: 3, gap: 12 }))
setLayout(applyPreset(layout, 'rows'))
setLayout(applyPreset(layout, 'columns'))`

type Data = { label: string }

const DEFAULTS = { gap: 12, columns: 2 }

type PresetCard = { key: string; label: string; preset: LayoutPreset; columns?: number }

const PRESETS: PresetCard[] = [
  { key: 'rows', label: 'rows', preset: 'rows' },
  { key: 'columns', label: 'columns', preset: 'columns' },
  { key: 'grid-2', label: 'grid · 2', preset: 'grid', columns: 2 },
  { key: 'grid-3', label: 'grid · 3', preset: 'grid', columns: 3 },
]

function Thumb({
  layout,
  label,
  onApply,
  active,
}: {
  layout: GridLayout<Data>
  label: string
  onApply: () => void
  active: boolean
}) {
  const { canvas, items } = layout
  return (
    <li>
      <button type="button" className="gl-thumb" onClick={onApply} aria-pressed={active}>
        <svg viewBox={`0 0 ${canvas.width} ${canvas.height}`} aria-hidden="true">
          <rect x="0" y="0" width={canvas.width} height={canvas.height} fill="var(--g-bg-sunken)" />
          {items.map((item) => (
            <rect
              key={item.id}
              x={item.x}
              y={item.y}
              width={item.w}
              height={item.h}
              rx="8"
              fill="var(--g-bg-raised)"
              stroke="var(--g-line-strong)"
              strokeWidth="4"
            />
          ))}
        </svg>
        <span>{label}</span>
      </button>
    </li>
  )
}

function sameLayout(a: GridLayout, b: GridLayout) {
  if (a.items.length !== b.items.length) return false
  return a.items.every((item, index) => {
    const other = b.items[index]
    return (
      other &&
      other.id === item.id &&
      Math.round(other.x) === Math.round(item.x) &&
      Math.round(other.y) === Math.round(item.y) &&
      Math.round(other.w) === Math.round(item.w) &&
      Math.round(other.h) === Math.round(item.h)
    )
  })
}

export function ReactPresetsDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const initial = useMemo(() => dashboardLayout(12), [])
  const [layout, setLayout] = useState<GridLayout<Data>>(initial)
  const [text, setText] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const exported = useMemo(() => JSON.stringify(layout, null, 2), [layout])

  const thumbs = useMemo(
    () =>
      PRESETS.map((card) => ({
        card,
        layout: applyPreset(layout, card.preset, undefined, {
          gap: state.gap,
          columns: card.columns ?? state.columns,
        }),
      })),
    [layout, state.gap, state.columns],
  )

  const importText = () => {
    try {
      const parsed = normalizeLayout(JSON.parse(text || exported) as GridLayout<Data>)
      const violations = findLayoutViolations(parsed)
      if (violations.length > 0) {
        setMessage(`Rejected: ${violations.length} violation(s) — ${JSON.stringify(violations[0])}`)
        return
      }
      setLayout(parsed)
      setMessage(`Imported ${parsed.items.length} items.`)
    } catch (error) {
      setMessage(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return (
    <GridProvider<Data> layout={layout} onLayoutChange={setLayout} gap={state.gap}>
      <DemoFrame
        stageLabel="drag, then export · or apply a preset"
        stageStyle={{ height: 480 }}
        stage={
          <GridCanvas
            aria-label="Dashboard with presets and JSON import/export"
            style={{ minHeight: '100%' }}
          >
            {layout.items.map((item) => (
              <DemoItem key={item.id} id={item.id} label={item.data?.label} />
            ))}
            <DemoPreview />
          </GridCanvas>
        }
        controls={
          <>
            <ControlGroup title="Presets">
              <ul className="gl-thumbs">
                {thumbs.map(({ card, layout: candidate }) => (
                  <Thumb
                    key={card.key}
                    layout={candidate}
                    label={card.label}
                    active={sameLayout(candidate, layout)}
                    onApply={() => setLayout(candidate)}
                  />
                ))}
              </ul>
              <RangeField
                label="Gap"
                value={state.gap}
                min={0}
                max={32}
                step={2}
                onChange={(gap) => {
                  setLayout((current) => applyGap(current, gap))
                  update({ gap })
                }}
              />
              <RangeField
                label="Grid columns"
                value={state.columns}
                min={1}
                max={4}
                step={1}
                onChange={(columns) => update({ columns })}
              />
            </ControlGroup>
            <div className="gd-actions">
              <Button
                onClick={() => {
                  reset()
                  setLayout(initial)
                  setText('')
                  setMessage(null)
                }}
              >
                Reset
              </Button>
            </div>
          </>
        }
        inspector={
          <>
            <div className="gd-inspector">
              <div className="gd-inspector-bar">
                <span>
                  export <b>{exported.length.toLocaleString()} chars</b>
                </span>
                {message ? <span aria-live="polite">{message}</span> : null}
              </div>
              <label className="gd-toggle" htmlFor="gl-json">
                <span>Layout JSON (edit, then Import)</span>
              </label>
              <textarea
                id="gl-json"
                className="gl-textarea"
                value={text || exported}
                onChange={(event) => setText(event.target.value)}
                spellCheck={false}
              />
              <div className="gd-actions">
                <Button variant="primary" onClick={importText}>
                  Import
                </Button>
                <Button
                  onClick={() => {
                    setText('')
                    setMessage('Export refreshed from the live layout.')
                  }}
                >
                  Export current
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard
                      .writeText(exported)
                      .then(() => setMessage('Copied JSON to the clipboard.'))
                      .catch(() => setMessage('Clipboard unavailable.'))
                  }}
                >
                  Copy JSON
                </Button>
              </div>
            </div>
            <Inspector />
            <CodeExample code={SNIPPET} />
          </>
        }
      />
    </GridProvider>
  )
}
