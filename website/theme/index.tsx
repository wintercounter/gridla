import { Layout as BaseLayout } from '@rspress/core/theme-original'

import { NavApps, NavTitle } from './components/Nav'
import { NotFound } from './components/NotFound'
// oxlint-disable-next-line import/no-unassigned-import
import './styles.css'

export * from '@rspress/core/theme-original'

/** Rspress layout with the Gridla nav title, app links, and 404 page. */
export function Layout() {
  return <BaseLayout navTitle={<NavTitle />} afterNavMenu={<NavApps />} NotFoundLayout={NotFound} />
}
