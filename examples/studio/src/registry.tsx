/**
 * The component kinds a document may contain. Each kind is an explicit React
 * component with typed props, a default size, and the appearance fields the
 * inspector shows. Nothing here is driven by JSON: the document only stores
 * `kind` + `props` and this file decides what that means.
 */

import type { ReactNode } from 'react'

import type { GridItemSize } from 'gridla'

export type NodeKind = 'heading' | 'text' | 'image' | 'stat' | 'chart' | 'list' | 'button' | 'group'

export type NodeProps = Record<string, string | number | boolean>

export type FieldSpec = {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'number' | 'toggle'
  options?: readonly { value: string; label: string }[]
  min?: number
  max?: number
  help?: string
}

export type KindSpec = {
  kind: NodeKind
  label: string
  description: string
  icon: ReactNode
  size: GridItemSize
  defaultProps: NodeProps
  fields: readonly FieldSpec[]
  render: (props: NodeProps) => ReactNode
}

// ---------------------------------------------------------------------------
// Icons (inline SVG, 16px grid)
// ---------------------------------------------------------------------------

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const ICONS: Record<NodeKind, ReactNode> = {
  heading: (
    <Icon>
      <path d="M3 3v10M3 8h7M10 3v10" />
      <path d="M13 13V7l-1.2 1" />
    </Icon>
  ),
  text: (
    <Icon>
      <path d="M2.5 4h11M2.5 7h11M2.5 10h8M2.5 13h5" />
    </Icon>
  ),
  image: (
    <Icon>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M2.5 11.5 6 8l3 3 2-2 2.5 2.5" />
      <circle cx="10.5" cy="6" r="1" />
    </Icon>
  ),
  stat: (
    <Icon>
      <path d="M2.5 13V9M6.5 13V5M10.5 13V7M14.5 13V3" />
    </Icon>
  ),
  chart: (
    <Icon>
      <path d="M2 13h12" />
      <path d="M2.5 10.5 6 7l3 2.5L13.5 4" />
    </Icon>
  ),
  list: (
    <Icon>
      <path d="M6 4h8M6 8h8M6 12h8" />
      <circle cx="3" cy="4" r="0.8" fill="currentColor" />
      <circle cx="3" cy="8" r="0.8" fill="currentColor" />
      <circle cx="3" cy="12" r="0.8" fill="currentColor" />
    </Icon>
  ),
  button: (
    <Icon>
      <rect x="2" y="5" width="12" height="6" rx="3" />
      <path d="M6 8h4" />
    </Icon>
  ),
  group: (
    <Icon>
      <rect x="2" y="2" width="12" height="12" rx="1.5" strokeDasharray="2.5 2" />
      <rect x="4.5" y="4.5" width="3" height="3" />
      <rect x="8.5" y="4.5" width="3" height="3" />
      <rect x="4.5" y="8.5" width="7" height="3" />
    </Icon>
  ),
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

const TONES = [
  { value: 'paper', label: 'Paper' },
  { value: 'ink', label: 'Ink' },
  { value: 'accent', label: 'Accent' },
] as const

const TONE_FIELD: FieldSpec = { key: 'tone', label: 'Tone', type: 'select', options: TONES }

function str(props: NodeProps, key: string, fallback = ''): string {
  const value = props[key]
  return typeof value === 'string' ? value : fallback
}

function Heading(props: NodeProps) {
  const level = str(props, 'level', '2')
  const align = str(props, 'align', 'start')
  const text = str(props, 'text', 'Heading')
  const Tag = level === '1' ? 'h1' : level === '3' ? 'h3' : 'h2'
  return (
    <div className="st-content st-heading" data-tone={str(props, 'tone', 'paper')}>
      <Tag className="st-heading-text" style={{ textAlign: align as 'start' | 'center' | 'end' }}>
        {text}
      </Tag>
    </div>
  )
}

function Text(props: NodeProps) {
  const body = str(props, 'body', '')
  const columns = str(props, 'columns', '1')
  return (
    <div className="st-content st-text" data-tone={str(props, 'tone', 'paper')}>
      <div className="st-text-body" style={{ columnCount: Number(columns) || 1 }}>
        {body.split(/\n{2,}/).map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </div>
  )
}

function Image(props: NodeProps) {
  const label = str(props, 'label', 'Image')
  return (
    <div className="st-content st-image" data-tone={str(props, 'tone', 'paper')}>
      <svg className="st-image-art" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden>
        <line x1="0" y1="0" x2="100" y2="60" />
        <line x1="100" y1="0" x2="0" y2="60" />
      </svg>
      <span className="st-image-label">{label}</span>
    </div>
  )
}

function Stat(props: NodeProps) {
  const delta = str(props, 'delta', '')
  const negative = delta.trim().startsWith('-')
  return (
    <div className="st-content st-stat" data-tone={str(props, 'tone', 'paper')}>
      <span className="st-stat-label">{str(props, 'label', 'Metric')}</span>
      <span className="st-stat-value">{str(props, 'value', '0')}</span>
      {delta ? (
        <span className="st-stat-delta" data-negative={negative ? '' : undefined}>
          {delta}
        </span>
      ) : null}
    </div>
  )
}

/** Deterministic pseudo-random series so a chart looks the same across renders. */
function series(seed: string, count: number): number[] {
  let hash = 2166136261
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  const values: number[] = []
  let value = 40 + (hash >>> 24) / 8
  for (let index = 0; index < count; index += 1) {
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177)
    value = Math.min(95, Math.max(8, value + ((hash >>> 20) % 31) - 15))
    values.push(value)
  }
  return values
}

function Chart(props: NodeProps) {
  const variant = str(props, 'variant', 'line')
  const points = series(str(props, 'title', 'chart') + variant, 14)
  const width = 140
  const height = 60
  const step = width / (points.length - 1)
  const path = points
    .map(
      (value, index) =>
        `${index === 0 ? 'M' : 'L'}${(index * step).toFixed(1)},${(height - (value / 100) * height).toFixed(1)}`,
    )
    .join(' ')
  return (
    <div className="st-content st-chart" data-tone={str(props, 'tone', 'paper')}>
      <div className="st-chart-head">
        <span className="st-chart-title">{str(props, 'title', 'Series')}</span>
        <span className="st-chart-meta">{variant === 'bars' ? 'bars' : 'line'} · 14 pts</span>
      </div>
      <svg
        className="st-chart-art"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        <line className="st-chart-rule" x1="0" y1={height * 0.5} x2={width} y2={height * 0.5} />
        <line className="st-chart-rule" x1="0" y1={height} x2={width} y2={height} />
        {variant === 'bars' ? (
          points.map((value, index) => (
            <rect
              key={index}
              className="st-chart-bar"
              x={index * step + 1}
              y={height - (value / 100) * height}
              width={Math.max(2, step - 2)}
              height={(value / 100) * height}
            />
          ))
        ) : (
          <>
            <path className="st-chart-area" d={`${path} L${width},${height} L0,${height} Z`} />
            <path className="st-chart-line" d={path} />
          </>
        )}
      </svg>
    </div>
  )
}

function List(props: NodeProps) {
  const items = str(props, 'items', '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return (
    <div className="st-content st-list" data-tone={str(props, 'tone', 'paper')}>
      {str(props, 'title') ? <span className="st-list-title">{str(props, 'title')}</span> : null}
      <ul className="st-list-items">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function Button(props: NodeProps) {
  return (
    <div className="st-content st-cta" data-tone={str(props, 'tone', 'paper')}>
      <span className="st-button-face" data-variant={str(props, 'variant', 'primary')}>
        {str(props, 'label', 'Button')}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const KINDS: readonly KindSpec[] = [
  {
    kind: 'heading',
    label: 'Heading',
    description: 'A title line.',
    icon: ICONS.heading,
    size: { w: 480, h: 72, minW: 120, minH: 48, sizeMode: 'fixed-h' },
    defaultProps: { text: 'Section title', level: '2', align: 'start', tone: 'paper' },
    fields: [
      { key: 'text', label: 'Text', type: 'text' },
      {
        key: 'level',
        label: 'Level',
        type: 'select',
        options: [
          { value: '1', label: 'Display' },
          { value: '2', label: 'Section' },
          { value: '3', label: 'Small' },
        ],
      },
      {
        key: 'align',
        label: 'Align',
        type: 'select',
        options: [
          { value: 'start', label: 'Start' },
          { value: 'center', label: 'Center' },
          { value: 'end', label: 'End' },
        ],
      },
      TONE_FIELD,
    ],
    render: Heading,
  },
  {
    kind: 'text',
    label: 'Text',
    description: 'Paragraphs, optionally in columns.',
    icon: ICONS.text,
    size: { w: 360, h: 160, minW: 120, minH: 60 },
    defaultProps: {
      body: 'Drag the edges to resize. Drop this block into a group to reflow it with its siblings.',
      columns: '1',
      tone: 'paper',
    },
    fields: [
      { key: 'body', label: 'Body', type: 'textarea', help: 'Blank line starts a new paragraph.' },
      {
        key: 'columns',
        label: 'Columns',
        type: 'select',
        options: [
          { value: '1', label: '1' },
          { value: '2', label: '2' },
          { value: '3', label: '3' },
        ],
      },
      TONE_FIELD,
    ],
    render: Text,
  },
  {
    kind: 'image',
    label: 'Image',
    description: 'A placeholder frame.',
    icon: ICONS.image,
    size: { w: 320, h: 200, minW: 60, minH: 60 },
    defaultProps: { label: 'Image', tone: 'paper' },
    fields: [{ key: 'label', label: 'Caption', type: 'text' }, TONE_FIELD],
    render: Image,
  },
  {
    kind: 'stat',
    label: 'Stat',
    description: 'One number with a label.',
    icon: ICONS.stat,
    size: { w: 200, h: 110, minW: 100, minH: 72 },
    defaultProps: { label: 'Sessions', value: '12,480', delta: '+4.2%', tone: 'paper' },
    fields: [
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'value', label: 'Value', type: 'text' },
      { key: 'delta', label: 'Change', type: 'text', help: 'Start with - for a drop.' },
      TONE_FIELD,
    ],
    render: Stat,
  },
  {
    kind: 'chart',
    label: 'Chart',
    description: 'A drawn line or bar series.',
    icon: ICONS.chart,
    size: { w: 420, h: 240, minW: 140, minH: 100 },
    defaultProps: { title: 'Throughput', variant: 'line', tone: 'paper' },
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      {
        key: 'variant',
        label: 'Style',
        type: 'select',
        options: [
          { value: 'line', label: 'Line' },
          { value: 'bars', label: 'Bars' },
        ],
      },
      TONE_FIELD,
    ],
    render: Chart,
  },
  {
    kind: 'list',
    label: 'List',
    description: 'A short bulleted list.',
    icon: ICONS.list,
    size: { w: 280, h: 200, minW: 120, minH: 80 },
    defaultProps: {
      title: 'Next steps',
      items: 'Review the layout\nShare the export\nCollect feedback',
      tone: 'paper',
    },
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'items', label: 'Items', type: 'textarea', help: 'One item per line.' },
      TONE_FIELD,
    ],
    render: List,
  },
  {
    kind: 'button',
    label: 'Button',
    description: 'A call to action.',
    icon: ICONS.button,
    size: { w: 180, h: 56, minW: 96, minH: 44, maxH: 96, sizeMode: 'fixed' },
    defaultProps: { label: 'Get started', variant: 'primary', tone: 'paper' },
    fields: [
      { key: 'label', label: 'Label', type: 'text' },
      {
        key: 'variant',
        label: 'Variant',
        type: 'select',
        options: [
          { value: 'primary', label: 'Primary' },
          { value: 'outline', label: 'Outline' },
          { value: 'quiet', label: 'Quiet' },
        ],
      },
      TONE_FIELD,
    ],
    render: Button,
  },
  {
    kind: 'group',
    label: 'Group',
    description: 'A nested canvas. Drop items inside.',
    icon: ICONS.group,
    size: { w: 600, h: 320, minW: 160, minH: 120 },
    defaultProps: { title: 'Group', tone: 'plain' },
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      {
        key: 'tone',
        label: 'Frame',
        type: 'select',
        options: [
          { value: 'plain', label: 'Plain' },
          { value: 'outlined', label: 'Outlined' },
          { value: 'surface', label: 'Surface' },
        ],
      },
    ],
    // Groups render their own canvas; see StudioCanvas.
    render: () => null,
  },
]

const BY_KIND = new Map(KINDS.map((spec) => [spec.kind, spec]))

export function getKind(kind: NodeKind): KindSpec {
  const spec = BY_KIND.get(kind)
  if (!spec) throw new Error(`Unknown kind "${kind}"`)
  return spec
}

export function isKind(value: unknown): value is NodeKind {
  return typeof value === 'string' && BY_KIND.has(value as NodeKind)
}

export function renderKind(kind: NodeKind, props: NodeProps): ReactNode {
  return getKind(kind).render(props)
}
