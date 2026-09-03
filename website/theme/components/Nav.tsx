import { Mark } from './Mark'
import { SITE_BASE, appHref } from '../site'

/** Wordmark rendered in the navigation bar. Links to the home page. */
export function NavTitle() {
  return (
    <a className="g-nav-title" href={SITE_BASE} aria-label="Gridla home">
      <Mark />
      <span>gridla</span>
    </a>
  )
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 12 12 4M6 4h6v6" />
    </svg>
  )
}

/**
 * Links to the gallery and the studio. These are separate apps deployed under
 * the site base path, so they are plain anchors and not router links.
 */
export function NavApps() {
  return (
    <nav className="g-nav-apps" aria-label="Companion apps">
      <a className="g-nav-app" href={appHref('gallery')}>
        Gallery <ArrowIcon />
      </a>
      <a className="g-nav-app" href={appHref('studio')} data-primary="">
        Studio <ArrowIcon />
      </a>
    </nav>
  )
}
