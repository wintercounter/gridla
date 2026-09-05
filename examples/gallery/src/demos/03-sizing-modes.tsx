import { useMemo } from 'react'

import { createItem, projectLayout, type GridLayout, type GridSizeMode } from 'gridla'
import { canvas } from '@gridla/demo-kit'
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

const SNIPPET = `import { createItem, projectLayout } from 'gridla'

const items = [
  createItem('free',    { w: 220, h: 200 }, 0, 0),                        // both axes scale
  createItem('fixed-w', { w: 220, h: 200, sizeMode: 'fixed-w' }, 240, 0), // width stays 220px
  createItem('fixed-h', { w: 220, h: 200, sizeMode: 'fixed-h' }, 480, 0), // height stays 200px
  createItem('fixed',   { w: 220, h: 200, sizeMode: 'fixed' }, 720, 0),   // neither scales
]
const wide = projectLayout({ canvas, items }, { width: 1280, height: 720 }, { gap: 20 })`

const MODES = [
  { value: 'free', label: 'free' },
  { value: 'fixed-w', label: 'fixed-w' },
  { value: 'fixed-h', label: 'fixed-h' },
  { value: 'fixed', label: 'fixed' },
] as const

const DEFAULTS = {
  width: 1200,
  height: 600,
  a: 'free',
  b: 'fixed-w',
  c: 'fixed-h',
  d: 'fixed',
  authored: true,
}

function build(modes: [GridSizeMode, GridSizeMode, GridSizeMode, GridSizeMode]): GridLayout<{
  label: string
}> {
  const pad = 16
  const c = canvas(960, 600, pad)
  const gap = 20
  const inner = 960 - pad * 2
  const w = (inner - gap * 3) / 4
  const ids = ['tile-a', 'tile-b', 'tile-c', 'tile-d']
  return {
    canvas: c,
    items: [
      createItem('banner', { w: inner, h: 80, sizeMode: 'fixed-h' }, pad, pad, {
        label: 'Banner · fixed-h',
      }),
      ...ids.map((id, index) =>
        createItem(
          id,
          { w, h: 300, minW: 60, minH: 60, sizeMode: modes[index] },
          pad + index * (w + gap),
          pad + 80 + gap,
          { label: `${id} · ${modes[index]}` },
        ),
      ),
      createItem(
        'footer',
        { w: inner, h: 600 - pad * 2 - 80 - 300 - gap * 2, minH: 60 },
        pad,
        pad + 80 + gap + 300 + gap,
        {
          label: 'Footer · free',
        },
      ),
    ],
  }
}

export function SizingModesDemo() {
  const [state, update, reset] = useHashState(DEFAULTS)
  const source = useMemo(
    () =>
      build([
        state.a as GridSizeMode,
        state.b as GridSizeMode,
        state.c as GridSizeMode,
        state.d as GridSizeMode,
      ]),
    [state.a, state.b, state.c, state.d],
  )
  const projected = useMemo(
    () =>
      projectLayout(
        source,
        { ...source.canvas, width: state.width, height: state.height },
        { gap: 20 },
      ),
    [source, state.width, state.height],
  )
  const changed = useMemo(
    () =>
      new Set(
        projected.items
          .filter((item) => {
            const original = source.items.find((entry) => entry.id === item.id)
            return (
              original &&
              (Math.round(original.w) !== Math.round(item.w) ||
                Math.round(original.h) !== Math.round(item.h))
            )
          })
          .map((item) => item.id),
      ),
    [projected, source],
  )

  const modeField = (key: 'a' | 'b' | 'c' | 'd', label: string) => (
    <SelectField
      label={label}
      value={state[key] as GridSizeMode}
      options={MODES}
      onChange={(value) => update({ [key]: value } as Partial<typeof DEFAULTS>)}
    />
  )

  return (
    <DemoFrame
      stageLabel={`authored 960×600 · projected ${state.width}×${state.height}`}
      stage={
        <CoreStage layout={projected} ariaLabel="Four tiles with different sizing modes">
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
              min={480}
              max={1600}
              step={20}
              onChange={(width) => update({ width })}
              format={(v) => `${v}px`}
            />
            <RangeField
              label="Height"
              value={state.height}
              min={300}
              max={900}
              step={20}
              onChange={(height) => update({ height })}
              format={(v) => `${v}px`}
            />
            <Toggle
              label="Show authored rects"
              checked={state.authored}
              onChange={(authored) => update({ authored })}
            />
          </ControlGroup>
          <ControlGroup title="Tile size modes">
            {modeField('a', 'tile-a')}
            {modeField('b', 'tile-b')}
            {modeField('c', 'tile-c')}
            {modeField('d', 'tile-d')}
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
                resized <b>{changed.size}</b>
              </span>
            }
          />
          <div className="gd-inspector">
            <details open>
              <summary>Sizes after projection</summary>
              <LayoutTable layout={projected} changed={changed} />
            </details>
          </div>
          <CodeExample code={SNIPPET} />
        </>
      }
    />
  )
}
