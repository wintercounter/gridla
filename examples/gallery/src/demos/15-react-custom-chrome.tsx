import { useMemo, useState } from 'react'

import type { GridLayout, GridResizeEdge } from 'gridla'
import { GridCanvas, GridItem, GridPreviewOutline, GridProvider } from 'gridla/react'
import { dashboardLayout, formatRect } from '@gridla/demo-kit'
import {
  Button,
  ControlGroup,
  DemoFrame,
  Inspector,
  Segmented,
  Toggle,
} from '@gridla/demo-kit/react'

import { CodeExample } from '../lib/code'
import { useHashState } from '../lib/hash-state'

const SNIPPET = `import { GridItem } from 'gridla/react'

// GridItem is headless: it positions a div and hands you render props.
<GridItem id={item.id} draggable={false} className="card">
  {({ rect, isSelected, isActive, dragHandleProps, getResizeHandleProps }) => (
    <>
      <header>
        <span className="grip" {...dragHandleProps} />   {/* only this starts a move */}
        {item.title}
      </header>
      <p>{item.body}</p>
      {isSelected && (
        <>
          <div className="ring" data-coords={\`\${rect.w}×\${rect.h}\`} />
          <span className="knob" {...getResizeHandleProps('se')} />
          <span className="knob" {...getResizeHandleProps('e')} />
        </>
      )}
    </>
  )}
</GridItem>`

type Data = { label: string }

const DEFAULTS = { grip: true, knobs: 'three', ring: true }

const ICONS: Record<string, string> = { header: '▤', chart: '◐', sidebar: '▥', table: '▦' }

function Card({
  id,
  label,
  gripOnly,
  edges,
  ring,
}: {
  id: string
  label: string
  gripOnly: boolean
  edges: GridResizeEdge[]
  ring: boolean
}) {
  return (
    <GridItem id={id} className="gl-card" draggable={!gripOnly}>
      {({ rect, isSelected, dragHandleProps, getResizeHandleProps }) => (
        <>
          <div className="gl-card-head">
            {gripOnly ? (
              <span className="gl-grip" aria-label="Drag handle" {...dragHandleProps} />
            ) : null}
            <span aria-hidden="true">{ICONS[id] ?? '▣'}</span>
            <span>{label}</span>
          </div>
          <div className="gl-card-body">
            {gripOnly ? 'Move from the grip only.' : 'Move from anywhere on the card.'}
          </div>
          {isSelected ? (
            <>
              {ring ? (
                <div className="gl-card-ring" data-coords={formatRect(rect)} aria-hidden="true" />
              ) : null}
              {edges.map((edge) => (
                <span
                  key={edge}
                  className="gl-knob"
                  data-edge={edge}
                  {...getResizeHandleProps(edge)}
                />
              ))}
            </>
          ) : null}
        </>
      )}
    </GridItem>
  )
}

export function ReactCustomChromeDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const initial = useMemo(() => dashboardLayout(16), [])
  const [layout, setLayout] = useState<GridLayout<Data>>(initial)
  const edges: GridResizeEdge[] =
    state.knobs === 'one' ? ['se'] : state.knobs === 'none' ? [] : ['e', 's', 'se']

  return (
    <GridProvider<Data> layout={layout} onLayoutChange={setLayout} gap={16}>
      <DemoFrame
        stageLabel="custom renderer · click a card to select"
        stageStyle={{ height: 480 }}
        stage={
          <GridCanvas aria-label="Cards with custom chrome" style={{ minHeight: '100%' }}>
            {layout.items.map((item) => (
              <Card
                key={item.id}
                id={item.id}
                label={item.data?.label ?? item.id}
                gripOnly={state.grip}
                edges={edges}
                ring={state.ring}
              />
            ))}
            <GridPreviewOutline className="gd-preview" />
          </GridCanvas>
        }
        controls={
          <>
            <ControlGroup title="Chrome">
              <Toggle
                label="Drag from the grip only"
                checked={state.grip}
                onChange={(grip) => update({ grip })}
              />
              <Toggle
                label="Selection ring with coordinates"
                checked={state.ring}
                onChange={(ring) => update({ ring })}
              />
              <Segmented
                ariaLabel="Resize knobs"
                value={state.knobs}
                options={[
                  { value: 'none', label: 'no knobs' },
                  { value: 'one', label: 'corner' },
                  { value: 'three', label: 'e · s · se' },
                ]}
                onChange={(knobs) => update({ knobs })}
              />
            </ControlGroup>
            <div className="gd-actions">
              <Button
                onClick={() => {
                  reset()
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
