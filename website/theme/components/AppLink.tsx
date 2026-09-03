import type { ReactNode } from 'react'

import { appHref, type SiteApp } from '../site'

/**
 * Link to a companion app (gallery or studio). Rendered as a plain anchor so
 * the browser performs a full navigation instead of a client-side route.
 */
export function AppLink({
  app,
  demo,
  children,
}: {
  app: SiteApp
  /** Gallery demo id; becomes the `#/<id>` hash route. */
  demo?: string
  children?: ReactNode
}) {
  return (
    <a className="g-applink" href={appHref(app, demo)}>
      {children ?? (app === 'gallery' ? 'Open in the gallery' : 'Open the studio')}
    </a>
  )
}
