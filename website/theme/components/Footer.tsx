import { ExternalIcon } from './Nav'
import { Mark } from './Mark'
import { REPO_URL, SITE_BASE, appHref } from '../site'

type FooterLink = { label: string; href: string; external?: boolean }

function href(path: string) {
  return `${SITE_BASE}${path}`
}

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Docs',
    links: [
      { label: 'Install', href: href('getting-started/install.html') },
      { label: 'Mental model', href: href('concepts/mental-model.html') },
      { label: 'Recipes', href: href('recipes/move.html') },
      { label: 'API reference', href: href('api/index.html') },
    ],
  },
  {
    title: 'Examples',
    links: [
      { label: 'All examples', href: appHref('gallery'), external: true },
      {
        label: 'Responsive projection',
        href: appHref('gallery', 'responsive-projection'),
        external: true,
      },
      { label: 'Nested groups', href: appHref('gallery', 'nested-groups'), external: true },
      {
        label: 'Cross-canvas transfer',
        href: appHref('gallery', 'cross-transfer'),
        external: true,
      },
    ],
  },
  {
    title: 'Sample studio',
    links: [
      { label: 'Open the sample studio', href: appHref('studio'), external: true },
      { label: 'Nesting', href: href('concepts/nesting.html') },
      { label: 'Multiple canvases', href: href('recipes/multiple-canvases.html') },
    ],
  },
  {
    title: 'Project',
    links: [
      { label: 'GitHub', href: REPO_URL, external: true },
      { label: 'npm', href: 'https://www.npmjs.com/package/gridla', external: true },
      { label: 'Changelog', href: href('guides/changelog.html') },
      { label: 'Contributing', href: href('guides/contributing.html') },
    ],
  },
]

/** Site footer for the home page: wordmark, link columns, license, and version. */
export function SiteFooter() {
  return (
    <footer className="g-footer">
      <div className="g-footer-inner">
        <div className="g-footer-brand">
          <a className="g-footer-wordmark" href={SITE_BASE} aria-label="Gridla home">
            <Mark />
            <span>gridla</span>
          </a>
          <p>Pixel-precise grids and nested layouts, solved as plain data.</p>
        </div>
        <nav className="g-footer-columns" aria-label="Footer">
          {COLUMNS.map((column) => (
            <div key={column.title} className="g-footer-column">
              <h3>{column.title}</h3>
              <ul>
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href}>
                      {link.label}
                      {link.external ? <ExternalIcon /> : null}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="g-footer-meta">
          <span>
            MIT licensed · <a href={`${REPO_URL}/blob/main/LICENSE`}>License</a>
          </span>
          <span className="g-footer-version">
            <code>gridla@{process.env.GRIDLA_VERSION}</code>
          </span>
          <span>Hand-authored assets, no runtime UI framework.</span>
        </div>
      </div>
    </footer>
  )
}
