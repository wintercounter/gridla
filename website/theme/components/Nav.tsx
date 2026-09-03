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

/** External-link glyph used after links that leave the docs router. */
export function ExternalIcon() {
  return (
    <svg
      className="g-external"
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 11.5 11.5 4.5M6.5 4.5h5v5" />
    </svg>
  )
}

/**
 * Links to the examples app and the sample studio. Both are separate apps
 * deployed under the site base path, so they are plain anchors (full
 * navigation) styled to sit on the same baseline as the Rspress nav items.
 */
export function NavApps() {
  return (
    <ul className="g-nav-apps" aria-label="Companion apps">
      <li>
        <a className="g-nav-app" href={appHref('gallery')}>
          Examples
          <ExternalIcon />
        </a>
      </li>
      <li>
        <a className="g-nav-app" href={appHref('studio')}>
          Sample studio
          <ExternalIcon />
        </a>
      </li>
    </ul>
  )
}
