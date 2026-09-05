import { useEffect, type ReactNode } from 'react'

import { ThemeSwitch } from '@gridla/demo-kit/react'

import { demos, type DemoEntry } from './demos'
import { demoHref, useHashRoute, useMediaQuery } from './lib/route'

function Wordmark() {
  return (
    <svg viewBox="0 0 260 64" className="gl-wordmark" role="img" aria-label="gridla">
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
  return (
    <section className="gl-nav-group" aria-labelledby={`nav-${title}`}>
      <h2 id={`nav-${title}`}>{title}</h2>
      <ol>
        {entries.map((demo) => (
          <li key={demo.id}>
            <a
              href={demoHref(demo.id)}
              aria-current={demo.id === activeId ? 'page' : undefined}
              data-number={String(demo.number).padStart(2, '0')}
            >
              <span className="gl-nav-title">{demo.title}</span>
              <span className="gl-nav-goal">{demo.goal}</span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Nav({ activeId }: { activeId: string }) {
  return (
    <nav className="gl-nav" aria-label="Demos">
      <NavGroup title="Core" entries={demos.filter((d) => d.group === 'core')} activeId={activeId} />
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

  useEffect(() => {
    document.title = `${demo.title} · Gridla gallery`
  }, [demo.title])

  return (
    <div className="gl-app">
      <a className="gl-skip" href="#main">
        Skip to demo
      </a>
      <header className="gl-top">
        <a className="gl-brand" href={demoHref(demos[0].id)}>
          <Wordmark />
          <span className="gl-brand-sub">demo gallery</span>
        </a>
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
