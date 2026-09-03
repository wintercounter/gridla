import {
  useId,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'

import type { GridLayout } from 'gridla'
import {
  GridCanvas,
  GridItem,
  GridPreviewOutline,
  GridProvider,
  useGridLayout,
  type GridChangeDetail,
} from 'gridla/react'

type Data = { label: string }
type Layout = GridLayout<Data>
type Strategy = NonNullable<GridChangeDetail['strategy']>

const CANVAS = {
  width: 600,
  height: 300,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  heightMode: 'bounded' as const,
}

const subscribeNever = () => () => {}

/** True after hydration. Rendered layouts live in the browser only: the canvas measures itself. */
function useMounted() {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  )
}

function toneOf(strategy: Strategy): string {
  if (strategy.startsWith('push')) return 'push'
  if (strategy.includes('swap')) return 'swap'
  if (strategy.startsWith('reorder') || strategy.startsWith('insert')) return 'reorder'
  if (strategy.includes('shrink') || strategy.includes('trim')) return 'shrink'
  if (strategy.startsWith('resize')) return 'resize'
  return 'other'
}

/** The strategy of the last accepted commit, as a colored chip. */
function StrategyChip({ strategy }: { strategy: Strategy | null }) {
  return (
    <output className="g-chip" data-tone={strategy ? toneOf(strategy) : 'idle'} aria-live="polite">
      <span className="g-chip-label">strategy</span>
      <code>{strategy ?? 'idle'}</code>
    </output>
  )
}

function MiniDemo({
  title,
  caption,
  status,
  onReset,
  controls,
  children,
}: {
  title: string
  caption: ReactNode
  /** Readout chips shown under the stage. */
  status?: ReactNode
  onReset: () => void
  controls?: ReactNode
  children: ReactNode
}) {
  const mounted = useMounted()
  return (
    <article className="g-mini" data-reveal="">
      <header className="g-mini-head">
        <h3>{title}</h3>
        <ResetButton onClick={onReset} />
      </header>
      {controls}
      <div className="g-mini-stage">{mounted ? children : null}</div>
      {status ? <div className="g-mini-status">{status}</div> : null}
      <p className="g-mini-caption">{caption}</p>
    </article>
  )
}

function Card({ id, label, resize }: { id: string; label: string; resize?: boolean }) {
  return (
    <GridItem
      id={id}
      className="g-mini-item"
      resizeEdges={resize ? ['e', 's', 'se'] : undefined}
      resizeHandleClassName="g-mini-handle"
    >
      {(view) => (
        <>
          <span className="g-mini-item-label">{label}</span>
          <code className="g-mini-item-size">
            {Math.round(view.rect.w)}×{Math.round(view.rect.h)}
          </code>
        </>
      )}
    </GridItem>
  )
}

function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="g-mini-reset" onClick={onClick}>
      Reset
    </button>
  )
}

// ---------------------------------------------------------------------------
// 1. Push or swap
// ---------------------------------------------------------------------------

const PUSH_SWAP: Layout = {
  canvas: CANVAS,
  items: [
    { id: 'chart', x: 0, y: 0, w: 360, h: 180, minW: 120, minH: 60, data: { label: 'chart' } },
    { id: 'stats', x: 372, y: 0, w: 228, h: 84, minW: 100, minH: 60, data: { label: 'stats' } },
    { id: 'notes', x: 372, y: 96, w: 228, h: 84, minW: 100, minH: 60, data: { label: 'notes' } },
    { id: 'table', x: 0, y: 192, w: 600, h: 108, minW: 120, minH: 60, data: { label: 'table' } },
  ],
}

function PushSwapDemo() {
  const [layout, setLayout] = useState(PUSH_SWAP)
  const [strategy, setStrategy] = useState<Strategy | null>(null)
  return (
    <MiniDemo
      title="Push or swap"
      status={<StrategyChip strategy={strategy} />}
      onReset={() => {
        setLayout(PUSH_SWAP)
        setStrategy(null)
      }}
      caption={
        <>
          Drag a card. Nudge into a neighbor to push it aside; cover it to swap. Every commit names
          the strategy that produced it.
        </>
      }
    >
      <GridProvider<Data>
        layout={layout}
        onLayoutChange={setLayout}
        onCommit={(detail) => detail.strategy && setStrategy(detail.strategy)}
        gap={12}
      >
        <GridCanvas className="g-mini-canvas" aria-label="Push or swap demo">
          {layout.items.map((item) => (
            <Card key={item.id} id={item.id} label={item.data?.label ?? item.id} resize />
          ))}
          <GridPreviewOutline className="g-mini-preview" />
        </GridCanvas>
      </GridProvider>
    </MiniDemo>
  )
}

// ---------------------------------------------------------------------------
// 2. Responsive projection
// ---------------------------------------------------------------------------

const PROJECTION: Layout = {
  canvas: CANVAS,
  items: [
    {
      id: 'nav',
      x: 0,
      y: 0,
      w: 140,
      h: 300,
      sizeMode: 'fixed-w',
      minH: 60,
      data: { label: 'nav · fixed-w' },
    },
    { id: 'hero', x: 152, y: 0, w: 448, h: 144, minW: 80, minH: 60, data: { label: 'hero' } },
    { id: 'a', x: 152, y: 156, w: 212, h: 144, minW: 60, minH: 60, data: { label: 'a' } },
    { id: 'b', x: 376, y: 156, w: 224, h: 144, minW: 60, minH: 60, data: { label: 'b' } },
  ],
}

