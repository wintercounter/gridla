import { useMemo, useState } from 'react'

import type { GridLayout, GridResizeEdge } from 'gridla'
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
  Segmented,
  Toggle,
} from '@gridla/demo-kit/react'

import { CodeExample } from '../lib/code'
import { useHashState } from '../lib/hash-state'

const SNIPPET = `/* Every adapter emits the same attributes; this CSS works with all of them. */

/* Size the built-in resize handles (inline geometry reads these). */
[data-gridla-canvas] {
  --gridla-handle-size: 14px;   /* thickness, corner square side */
  --gridla-handle-inset: 14px;  /* edge handles stop short of the corners */
}
@media (pointer: coarse) {
  [data-gridla-canvas] { --gridla-handle-size: 24px; }
}

/* Paint a grip inside the hit area; reveal it on hover and selection. */
[data-gridla-resize-handle]::after {
  content: ''; position: absolute; inset: 2px; border-radius: 2px;
  background: var(--select); opacity: 0; transition: opacity 120ms;
}
[data-gridla-item]:hover [data-gridla-resize-handle]::after,
[data-gridla-item][data-gridla-selected] [data-gridla-resize-handle]::after { opacity: 0.85; }

/* States, preview, motion. */
[data-gridla-item] { transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1); }
[data-gridla-item][data-gridla-active] { transition: none; }
[data-gridla-item][data-gridla-selected] { outline: 2px solid var(--select); }
[data-gridla-item][data-gridla-shifted] { border-style: dashed; }
[data-gridla-preview] { border: 2px dashed var(--accent); }
html[data-gridla-dragging] { user-select: none; }`

type Data = { label: string }
type Tokens = 'default' | 'ocean' | 'mono'

const DEFAULTS = {
  size: 10,
  corners: false,
  always: false,
  motion: true,
  tokens: 'default' as Tokens,
}

const ALL_EDGES: readonly GridResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
const CORNERS: readonly GridResizeEdge[] = ['ne', 'nw', 'se', 'sw']

export function ReactStylingDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const initial = useMemo(() => dashboardLayout(16), [])
  const [layout, setLayout] = useState<GridLayout<Data>>(initial)

  return (
    <GridProvider<Data> layout={layout} onLayoutChange={setLayout} gap={16}>
      <DemoFrame
        stageLabel="styling · hover or select a card to see its handles"
        stageStyle={{ height: 480 }}
        stage={
          <GridCanvas
            aria-label="Styling demo"
            className="gl-styling"
            data-handles={state.always ? 'always' : undefined}
            data-motion={state.motion ? undefined : 'off'}
            data-tokens={state.tokens === 'default' ? undefined : state.tokens}
            style={{ minHeight: '100%', ['--gridla-handle-size' as string]: `${state.size}px` }}
          >
            {layout.items.map((item) => (
              <DemoItem
                key={item.id}
                id={item.id}
                label={item.data?.label}
                edges={state.corners ? CORNERS : ALL_EDGES}
              />
            ))}
            <DemoPreview />
          </GridCanvas>
        }
        controls={
          <>
            <ControlGroup title="Resize handles">
              <RangeField
                label="--gridla-handle-size"
                value={state.size}
                min={6}
                max={28}
                onChange={(size) => update({ size })}
                format={(value) => `${value}px`}
              />
              <Toggle
                label="Corner handles only"
                checked={state.corners}
                onChange={(corners) => update({ corners })}
              />
              <Toggle
                label="Show grips always"
                checked={state.always}
                onChange={(always) => update({ always })}
              />
            </ControlGroup>
            <ControlGroup title="Motion and tokens">
              <Toggle
                label="Animate siblings (transform)"
                checked={state.motion}
                onChange={(motion) => update({ motion })}
              />
              <Segmented<Tokens>
                ariaLabel="Theme tokens"
                value={state.tokens}
                options={[
                  { value: 'default', label: 'default' },
                  { value: 'ocean', label: 'ocean' },
                  { value: 'mono', label: 'mono' },
                ]}
                onChange={(tokens) => update({ tokens })}
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
            <CodeExample code={SNIPPET} title="CSS" lang="css" />
          </>
        }
      />
    </GridProvider>
  )
}
