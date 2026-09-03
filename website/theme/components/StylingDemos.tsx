import { useId, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'

import type { GridLayout, GridResizeEdge } from 'gridla'
import { rectStyle } from 'gridla/interaction'
import {
  GridCanvas,
  GridItem,
  GridPreviewOutline,
  GridProvider,
  useGridPreview,
} from 'gridla/react'

type Data = { label: string }
type Layout = GridLayout<Data>

const CANVAS = {
  width: 600,
  height: 260,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  heightMode: 'bounded' as const,
}

const ALL_EDGES: readonly GridResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
const CORNERS: readonly GridResizeEdge[] = ['ne', 'nw', 'se', 'sw']

const subscribeNever = () => () => {}

/** True after hydration. Canvases measure themselves, so they render in the browser only. */
function useMounted() {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  )
}

function Frame({
  title,
  caption,
  status,
  onReset,
  controls,
  children,
}: {
  title: string
  caption: ReactNode
  status?: ReactNode
  onReset: () => void
  controls?: ReactNode
  children: ReactNode
}) {
  const mounted = useMounted()
  return (
    <article className="g-mini g-styling-demo">
      <header className="g-mini-head">
        <h4>{title}</h4>
        <button type="button" className="g-mini-reset" onClick={onReset}>
          Reset
        </button>
      </header>
      {controls ? <div className="g-styling-controls">{controls}</div> : null}
      <div className="g-mini-stage g-styling-stage">{mounted ? children : null}</div>
      {status ? <div className="g-mini-status">{status}</div> : null}
      <p className="g-mini-caption">{caption}</p>
    </article>
  )
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="g-styling-segmented">
      <legend className="g-styling-control-label">{label}</legend>
      <div className="g-styling-segmented-track">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function Range({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  unit: string
  onChange: (value: number) => void
}) {
  const id = useId()
  return (
    <div className="g-mini-control">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ ['--g-fill' as string]: `${((value - min) / (max - min)) * 100}%` }}
      />
      <code>
        {value}
        {unit}
      </code>
    </div>
  )
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="g-styling-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

