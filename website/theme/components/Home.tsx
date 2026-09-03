import type { ReactNode } from 'react'

import { InstallCommand } from './InstallCommand'
import { Mark } from './Mark'
import { Reflow } from './Reflow'
import { REPO_URL, SITE_BASE, appHref } from '../site'

function href(path: string) {
  return `${SITE_BASE}${path}`
}

export function Hero() {
  return (
    <section className="g-hero">
      <div className="g-hero-copy">
        <div className="g-wordmark">
          <Mark title="Gridla" />
          <span>gridla</span>
        </div>
        <h1 className="g-hero-title">
          Pixel-precise grids and nested layouts, solved as <em>plain data</em>.
        </h1>
        <p className="g-hero-lede">
          A framework-neutral engine that moves, resizes, places, and transfers items in pixel
          coordinates, projects a layout onto any canvas size, and flattens trees of nested layouts.
          Zero runtime dependencies; React adapter included.
        </p>
        <InstallCommand />
        <div className="g-hero-actions">
          <a
            className="g-button"
            data-variant="primary"
            href={href('getting-started/install.html')}
          >
            Get started
          </a>
          <a className="g-button" href={appHref('gallery')}>
            Gallery
          </a>
          <a className="g-button" href={appHref('studio')}>
            Studio
          </a>
        </div>
      </div>
      <Reflow />
    </section>
  )
}

export function CodeSection({ children }: { children: ReactNode }) {
  return (
    <section className="g-home-code">
      <div>
        <p className="g-section-kicker">Two entry points</p>
        <h2>The core is a set of pure functions. React is optional.</h2>
      </div>
      {children}
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

const FEATURES: { title: string; body: ReactNode }[] = [
  {
    title: 'Intent-driven move solver',
    body: (
      <>
        <code>moveItem</code> infers intent from overlap: push along an axis, swap, reorder a row or
        column, insert into a lane, trim a large neighbor, snap to an open slot, or shrink a chain.
        Every result names the strategy that produced it.
      </>
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
      <div>
        <p className="g-section-kicker">What it does</p>
        <h2>Grounded in the solver, not in adjectives.</h2>
      </div>
      <ul>
        {FEATURES.map((feature) => (
          <li key={feature.title}>
            <Cell />
            <div>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

const LINKS: { title: string; body: string; href: string }[] = [
  {
    title: 'Gallery',
    body: 'Twenty focused demos with live controls and inspectable layout data.',
    href: appHref('gallery'),
  },
  {
    title: 'Studio',
    body: 'Build a nested dashboard in the React example without reading the docs.',
    href: appHref('studio'),
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
  },
]

export function HomeLinks() {
  return (
    <section className="g-home-links">
      <div>
        <p className="g-section-kicker">Go deeper</p>
        <h2>Try it, read it, measure it.</h2>
      </div>
      <ul>
        {LINKS.map((link) => (
          <li key={link.title}>
            <a href={link.href}>
              <b>{link.title}</b>
              <span>{link.body}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function HomePage({ children }: { children?: ReactNode }) {
  return (
    <div className="g-home">
      <div className="g-home-inner">{children}</div>
    </div>
  )
}
