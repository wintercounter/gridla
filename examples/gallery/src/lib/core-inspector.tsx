import type { ReactNode } from 'react'

import type { GridLayout, SolveStrategy } from 'gridla'
import { formatLayout } from '@gridla/demo-kit'

/** Inspector for core demos: a status bar plus the raw layout data. */
export function CoreInspector({
  layout,
  strategy,
  accepted,
  extra,
  title = 'Layout data',
}: {
  layout: GridLayout
  strategy?: SolveStrategy | null
  accepted?: boolean
  extra?: ReactNode
  title?: string
}) {
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
        {strategy !== undefined ? (
          <span>
            strategy <b data-strategy>{strategy ?? '—'}</b>
            {accepted === false ? <b className="gl-rejected-tag"> rejected</b> : null}
          </span>
        ) : null}
        {extra}
      </div>
      <details>
        <summary>{title}</summary>
        <pre>{formatLayout(layout)}</pre>
      </details>
    </div>
  )
}
