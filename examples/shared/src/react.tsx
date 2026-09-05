/**
 * React demo chrome: a frame with stage + controls, an inspector, and a
 * default item renderer. Built only on the public `gridla/react` API.
 */

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react'

import type { GridLayout, GridResizeEdge, SolveStrategy } from 'gridla'
import { GridItem, GridPreviewOutline, useGridPreview, useGridVisibleLayout } from 'gridla/react'

import { applyTheme, formatLayout, formatRect, readTheme, type Theme } from './index'

export type DemoFrameProps = {
  stage: ReactNode
  controls?: ReactNode
  inspector?: ReactNode
  stageLabel?: string
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
      <div className="gd-stage" style={stageStyle} data-scrollable={scrollable ? '' : undefined}>
        {stageLabel ? <span className="gd-stage-label">{stageLabel}</span> : null}
        {stage}
      </div>
      {controls ? <aside className="gd-controls">{controls}</aside> : null}
      {inspector}
    </div>
  )
}

export type ControlGroupProps = { title: string; children: ReactNode }

export function ControlGroup({ title, children }: ControlGroupProps) {
  return (
    <>
      <h4>{title}</h4>
      {children}
    </>
  )
}

export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v) => String(v),
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
  return (
    <div className="gd-field">
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>{format(value)}</output>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
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
    <div className="gd-field">
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
    <div className="gd-segmented" role="group" aria-label={ariaLabel}>
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

/** Default item chrome: title, coordinates, optional body, resize handles. */
export function DemoItem({
  id,
  label,
  children,
  edges = ['e', 's', 'se'],
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

/** Live layout data plus the last solver strategy. */
export function Inspector({ title = 'Layout data' }: { title?: string }) {
  const layout = useGridVisibleLayout()
  const preview = useGridPreview()
  const [last, setLast] = useState<SolveStrategy | null>(null)
  useEffect(() => {
    if (preview?.strategy) setLast(preview.strategy)
  }, [preview?.strategy])
  return (
    <div className="gd-inspector">
      <div className="gd-inspector-bar">
        <span>
          canvas{' '}
          <b>
            {layout.canvas.width}×{layout.canvas.height}
          </b>{' '}
          · {layout.canvas.heightMode}
        </span>
        <span>
          items <b>{layout.items.length}</b>
        </span>
        <span>
          strategy <b data-strategy>{preview?.strategy ?? last ?? '—'}</b>
          {preview && !preview.accepted ? ' (rejected)' : ''}
        </span>
      </div>
      <details>
        <summary>{title}</summary>
        <pre>{formatLayout(layout)}</pre>
      </details>
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
  const [theme, setTheme] = useState<Theme>('system')
  useEffect(() => {
    const stored = readTheme()
    setTheme(stored)
    applyTheme(stored)
  }, [])
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
