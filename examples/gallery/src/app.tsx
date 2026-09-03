import { useEffect, useRef, type ReactNode } from 'react'

import { ThemeSwitch } from '@gridla/demo-kit/react'

import { demos, type DemoEntry } from './demos'
import { demoHref, useHashRoute, useMediaQuery } from './lib/route'

/** Docs home: the site root when deployed under `/gridla/`, else `/`. */
function docsHome(): string {
  if (typeof location === 'undefined') return '/'
  return location.pathname.startsWith('/gridla/') ? '/gridla/' : '/'
}

function Wordmark() {
  return (
    <svg viewBox="0 0 260 64" className="gl-wordmark" aria-labelledby="gl-wordmark-title">
      <title id="gl-wordmark-title">gridla</title>
      <g fill="currentColor">
        <rect x="6" y="6" width="14" height="14" rx="2" />
        <rect x="25" y="6" width="14" height="14" rx="2" />
        <rect x="44" y="6" width="14" height="14" rx="2" />
        <rect x="6" y="25" width="14" height="14" rx="2" />
        <rect x="6" y="44" width="14" height="14" rx="2" />
        <rect x="44" y="44" width="14" height="14" rx="2" />
        <rect x="25" y="44" width="14" height="14" rx="2" />
      </g>
      <rect x="25" y="25" width="33" height="14" rx="2" fill="#E0562F" />
      <text
        x="78"
        y="45"
        fill="currentColor"
        fontFamily="'Familjen Grotesk','Avenir Next','Segoe UI Variable',system-ui,sans-serif"
        fontSize="38"
        fontWeight="600"
        letterSpacing="-0.02em"
      >
        gridla
      </text>
    </svg>
  )
}

function NavGroup({
  title,
  entries,
  activeId,
}: {
  title: string
  entries: DemoEntry[]
  activeId: string
}) {
  const headingId = `nav-${title.toLowerCase()}`
  return (
    <details className="gl-nav-group" open>
      <summary>
        <h2 id={headingId}>{title}</h2>
        <span className="gl-nav-count" aria-hidden="true">
          {entries.length}
        </span>
      </summary>
      <ol aria-labelledby={headingId}>
        {entries.map((demo) => {
          const active = demo.id === activeId
          return (
            <li key={demo.id}>
              <a
                href={demoHref(demo.id)}
                aria-current={active ? 'page' : undefined}
                data-number={String(demo.number).padStart(2, '0')}
                title={active ? undefined : demo.goal}
              >
                <span className="gl-nav-title">{demo.title}</span>
                {active ? <span className="gl-nav-goal">{demo.goal}</span> : null}
              </a>
            </li>
          )
        })}
      </ol>
    </details>
  )
}

/** Arrow keys move between demo links; Home/End jump to the ends. */
function onNavKeyDown(nav: HTMLElement, event: KeyboardEvent) {
  const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
  if (!keys.includes(event.key)) return
  const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[href]'))
  const visible = links.filter((link) => link.offsetParent !== null)
  if (visible.length === 0) return
  const index = visible.indexOf(document.activeElement as HTMLAnchorElement)
  let next = index
  if (event.key === 'ArrowDown') next = index < 0 ? 0 : Math.min(visible.length - 1, index + 1)
  if (event.key === 'ArrowUp') next = index < 0 ? 0 : Math.max(0, index - 1)
  if (event.key === 'Home') next = 0
  if (event.key === 'End') next = visible.length - 1
  event.preventDefault()
  visible[next]?.focus()
}

function Nav({ activeId }: { activeId: string }) {
  const ref = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const nav = ref.current
    if (!nav) return
    const handler = (event: KeyboardEvent) => onNavKeyDown(nav, event)
    nav.addEventListener('keydown', handler)
    return () => nav.removeEventListener('keydown', handler)
  }, [])
  return (
    <nav ref={ref} className="gl-nav" aria-label="Demos">
      <NavGroup
        title="Core"
        entries={demos.filter((d) => d.group === 'core')}
        activeId={activeId}
      />
      <NavGroup
        title="React"
        entries={demos.filter((d) => d.group === 'react')}
        activeId={activeId}
      />
    </nav>
  )
}

function NavDrawer({ activeId, children }: { activeId: string; children: ReactNode }) {
  const narrow = useMediaQuery('(max-width: 899px)')
  if (!narrow) return <aside className="gl-side">{children}</aside>
  const active = demos.find((d) => d.id === activeId)
  return (
    <details className="gl-side gl-drawer">
      <summary>
        <span>Demos</span>
        <span className="gl-drawer-current">{active?.title}</span>
      </summary>
      {children}
    </details>
  )
}

export function App() {
  const routeId = useHashRoute()
  const demo = demos.find((entry) => entry.id === routeId) ?? demos[0]
  const Component = demo.component
  const docs = docsHome()

  useEffect(() => {
    document.title = `${demo.title} · Gridla examples`
  }, [demo.title])

  return (
    <div className="gl-app">
      <a className="gl-skip" href="#main">
        Skip to demo
      </a>
      <header className="gl-top">
        <div className="gl-top-brand">
          <a className="gl-brand" href={docs} aria-label="Gridla documentation home">
            <Wordmark />
          </a>
          <span className="gl-top-sep" aria-hidden="true" />
          <a className="gl-top-title" href={demoHref(demos[0].id)}>
            Examples
          </a>
        </div>
        <nav className="gl-top-nav" aria-label="Site">
          <a href={docs}>Docs</a>
          <a href={`${docs}studio/`}>Sample studio</a>
        </nav>
        <ThemeSwitch />
      </header>
      <NavDrawer activeId={demo.id}>
        <Nav activeId={demo.id} />
      </NavDrawer>
      <main id="main" className="gl-main" tabIndex={-1}>
        <header className="gl-demo-head">
          <p className="gl-demo-kicker">
            <span>{String(demo.number).padStart(2, '0')}</span>
            <span>{demo.group === 'core' ? 'core · no provider' : 'gridla/react'}</span>
          </p>
          <h1>{demo.title}</h1>
          <p className="gl-demo-goal">{demo.goal}</p>
          <ul className="gl-tags" aria-label="Topics">
            {demo.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        </header>
        <Component key={demo.id} />
      </main>
    </div>
  )
}
