import { useEffect, useMemo, useRef, useState } from 'react'

import {
  applyGap,
  createItem,
  transferItem,
  type GridItem as GridItemModel,
  type GridLayout,
  type TransferResult,
} from 'gridla'
import { GridCanvas, GridProvider, GridTransferScope, type GridChangeDetail } from 'gridla/react'
import { canvas, formatRect } from '@gridla/demo-kit'
import {
  Button,
  ControlGroup,
  DemoItem,
  DemoPreview,
  RangeField,
  Segmented,
  SelectField,
} from '@gridla/demo-kit/react'

import { CodeExample } from '../lib/code'
import { CoreInspector } from '../lib/core-inspector'
import { useHashState } from '../lib/hash-state'

const SNIPPET = `import { transferItem } from 'gridla'
import { GridProvider, GridCanvas, GridTransferScope } from 'gridla/react'

// Interactive: wrap the providers in one scope and drag across the boundary.
// The item keeps its on-screen size; the target's solver places it.
<GridTransferScope>
  <GridProvider layout={left} onLayoutChange={setLeft} onTransferOut={(id, to) => log(id, to)}>
    <GridCanvas />
  </GridProvider>
  <GridProvider layout={right} onLayoutChange={setRight} onTransferIn={(item, from) => log(item.id, from)}>
    <GridCanvas />
  </GridProvider>
</GridTransferScope>

// Programmatic: the same move as one solver call. The pointer is in the
// TARGET canvas' coordinates; the size is scaled by the canvas ratio unless
// you pass \`size\`.
const result = transferItem({ source: left, target: right, itemId: 'chart', pointer: { x: 200, y: 150 }, options: { gap: 12 } })
if (result.accepted) {
  left = result.source  // without the item
  right = result.target // with the item placed
}
result.strategy // placement strategy used in the target, or 'rejected'`

type Data = { label: string }
type Side = 'left' | 'right'
type Size = { w: number; h: number }
type Transfer = {
  item: string
  from: Side
  to: Side
  strategy: string
  authored: Size
  scaled: Size
  via: 'drag' | 'transferItem'
}

const DEFAULTS = { direction: 'ab', item: 'chart', x: 200, y: 160, gap: 12 }

const CANVASES: Record<Side, { label: string; size: string }> = {
  left: { label: 'Left', size: '960×600' },
  right: { label: 'Right', size: '480×600' },
}

const other = (side: Side): Side => (side === 'left' ? 'right' : 'left')
const sizeOf = (item: Size) => `${Math.round(item.w)}×${Math.round(item.h)}`

function buildLeft(): GridLayout<Data> {
  return {
    canvas: canvas(960, 600, 16),
    items: [
      createItem('chart', { w: 600, h: 280, minW: 120, minH: 80 }, 16, 16, { label: 'Chart' }),
      createItem('stat-1', { w: 312, h: 132, minW: 80, minH: 60 }, 632, 16, { label: 'Stat 1' }),
      createItem('stat-2', { w: 312, h: 132, minW: 80, minH: 60 }, 632, 164, { label: 'Stat 2' }),
      createItem('table', { w: 928, h: 272, minW: 120, minH: 80 }, 16, 312, { label: 'Table' }),
    ],
  }
}

function buildRight(): GridLayout<Data> {
  return {
    canvas: canvas(480, 600, 12),
    items: [createItem('note', { w: 456, h: 160, minW: 60, minH: 40 }, 12, 12, { label: 'Note' })],
  }
}

