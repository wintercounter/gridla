import { useEffect, type ReactNode } from 'react'

import { SiteFooter } from './Footer'
import { InstallCommand } from './InstallCommand'
import { Mark } from './Mark'
import { ExternalIcon } from './Nav'
import { Reflow } from './Reflow'
import { REPO_URL, SITE_BASE, appHref } from '../site'

function href(path: string) {
  return `${SITE_BASE}${path}`
}

function ArrowRightIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 10h12M10.5 5l5 5-5 5" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor">
      <path d="M6 4.2v11.6a.6.6 0 0 0 .9.5l9-5.8a.6.6 0 0 0 0-1l-9-5.8a.6.6 0 0 0-.9.5z" />
    </svg>
  )
}

function CursorIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    >
      <path d="M4.5 3.5 15.5 10l-4.9 1-2.4 4.5z" />
    </svg>
  )
}

export function Hero() {
  return (
    <section className="g-hero">
      <div className="g-hero-copy">
        <div className="g-wordmark" data-reveal="" style={{ ['--i' as string]: 0 }}>
          <Mark title="Gridla" />
          <span>gridla</span>
        </div>
        <h1 className="g-hero-title" data-reveal="" style={{ ['--i' as string]: 1 }}>
          Pixel-precise grids and nested layouts, solved as <em>plain data</em>.
        </h1>
        <p className="g-hero-lede" data-reveal="" style={{ ['--i' as string]: 2 }}>
          A framework-neutral engine that moves, resizes, places, and transfers items in pixel
          coordinates, projects a layout onto any canvas size, and flattens trees of nested layouts.
          Zero runtime dependencies; React adapter included.
        </p>
        <div data-reveal="" style={{ ['--i' as string]: 3 }}>
          <InstallCommand />
        </div>
        <div className="g-hero-actions" data-reveal="" style={{ ['--i' as string]: 4 }}>
          <a
            className="g-button"
            data-variant="primary"
            href={href('getting-started/install.html')}
          >
            Get started
            <ArrowRightIcon />
          </a>
          <a className="g-button" href={appHref('gallery')}>
            <PlayIcon />
            Browse the examples
          </a>
          <a className="g-button" data-variant="ghost" href={appHref('studio')}>
            <CursorIcon />
            Open the sample studio
          </a>
        </div>
        <ul className="g-hero-meta" data-reveal="" style={{ ['--i' as string]: 5 }}>
          <li>zero runtime dependencies</li>
          <li>core about 23 kB min+gzip</li>
          <li>MIT licensed</li>
        </ul>
      </div>
      <div className="g-hero-figure" data-reveal="" style={{ ['--i' as string]: 2 }}>
        <Reflow />
      </div>
    </section>
  )
}

export function SectionHead({
  kicker,
  title,
  children,
}: {
  kicker: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="g-section-head" data-reveal="">
      <p className="g-section-kicker">{kicker}</p>
      <h2>{title}</h2>
      {children ? <p className="g-section-lede">{children}</p> : null}
    </div>
  )
}

export function CodeSection({ children }: { children: ReactNode }) {
  return (
    <section className="g-home-code">
      <SectionHead
        kicker="Two entry points"
        title="The core is a set of pure functions. React is optional."
      >
        Solve in the core with plain objects, or let the adapter own measurement, gestures, and
        previews while you own the state.
      </SectionHead>
      <div data-reveal="">{children}</div>
    </section>
  )
}

function Cell() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M3.5 12h17M12 3.5v17" />
    </svg>
  )
}

const STRATEGIES: { name: string; tone: string }[] = [
  { name: 'push-x', tone: 'push' },
  { name: 'swap', tone: 'swap' },
  { name: 'reorder-row', tone: 'reorder' },
  { name: 'insert-column', tone: 'reorder' },
  { name: 'trim-neighbor', tone: 'shrink' },
  { name: 'fit-open-slot', tone: 'other' },
]

