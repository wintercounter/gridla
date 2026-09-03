/** @jsxImportSource @builder.io/qwik */
import '@gridla/demo-kit/tokens.css'
import '@gridla/demo-kit/demo.css'
import './style.css'

import { component$, render, useSignal, useStore } from '@builder.io/qwik'

import type { GridLayout } from 'gridla'
import {
  GridCanvas,
  GridItem,
  GridPreviewOutline,
  GridProvider,
  useGridItemView,
  useGridRuntime,
} from 'gridla/qwik'
import { dashboardLayout, formatRect } from '@gridla/demo-kit'

// The Qwik demo app. It renders the shared dashboard layout with `gridla/qwik`
// (client-side rendered here; the same components render on the server in a
// Qwik City app) and drives the shared adapter contract tests
// (tests/e2e/specs/adapters.qwik.e2e.ts). The Qwik optimizer runs through
// qwik-loader.cjs; see rsbuild.config.ts.

type Data = { label: string }

const DemoItem = component$<{ id: string; label: string; body: string }>(({ id, label, body }) => {
  const view = useGridItemView(id)
  return (
    <GridItem id={id} class="gd-item" resizeEdges={['e', 's', 'se']} resizeHandleClass="gd-handle">
      <div class="gd-item-head">
        <span>{label}</span>
        <span class="gd-item-coords">{formatRect(view.value.rect)}</span>
      </div>
      <div class="gd-item-body">{body}</div>
    </GridItem>
  )
})

const Toolbar = component$<{ counter: { value: number } }>(({ counter }) => {
  const runtime = useGridRuntime<Data>()
  return (
    <button
      type="button"
      class="gd-button"
      data-variant="primary"
      onClick$={() => {
        const n = counter.value + 1
        counter.value = n
        runtime.controller?.actions.place(
          { id: `new-${n}`, w: 220, h: 140, minW: 80, minH: 60, data: { label: `New ${n}` } },
          { pointer: { x: 480, y: 300 } },
        )
      }}
    >
      Add item
    </button>
  )
})

const App = component$(() => {
  const layout = useSignal<GridLayout<Data>>(dashboardLayout())
  const gap = useSignal(12)
  const counter = useSignal(0)
  const status = useStore({ strategy: 'none', reason: '', commits: 0 })

  return (
    <main class="page">
      <header class="page-head">
        <div>
          <h1>Gridla with Qwik</h1>
          <p>
            <code>GridProvider</code> renders the layout on the server from props and creates the
            controller in a visible task on the client. <code>GridCanvas</code> measures itself and
            binds pointer and keyboard input, and <code>GridItem</code> positions each child. The
            layout state is yours: this page keeps it in a signal.
          </p>
        </div>
      </header>
      <GridProvider
        layout={layout.value}
        gap={gap.value}
        snapDistance={24}
        onLayoutChange$={(next) => {
          layout.value = next as GridLayout<Data>
        }}
        onCommit$={(detail) => {
          status.strategy = detail.strategy ?? 'none'
          status.reason = detail.reason
          status.commits += 1
        }}
      >
        <section class="gd-stage stage">
          <GridCanvas>
            {layout.value.items.map((item) => (
              <DemoItem
                key={item.id}
                id={item.id}
                label={item.data?.label ?? item.id}
                body={
                  item.id === 'header'
                    ? 'fixed height · flexes horizontally'
                    : 'drag me · resize from the edges'
                }
              />
            ))}
            <GridPreviewOutline class="gd-preview" />
          </GridCanvas>
        </section>
        <div class="toolbar">
          <Toolbar counter={counter} />
          <button
            type="button"
            class="gd-button"
            onClick$={() => {
              layout.value = dashboardLayout()
            }}
          >
            Reset
          </button>
          <label>
            Gap {gap.value}
            <input
              class="gd-range"
              type="range"
              min={0}
              max={32}
              step={2}
              value={gap.value}
              onInput$={(_, element) => {
                gap.value = Number(element.value)
              }}
            />
          </label>
        </div>
      </GridProvider>
      <p class="page-note" data-testid="status">
        {layout.value.items.length} items · last strategy: {status.strategy}
        {status.reason ? ` (${status.reason})` : ''} · commits: {status.commits}
      </p>
    </main>
  )
})

void render(document.getElementById('root') as HTMLElement, <App />)
