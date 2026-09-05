import type { ReactNode } from 'react'

import type { GridLayout, SolveStrategy } from 'gridla'
import { formatLayout } from '@gridla/demo-kit'
import { CodeBlock, Disclosure, StatGrid, type Stat } from '@gridla/demo-kit/react'

/** Inspector for core demos: a stat readout plus the raw layout data. */
export function CoreInspector({
  layout,
  strategy,
  accepted,
  extra,
  stats,
  title = 'Layout data',
}: {
  layout: GridLayout
  strategy?: SolveStrategy | null
  accepted?: boolean
  /** Extra chips rendered in a status row under the stats. */
  extra?: ReactNode
  /** Extra stat cells appended to the readout. */
  stats?: readonly Stat[]
  title?: string
}) {
  const cells: Stat[] = [
    {
      label: 'canvas',
      value: `${layout.canvas.width}×${layout.canvas.height}`,
      detail: layout.canvas.heightMode,
    },
    { label: 'items', value: layout.items.length },
  ]
  if (strategy !== undefined) {
    cells.push({
      label: 'strategy',
      value: <span data-strategy>{strategy ?? '—'}</span>,
      tone: accepted === false ? 'warn' : strategy ? 'accent' : 'muted',
      detail: accepted === false ? 'rejected' : undefined,
    })
  }
  if (stats) cells.push(...stats)
  return (
    <div className="gd-inspector">
      <StatGrid stats={cells} ariaLabel="Layout status" dense />
      {extra ? <div className="gd-inspector-bar">{extra}</div> : null}
      <Disclosure title={title}>
        <CodeBlock code={formatLayout(layout)} lang="ts" />
      </Disclosure>
    </div>
  )
}
