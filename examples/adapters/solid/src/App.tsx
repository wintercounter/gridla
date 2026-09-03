/** @jsxImportSource solid-js */
import { For, createSignal, type JSX } from 'solid-js'

import { createItem, type GridItem as GridItemModel, type GridLayout } from 'gridla'
import {
  applyTheme,
  canvas,
  formatLayout,
  formatRect,
  readTheme,
  type Theme,
} from '@gridla/demo-kit'
import {
  GridCanvas,
  GridItem,
  GridPreviewOutline,
  GridProvider,
  GridTransferScope,
  useGridActions,
  type GridChangeDetail,
} from 'gridla/solid'

// The Solid demo app: a controlled dashboard with a nested group inside a
// `GridTransferScope`, so items move between the group and the page. It
// drives the shared adapter contract tests (tests/e2e/specs/adapters.solid.e2e.ts).

type Data = { label: string; kind?: 'group' }

const GAP = 12
const EDGES = ['e', 's', 'se'] as const

function outerLayout(): GridLayout<Data> {
  const c = canvas(960, 600, 12)
  const inner = c.width - 24
  const half = Math.floor((inner - GAP) / 2)
  const row = 12 + 72 + GAP
  // Leaves free room to the right of the sidebar and a table that can shrink,
  // so moves, resizes, and drops have somewhere to go.
  return {
    canvas: c,
    items: [
      createItem('header', { w: inner, h: 72, minW: 120, minH: 48, sizeMode: 'fixed-h' }, 12, 12, {
        label: 'Header',
      }),
      createItem('group', { w: half, h: 220, minW: 200, minH: 160 }, 12, row, {
        label: 'Group',
        kind: 'group',
      }),
      createItem('sidebar', { w: 300, h: 220, minW: 120, minH: 120 }, 12 + half + GAP, row, {
        label: 'Sidebar',
      }),
      createItem('table', { w: inner, h: 200, minW: 160, minH: 60 }, 12, row + 220 + GAP, {
        label: 'Table',
      }),
    ],
  }
}

function innerLayout(): GridLayout<Data> {
  return {
    canvas: canvas(456, 220, 8),
    items: [
      createItem('note-1', { w: 160, h: 80, minW: 80, minH: 48 }, 8, 8, { label: 'Note 1' }),
      createItem('note-2', { w: 160, h: 80, minW: 80, minH: 48 }, 8 + 160 + GAP, 8, {
        label: 'Note 2',
      }),
    ],
  }
}

function Card(props: { item: GridItemModel<Data>; handleOnly?: boolean; children?: JSX.Element }) {
  return (
    <GridItem
      id={props.item.id}
      class="gd-item"
      draggable={!props.handleOnly}
      resizeEdges={EDGES}
      resizeHandleClass="gd-handle"
    >
      {({ view, dragHandleProps }) => (
        <>
          <div class="gd-item-head" {...(props.handleOnly ? dragHandleProps : {})}>
            <span>{props.item.data?.label ?? props.item.id}</span>
            <span class="gd-item-coords">{formatRect(view().rect)}</span>
          </div>
          <div class="gd-item-body">{props.children}</div>
        </>
      )}
    </GridItem>
  )
}

// The nested layout lives in `App` state: the outer `<For>` recreates the
// group's card whenever the outer layout changes, so the group must not own it.
function Group(props: {
  item: GridItemModel<Data>
  layout: GridLayout<Data>
  onLayoutChange: (layout: GridLayout<Data>) => void
  onCommit: (detail: GridChangeDetail) => void
}) {
  return (
    <Card item={props.item} handleOnly>
      <GridProvider<Data>
        layout={props.layout}
        onLayoutChange={props.onLayoutChange}
        onCommit={props.onCommit}
        gap={GAP}
        snapDistance={16}
      >
        <GridCanvas class="nested" style={{ height: '100%' }}>
          <For each={props.layout.items}>{(item) => <Card item={item}>drag me out</Card>}</For>
          <GridPreviewOutline class="gd-preview" />
        </GridCanvas>
      </GridProvider>
    </Card>
  )
}