function Card({
  id,
  label,
  edges,
  locked,
}: {
  id: string
  label: string
  edges?: readonly GridResizeEdge[]
  locked?: boolean
}) {
  return (
    <GridItem
      id={id}
      className="g-mini-item"
      data-locked={locked ? '' : undefined}
      resizeEdges={edges}
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

// ---------------------------------------------------------------------------
// Handles
// ---------------------------------------------------------------------------

const HANDLES: Layout = {
  canvas: CANVAS,
  items: [
    { id: 'chart', x: 0, y: 0, w: 360, h: 150, minW: 120, minH: 70, data: { label: 'chart' } },
    { id: 'stats', x: 372, y: 0, w: 228, h: 150, minW: 100, minH: 70, data: { label: 'stats' } },
    { id: 'table', x: 0, y: 162, w: 600, h: 98, minW: 120, minH: 70, data: { label: 'table' } },
  ],
}

type HandleMode = 'hit' | 'grips' | 'corners'

function HandlesDemo() {
  const [layout, setLayout] = useState(HANDLES)
  const [mode, setMode] = useState<HandleMode>('hit')
  const [size, setSize] = useState(10)
  const [cursor, setCursor] = useState(false)
  const style: CSSProperties = {
    ['--gridla-handle-size' as string]: `${size}px`,
    ...(cursor ? { ['--gridla-handle-cursor' as string]: 'crosshair' } : {}),
  }
  return (
    <Frame
      title="Resize handles"
      onReset={() => {
        setLayout(HANDLES)
        setMode('hit')
        setSize(10)
        setCursor(false)
      }}
      controls={
        <>
          <Segmented<HandleMode>
            label="Paint"
            value={mode}
            options={[
              { value: 'hit', label: 'hit areas' },
              { value: 'grips', label: 'grips' },
              { value: 'corners', label: 'corners only' },
            ]}
            onChange={setMode}
          />
          <Range
            label="--gridla-handle-size"
            value={size}
            min={6}
            max={28}
            unit="px"
            onChange={setSize}
          />
          <Check label="--gridla-handle-cursor: crosshair" checked={cursor} onChange={setCursor} />
        </>
      }
      caption={
        <>
          <strong>Hit areas</strong> paints the built-in handles as they are laid out: eight
          invisible boxes inside the item, sized by <code>--gridla-handle-size</code>.{' '}
          <strong>Grips</strong> keeps the hit areas and draws a small grip with{' '}
          <code>::after</code> on hover and selection. <strong>Corners only</strong> renders four
          handles through <code>resizeEdges</code>.
        </>
      }
    >
      <GridProvider<Data> layout={layout} onLayoutChange={setLayout} gap={12}>
        <GridCanvas
          className="g-mini-canvas g-styling-canvas"
          data-mode={mode}
          style={style}
          aria-label="Resize handle styling demo"
        >
          {layout.items.map((item) => (
            <Card
              key={item.id}
              id={item.id}
              label={item.data?.label ?? item.id}
              edges={mode === 'corners' ? CORNERS : ALL_EDGES}
            />
          ))}
          <GridPreviewOutline className="g-mini-preview" />
        </GridCanvas>
      </GridProvider>
    </Frame>
  )
}

// ---------------------------------------------------------------------------
// Preview by strategy
// ---------------------------------------------------------------------------

const PREVIEW: Layout = {
  canvas: CANVAS,
  items: [
    { id: 'a', x: 0, y: 0, w: 192, h: 124, minW: 80, minH: 60, data: { label: 'a' } },
    { id: 'b', x: 204, y: 0, w: 192, h: 124, minW: 80, minH: 60, data: { label: 'b' } },
    { id: 'c', x: 408, y: 0, w: 192, h: 124, minW: 80, minH: 60, data: { label: 'c' } },
    {
      id: 'wall',
      x: 0,
      y: 136,
      w: 600,
      h: 124,
      minW: 120,
      minH: 60,
      policy: { movement: 'locked' },
      data: { label: 'locked' },
    },
  ],
}

/** A preview outline that carries the solver strategy and the accepted flag as data attributes. */
function StrategyPreview() {
  const preview = useGridPreview()
  if (!preview) return null
  const { x, y, w, h } = preview.item
  return (
    <div
      data-gridla-preview=""
      data-strategy={preview.strategy}
      data-rejected={preview.accepted ? undefined : ''}
      className="g-styling-preview"
      style={{
        pointerEvents: 'none',
        boxSizing: 'border-box',
        ...rectStyle({ x, y, w, h }, 'transform'),
      }}
    />
  )
}

function PreviewChip() {
  const preview = useGridPreview()
  return (
    <output className="g-chip" data-tone={preview ? (preview.accepted ? 'push' : 'other') : 'idle'}>
      <span className="g-chip-label">preview</span>
      <code>
        {preview ? `${preview.strategy}${preview.accepted ? '' : ' · rejected'}` : 'idle'}
      </code>
    </output>
  )
}

function PreviewDemo() {
  const [layout, setLayout] = useState(PREVIEW)
  return (
    <GridProvider<Data> layout={layout} onLayoutChange={setLayout} gap={12}>
      <Frame
        title="Preview outline by strategy"
        status={<PreviewChip />}
        onReset={() => setLayout(PREVIEW)}
        caption={
          <>
            A custom outline built from <code>useGridPreview()</code> and <code>rectStyle()</code>.
            Its border color follows the strategy (push, swap, reorder, shrink), the name is printed
            with <code>attr(data-strategy)</code>, and a drop the solver rejects, such as a push
            into the locked row, turns red.
          </>
        }
      >
        <GridCanvas className="g-mini-canvas" aria-label="Preview outline styling demo">
          {layout.items.map((item) => (
            <Card
              key={item.id}
              id={item.id}
              label={item.data?.label ?? item.id}
              edges={['se']}
              locked={item.policy?.movement === 'locked'}
            />
          ))}
          <StrategyPreview />
        </GridCanvas>
      </Frame>
    </GridProvider>
  )
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

const MOTION: Layout = {
  canvas: CANVAS,
  items: [
    { id: 'one', x: 0, y: 0, w: 144, h: 124, minW: 60, minH: 60, data: { label: 'one' } },
    { id: 'two', x: 156, y: 0, w: 144, h: 124, minW: 60, minH: 60, data: { label: 'two' } },
    { id: 'three', x: 312, y: 0, w: 144, h: 124, minW: 60, minH: 60, data: { label: 'three' } },
    { id: 'four', x: 468, y: 0, w: 132, h: 124, minW: 60, minH: 60, data: { label: 'four' } },
    { id: 'wide', x: 0, y: 136, w: 600, h: 124, minW: 120, minH: 60, data: { label: 'wide' } },
  ],
}

type MotionMode = 'off' | 'siblings' | 'all'

function MotionDemo() {
  const [layout, setLayout] = useState(MOTION)
  const [mode, setMode] = useState<MotionMode>('siblings')
  return (
    <Frame
      title="Motion"
      onReset={() => {
        setLayout(MOTION)
        setMode('siblings')
      }}
      controls={
        <Segmented<MotionMode>
          label="transition: transform"
          value={mode}
          options={[
            { value: 'off', label: 'off' },
            { value: 'siblings', label: 'siblings' },
            { value: 'all', label: 'active too' },
          ]}
          onChange={setMode}
        />
      }
      caption={
        <>
          Drag <em>one</em> across the row. With <strong>siblings</strong>, pushed cards glide to
          their new slots while the active card stays under the pointer. With{' '}
          <strong>active too</strong>, the same transition applies to the active card and it visibly
          lags: keep <code>[data-gridla-active]</code> on <code>transition: none</code>.
        </>
      }
    >
      <GridProvider<Data> layout={layout} onLayoutChange={setLayout} gap={12}>
        <GridCanvas
          className="g-mini-canvas g-styling-canvas"
          data-motion={mode}
          aria-label="Motion styling demo"
        >
          {layout.items.map((item) => (
            <Card key={item.id} id={item.id} label={item.data?.label ?? item.id} />
          ))}
          <GridPreviewOutline className="g-mini-preview" />
        </GridCanvas>
      </GridProvider>
    </Frame>
  )
}

export type StylingDemoKind = 'handles' | 'preview' | 'motion'

/**
 * Live `gridla/react` canvases for the styling guide. Pass `only` to render
 * one of them next to the section it belongs to.
 */
export function StylingDemos({ only }: { only?: StylingDemoKind }) {
  return (
    <div className="g-styling">
      {!only || only === 'handles' ? <HandlesDemo /> : null}
      {!only || only === 'preview' ? <PreviewDemo /> : null}
      {!only || only === 'motion' ? <MotionDemo /> : null}
    </div>
  )
}
