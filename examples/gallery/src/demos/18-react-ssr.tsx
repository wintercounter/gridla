import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'

import { createItem, projectLayout, type GridLayout } from 'gridla'
import { GridCanvas, GridItem, GridProvider } from 'gridla/react'
import { canvas } from '@gridla/demo-kit'
import { Button, ControlGroup, RangeField, Toggle } from '@gridla/demo-kit/react'

import { CodeExample } from '../lib/code'
import { useHashState } from '../lib/hash-state'

const SNIPPET = `import { renderToString } from 'react-dom/server'
import { GridProvider, GridCanvas, GridItem } from 'gridla/react'

// gridla/react has no DOM access at import time or during render, so this
// runs in Node, Bun, an edge runtime, or (as here) the browser.
// responsive={false} sizes the canvas from the layout instead of measuring it,
// so the server markup already has final coordinates.
const html = renderToString(
  <GridProvider layout={layout} responsive={false}>
    <GridCanvas>
      {layout.items.map((item) => <GridItem key={item.id} id={item.id}>{item.id}</GridItem>)}
    </GridCanvas>
  </GridProvider>,
)
// On the client: hydrateRoot(container, sameTree)`

type Data = { label: string }

const DEFAULTS = { count: 4, responsive: false }

function build(count: number): GridLayout<Data> {
  const c = canvas(600, 300, 12)
  const columns = 2
  const rows = Math.ceil(count / columns)
  const w = (576 - 12) / columns
  const h = (276 - 12 * (rows - 1)) / rows
  return {
    canvas: c,
    items: Array.from({ length: count }, (_, index) =>
      createItem(
        `tile-${index + 1}`,
        { w, h, minW: 40, minH: 30 },
        12 + (index % columns) * (w + 12),
        12 + Math.floor(index / columns) * (h + 12),
        {
          label: `Tile ${index + 1}`,
        },
      ),
    ),
  }
}

function Tree({ layout, responsive }: { layout: GridLayout<Data>; responsive: boolean }) {
  return (
    <GridProvider<Data> layout={layout} responsive={responsive} gap={12}>
      <GridCanvas
        aria-label="Server-rendered grid"
        style={responsive ? { height: '100%' } : undefined}
      >
        {layout.items.map((item) => (
          <GridItem key={item.id} id={item.id} className="gd-item">
            <div className="gd-item-head">
              <span>{item.data?.label}</span>
            </div>
          </GridItem>
        ))}
      </GridCanvas>
    </GridProvider>
  )
}

function pretty(html: string) {
  return html.replace(/></g, '>\n<')
}

export function ReactSsrDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const layout = useMemo(() => projectLayout(build(state.count), {}), [state.count])
  const tree = useMemo<ReactElement>(
    () => <Tree layout={layout} responsive={state.responsive} />,
    [layout, state.responsive],
  )
  const html = useMemo(() => renderToString(tree), [tree])
  const container = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState('rendering')

  useEffect(() => {
    const element = container.current
    if (!element) return
    element.innerHTML = html
    let root: Root | null = null
    let errors = 0
    const onError = () => {
      errors += 1
    }
    try {
      root = hydrateRoot(element, tree, { onRecoverableError: onError })
      // Report after React has flushed hydration so recoverable errors are counted.
      window.setTimeout(() => {
        setStatus(
          errors > 0
            ? `hydrated with ${errors} recoverable mismatch(es)`
            : 'hydrated · interactive',
        )
      }, 0)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      window.setTimeout(() => setStatus(`hydration failed: ${message}`), 0)
    }
    return () => {
      const current = root
      root = null
      // Unmount asynchronously: React forbids unmounting during a render phase.
      window.setTimeout(() => current?.unmount(), 0)
    }
  }, [html, tree])

  return (
    <div className="gd-frame">
      <div className="gl-compare-wrap">
        <div className="gl-ssr">
          <section>
            <h3>renderToString output ({html.length.toLocaleString()} chars)</h3>
            <pre>{pretty(html)}</pre>
          </section>
          <section>
            <h3>
              Hydrated live version ·{' '}
              <span className="gl-status" data-state="saved">
                {status}
              </span>
            </h3>
            <div className="gl-ssr-live gd-stage" ref={container} />
          </section>
        </div>
      </div>
      <aside className="gd-controls">
        <ControlGroup title="Tree">
          <RangeField
            label="Tiles"
            value={state.count}
            min={1}
            max={8}
            step={1}
            onChange={(count) => update({ count })}
          />
          <Toggle
            label="responsive (measure on client)"
            checked={state.responsive}
            onChange={(responsive) => update({ responsive })}
          />
        </ControlGroup>
        <p className="gl-note">
          With <code>responsive=false</code> the server output already carries final transforms.
          With it on, the server renders authored coordinates and the client re-projects after
          measuring.
        </p>
        <div className="gd-actions">
          <Button onClick={reset}>Reset</Button>
        </div>
      </aside>
      <CodeExample code={SNIPPET} />
    </div>
  )
}