const FEATURES: { title: string; body: ReactNode; extra?: ReactNode }[] = [
  {
    title: 'Intent-driven move solver',
    body: (
      <>
        <code>moveItem</code> infers intent from overlap: push along an axis, swap, reorder a row or
        column, insert into a lane, trim a large neighbor, snap to an open slot, or shrink a chain.
        Every result names the strategy that produced it.
      </>
    ),
    extra: (
      <ul className="g-chip-row" aria-label="Some strategies">
        {STRATEGIES.map((strategy) => (
          <li key={strategy.name} className="g-chip" data-tone={strategy.tone}>
            <code>{strategy.name}</code>
          </li>
        ))}
      </ul>
    ),
  },
  {
    title: 'Resize, place, transfer',
    body: (
      <>
        <code>resizeItem</code> snaps the dragged edge and shrinks only the neighbors it collides
        with. <code>placeItem</code> inserts by top-left intent or centered on a pointer.{' '}
        <code>transferItem</code> moves an item between canvases and rescales it.
      </>
    ),
  },
  {
    title: 'Projection that keeps structure',
    body: (
      <>
        <code>projectLayout</code> re-fits a layout to a new canvas: rows and columns behave like
        flex chains, fixed items keep their pixels, gaps stay exact, free space scales.
      </>
    ),
  },
  {
    title: 'Nested layouts as math',
    body: (
      <>
        <code>flattenLayout</code> turns a tree of layouts into root-relative rectangles, with hit
        testing, container lookup, locked subtrees, and coordinate conversion.
      </>
    ),
  },
  {
    title: 'Constraints and policies',
    body: (
      <>
        Per-item <code>minW</code>/<code>maxH</code>, four size modes, collision <code>ignore</code>{' '}
        ghosts, and <code>locked</code> walls that never move as a side effect.
      </>
    ),
  },
  {
    title: 'Headless React adapter',
    body: (
      <>
        <code>GridProvider</code>, <code>GridCanvas</code>, and <code>GridItem</code> handle
        measurement, pointer and keyboard gestures, previews, and cross-canvas transfer. Appearance
        stays yours.
      </>
    ),
  },
]

export function Features() {
  return (
    <section className="g-features">
      <SectionHead kicker="What it does" title="Grounded in the solver, not in adjectives." />
      <ul>
        {FEATURES.map((feature, index) => (
          <li key={feature.title} data-reveal="" style={{ ['--i' as string]: index % 3 }}>
            <Cell />
            <div>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
              {feature.extra}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

const LINKS: { title: string; body: string; href: string; external?: boolean }[] = [
  {
    title: 'Examples',
    body: 'Twenty focused examples with live controls and inspectable layout data.',
    href: appHref('gallery'),
    external: true,
  },
  {
    title: 'Sample studio',
    body: 'A complete nested dashboard built on the React adapter. Build one without reading the docs.',
    href: appHref('studio'),
    external: true,
  },
  {
    title: 'API reference',
    body: 'Every core and React export, generated from the source declarations.',
    href: href('api/index.html'),
  },
  {
    title: 'Benchmarks',
    body: 'Median, p95, and scaling notes for the solver and projection hot paths.',
    href: href('guides/performance.html'),
  },
  {
    title: 'Source',
    body: 'MIT licensed. Issues, changesets, and contributor notes on GitHub.',
    href: REPO_URL,
    external: true,
  },
]

export function HomeLinks() {
  return (
    <section className="g-home-links">
      <SectionHead kicker="Go deeper" title="Try it, read it, measure it." />
      <ul>
        {LINKS.map((link, index) => (
          <li key={link.title} data-reveal="" style={{ ['--i' as string]: index % 3 }}>
            <a href={link.href}>
              <b>
                {link.title}
                {link.external ? <ExternalIcon /> : <ArrowRightIcon />}
              </b>
              <span>{link.body}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Home page shell. Elements marked `data-reveal` fade and rise into place the
 * first time they scroll into view; the CSS turns that off under reduced
 * motion, so this only toggles a flag.
 */
export function HomePage({ children }: { children?: ReactNode }) {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.g-home')
    if (!root) return
    // Only hide elements once the observer is in place, so content is never
    // invisible without JavaScript.
    root.dataset.revealReady = ''
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
    if (nodes.length === 0) return
    if (typeof IntersectionObserver === 'undefined') {
      for (const node of nodes) node.dataset.revealed = ''
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          ;(entry.target as HTMLElement).dataset.revealed = ''
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    )
    for (const node of nodes) observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="g-home">
      <div className="g-home-backdrop" aria-hidden="true" />
      <div className="g-home-inner">{children}</div>
      <SiteFooter />
    </div>
  )
}
