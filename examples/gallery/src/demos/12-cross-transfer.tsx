import { useMemo, useState } from 'react'

import { createItem, transferItem, type GridLayout, type TransferResult } from 'gridla'
import { canvas, formatRect } from '@gridla/demo-kit'
import { Button, ControlGroup, RangeField, Segmented, SelectField } from '@gridla/demo-kit/react'

import { CodeExample } from '../lib/code'
import { CoreInspector } from '../lib/core-inspector'
import { CoreStage, RectOutline, type StagePointer } from '../lib/core-stage'
import { useHashState } from '../lib/hash-state'

const SNIPPET = `import { transferItem } from 'gridla'

// Pointer is in the TARGET canvas' coordinates. The item's size is scaled by
// the ratio of the two canvases unless you pass \`size\`.
const result = transferItem({
  source: left,
  target: right,
  itemId: 'chart',
  pointer: { x: 200, y: 150 },
  options: { gap: 12 },
})
if (result.accepted) {
  left = result.source  // without the item
  right = result.target // with the item placed
}
result.strategy // placement strategy used in the target, or 'rejected'`

type Data = { label: string }

const DEFAULTS = { direction: 'ab', item: 'chart', x: 200, y: 160, gap: 12 }

function buildA(): GridLayout<Data> {
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

function buildB(): GridLayout<Data> {
  return {
    canvas: canvas(480, 600, 12),
    items: [createItem('note', { w: 456, h: 160, minW: 60, minH: 40 }, 12, 12, { label: 'Note' })],
  }
}

export function CrossTransferDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const [a, setA] = useState<GridLayout<Data>>(buildA)
  const [b, setB] = useState<GridLayout<Data>>(buildB)
  const [last, setLast] = useState<TransferResult<Data> | null>(null)
  const forward = state.direction === 'ab'
  const source = forward ? a : b
  const target = forward ? b : a
  const itemId = source.items.some((item) => item.id === state.item)
    ? state.item
    : (source.items[0]?.id ?? '')

  const result = useMemo<TransferResult<Data> | null>(
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

  const commit = () => {
    if (!result?.accepted) return
    if (forward) {
      setA(result.source)
      setB(result.target)
    } else {
      setB(result.source)
      setA(result.target)
    }
    setLast(result)
  }

  const pick = ({ point, event }: StagePointer) => {
    update({ x: Math.round(point.x), y: Math.round(point.y) })
    if (event.detail >= 2) commit()
  }

  const stageFor = (layout: GridLayout<Data>, isTarget: boolean, label: string) => (
    <div className="gl-pane">
      <div className="gl-pane-head">
        <h3>{label}</h3>
        <b>{isTarget ? 'target' : 'source'}</b>
      </div>
      <CoreStage
        layout={isTarget && result?.accepted ? result.target : layout}
        ariaLabel={`${label}, the ${isTarget ? 'target' : 'source'} of the transfer`}
        onPointerDown={isTarget ? pick : ({ itemId: id }) => id && update({ item: id })}
      >
        {isTarget && result ? (
          <>
            <div
              className="gl-crosshair"
              aria-hidden="true"
              style={{ transform: `translate(${state.x}px, ${state.y}px)` }}
            />
            <RectOutline
              rect={result.item}
              kind={result.accepted ? 'preview' : 'rejected'}
              label={`${result.strategy} · ${formatRect(result.item)}`}
            />
          </>
        ) : null}
        {!isTarget ? (
          <RectOutline
            rect={layout.items.find((i) => i.id === itemId) ?? { x: 0, y: 0, w: 0, h: 0 }}
            kind="hover"
            label="leaving"
          />
        ) : null}
      </CoreStage>
    </div>
  )

  return (
    <div className="gd-frame">
      <div className="gl-compare-wrap">
        <div className="gd-compare">
          {forward ? stageFor(a, false, 'Left · 960×600') : stageFor(b, false, 'Right · 480×600')}
          {forward ? stageFor(b, true, 'Right · 480×600') : stageFor(a, true, 'Left · 960×600')}
        </div>
      </div>
      <aside className="gd-controls">
        <ControlGroup title="Transfer">
          <Segmented
            ariaLabel="Direction"
            value={state.direction}
            options={[
              { value: 'ab', label: 'Left → Right' },
              { value: 'ba', label: 'Right → Left' },
            ]}
            onChange={(direction) => update({ direction })}
          />
          <SelectField
            label="Item (or click it)"
            value={itemId}
            options={source.items.map((item) => ({ value: item.id, label: item.id }))}
            onChange={(item) => update({ item })}
          />
        </ControlGroup>
        <ControlGroup title="Pointer in target (or click the target)">
          <RangeField
            label="x"
            value={state.x}
            min={0}
            max={target.canvas.width}
            step={2}
            onChange={(x) => update({ x })}
          />
          <RangeField
            label="y"
            value={state.y}
            min={0}
            max={target.canvas.height}
            step={2}
            onChange={(y) => update({ y })}
          />
          <RangeField
            label="Gap"
            value={state.gap}
            min={0}
            max={32}
            step={2}
            onChange={(gap) => update({ gap })}
          />
        </ControlGroup>
        <div className="gd-actions">
          <Button variant="primary" disabled={!result?.accepted} onClick={commit}>
            Transfer
          </Button>
          <Button
            onClick={() => {
              reset()
              setA(buildA())
              setB(buildB())
              setLast(null)
            }}
          >
            Reset
          </Button>
        </div>
      </aside>
      <CoreInspector
        layout={target}
        strategy={result?.strategy ?? null}
        accepted={result?.accepted}
        extra={
          <>
            <span>
              scaled size{' '}
              <b>{result ? `${Math.round(result.item.w)}×${Math.round(result.item.h)}` : '—'}</b>
            </span>
            <span>
              last commit <b>{last ? `${last.item.id} · ${last.strategy}` : '—'}</b>
            </span>
          </>
        }
        title="Target layout (committed)"
      />
      <CodeExample code={SNIPPET} />
    </div>
  )
}