function Toolbar(props: { onReset: () => void }) {
  const actions = useGridActions<Data>()
  const [counter, setCounter] = createSignal(0)
  return (
    <div class="gd-actions">
      <button
        type="button"
        class="gd-button"
        data-variant="primary"
        onClick={() => {
          const n = counter() + 1
          setCounter(n)
          actions.place(
            { id: `new-${n}`, w: 220, h: 140, minW: 80, minH: 60, data: { label: `New ${n}` } },
            { pointer: { x: 480, y: 300 } },
          )
        }}
      >
        Add item
      </button>
      <button type="button" class="gd-button" data-testid="reset" onClick={() => props.onReset()}>
        Reset
      </button>
    </div>
  )
}

function ThemeSwitch() {
  const [theme, setTheme] = createSignal<Theme>(readTheme())
  applyTheme(theme())
  return (
    <select
      class="gd-select"
      aria-label="Theme"
      value={theme()}
      onChange={(event) => {
        const next = event.currentTarget.value as Theme
        setTheme(next)
        applyTheme(next)
      }}
    >
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  )
}

function describe(detail: GridChangeDetail | null) {
  return detail ? `${detail.strategy ?? 'none'} (${detail.reason})` : 'none'
}

export function App() {
  const [layout, setLayout] = createSignal(outerLayout())
  const [nested, setNested] = createSignal(innerLayout())
  const [lastCommit, setLastCommit] = createSignal<GridChangeDetail | null>(null)
  // A transfer commits on the target (with a strategy) and then removes the
  // item from the source (without one); keep the informative detail.
  const noteCommit = (detail: GridChangeDetail) => {
    if (detail.reason !== 'transfer' || detail.strategy) setLastCommit(detail)
  }

  return (
    <main class="page">
      <header class="page-head">
        <div>
          <h1>Gridla with Solid</h1>
          <p>
            <code>gridla/solid</code> is written with <code>solid-js/h</code>, so it ships without a
            compiler step. <code>GridProvider</code> owns the layout, <code>GridCanvas</code>{' '}
            measures itself and handles pointer and keyboard input, and <code>GridItem</code>{' '}
            positions each child. The group is a nested provider; drag a note out of it or a card
            into it.
          </p>
        </div>
        <ThemeSwitch />
      </header>
      <GridTransferScope>
        <GridProvider<Data>
          layout={layout()}
          onLayoutChange={setLayout}
          onCommit={noteCommit}
          gap={GAP}
          snapDistance={24}
        >
          <div class="gd-frame">
            <section class="gd-stage" id="stage">
              <GridCanvas class="outer" style={{ height: '100%' }}>
                <For each={layout().items}>
                  {(item) =>
                    item.data?.kind === 'group' ? (
                      <Group
                        item={item}
                        layout={nested()}
                        onLayoutChange={setNested}
                        onCommit={noteCommit}
                      />
                    ) : (
                      <Card item={item}>
                        {item.id === 'header'
                          ? 'fixed height · flexes horizontally'
                          : 'drag me · resize from the edges'}
                      </Card>
                    )
                  }
                </For>
                <GridPreviewOutline class="gd-preview" />
              </GridCanvas>
            </section>
            <aside class="gd-controls">
              <Toolbar
                onReset={() => {
                  setLayout(outerLayout())
                  setNested(innerLayout())
                }}
              />
              <pre class="gd-code" data-testid="layout-json">
                {formatLayout(layout())}
              </pre>
            </aside>
          </div>
        </GridProvider>
      </GridTransferScope>
      <p class="page-note" data-testid="status">
        {layout().items.length} items · last strategy: {describe(lastCommit())}
      </p>
    </main>
  )
}
