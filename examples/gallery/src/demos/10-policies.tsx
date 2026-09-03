import { useMemo, useState } from 'react'

import { createItem, isGhost, isLocked, moveItem, type GridLayout, type SolveResult } from 'gridla'
import { canvas, formatRect } from '@gridla/demo-kit'
import { Button, ControlGroup, DemoFrame, RangeField, Toggle } from '@gridla/demo-kit/react'

import { CodeExample } from '../lib/code'
import { CoreInspector } from '../lib/core-inspector'
import { CoreStage, RectOutline } from '../lib/core-stage'
import { useCoreDrag } from '../lib/drag'
import { useHashState } from '../lib/hash-state'

const SNIPPET = `import { isGhost, isLocked, moveItem } from 'gridla'

const items = [
  // A wall: blocks other items but is never pushed, swapped or shrunk.
  { id: 'sidebar', x: 600, y: 96, w: 336, h: 400, policy: { movement: 'locked' } },
  // A ghost: solvers move, resize and place straight through it.
  { id: 'note', x: 200, y: 300, w: 240, h: 140, policy: { collision: 'ignore' } },
  { id: 'chart', x: 24, y: 96, w: 540, h: 260 },
]
isLocked(items[0]) // true
isGhost(items[1])  // true
moveItem({ layout: { canvas, items }, itemId: 'chart', position: { x: 500, y: 96 } })
// -> the chart cannot push the sidebar; the solver shrinks, slides, or rejects`

type Data = { label: string }

const DEFAULTS = { locked: true, ghost: true, x: 24, y: 96, gap: 12 }

function build(locked: boolean, ghost: boolean): GridLayout<Data> {
  const sidebar = createItem('sidebar', { w: 336, h: 468, minW: 120, minH: 120 }, 600, 96, {
    label: locked ? 'Sidebar · locked' : 'Sidebar',
  })
  if (locked) sidebar.policy = { movement: 'locked' }
  const note = createItem('note', { w: 240, h: 140, minW: 80, minH: 60 }, 200, 380, {
    label: ghost ? 'Note · ghost' : 'Note',
  })
  if (ghost) note.policy = { collision: 'ignore' }
  return {
    canvas: canvas(960, 600, 24),
    items: [
      createItem('header', { w: 912, h: 60, sizeMode: 'fixed-h' }, 24, 24, { label: 'Header' }),
      createItem('chart', { w: 540, h: 260, minW: 160, minH: 100 }, 24, 96, {
        label: 'Chart · drag me',
      }),
      sidebar,
      note,
    ],
  }
}

export function PoliciesDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const [override, setOverride] = useState<GridLayout<Data>['items'] | null>(null)
  const base = useMemo(() => build(state.locked, state.ghost), [state.locked, state.ghost])
  const layout = useMemo<GridLayout<Data>>(
    () =>
      override
        ? {
            canvas: base.canvas,
            items: override.map((item) => {
              const policy = base.items.find((entry) => entry.id === item.id)?.policy
              return policy ? { ...item, policy } : { ...item, policy: undefined }
            }),
          }
        : base,
    [base, override],
  )
  const [preview, setPreview] = useState<SolveResult<Data> | null>(null)
  const options = useMemo(() => ({ gap: state.gap, snapDistance: 16 }), [state.gap])
  const drag = useCoreDrag<Data>({
    layout,
    options,
    canDrag: (id) => id !== 'header',
    onPreview: setPreview,
    onCommit: (result) => {
      if (result.accepted) setOverride(result.layout.items)
    },
  })
  const sliderResult = useMemo(
    () =>
      preview
        ? null
        : moveItem({ layout, itemId: 'chart', position: { x: state.x, y: state.y }, options }),
    [preview, layout, state.x, state.y, options],
  )
  const live = preview ?? sliderResult
  const shown = live?.accepted ? live.layout : layout

  return (
    <DemoFrame
      stageLabel="drag the chart into the sidebar or over the note"
      stage={
        <CoreStage
          layout={shown}
          ariaLabel="Layout with a locked sidebar and a ghost note; drag the chart against them"
          onPointerDown={drag.onPointerDown}
          onPointerMove={drag.onPointerMove}
          onPointerUp={drag.onPointerUp}
        >
          {live ? (
            <RectOutline
              rect={live.item}
              kind={live.accepted ? 'preview' : 'rejected'}
              label={`${live.strategy}${live.accepted ? '' : ' · rejected'}`}
            />
          ) : null}
        </CoreStage>
      }
      controls={
        <>
          <ControlGroup title="Policies">
            <Toggle
              label="Sidebar is locked (movement: locked)"
              checked={state.locked}
              onChange={(locked) => update({ locked })}
            />
            <Toggle
              label="Note is a ghost (collision: ignore)"
              checked={state.ghost}
              onChange={(ghost) => update({ ghost })}
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
          <ControlGroup title="Move chart (keyboard)">
            <RangeField
              label="Requested x"
              value={state.x}
              min={0}
              max={960}
              step={2}
              onChange={(x) => update({ x })}
            />
            <RangeField
              label="Requested y"
              value={state.y}
              min={0}
              max={600}
              step={2}
              onChange={(y) => update({ y })}
            />
          </ControlGroup>
          <div className="gd-actions">
            <Button
              variant="primary"
              disabled={!sliderResult?.accepted}
              onClick={() => {
                if (sliderResult?.accepted) setOverride(sliderResult.layout.items)
              }}
            >
              Apply move
            </Button>
            <Button
              onClick={() => {
                reset()
                setOverride(null)
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
              <>
                <span>
                  locked{' '}
                  <b>
                    {layout.items
                      .filter(isLocked)
                      .map((item) => item.id)
                      .join(', ') || 'none'}
                  </b>
                </span>
                <span>
                  ghosts{' '}
                  <b>
                    {layout.items
                      .filter(isGhost)
                      .map((item) => item.id)
                      .join(', ') || 'none'}
                  </b>
                </span>
                {live ? (
                  <span>
                    candidate <b>{formatRect(live.item)}</b>
                  </span>
                ) : null}
              </>
            }
          />
          <CodeExample code={SNIPPET} />
        </>
      }
    />
  )
}
