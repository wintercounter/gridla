import { useEffect } from 'react'

import { SITE_BASE } from '../site'

/**
 * Custom 404 page. Rspress emits it as `404.html`, which GitHub Pages serves
 * for every unknown path, so it doubles as the deep-link fallback: a request
 * for a documentation route without its `.html` suffix (or with a trailing
 * slash) is redirected to the canonical file before anything is shown.
 */
export function NotFound() {
  useEffect(() => {
    const path = window.location.pathname
    if (!path.startsWith(SITE_BASE)) return
    const rest = path.slice(SITE_BASE.length)
    if (!rest || /\.[a-z0-9]+$/i.test(rest)) return
    const target = `${SITE_BASE}${rest.replace(/\/$/, '')}.html`
    if (target !== path) {
      window.location.replace(`${target}${window.location.search}${window.location.hash}`)
    }
  }, [])

  return (
    <main className="g-404">
      <span className="g-404-code">404 · rejected</span>
      <h1>No item at this position.</h1>
      <p>
        The page you asked for is outside the canvas. Try the <a href={SITE_BASE}>home page</a>, the{' '}
        <a href={`${SITE_BASE}getting-started/install.html`}>getting started guide</a>, or the{' '}
        <a href={`${SITE_BASE}api/index.html`}>API reference</a>.
      </p>
      <p>
        If you followed a link from an older version, see the{' '}
        <a href={`${SITE_BASE}guides/migration.html`}>migration guide</a>.
      </p>
    </main>
  )
}
