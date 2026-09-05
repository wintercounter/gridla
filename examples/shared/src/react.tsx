/**
 * React demo chrome: a frame with stage + controls, an inspector, and a
 * default item renderer. Built only on the public `gridla/react` API.
 */

import { useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react'

import type { GridLayout, GridResizeEdge, SolveStrategy } from 'gridla'
import {
  GridItem,
  GridPreviewOutline,
  useGridPreview,
  useGridStore,
  useGridVisibleLayout,
} from 'gridla/react'

import { tokenizeWithOffsets } from './highlight'
import { applyTheme, formatLayout, formatRect, readTheme, type Theme } from './index'

export type DemoFrameProps = {
  stage: ReactNode
  controls?: ReactNode
  inspector?: ReactNode
  /** Caption rendered under the stage (never over the playground). */
  stageLabel?: ReactNode
  stageStyle?: CSSProperties
  scrollable?: boolean
}

export function DemoFrame({
  stage,
  controls,
  inspector,
  stageLabel,
  stageStyle,
  scrollable,
}: DemoFrameProps) {
  return (
    <div className="gd-frame" data-controls={controls ? '' : undefined}>
      <div className="gd-stage-col">
        <div
          className="gd-stage"
          style={stageStyle}
          data-scrollable={scrollable ? '' : undefined}
          data-fixed={stageStyle?.height !== undefined ? '' : undefined}
        >
          <div className="gd-stage-inner">{stage}</div>
        </div>
        {stageLabel ? <StageCaption>{stageLabel}</StageCaption> : null}
      </div>
      {controls ? <aside className="gd-controls">{controls}</aside> : null}
      {inspector}
    </div>
  )
}

/** A caption row under a stage: `.gd-stage-label` keeps the old name for the text. */
export function StageCaption({ children }: { children: ReactNode }) {
  return (
    <div className="gd-stage-caption">
      <span className="gd-stage-label">{children}</span>
    </div>
  )
}

export type ControlGroupProps = { title: string; children: ReactNode }

export function ControlGroup({ title, children }: ControlGroupProps) {
  return (
    <div className="gd-group">
      <h4>{title}</h4>
      {children}
    </div>
  )
}

const formatNumber = (value: number) => String(value)

export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = formatNumber,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  format?: (value: number) => string
}) {
  const id = useId()
  const fill = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0
  return (
    <div className="gd-field" data-kind="range">
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>{format(value)}</output>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--gd-fill': `${fill}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  const id = useId()
  return (
    <div className="gd-field" data-kind="select">
      <label htmlFor={id}>{label}</label>
      <span />
      <select id={id} value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="gd-toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  ariaLabel: string
}) {
  return (
    <fieldset className="gd-segmented" aria-label={ariaLabel}>
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
    </fieldset>
  )
}

export function Button({
  children,
  variant,
  onClick,
  disabled,
}: {
  children: ReactNode
  variant?: 'primary' | 'ghost'
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="gd-button"
      data-variant={variant}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

const DEFAULT_EDGES: readonly GridResizeEdge[] = ['e', 's', 'se']

/** Default item chrome: title, coordinates, optional body, resize handles. */
export function DemoItem({
  id,
  label,
  children,
  edges = DEFAULT_EDGES,
  draggable = true,
}: {
  id: string
  label?: string
  children?: ReactNode
  edges?: readonly GridResizeEdge[]
  draggable?: boolean
}) {
  return (
    <GridItem
      id={id}
      className="gd-item"
      resizeEdges={edges}
      resizeHandleClassName="gd-handle"
      draggable={draggable}
      data-static={draggable ? undefined : ''}
    >
      {(view) => (
        <>
          <div className="gd-item-head">
            <span>{label ?? id}</span>
            <span className="gd-item-coords">{formatRect(view.rect)}</span>
          </div>
          {children ? <div className="gd-item-body">{children}</div> : null}
        </>
      )}
    </GridItem>
  )
}

export function DemoPreview() {
  return <GridPreviewOutline className="gd-preview" />
}

// ---------------------------------------------------------------------------
// Readouts
// ---------------------------------------------------------------------------

export type Stat = {
  /** Stable key; defaults to the label when it is a string. */
  key?: string
  label: ReactNode
  value: ReactNode
  /** `accent` for the thing that is happening now (strategy, live values). */
  tone?: 'accent' | 'muted' | 'warn'
  /** Fine print under the value (a unit, a mode, a note). */
  detail?: ReactNode
}

/**
 * A grid of label-over-value cells for stat and info readouts. Values are set
 * in mono; use `tone="accent"` for the one cell that carries the action.
 */
export function StatGrid({
  stats,
  columns,
  ariaLabel,
  dense,
}: {
  stats: readonly Stat[]
  /** Fixed column count; defaults to auto-fit. */
  columns?: number
  ariaLabel?: string
  /** Tighter cells for status bars. */
  dense?: boolean
}) {
  return (
    <dl
      className="gd-stats"
      aria-label={ariaLabel}
      data-dense={dense ? '' : undefined}
      style={columns ? ({ '--gd-stat-columns': columns } as CSSProperties) : undefined}
    >
      {stats.map((stat) => (
        <div className="gd-stat" key={statKey(stat)} data-tone={stat.tone}>
          <dt>{stat.label}</dt>
          <dd>
            {stat.value}
            {stat.detail ? <small>{stat.detail}</small> : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function statKey(stat: Stat): string {
  if (stat.key) return stat.key
  if (typeof stat.label === 'string' || typeof stat.label === 'number') return String(stat.label)
  return JSON.stringify(stat.label) ?? ''
}

/** A single stat cell, for composing a `.gd-stats` grid by hand. */
export function Readout({ label, value, tone, detail }: Stat) {
  return (
    <div className="gd-stat" data-tone={tone}>
      <dt>{label}</dt>
      <dd>
        {value}
        {detail ? <small>{detail}</small> : null}
      </dd>
    </div>
  )
}

/** A `<details>` styled as a button with a chevron; wraps layout data and code. */
export function Disclosure({
  title,
  children,
  open,
}: {
  title: ReactNode
  children: ReactNode
  open?: boolean
}) {
  return (
    <details className="gd-disclosure" open={open}>
      <summary>{title}</summary>
      <div className="gd-disclosure-body">{children}</div>
    </details>
  )
}

// ---------------------------------------------------------------------------
// Code
// ---------------------------------------------------------------------------

/** Syntax-highlighted code. Renders a `<pre class="gd-code">` with `gd-tok-*` spans. */
export function CodeBlock({
  code,
  lang = 'tsx',
  className,
  style,
}: {
  code: string
  lang?: string
  className?: string
  style?: CSSProperties
}) {
  const tokens = useMemo(() => tokenizeWithOffsets(code), [code])
  return (
    <pre className={className ? `gd-code ${className}` : 'gd-code'} data-lang={lang} style={style}>
      <code>
        {tokens.map((token) =>
          token.kind === 'text' ? (
            token.text
          ) : (
            <span key={token.start} className={`gd-tok-${token.kind}`}>
              {token.text}
            </span>
          ),
        )}
      </code>
    </pre>
  )
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------

/** Live layout data plus the last solver strategy. */
export function Inspector({
  title = 'Layout data',
  extra,
}: {
  title?: string
  /** Additional stat cells appended to the readout. */
  extra?: readonly Stat[]
}) {
  const layout = useGridVisibleLayout()
  const preview = useGridPreview()
  // Keep the last strategy visible after a gesture ends: the selector keeps
  // its previous value whenever the store has no preview.
  const last = useGridStore<unknown, SolveStrategy | null>(
    (state) => state.preview?.strategy ?? null,
    (previous, next) => next === null || previous === next,
  )
  const strategy = preview?.strategy ?? last
  const rejected = Boolean(preview && !preview.accepted)
  const stats: Stat[] = [
    {
      label: 'canvas',
      value: `${layout.canvas.width}×${layout.canvas.height}`,
      detail: layout.canvas.heightMode,
    },
    { label: 'items', value: layout.items.length },
    {
      label: 'strategy',
      value: <span data-strategy>{strategy ?? '—'}</span>,
      tone: rejected ? 'warn' : strategy ? 'accent' : 'muted',
      detail: rejected ? 'rejected' : preview ? 'live' : undefined,
    },
    ...(extra ?? []),
  ]
  return (
    <div className="gd-inspector">
      <StatGrid stats={stats} ariaLabel="Layout status" dense />
      <Disclosure title={title}>
        <CodeBlock code={formatLayout(layout)} lang="ts" />
      </Disclosure>
    </div>
  )
}

export function LayoutTable({
  layout,
  changed,
}: {
  layout: GridLayout
  changed?: ReadonlySet<string>
}) {
  return (
    <table className="gd-table">
      <thead>
        <tr>
          <th>id</th>
          <th>x</th>
          <th>y</th>
          <th>w</th>
          <th>h</th>
        </tr>
      </thead>
      <tbody>
        {layout.items.map((item) => (
          <tr key={item.id} data-changed={changed?.has(item.id) ? '' : undefined}>
            <td>{item.id}</td>
            <td>{Math.round(item.x)}</td>
            <td>{Math.round(item.y)}</td>
            <td>{Math.round(item.w)}</td>
            <td>{Math.round(item.h)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>(() => readTheme())
  useEffect(() => {
    applyTheme(theme)
  }, [theme])
  return (
    <Segmented
      ariaLabel="Theme"
      value={theme}
      options={[
        { value: 'light', label: 'Light' },
        { value: 'system', label: 'Auto' },
        { value: 'dark', label: 'Dark' },
      ]}
      onChange={(next) => {
        setTheme(next)
        applyTheme(next)
      }}
    />
  )
}
