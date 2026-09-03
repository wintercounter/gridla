import { useMemo, useState } from 'react'

import {
  applyGap,
  moveItem,
  placeItem,
  resizeItem,
  type GridLayout,
  type SolveResult,
} from 'gridla'
import { dashboardLayout, formatRect } from '@gridla/demo-kit'
import {
  Button,
  ControlGroup,
  DemoFrame,
  RangeField,
  Segmented,
  SelectField,
  Toggle,
} from '@gridla/demo-kit/react'

import { CodeExample } from '../lib/code'
import { CoreInspector } from '../lib/core-inspector'
import { CoreStage, RectOutline } from '../lib/core-stage'
import { useHashState } from '../lib/hash-state'

const SNIPPET = `import { moveItem, placeItem, resizeItem } from 'gridla'

const options = { gap: 12, snapDistance: 24 }

const moved = moveItem({ layout, itemId: 'chart', position: { x: 486, y: 96 }, options })
const resized = resizeItem({ layout, itemId: 'sidebar', rect: { w: 300, h: 200 }, options })
const placed = placeItem({
  layout,
  item: { id: 'note', w: 240, h: 140, minW: 80, minH: 60 },
  pointer: { x: 480, y: 300 },
  options,
})

// Every result has the same shape. Nothing is mutated; commit \`layout\` if accepted.
if (moved.accepted) layout = moved.layout
else console.log(moved.strategy) // 'rejected'; moved.item is the candidate that failed`

type Data = { label: string }
type Op = 'move' | 'resize' | 'place'

const DEFAULTS = {
  op: 'move',
  item: 'chart',
  x: 486,
  y: 96,
  w: 300,
  h: 200,
  gap: 12,
  snap: true,
  snapDistance: 24,
}

export function ProgrammaticOpsDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const [layout, setLayout] = useState<GridLayout<Data>>(() => dashboardLayout(state.gap))
  const [counter, setCounter] = useState(0)
  const op = state.op as Op
  const options = useMemo(
    () => ({ gap: state.gap, snap: state.snap, snapDistance: state.snapDistance }),
    [state.gap, state.snap, state.snapDistance],
  )
  const ids = layout.items.map((item) => ({ value: item.id, label: item.id }))
  const itemId = layout.items.some((item) => item.id === state.item)
    ? state.item
    : (layout.items[0]?.id ?? '')

  const result = useMemo<SolveResult<Data> | null>(() => {
    if (!itemId && op !== 'place') return null
    if (op === 'move')
      return moveItem({ layout, itemId, position: { x: state.x, y: state.y }, options })
    if (op === 'resize')
      return resizeItem({ layout, itemId, rect: { w: state.w, h: state.h }, options })
    return placeItem<Data>({
      layout,
      item: {
        id: `note-${counter + 1}`,
        w: state.w,
        h: state.h,
        minW: 80,
        minH: 60,
        data: { label: `Note ${counter + 1}` },
      },
      pointer: { x: state.x, y: state.y },
      options,
    })
  }, [op, layout, itemId, state.x, state.y, state.w, state.h, options, counter])

  const requested =
    op === 'move'
      ? (() => {
          const item = layout.items.find((entry) => entry.id === itemId)
          return item ? { x: state.x, y: state.y, w: item.w, h: item.h } : null
        })()
      : op === 'resize'
        ? (() => {
            const item = layout.items.find((entry) => entry.id === itemId)
            return item ? { x: item.x, y: item.y, w: state.w, h: state.h } : null
          })()
        : { x: state.x - state.w / 2, y: state.y - state.h / 2, w: state.w, h: state.h }

  const shown = result?.accepted ? result.layout : layout

  return (
    <DemoFrame
      stageLabel={`${op} · preview`}
      stage={
        <CoreStage layout={shown} ariaLabel="Dashboard driven by programmatic solver calls">
          {requested ? <RectOutline rect={requested} kind="source" label="requested" /> : null}
          {result ? (
            result.accepted ? (
              <RectOutline
                rect={result.item}
                kind="preview"
                label={`${result.strategy} · ${formatRect(result.item)}`}
              />
            ) : (
              <RectOutline
                rect={result.item}
                kind="rejected"
                label={`rejected · ${result.strategy}`}
              />
            )
          ) : null}
        </CoreStage>
      }
      controls={
        <>
          <ControlGroup title="Operation">
            <Segmented
              ariaLabel="Operation"
              value={op}
              options={[
                { value: 'move', label: 'move' },
                { value: 'resize', label: 'resize' },
                { value: 'place', label: 'place' },
              ]}
              onChange={(next) => update({ op: next })}
            />
            {op !== 'place' ? (
              <SelectField
                label="Item"
                value={itemId}
                options={ids}
                onChange={(item) => update({ item })}
              />
            ) : null}
          </ControlGroup>
          <ControlGroup
            title={
              op === 'resize'
                ? 'Requested size'
                : op === 'place'
                  ? 'Pointer and size'
                  : 'Requested position'
            }
          >
            {op !== 'resize' ? (
              <>
                <RangeField
                  label={op === 'place' ? 'Pointer x' : 'x'}
                  value={state.x}
                  min={0}
                  max={960}
                  step={2}
                  onChange={(x) => update({ x })}
                />
                <RangeField
                  label={op === 'place' ? 'Pointer y' : 'y'}
                  value={state.y}
                  min={0}
                  max={600}
                  step={2}
                  onChange={(y) => update({ y })}
                />
              </>
            ) : null}
            {op !== 'move' ? (
              <>
                <RangeField
                  label="w"
                  value={state.w}
                  min={40}
                  max={936}
                  step={2}
                  onChange={(w) => update({ w })}
                />
                <RangeField
                  label="h"
                  value={state.h}
                  min={40}
                  max={576}
                  step={2}
                  onChange={(h) => update({ h })}
                />
              </>
            ) : null}
          </ControlGroup>
          <ControlGroup title="Solve options">
            <RangeField
              label="Gap"
              value={state.gap}
              min={0}
              max={32}
              step={2}
              onChange={(gap) => {
                // Re-space the committed layout so the new gap is visible at once.
                setLayout((current) => applyGap(current, gap))
                update({ gap })
              }}
            />
            <RangeField
              label="Snap distance"
              value={state.snapDistance}
              min={0}
              max={64}
              step={4}
              onChange={(snapDistance) => update({ snapDistance })}
            />
            <Toggle label="Snap" checked={state.snap} onChange={(snap) => update({ snap })} />
          </ControlGroup>
          <div className="gd-actions">
            <Button
              variant="primary"
              disabled={!result?.accepted}
              onClick={() => {
                if (!result?.accepted) return
                setLayout(result.layout)
                if (op === 'place') setCounter((n) => n + 1)
              }}
            >
              Apply
            </Button>
            <Button
              onClick={() => {
                reset()
                setLayout(dashboardLayout(12))
                setCounter(0)
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
            layout={layout}
            strategy={result?.strategy ?? null}
            accepted={result?.accepted}
            extra={
              result ? (
                <>
                  <span>
                    candidate <b>{formatRect(result.item)}</b>
                  </span>
                  <span>
                    siblings shifted <b>{result.shiftedSiblings ? 'yes' : 'no'}</b>
                  </span>
                </>
              ) : null
            }
            title="Committed layout"
          />
          <CodeExample code={SNIPPET} />
        </>
      }
    />
  )
}