function Board({
  side,
  layout,
  gap,
  onChange,
  onLeave,
  onArrive,
}: {
  side: Side
  layout: GridLayout<Data>
  gap: number
  onChange: (side: Side, layout: GridLayout<Data>, detail: GridChangeDetail) => void
  onLeave: (side: Side, itemId: string) => void
  onArrive: (side: Side, item: GridItemModel<Data>) => void
}) {
  const { label, size } = CANVASES[side]
  return (
    <GridProvider<Data>
      layout={layout}
      onLayoutChange={(next, detail) => onChange(side, next, detail)}
      gap={gap}
      onTransferOut={(itemId) => onLeave(side, itemId)}
      onTransferIn={(item) => onArrive(side, item)}
    >
      <div className="gl-pane">
        <div className="gl-pane-head">
          <h3>
            {label} · {size}
          </h3>
          <b>
            {layout.items.length} {layout.items.length === 1 ? 'item' : 'items'}
          </b>
        </div>
        <div className="gd-stage">
          <GridCanvas
            aria-label={`${label} canvas, authored at ${size}; drag items to the other canvas`}
            style={{ height: '100%' }}
          >
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

export function CrossTransferDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const [left, setLeft] = useState<GridLayout<Data>>(buildLeft)
  const [right, setRight] = useState<GridLayout<Data>>(buildRight)
  const [last, setLast] = useState<Transfer | null>(null)

  // Callbacks fire mid-gesture, before React re-renders: keep the layouts and
  // the target's strategy in refs so a transfer can be described in one go.
  const layouts = useRef({ left, right })
  useEffect(() => {
    layouts.current = { left, right }
  }, [left, right])
  const pending = useRef<{ strategy: string; authored: Size | null }>({
    strategy: '—',
    authored: null,
  })

  const setSide = (side: Side, layout: GridLayout<Data>) =>
    side === 'left' ? setLeft(layout) : setRight(layout)

  const onChange = (side: Side, layout: GridLayout<Data>, detail: GridChangeDetail) => {
    setSide(side, layout)
    if (detail.reason === 'transfer' && detail.strategy) pending.current.strategy = detail.strategy
  }
  const onLeave = (side: Side, itemId: string) => {
    const item = layouts.current[side].items.find((entry) => entry.id === itemId)
    pending.current.authored = item ? { w: item.w, h: item.h } : null
  }
  const onArrive = (side: Side, item: GridItemModel<Data>) => {
    setLast({
      item: item.id,
      from: other(side),
      to: side,
      strategy: pending.current.strategy,
      authored: pending.current.authored ?? { w: item.w, h: item.h },
      scaled: { w: item.w, h: item.h },
      via: 'drag',
    })
  }

  // Programmatic form of the same operation.
  const forward = state.direction === 'ab'
  const sourceSide: Side = forward ? 'left' : 'right'
  const source = forward ? left : right
  const target = forward ? right : left
  const itemId = source.items.some((item) => item.id === state.item)
    ? state.item
    : (source.items[0]?.id ?? '')
  const simulated = useMemo<TransferResult<Data> | null>(
    () =>
      itemId
        ? transferItem({
            source,
            target,
            itemId,
            pointer: { x: state.x, y: state.y },
            options: { gap: state.gap },
          })
        : null,
    [source, target, itemId, state.x, state.y, state.gap],
  )
  const simulate = () => {
    if (!simulated?.accepted) return
    const authored = source.items.find((item) => item.id === itemId)
    setSide(sourceSide, simulated.source)
    setSide(other(sourceSide), simulated.target)
    setLast({
      item: itemId,
      from: sourceSide,
      to: other(sourceSide),
      strategy: simulated.strategy,
      authored: authored ? { w: authored.w, h: authored.h } : simulated.item,
      scaled: { w: simulated.item.w, h: simulated.item.h },
      via: 'transferItem',
    })
  }

  return (
    <div className="gd-frame">
      <div className="gl-compare-wrap">
        <GridTransferScope>
          <div className="gx-transfer">
            <Board
              side="left"
              layout={left}
              gap={state.gap}
              onChange={onChange}
              onLeave={onLeave}
              onArrive={onArrive}
            />
            <Board
              side="right"
              layout={right}
              gap={state.gap}
              onChange={onChange}
              onLeave={onLeave}
              onArrive={onArrive}
            />
          </div>
        </GridTransferScope>
        <p className="gx-transfer-hint">
          Drag any card into the other canvas. It keeps its on-screen size (the right canvas is
          authored at half the width) and the target&apos;s solver picks where it lands.
        </p>
      </div>
      <aside className="gd-controls">
        <ControlGroup title="Last transfer">
          <dl className="gl-readout" aria-live="polite">
            <dt>item</dt>
            <dd data-accent>
              {last
                ? `${last.item} · ${CANVASES[last.from].label} to ${CANVASES[last.to].label}`
                : '— drag a card across —'}
            </dd>
            <dt>strategy</dt>
            <dd data-strategy>{last?.strategy ?? '—'}</dd>
            <dt>authored size</dt>
            <dd>{last ? `${sizeOf(last.authored)} in ${CANVASES[last.from].size}` : '—'}</dd>
            <dt>scaled size</dt>
            <dd>{last ? `${sizeOf(last.scaled)} in ${CANVASES[last.to].size}` : '—'}</dd>
            <dt>via</dt>
            <dd>{last ? (last.via === 'drag' ? 'pointer drag' : 'transferItem()') : '—'}</dd>
          </dl>
        </ControlGroup>
        <ControlGroup title="Solve options">
          <RangeField
            label="Gap"
            value={state.gap}
            min={0}
            max={32}
            step={2}
            onChange={(gap) => {
              setLeft(applyGap(left, gap))
              setRight(applyGap(right, gap))
              update({ gap })
            }}
            format={(v) => `${v}px`}
          />
        </ControlGroup>
        <ControlGroup title="Simulate a drop with transferItem()">
          <Segmented
            ariaLabel="Direction"
            value={state.direction}
            options={[
              { value: 'ab', label: 'Left to Right' },
              { value: 'ba', label: 'Right to Left' },
            ]}
            onChange={(direction) => update({ direction })}
          />
          <SelectField
            label="Item"
            value={itemId}
            options={source.items.map((item) => ({ value: item.id, label: item.id }))}
            onChange={(item) => update({ item })}
          />
          <RangeField
            label={`Drop x (in ${CANVASES[other(sourceSide)].label.toLowerCase()})`}
            value={Math.min(state.x, target.canvas.width)}
            min={0}
            max={target.canvas.width}
            step={2}
            onChange={(x) => update({ x })}
            format={(v) => `${v}px`}
          />
          <RangeField
            label={`Drop y (in ${CANVASES[other(sourceSide)].label.toLowerCase()})`}
            value={Math.min(state.y, target.canvas.height)}
            min={0}
            max={target.canvas.height}
            step={2}
            onChange={(y) => update({ y })}
            format={(v) => `${v}px`}
          />
          <p className="gl-note" aria-live="polite">
            {simulated
              ? simulated.accepted
                ? `Would land at ${formatRect(simulated.item)} via ${simulated.strategy}.`
                : 'Rejected: nothing fits at that point.'
              : 'Nothing to transfer from this side.'}
          </p>
          <div className="gd-actions">
            <Button variant="primary" disabled={!simulated?.accepted} onClick={simulate}>
              Transfer
            </Button>
            <Button
              onClick={() => {
                reset()
                setLeft(buildLeft())
                setRight(buildRight())
                setLast(null)
              }}
            >
              Reset
            </Button>
          </div>
        </ControlGroup>
      </aside>
      <CoreInspector layout={left} title="Left layout data (960×600)" />
      <CoreInspector layout={right} title="Right layout data (480×600)" />
      <CodeExample code={SNIPPET} />
    </div>
  )
}
