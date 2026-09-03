import { useMemo, useRef } from 'react'

import { applyGap, projectLayout, type GridLayout, type ProjectionStrategy } from 'gridla'
import { dashboardLayout } from '@gridla/demo-kit'
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
import { CoreStage } from '../lib/core-stage'
import { useHashState } from '../lib/hash-state'
import { useElementWidth } from '../lib/measure'

const SNIPPET = `import { applyGap, projectLayout } from 'gridla'

// Space the authored layout once; projection keeps that gap at every size.
const source = applyGap(authored, 12)

// Measure the container yourself (ResizeObserver, a layout effect, anything).
const observer = new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect
  const rendered = projectLayout(source, { ...source.canvas, width, height }, { gap: 12 })
  paint(rendered) // rendered.items are in container pixels
})
observer.observe(container)`

const DEFAULTS = { fill: 100, height: 480, scrollable: false, strategy: 'chain', gap: 12 }

const PRESETS = [
  { value: 'phone', label: '360' },
  { value: 'tablet', label: '768' },
  { value: 'fill', label: 'Fill' },
] as const

export function ResponsiveProjectionDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const wrapper = useRef<HTMLDivElement | null>(null)
  const available = useElementWidth(wrapper)
  const authored = useMemo(() => dashboardLayout(12), [])
  // Re-space the authored layout with the slider gap so the change is visible
  // even when the container matches the authored size.
  const source = useMemo(() => applyGap(authored, state.gap), [authored, state.gap])
  const width = Math.max(120, Math.round((available * state.fill) / 100))

  const rendered = useMemo<GridLayout>(
    () =>
      width > 0
        ? projectLayout(
            source,
            {
              ...source.canvas,
              width,
              height: state.height,
              heightMode: state.scrollable ? 'scrollable' : 'bounded',
            },
            { strategy: state.strategy as ProjectionStrategy, gap: state.gap },
          )
        : source,
    [source, width, state.height, state.scrollable, state.strategy, state.gap],
  )

  const preset =
    state.fill === 100
      ? 'fill'
      : Math.abs(width - 360) < 2
        ? 'phone'
        : Math.abs(width - 768) < 2
          ? 'tablet'
          : 'custom'

  return (
    <DemoFrame
      stageLabel={`measured ${width}×${state.height}`}
      stage={
        <div ref={wrapper} className="gl-measure-wrap">
          <div style={{ width: `${state.fill}%` }} className="gl-measure-inner">
            <CoreStage
              layout={rendered}
              fit="none"
              ariaLabel="A dashboard layout projected live onto the measured container"
            />
          </div>
        </div>
      }
      controls={
        <>
          <ControlGroup title="Container">
            <RangeField
              label="Container width"
              value={state.fill}
              min={30}
              max={100}
              step={1}
              onChange={(fill) => update({ fill })}
              format={(v) => `${v}% · ${Math.round((available * v) / 100)}px`}
            />
            <Segmented
              ariaLabel="Width presets"
              value={preset === 'custom' ? 'fill' : preset}
              options={PRESETS}
              onChange={(value) => {
                if (available === 0) return
                const target = value === 'phone' ? 360 : value === 'tablet' ? 768 : available
                update({
                  fill: Math.max(30, Math.min(100, Math.round((target / available) * 100))),
                })
              }}
            />
            <RangeField
              label="Container height"
              value={state.height}
              min={240}
              max={720}
              step={16}
              onChange={(height) => update({ height })}
              format={(v) => `${v}px`}
            />
            <Toggle
              label="Scrollable height"
              checked={state.scrollable}
              onChange={(scrollable) => update({ scrollable })}
            />
          </ControlGroup>
          <ControlGroup title="Projection">
            <SelectField
              label="Strategy"
              value={state.strategy as ProjectionStrategy}
              options={[
                { value: 'chain', label: 'chain' },
                { value: 'segments', label: 'segments' },
              ]}
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
          </ControlGroup>
          <div className="gd-actions">
            <Button onClick={reset}>Reset</Button>
          </div>
        </>
      }
      inspector={
        <>
          <CoreInspector layout={rendered} title="Rendered layout (container pixels)" />
          <CodeExample code={SNIPPET} />
        </>
      }
    />
  )
}
