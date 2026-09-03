import { useMemo } from 'react'

import { applyGap, projectLayout, type GridLayout, type ProjectionStrategy } from 'gridla'
import { dashboardLayout } from '@gridla/demo-kit'
import {
  Button,
  ControlGroup,
  DemoFrame,
  LayoutTable,
  RangeField,
  SelectField,
  Toggle,
} from '@gridla/demo-kit/react'

import { CodeExample } from '../lib/code'
import { CoreInspector } from '../lib/core-inspector'
import { CoreStage, RectOutline } from '../lib/core-stage'
import { useHashState } from '../lib/hash-state'

const SNIPPET = `import { applyGap, createItem, projectLayout } from 'gridla'

// A layout is a plain object: a canvas and absolutely positioned items.
const layout = {
  canvas: { width: 960, height: 600, padding: { top: 12, right: 12, bottom: 12, left: 12 }, heightMode: 'bounded' },
  items: [
    createItem('header', { w: 936, h: 72, sizeMode: 'fixed-h' }, 12, 12),
    createItem('chart', { w: 462, h: 280, minW: 160 }, 12, 96),
    createItem('sidebar', { w: 462, h: 280, minW: 120 }, 486, 96),
  ],
}

// Re-space the authored rows and columns, then project onto another canvas.
// Rows and columns keep their relationships at both steps.
const spaced = applyGap(layout, 20)
const projected = projectLayout(spaced, { width: 640, height: 480 }, { strategy: 'chain', gap: 20 })
projected.items.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }))`

const DEFAULTS = { width: 960, height: 600, strategy: 'chain', gap: 12, authored: false }

const STRATEGIES = [
  { value: 'chain', label: 'chain (rows and columns flex)' },
  { value: 'segments', label: 'segments (every edge is a stop)' },
] as const

export function StaticLayoutDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const source = useMemo(() => dashboardLayout(DEFAULTS.gap), [])
  // The gap is applied to the authored layout first, so the slider visibly
  // re-spaces the rows and columns before they are projected.
  const spaced = useMemo(() => applyGap(source, state.gap), [source, state.gap])
  const projected = useMemo<GridLayout>(
    () =>
      projectLayout(
        spaced,
        { ...spaced.canvas, width: state.width, height: state.height },
        { strategy: state.strategy as ProjectionStrategy, gap: state.gap },
      ),
    [spaced, state.width, state.height, state.strategy, state.gap],
  )
  const changed = useMemo(() => {
    const ids = new Set<string>()
    for (const item of projected.items) {
      const original = source.items.find((entry) => entry.id === item.id)
      if (!original) continue
      if (
        Math.round(original.x) !== Math.round(item.x) ||
        Math.round(original.y) !== Math.round(item.y) ||
        Math.round(original.w) !== Math.round(item.w) ||
        Math.round(original.h) !== Math.round(item.h)
      ) {
        ids.add(item.id)
      }
    }
    return ids
  }, [projected, source])

  return (
    <DemoFrame
      stageLabel={`authored 960×600 · projected ${state.width}×${state.height}`}
      stage={
        <CoreStage
          layout={projected}
          ariaLabel="A dashboard layout projected onto the selected canvas size"
        >
          {state.authored
            ? source.items.map((item) => <RectOutline key={item.id} rect={item} kind="source" />)
            : null}
        </CoreStage>
      }
      controls={
        <>
          <ControlGroup title="Target canvas">
            <RangeField
              label="Width"
              value={state.width}
              min={320}
              max={1280}
              step={16}
              onChange={(width) => update({ width })}
              format={(v) => `${v}px`}
            />
            <RangeField
              label="Height"
              value={state.height}
              min={240}
              max={800}
              step={16}
              onChange={(height) => update({ height })}
              format={(v) => `${v}px`}
            />
          </ControlGroup>
          <ControlGroup title="Projection">
            <SelectField
              label="Strategy"
              value={state.strategy as ProjectionStrategy}
              options={STRATEGIES}
              onChange={(strategy) => update({ strategy })}
            />
            <RangeField
              label="Gap"
              value={state.gap}
              min={0}
              max={32}
              step={2}
              onChange={(gap) => update({ gap })}
              format={(v) => `${v}px`}
            />
            <Toggle
              label="Show authored rects"
              checked={state.authored}
              onChange={(authored) => update({ authored })}
            />
          </ControlGroup>
          <div className="gd-actions">
            <Button onClick={reset}>Reset</Button>
          </div>
        </>
      }
      inspector={
        <>
          <CoreInspector
            layout={projected}
            extra={
              <span>
                changed <b>{changed.size}</b> of {projected.items.length}
              </span>
            }
            title="Projected layout"
          />
          <div className="gd-inspector">
            <details open>
              <summary>Projected coordinates (changed rows in accent)</summary>
              <LayoutTable layout={projected} changed={changed} />
            </details>
          </div>
          <CodeExample code={SNIPPET} />
        </>
      }
    />
  )
}
