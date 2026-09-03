/**
 * Starting documents. Each one is a real nested tree: groups own their own
 * canvas and children, so they exercise the same code paths as user-built
 * layouts.
 */

import { createItem, type GridItem, type GridItemSize, type GridLayout } from 'gridla'

import {
  canvas,
  createDocument,
  nextId,
  padding,
  type StudioDocument,
  type StudioNode,
} from './document'
import { getKind, type NodeKind, type NodeProps } from './registry'

export type TemplateId = 'blank' | 'dashboard' | 'editorial' | 'analytics' | 'freeform'

export type TemplateSpec = {
  id: TemplateId
  label: string
  description: string
}

export const TEMPLATES: readonly TemplateSpec[] = [
  { id: 'blank', label: 'Blank', description: 'An empty page. Add items from the palette.' },
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Header, a row of stats in a group, a chart and a list.',
  },
  {
    id: 'editorial',
    label: 'Editorial',
    description: 'A display heading, a two-column story group, an image and a call to action.',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    description: 'Two chart groups side by side over a wide stat row.',
  },
  {
    id: 'freeform',
    label: 'Freeform',
    description: 'Loose blocks at odd sizes, one locked, one nested group.',
  },
]

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

type Placed = { node: StudioNode; item: GridItem }

function leaf(
  kind: NodeKind,
  x: number,
  y: number,
  w: number,
  h: number,
  props: NodeProps = {},
  size: Partial<GridItemSize> = {},
  extra: Partial<GridItem> = {},
): Placed {
  const spec = getKind(kind)
  const id = nextId(kind)
  const item = createItem(id, { ...spec.size, ...size, w, h }, x, y)
  return {
    node: { id, kind, props: { ...spec.defaultProps, ...props } },
    item: { ...item, ...extra },
  }
}

function group(
  x: number,
  y: number,
  w: number,
  h: number,
  props: NodeProps,
  layout: { width: number; height: number; inset?: number; gap?: number },
  children: Placed[],
  extra: Partial<GridItem> = {},
): Placed {
  const spec = getKind('group')
  const id = nextId('group')
  const item = createItem(id, { ...spec.size, w, h }, x, y)
  const groupLayout: GridLayout = {
    canvas: canvas(layout.width, layout.height, layout.inset ?? 12),
    items: children.map((child) => child.item),
  }
  return {
    node: {
      id,
      kind: 'group',
      props: { ...spec.defaultProps, ...props },
      gap: layout.gap ?? 12,
      layout: groupLayout,
      children: children.map((child) => child.node),
    },
    item: { ...item, ...extra },
  }
}

