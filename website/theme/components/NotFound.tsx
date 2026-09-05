import { SITE_BASE } from '../site'

/** Custom 404 page. Also mirrored statically in public/404.html for deep links. */
export function NotFound() {
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