function CanvasReadout() {
  const layout = useGridLayout<Data>()
  return (
    <output className="g-chip" data-tone="idle">
      <span className="g-chip-label">canvas</span>
      <code>
        {Math.round(layout.canvas.width)}×{Math.round(layout.canvas.height)}
      </code>
    </output>
  )
}

function ProjectionDemo() {
  const [pct, setPct] = useState(100)
  const [layout, setLayout] = useState(PROJECTION)
  const id = useId()
  return (
    <GridProvider<Data> layout={layout} onLayoutChange={setLayout} gap={12}>
      <MiniDemo
        title="Responsive projection"
        status={<CanvasReadout />}
        onReset={() => {
          setLayout(PROJECTION)
          setPct(100)
        }}
        controls={
          <div className="g-mini-control">
            <label htmlFor={id}>canvas width</label>
            <input
              id={id}
              type="range"
              min={40}
              max={100}
              step={1}
              value={pct}
              onChange={(event) => setPct(Number(event.target.value))}
              style={{ ['--g-fill' as string]: `${((pct - 40) / 60) * 100}%` }}
            />
            <code>{pct}%</code>
          </div>
        }
        caption={
          <>
            Slide to narrow the canvas. Rows behave like flex chains and gaps stay exact; the
            navigation column is <code>fixed-w</code> and keeps its 140 pixels.
          </>
        }
      >
        <div className="g-mini-frame" style={{ width: `${pct}%` }}>
          <GridCanvas className="g-mini-canvas" aria-label="Responsive projection demo">
            {layout.items.map((item) => (
              <Card key={item.id} id={item.id} label={item.data?.label ?? item.id} />
            ))}
            <GridPreviewOutline className="g-mini-preview" />
          </GridCanvas>
        </div>
      </MiniDemo>
    </GridProvider>
  )
}

// ---------------------------------------------------------------------------
// 3. Nested groups
// ---------------------------------------------------------------------------

const OUTER: Layout = {
  canvas: CANVAS,
  items: [
    { id: 'side', x: 0, y: 0, w: 150, h: 300, minW: 80, minH: 60, data: { label: 'side' } },
    { id: 'group', x: 162, y: 0, w: 438, h: 300, minW: 200, minH: 140, data: { label: 'group' } },
  ],
}

const INNER: Layout = {
  canvas: { ...CANVAS, width: 438, height: 260 },
  items: [
    { id: 'a', x: 0, y: 0, w: 213, h: 124, minW: 60, minH: 50, data: { label: 'a' } },
    { id: 'b', x: 225, y: 0, w: 213, h: 124, minW: 60, minH: 50, data: { label: 'b' } },
    { id: 'c', x: 0, y: 136, w: 438, h: 124, minW: 60, minH: 50, data: { label: 'c' } },
  ],
}

function stop(event: PointerEvent | KeyboardEvent) {
  event.stopPropagation()
}

function Group() {
  const [inner, setInner] = useState(INNER)
  return (
    <GridItem id="group" className="g-mini-item" data-group="" draggable={false}>
      {(view) => (
        <>
          <div className="g-mini-group-bar" {...view.dragHandleProps}>
            <span className="g-mini-item-label">group · drag here</span>
            <code className="g-mini-item-size">
              {Math.round(view.rect.w)}×{Math.round(view.rect.h)}
            </code>
          </div>
          {/* Inner gestures stay inside the inner canvas. */}
          <div
            className="g-mini-group-body"
            role="presentation"
            onPointerDown={stop}
            onKeyDown={stop}
          >
            <GridProvider<Data> layout={inner} onLayoutChange={setInner} gap={8}>
              <GridCanvas className="g-mini-canvas" aria-label="Nested group">
                {inner.items.map((item) => (
                  <Card key={item.id} id={item.id} label={item.data?.label ?? item.id} />
                ))}
                <GridPreviewOutline className="g-mini-preview" />
              </GridCanvas>
            </GridProvider>
          </div>
        </>
      )}
    </GridItem>
  )
}

function NestedDemo() {
  const [layout, setLayout] = useState(OUTER)
  const [key, setKey] = useState(0)
  return (
    <MiniDemo
      title="Nested groups"
      onReset={() => {
        setLayout(OUTER)
        setKey((value) => value + 1)
      }}
      caption={
        <>
          A group is a layout inside an item: one provider per container. Drag the cards inside the
          group, or drag the group by its bar and push the side column.
        </>
      }
    >
      <GridProvider<Data> key={key} layout={layout} onLayoutChange={setLayout} gap={12}>
        <GridCanvas className="g-mini-canvas" aria-label="Nested groups demo">
          <Card id="side" label="side" />
          <Group />
          <GridPreviewOutline className="g-mini-preview" />
        </GridCanvas>
      </GridProvider>
    </MiniDemo>
  )
}

/** Three live demos built on `gridla/react`, shown on the home page. */
export function HomeDemos() {
  return (
    <section className="g-home-demos">
      <div className="g-section-head" data-reveal="">
        <p className="g-section-kicker">Try it here</p>
        <h2>Real canvases, not screenshots.</h2>
        <p className="g-section-lede">
          Each box below is <code>GridProvider</code>, <code>GridCanvas</code>, and{' '}
          <code>GridItem</code> with a few lines of CSS. Pointer, touch, and keyboard all work.
        </p>
      </div>
      <div className="g-mini-grid">
        <PushSwapDemo />
        <ProjectionDemo />
        <NestedDemo />
      </div>
    </section>
  )
}