function page(name: string, height: number, gap: number, children: Placed[]): StudioDocument {
  const doc = createDocument(name)
  doc.root = {
    ...doc.root,
    gap,
    layout: {
      canvas: { width: 1200, height, padding: padding(24), heightMode: 'scrollable' },
      items: children.map((child) => child.item),
    },
    children: children.map((child) => child.node),
  }
  return doc
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function dashboard(): StudioDocument {
  const inner = 1200 - 48
  const gap = 16
  const statsWidth = inner
  const statCell = Math.floor((statsWidth - 24 - gap * 3) / 4)
  const stats = group(
    24,
    112,
    statsWidth,
    150,
    { title: 'Key numbers', tone: 'plain' },
    { width: statsWidth, height: 150, inset: 12, gap },
    [
      ['Revenue', '$48.2k', '+6.1%'],
      ['Orders', '1,204', '+2.4%'],
      ['Refunds', '31', '-12%'],
      ['Avg. basket', '$40.10', '+0.8%'],
    ].map(([label, value, delta], index) =>
      leaf('stat', 12 + index * (statCell + gap), 12, statCell, 126, { label, value, delta }),
    ),
  )
  const chartWidth = Math.floor((inner - gap) * 0.62)
  return page('Dashboard', 720, gap, [
    leaf('heading', 24, 24, inner, 72, { text: 'Operations overview', level: '1' }),
    stats,
    leaf('chart', 24, 278, chartWidth, 300, { title: 'Weekly throughput', variant: 'line' }),
    leaf('list', 24 + chartWidth + gap, 278, inner - chartWidth - gap, 300, {
      title: 'Open tasks',
      items:
        'Reconcile Q3 refunds\nRotate access keys\nReview basket size drop\nPlan capacity for launch week',
    }),
    leaf('chart', 24, 594, Math.floor((inner - gap) / 2), 200, {
      title: 'Orders by hour',
      variant: 'bars',
    }),
    leaf('button', 24 + Math.floor((inner - gap) / 2) + gap, 594, 200, 56, {
      label: 'Export report',
      variant: 'outline',
    }),
  ])
}

function editorial(): StudioDocument {
  const inner = 1200 - 48
  const gap = 24
  const storyWidth = Math.floor(inner * 0.6)
  const col = Math.floor((storyWidth - 24 - gap) / 2)
  const story = group(
    24,
    136,
    storyWidth,
    380,
    { title: 'Story', tone: 'outlined' },
    { width: storyWidth, height: 380, inset: 12, gap },
    [
      leaf('text', 12, 12, col, 356, {
        body: 'Grids are a promise: whatever you put on the page stays where you put it, and everything around it makes room.\n\nThis studio keeps that promise while the canvas changes width. Try the tablet preview.',
        columns: '1',
      }),
      leaf('text', 12 + col + gap, 12, col, 356, {
        body: 'Each group is its own canvas. Resize the group and watch both columns reflow.\n\nDrag a block out of the group and it joins the page; drag one in and it joins the group.',
        columns: '1',
      }),
    ],
  )
  return page('Editorial', 800, gap, [
    leaf('heading', 24, 24, inner, 96, {
      text: 'The shape of a page',
      level: '1',
      tone: 'ink',
    }),
    story,
    leaf('image', 24 + storyWidth + gap, 136, inner - storyWidth - gap, 240, { label: 'Cover' }),
    leaf('text', 24 + storyWidth + gap, 400, inner - storyWidth - gap, 116, {
      body: 'A pull quote sits under the cover image and keeps its column width across sizes.',
      tone: 'accent',
    }),
    leaf('button', 24, 540, 220, 56, { label: 'Read the next chapter', variant: 'primary' }),
    leaf('button', 268, 540, 180, 56, { label: 'Share', variant: 'quiet' }),
  ])
}

function analytics(): StudioDocument {
  const inner = 1200 - 48
  const gap = 16
  const half = Math.floor((inner - gap) / 2)
  const chartGroup = (x: number, title: string, first: string, second: string) =>
    group(
      x,
      112,
      half,
      360,
      { title, tone: 'surface' },
      { width: half, height: 360, inset: 12, gap },
      [
        leaf('chart', 12, 12, half - 24, 200, { title: first, variant: 'line' }),
        leaf('chart', 12, 228, half - 24, 120, { title: second, variant: 'bars' }),
      ],
    )
  const statCell = Math.floor((inner - 24 - gap * 4) / 5)
  const statsRow = group(
    24,
    488,
    inner,
    140,
    { title: 'Totals', tone: 'plain' },
    { width: inner, height: 140, inset: 12, gap },
    [
      ['Visitors', '84,120', '+11%'],
      ['Sign-ups', '2,310', '+3.4%'],
      ['Churn', '1.9%', '-0.3%'],
      ['NPS', '61', '+4'],
      ['Uptime', '99.98%', ''],
    ].map(([label, value, delta], index) =>
      leaf('stat', 12 + index * (statCell + gap), 12, statCell, 116, { label, value, delta }),
    ),
  )
  return page('Analytics', 760, gap, [
    leaf('heading', 24, 24, 700, 72, { text: 'Product analytics', level: '2' }),
    leaf('button', 24 + 700 + gap, 32, 200, 56, { label: 'Last 30 days', variant: 'outline' }),
    chartGroup(24, 'Acquisition', 'New visitors', 'Sources'),
    chartGroup(24 + half + gap, 'Engagement', 'Active users', 'Sessions per day'),
    statsRow,
    leaf('list', 24, 644, 480, 92, {
      title: 'Notes',
      items: 'Sessions dipped during the outage on the 12th\nSign-ups recovered after the fix',
    }),
  ])
}

function freeform(): StudioDocument {
  const nested = group(
    620,
    320,
    440,
    300,
    { title: 'Scratch area', tone: 'outlined' },
    { width: 440, height: 300, inset: 12, gap: 12 },
    [
      leaf('stat', 12, 12, 200, 110, { label: 'Ideas', value: '7', delta: '+2' }),
      leaf('button', 224, 12, 160, 56, { label: 'Add one', variant: 'quiet' }),
      leaf('text', 12, 134, 416, 154, {
        body: 'Groups can sit anywhere. Drop a chart in here and it resizes to fit the group canvas.',
      }),
    ],
  )
  return page('Freeform', 720, 12, [
    leaf('heading', 24, 24, 520, 72, { text: 'Loose parts', level: '1' }),
    leaf('image', 560, 24, 280, 180, { label: 'Pinned' }, {}, { policy: { movement: 'locked' } }),
    leaf('chart', 24, 120, 380, 220, { title: 'Signal', variant: 'bars' }),
    leaf('stat', 420, 220, 200, 110, { label: 'Score', value: '8.4', delta: '+0.6' }),
    leaf('list', 24, 360, 300, 200, {
      title: 'Try',
      items:
        'Shift+click two blocks, then duplicate\nCmd/Ctrl+L locks the selection\nArrow keys nudge the selected block',
    }),
    nested,
    leaf('button', 860, 24, 180, 56, { label: 'Unpin', variant: 'outline' }),
    leaf('text', 340, 380, 260, 160, {
      body: 'Nothing here is aligned on purpose. Use the rows, columns or grid presets on the page to tidy up.',
      tone: 'accent',
    }),
  ])
}

export function buildTemplate(id: TemplateId): StudioDocument {
  switch (id) {
    case 'dashboard':
      return dashboard()
    case 'editorial':
      return editorial()
    case 'analytics':
      return analytics()
    case 'freeform':
      return freeform()
    default:
      return createDocument('Untitled layout')
  }
}
