import { useMemo, useState } from 'react'

import {
  createItem,
  itemBottom,
  itemRight,
  moveItem,
  type GridLayout,
  type SolveResult,
} from 'gridla'
import { canvas, formatRect } from '@gridla/demo-kit'
import {
  Button,
  ControlGroup,
  DemoFrame,
  RangeField,
  SelectField,
  Toggle,
} from '@gridla/demo-kit/react'

import { CodeExample } from '../lib/code'
import { CoreInspector } from '../lib/core-inspector'
import { CoreStage, Guide, RectOutline } from '../lib/core-stage'
import { useCoreDrag } from '../lib/drag'
import { useHashState } from '../lib/hash-state'

const SNIPPET = `import { moveItem } from 'gridla'

// Edges within snapDistance of a sibling edge attract; the result tells you
// where the item ended, so alignment guides are a diff between siblings and
// the solved rect.
const result = moveItem({
  layout,
  itemId: 'card',
  position: pointer,
  options: { gap: 12, snapDistance: 24, snap: true }, // snap: false to bypass (Ctrl in the React adapter)
})
const aligned = layout.items.filter((s) => s.id !== 'card' && (s.x === result.item.x || s.y === result.item.y))`

type Data = { label: string }

const DEFAULTS = { snapDistance: 24, snap: true, gap: 12, item: 'card', x: 120, y: 340 }

function build(gap = DEFAULTS.gap): GridLayout<Data> {
  return {
    canvas: canvas(960, 600, 24),
    items: [
      createItem('header', { w: 912, h: 72, sizeMode: 'fixed-h' }, 24, 24, { label: 'Header' }),
      createItem('chart', { w: 540, h: 220, minW: 120, minH: 80 }, 24, 96 + gap, {
        label: 'Chart',
      }),
      createItem('sidebar', { w: 372 - gap, h: 340, minW: 120, minH: 80 }, 564 + gap, 96 + gap, {
        label: 'Sidebar',
      }),
      createItem('card', { w: 220, h: 140, minW: 80, minH: 60 }, 120, 340, {
        label: 'Card · drag me',
      }),
    ],
  }
}

function guides(layout: GridLayout, item: GridLayout['items'][number]) {
  const xs = new Set<number>()
  const ys = new Set<number>()
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5
  for (const sibling of layout.items) {
    if (sibling.id === item.id) continue
    for (const edge of [sibling.x, itemRight(sibling)]) {
      if (near(edge, item.x) || near(edge, itemRight(item))) xs.add(Math.round(edge))
    }
    for (const edge of [sibling.y, itemBottom(sibling)]) {
      if (near(edge, item.y) || near(edge, itemBottom(item))) ys.add(Math.round(edge))
    }
  }
  return { xs: [...xs], ys: [...ys] }
}

export function SnapAlignmentDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const [layout, setLayout] = useState<GridLayout<Data>>(() => build(DEFAULTS.gap))
  const [preview, setPreview] = useState<SolveResult<Data> | null>(null)
  const options = useMemo(
    () => ({ gap: state.gap, snapDistance: state.snapDistance, snap: state.snap }),
    [state.gap, state.snapDistance, state.snap],
  )
  const canDrag = (id: string) => id !== 'header'
  const drag = useCoreDrag<Data>({
    layout,
    options,
    canDrag,
    onPreview: setPreview,
    onCommit: (result) => {
      if (result.accepted) setLayout(result.layout)
    },
  })

  const sliderResult = useMemo<SolveResult<Data> | null>(
    () =>
      preview || !layout.items.some((item) => item.id === state.item)
        ? null
        : moveItem({ layout, itemId: state.item, position: { x: state.x, y: state.y }, options }),
    [preview, layout, state.item, state.x, state.y, options],
  )
  const live = preview ?? sliderResult
  const shown = live?.accepted ? live.layout : layout
  const lines = live ? guides(shown, live.item) : { xs: [], ys: [] }
  const requested = live && preview ? null : { x: state.x, y: state.y }

  return (
    <DemoFrame
      stageLabel={state.snap ? `snap ${state.snapDistance}px` : 'snap off'}
      stage={
        <CoreStage
          layout={shown}
          ariaLabel="Layout where dragging an item snaps it to sibling edges"
          onPointerDown={drag.onPointerDown}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
          draggable={(item) => canDrag(item.id)}
        >
          {lines.xs.map((at) => (
            <Guide key={`x${at}`} axis="x" at={at} />
          ))}
          {lines.ys.map((at) => (
            <Guide key={`y${at}`} axis="y" at={at} />
          ))}
          {live ? (
            <RectOutline
              rect={live.item}
              kind={live.accepted ? 'preview' : 'rejected'}
              label={`${live.strategy} · ${formatRect(live.item)}`}
            />
          ) : null}
          {requested && live ? (
            <RectOutline rect={{ ...requested, w: live.item.w, h: live.item.h }} kind="source" />
          ) : null}
        </CoreStage>
      }
      controls={
        <>
          <ControlGroup title="Snapping">
            <Toggle
              label="Snap to edges"
              checked={state.snap}
              onChange={(snap) => update({ snap })}
            />
            <RangeField
              label="Snap distance"
              value={state.snapDistance}
              min={0}
              max={64}
              step={2}
              onChange={(snapDistance) => update({ snapDistance })}
              format={(v) => `${v}px`}
            />
            <RangeField
              label="Gap"
              value={state.gap}
              min={0}
              max={32}
              step={2}
              onChange={(gap) => {
                // The frame is rebuilt around the new gap; the card stays where
                // you dragged it so the snap targets visibly move under it.
                setLayout((current) => {
                  const card = current.items.find((item) => item.id === 'card')
                  const next = build(gap)
                  return {
                    ...next,
                    items: next.items.map((item) => (item.id === 'card' && card ? card : item)),
                  }
                })
                update({ gap })
              }}
              format={(v) => `${v}px`}
            />
          </ControlGroup>
          <ControlGroup title="Keyboard move (preview)">
            <SelectField
              label="Item"
              value={state.item}
              options={layout.items
                .filter((item) => item.id !== 'header')
                .map((item) => ({ value: item.id, label: item.id }))}
              onChange={(item) => update({ item })}
            />
            <RangeField
              label="Requested x"
              value={state.x}
              min={0}
              max={960}
              step={1}
              onChange={(x) => update({ x })}
            />
            <RangeField
              label="Requested y"
              value={state.y}
              min={0}
              max={600}
              step={1}
              onChange={(y) => update({ y })}
            />
          </ControlGroup>
          <div className="gd-actions">
            <Button
              variant="primary"
              disabled={!sliderResult?.accepted}
              onClick={() => {
                if (sliderResult?.accepted) setLayout(sliderResult.layout)
              }}
            >
              Apply move
            </Button>
            <Button
              onClick={() => {
                reset()
                setLayout(build(DEFAULTS.gap))
                setPreview(null)
              }}
            >
              Reset
            </Button>
          </div>
        </>
      }
      inspector={
        <>
          <CoreInspector
            layout={shown}
            strategy={live?.strategy ?? null}
            accepted={live?.accepted}
            extra={
              live ? (
                <>
                  <span>
                    guides <b>{lines.xs.length + lines.ys.length}</b>
                  </span>
                  <span>
                    dragging <b>{drag.active ?? '—'}</b>
                  </span>
                </>
              ) : null
            }
          />
          <CodeExample code={SNIPPET} />
        </>
      }
    />
  )
}
