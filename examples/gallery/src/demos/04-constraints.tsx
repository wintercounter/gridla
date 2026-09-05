import { useMemo, useState } from 'react'

import { resizeItem, type GridLayout, type SolveResult } from 'gridla'
import { dashboardLayout, formatRect } from '@gridla/demo-kit'
import { Button, ControlGroup, DemoFrame, RangeField } from '@gridla/demo-kit/react'

import { CodeExample } from '../lib/code'
import { CoreInspector } from '../lib/core-inspector'
import { CoreStage, RectOutline } from '../lib/core-stage'
import { useHashState } from '../lib/hash-state'

const SNIPPET = `import { resizeItem } from 'gridla'

const constrained = {
  ...layout,
  items: layout.items.map((item) =>
    item.id === 'chart' ? { ...item, minW: 240, maxW: 520, minH: 120, maxH: 360 } : item,
  ),
}

// Ask for 800×420. The solver clamps to the constraints, then makes room.
const result = resizeItem({
  layout: constrained,
  itemId: 'chart',
  rect: { w: 800, h: 420 },
  options: { gap: 12 },
})
result.accepted // true
result.item     // { id: 'chart', w: 520, h: 360, ... }
result.strategy // 'resize' | 'resize-shrink-neighbors' | 'rejected'`

type Data = { label: string }

const DEFAULTS = { minW: 240, maxW: 520, minH: 120, maxH: 360, w: 462, h: 280 }

export function ConstraintsDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const [committed, setCommitted] = useState<GridLayout<Data>>(() => dashboardLayout(12))

  const constrained = useMemo<GridLayout<Data>>(
    () => ({
      ...committed,
      items: committed.items.map((item) =>
        item.id === 'chart'
          ? { ...item, minW: state.minW, maxW: state.maxW, minH: state.minH, maxH: state.maxH }
          : item,
      ),
    }),
    [committed, state.minW, state.maxW, state.minH, state.maxH],
  )

  const result = useMemo<SolveResult<Data>>(
    () =>
      resizeItem({
        layout: constrained,
        itemId: 'chart',
        rect: { w: state.w, h: state.h },
        options: { gap: 12 },
      }),
    [constrained, state.w, state.h],
  )

  const chart = constrained.items.find((item) => item.id === 'chart')
  const requested = chart ? { x: chart.x, y: chart.y, w: state.w, h: state.h } : null
  const shown = result.accepted ? result.layout : constrained

  return (
    <DemoFrame
      stageLabel="chart · live resize preview"
      stage={
        <CoreStage
          layout={shown}
          ariaLabel="Dashboard where the chart is resized under constraints"
        >
          {requested ? <RectOutline rect={requested} kind="source" label="requested" /> : null}
          {result.accepted ? (
            <RectOutline
              rect={result.item}
              kind="preview"
              label={`solved ${formatRect(result.item)}`}
            />
          ) : (
            <RectOutline rect={result.item} kind="rejected" label="rejected" />
          )}
        </CoreStage>
      }
      controls={
        <>
          <ControlGroup title="Constraints on chart">
            <RangeField
              label="minW"
              value={state.minW}
              min={40}
              max={600}
              step={10}
              onChange={(minW) => update({ minW: Math.min(minW, state.maxW) })}
            />
            <RangeField
              label="maxW"
              value={state.maxW}
              min={40}
              max={936}
              step={10}
              onChange={(maxW) => update({ maxW: Math.max(maxW, state.minW) })}
            />
            <RangeField
              label="minH"
              value={state.minH}
              min={40}
              max={400}
              step={10}
              onChange={(minH) => update({ minH: Math.min(minH, state.maxH) })}
            />
            <RangeField
              label="maxH"
              value={state.maxH}
              min={40}
              max={576}
              step={10}
              onChange={(maxH) => update({ maxH: Math.max(maxH, state.minH) })}
            />
          </ControlGroup>
          <ControlGroup title="Requested size">
            <RangeField
              label="Width"
              value={state.w}
              min={40}
              max={936}
              step={2}
              onChange={(w) => update({ w })}
              format={(v) => `${v}px`}
            />
            <RangeField
              label="Height"
              value={state.h}
              min={40}
              max={576}
              step={2}
              onChange={(h) => update({ h })}
              format={(v) => `${v}px`}
            />
          </ControlGroup>
          <div className="gd-actions">
            <Button
              variant="primary"
              disabled={!result.accepted}
              onClick={() => setCommitted(result.layout)}
            >
              Apply
            </Button>
            <Button
              onClick={() => {
                reset()
                setCommitted(dashboardLayout(12))
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
            strategy={result.strategy}
            accepted={result.accepted}
            extra={
              <>
                <span>
                  requested{' '}
                  <b>
                    {state.w}×{state.h}
                  </b>
                </span>
                <span>
                  solved{' '}
                  <b>
                    {Math.round(result.item.w)}×{Math.round(result.item.h)}
                  </b>
                </span>
                <span>
                  siblings shifted <b>{result.shiftedSiblings ? 'yes' : 'no'}</b>
                </span>
              </>
            }
          />
          <CodeExample code={SNIPPET} />
        </>
      }
    />
  )
}
