import type { ReactNode } from 'react'

import { ExternalIcon } from './Nav'
import { appHref, type SiteApp } from '../site'

/**
 * Link to a companion app (examples or sample studio). Rendered as a plain
 * anchor so the browser performs a full navigation instead of a client-side
 * route.
 */
export function AppLink({
  app,
  demo,
  children,
}: {
  app: SiteApp
  /** Example id; becomes the `#/<id>` hash route. */
  demo?: string
  children?: ReactNode
}) {
  return (
    <a className="g-applink" href={appHref(app, demo)}>
      {children ?? (app === 'gallery' ? 'Open in the examples' : 'Open the sample studio')}
      <ExternalIcon />
    </a>
  )
}
